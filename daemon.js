const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const { execFileSync, spawnSync } = require('child_process');

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.agentlytics');
const PIDFILE = path.join(CONFIG_DIR, 'daemon.pid');
const DEFAULT_INTERVAL_SEC = 300;
const DEFAULT_PORT = 4637;
const LAUNCHD_LABEL = 'com.github.f.agentlytics';
const LAUNCHD_PLIST = path.join(HOME, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
const LOG_DIR = path.join(HOME, 'Library', 'Logs', 'agentlytics');
const LOG_FILE = path.join(LOG_DIR, 'daemon.log');

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}
function err(msg) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readPidfile() {
  try {
    const pid = parseInt(fs.readFileSync(PIDFILE, 'utf-8').trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch { return null; }
}

function claimPidfile() {
  ensureConfigDir();
  try {
    fs.writeFileSync(PIDFILE, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    const existing = readPidfile();
    if (existing && isPidAlive(existing)) return false;
    fs.writeFileSync(PIDFILE, String(process.pid));
    return true;
  }
}

function releasePidfile() {
  try {
    const pid = readPidfile();
    if (pid === process.pid) fs.unlinkSync(PIDFILE);
  } catch {}
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

function parseArgs(argv) {
  const opts = {
    port: parseInt(process.env.PORT || DEFAULT_PORT, 10),
    intervalSec: parseInt(process.env.AGENTLYTICS_DAEMON_INTERVAL || DEFAULT_INTERVAL_SEC, 10),
  };
  const portIdx = argv.indexOf('--port');
  if (portIdx !== -1 && argv[portIdx + 1]) {
    const n = parseInt(argv[portIdx + 1], 10);
    if (Number.isFinite(n)) opts.port = n;
  }
  const intIdx = argv.indexOf('--interval');
  if (intIdx !== -1 && argv[intIdx + 1]) {
    const n = parseInt(argv[intIdx + 1], 10);
    if (Number.isFinite(n)) opts.intervalSec = n;
  }
  if (opts.intervalSec < 30) opts.intervalSec = 30;
  return opts;
}

async function collectOnce(cache) {
  const start = Date.now();
  const { editors: editorModules } = require('./editors');
  const allChats = [];
  for (const editor of editorModules) {
    try {
      const chats = editor.getChats();
      allChats.push(...chats);
    } catch {}
  }
  allChats.sort((a, b) => (b.lastUpdatedAt || b.createdAt || 0) - (a.lastUpdatedAt || a.createdAt || 0));
  const result = await cache.scanAllAsync(() => {}, { chats: allChats });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`collected: ${result.analyzed} analyzed, ${result.skipped} cached (${elapsed}s)`);
  return result;
}

async function startDaemon(opts) {
  const { port, intervalSec } = opts;

  if (!claimPidfile()) {
    const existing = readPidfile();
    err(`daemon already running (PID ${existing}); refusing to start`);
    process.exit(1);
  }

  const portFree = await isPortFree(port);
  if (!portFree) {
    err(`port ${port} is already in use; refusing to start`);
    releasePidfile();
    process.exit(1);
  }

  log(`daemon starting (pid ${process.pid}, port ${port}, interval ${intervalSec}s)`);

  let shuttingDown = false;
  let httpServer = null;
  let collectTimer = null;
  let collectInFlight = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, shutting down`);
    if (collectTimer) clearInterval(collectTimer);
    if (httpServer) await new Promise((r) => httpServer.close(r));
    const waitStart = Date.now();
    while (collectInFlight && Date.now() - waitStart < 10000) {
      await new Promise((r) => setTimeout(r, 200));
    }
    releasePidfile();
    log('daemon stopped');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (e) => {
    err(`uncaught exception: ${e && e.stack || e}`);
    releasePidfile();
    process.exit(1);
  });
  process.on('unhandledRejection', (e) => {
    err(`unhandled rejection: ${e && e.stack || e}`);
    releasePidfile();
    process.exit(1);
  });

  const cache = require('./cache');

  try {
    await collectOnce(cache);
  } catch (e) {
    err(`initial collect failed: ${e.message}`);
  }

  const app = require('./server');
  if (typeof app.initMcpToolsCache === 'function') {
    app.initMcpToolsCache().catch(() => {});
  }
  httpServer = app.listen(port, '0.0.0.0', () => {
    log(`dashboard ready at http://localhost:${port}`);
  });

  collectTimer = setInterval(async () => {
    if (shuttingDown) return;
    if (collectInFlight) {
      log('previous collect still running; skipping this tick');
      return;
    }
    collectInFlight = true;
    try {
      await collectOnce(cache);
    } catch (e) {
      err(`collect cycle failed: ${e.message}`);
    } finally {
      collectInFlight = false;
    }
  }, intervalSec * 1000);
}

// ─────────────────────────────────────────────────────────────
// Lifecycle commands (install/uninstall/status/logs/start/stop/restart)
// ─────────────────────────────────────────────────────────────

function requireDarwin() {
  if (process.platform !== 'darwin') {
    throw new Error(`lifecycle commands require macOS (got ${process.platform})`);
  }
}

function launchdTarget() {
  return `gui/${process.getuid()}/${LAUNCHD_LABEL}`;
}

function launchdDomain() {
  return `gui/${process.getuid()}`;
}

function runLaunchctl(args, { allowFail = false } = {}) {
  const r = spawnSync('launchctl', args, { encoding: 'utf-8' });
  if (r.status !== 0 && !allowFail) {
    const out = (r.stdout || '') + (r.stderr || '');
    throw new Error(`launchctl ${args.join(' ')} failed: ${out.trim() || 'exit ' + r.status}`);
  }
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function isLaunchdLoaded() {
  const r = runLaunchctl(['print', launchdTarget()], { allowFail: true });
  return r.code === 0;
}

function buildPlist({ nodePath, indexPath, port, intervalSec }) {
  const envPairs = {
    PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
    HOME,
  };
  if (port) envPairs.PORT = String(port);
  if (intervalSec) envPairs.AGENTLYTICS_DAEMON_INTERVAL = String(intervalSec);

  const envXml = Object.entries(envPairs)
    .map(([k, v]) => `    <key>${k}</key>\n    <string>${v}</string>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${indexPath}</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
  <key>WorkingDirectory</key>
  <string>${CONFIG_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
${envXml}
  </dict>
</dict>
</plist>
`;
}

function pingServer(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/ping`, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function installCommand(argv) {
  requireDarwin();
  const opts = parseArgs(argv);
  const nodePath = process.execPath;
  const indexPath = path.resolve(__dirname, 'index.js');

  if (!fs.existsSync(indexPath)) {
    throw new Error(`cannot find index.js at ${indexPath}`);
  }

  // Stop any running foreground daemon (not managed by launchd) so launchd can take over
  const runningPid = readPidfile();
  if (runningPid && isPidAlive(runningPid)) {
    process.stdout.write(`  stopping existing daemon (pid ${runningPid})...\n`);
    try { process.kill(runningPid, 'SIGTERM'); } catch {}
    const deadline = Date.now() + 5000;
    while (isPidAlive(runningPid) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // If already loaded by launchd, bootout first
  if (isLaunchdLoaded()) {
    process.stdout.write('  unloading existing launchd service...\n');
    runLaunchctl(['bootout', launchdTarget()], { allowFail: true });
  }

  // Ensure directories
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const plistDir = path.dirname(LAUNCHD_PLIST);
  if (!fs.existsSync(plistDir)) fs.mkdirSync(plistDir, { recursive: true });

  const plist = buildPlist({
    nodePath,
    indexPath,
    port: opts.port !== DEFAULT_PORT ? opts.port : null,
    intervalSec: opts.intervalSec !== DEFAULT_INTERVAL_SEC ? opts.intervalSec : null,
  });
  fs.writeFileSync(LAUNCHD_PLIST, plist);
  process.stdout.write(`  wrote ${LAUNCHD_PLIST}\n`);

  runLaunchctl(['bootstrap', launchdDomain(), LAUNCHD_PLIST]);
  process.stdout.write('  loaded into launchd\n');

  // Give it a moment to boot then verify
  await new Promise((r) => setTimeout(r, 1500));
  const ping = await pingServer(opts.port, 3000);
  if (ping && ping.app === 'agentlytics') {
    process.stdout.write(`\n✓ Agentlytics daemon installed and running (pid ${ping.pid})\n`);
    process.stdout.write(`  Dashboard: http://localhost:${opts.port}\n`);
    process.stdout.write(`  Logs:      ${LOG_FILE}\n`);
    process.stdout.write(`  Plist:     ${LAUNCHD_PLIST}\n\n`);
  } else {
    process.stdout.write('\n⚠ Daemon installed but not responding yet. Check logs:\n');
    process.stdout.write(`  tail -f ${LOG_FILE}\n\n`);
  }
  return 0;
}

async function uninstallCommand() {
  requireDarwin();
  if (isLaunchdLoaded()) {
    runLaunchctl(['bootout', launchdTarget()], { allowFail: true });
    process.stdout.write('  unloaded from launchd\n');
  }
  if (fs.existsSync(LAUNCHD_PLIST)) {
    fs.unlinkSync(LAUNCHD_PLIST);
    process.stdout.write(`  removed ${LAUNCHD_PLIST}\n`);
  }
  // Also kill any foreground daemon left over
  const pid = readPidfile();
  if (pid && isPidAlive(pid)) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
    process.stdout.write(`  stopped running daemon (pid ${pid})\n`);
  }
  process.stdout.write('\n✓ Agentlytics daemon uninstalled\n\n');
  return 0;
}

async function statusCommand(argv) {
  const opts = parseArgs(argv);
  const installed = fs.existsSync(LAUNCHD_PLIST);
  const loaded = process.platform === 'darwin' && installed && isLaunchdLoaded();
  const pid = readPidfile();
  const alive = pid && isPidAlive(pid);
  const ping = alive ? await pingServer(opts.port) : null;

  process.stdout.write('\nAgentlytics Daemon\n');
  process.stdout.write(`  installed:  ${installed ? 'yes' : 'no'}${installed ? '   ' + LAUNCHD_PLIST : ''}\n`);
  if (process.platform === 'darwin') {
    process.stdout.write(`  launchd:    ${loaded ? 'loaded' : 'not loaded'}\n`);
  }
  process.stdout.write(`  pid:        ${pid ? pid + (alive ? ' (alive)' : ' (stale)') : 'none'}\n`);
  process.stdout.write(`  server:     ${ping ? `responding on http://localhost:${opts.port}` : 'not responding'}\n`);
  process.stdout.write(`  log:        ${LOG_FILE}\n\n`);
  return 0;
}

async function logsCommand(argv) {
  if (!fs.existsSync(LOG_FILE)) {
    process.stdout.write(`log file not found: ${LOG_FILE}\n`);
    process.stdout.write('(log is only written when running via launchd — try `agentlytics daemon install`)\n');
    return 1;
  }
  const follow = !argv.includes('--no-follow');
  const args = follow ? ['-n', '200', '-f', LOG_FILE] : ['-n', '200', LOG_FILE];
  const r = spawnSync('tail', args, { stdio: 'inherit' });
  return r.status || 0;
}

async function startCommand() {
  requireDarwin();
  if (!fs.existsSync(LAUNCHD_PLIST)) {
    throw new Error('daemon not installed — run `agentlytics daemon install` first');
  }
  if (!isLaunchdLoaded()) {
    runLaunchctl(['bootstrap', launchdDomain(), LAUNCHD_PLIST]);
    process.stdout.write('  loaded into launchd\n');
  } else {
    runLaunchctl(['kickstart', launchdTarget()]);
    process.stdout.write('  kickstarted\n');
  }
  process.stdout.write('\n✓ Agentlytics daemon started\n\n');
  return 0;
}

async function stopCommand() {
  requireDarwin();
  if (isLaunchdLoaded()) {
    runLaunchctl(['kill', 'SIGTERM', launchdTarget()], { allowFail: true });
    process.stdout.write('  sent SIGTERM via launchd\n');
  } else {
    const pid = readPidfile();
    if (pid && isPidAlive(pid)) {
      try { process.kill(pid, 'SIGTERM'); } catch {}
      process.stdout.write(`  sent SIGTERM to pid ${pid}\n`);
    } else {
      process.stdout.write('  no running daemon found\n');
    }
  }
  process.stdout.write('\n✓ Stop requested\n\n');
  return 0;
}

async function restartCommand() {
  requireDarwin();
  if (!fs.existsSync(LAUNCHD_PLIST)) {
    throw new Error('daemon not installed — run `agentlytics daemon install` first');
  }
  if (isLaunchdLoaded()) {
    runLaunchctl(['kickstart', '-k', launchdTarget()]);
  } else {
    runLaunchctl(['bootstrap', launchdDomain(), LAUNCHD_PLIST]);
  }
  process.stdout.write('\n✓ Agentlytics daemon restarted\n\n');
  return 0;
}

function helpCommand() {
  process.stdout.write(`
Agentlytics daemon — background collector & dashboard

Usage:
  agentlytics daemon [--port N] [--interval SECONDS]   run foreground (stays attached)
  agentlytics daemon install [--port N] [--interval S] install launchd agent & start
  agentlytics daemon uninstall                         stop & remove launchd agent
  agentlytics daemon start                             start installed service
  agentlytics daemon stop                              stop running service
  agentlytics daemon restart                           stop + start
  agentlytics daemon status                            show running state
  agentlytics daemon logs [--no-follow]                tail daemon log

Defaults: port 4637, interval 300s. Min interval 30s.
`);
  return 0;
}

async function runDaemonCommand(sub, argv) {
  switch (sub) {
    case 'install':   return installCommand(argv);
    case 'uninstall': return uninstallCommand();
    case 'status':    return statusCommand(argv);
    case 'logs':      return logsCommand(argv);
    case 'start':     return startCommand();
    case 'stop':      return stopCommand();
    case 'restart':   return restartCommand();
    case 'help':
    case '--help':
    case '-h':        return helpCommand();
    default:
      process.stderr.write(`unknown daemon subcommand: ${sub}\n`);
      helpCommand();
      return 1;
  }
}

module.exports = { startDaemon, parseArgs, runDaemonCommand, PIDFILE, LAUNCHD_LABEL, LAUNCHD_PLIST, LOG_FILE };
