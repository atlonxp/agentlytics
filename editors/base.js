const path = require('path');
const os = require('os');
const fs = require('fs');

const HOME = os.homedir();

// --- Permission check ---

function isSubscriptionAccessAllowed() {
  try {
    const configPath = path.join(HOME, '.agentlytics', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.allowSubscriptionAccess === true;
  } catch { return false; }
}

// --- Scan sources (multi-folder support) ---

const CONFIG_PATH = path.join(HOME, '.agentlytics', 'config.json');

// Read the user-configured extra project-source folders from config.json.
// Returns the raw string list exactly as stored (may include missing/unmounted
// paths — callers decide how to surface those).
function getConfiguredSources() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    if (Array.isArray(config.projectSources)) {
      return config.projectSources.filter((s) => typeof s === 'string' && s.trim());
    }
  } catch { /* no config / unreadable */ }
  return [];
}

// Ordered, realpath-deduped, existing base directories to scan for editor data:
// the real $HOME first, then each configured source folder. Read fresh on every
// call so Settings edits apply on the next scan with no restart. Missing or
// unmounted source paths are silently skipped here, so every adapter that loops
// these bases transparently gains multi-folder support.
function getScanBases() {
  const out = [];
  const seen = new Set();
  for (const b of [HOME, ...getConfiguredSources()]) {
    let rp;
    try {
      rp = fs.realpathSync(b);
      if (!fs.statSync(rp).isDirectory()) continue;
    } catch { continue; } // missing / unmounted drive
    if (seen.has(rp)) continue;
    seen.add(rp);
    out.push(rp);
  }
  return out;
}

// Inspect a single path and report which editors' chat data is reachable from it,
// using the same auto-detect rules the adapters use (home-base: <path>/<subdir>,
// or direct: the path itself is that editor's data dir). Powers the Settings
// "add source" preview and per-row status. Returns { path, exists, detected: [...] }.
function detectSourcesAt(inputPath) {
  const result = { path: inputPath, exists: false, detected: [] };
  let base;
  try {
    base = fs.realpathSync(inputPath);
    if (!fs.statSync(base).isDirectory()) return result;
    result.exists = true;
  } catch { return result; }

  const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
  const countDirs = (p) => {
    try { return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).length; }
    catch { return 0; }
  };
  const readDir = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
  const looksLikeClaudeProjectsRoot = (p) =>
    readDir(p).some((name) => {
      try { return name.startsWith('-') && fs.statSync(path.join(p, name)).isDirectory(); }
      catch { return false; }
    });

  // Claude Code: home-base (<base>/.claude*/projects*), direct (.claude dir), or
  // a projects-root pointed at directly.
  let claudeRoots = 0;
  for (const sib of readDir(base)) {
    if (!sib.startsWith('.claude')) continue;
    for (const sub of readDir(path.join(base, sib))) {
      if (sub.startsWith('projects')) claudeRoots += countDirs(path.join(base, sib, sub));
    }
  }
  if (path.basename(base).startsWith('.claude')) {
    for (const sub of readDir(base)) {
      if (sub.startsWith('projects')) claudeRoots += countDirs(path.join(base, sub));
    }
  }
  if (looksLikeClaudeProjectsRoot(base)) claudeRoots += countDirs(base);
  if (claudeRoots > 0) result.detected.push({ editor: 'claude-code', label: 'Claude Code', projectCount: claudeRoots });

  // Home-base detection for the other editors via their signature subpaths.
  const SIGS = [
    { editor: 'codex', label: 'Codex', sub: ['.codex/sessions'] },
    { editor: 'gemini', label: 'Gemini', sub: ['.gemini/tmp'] },
    { editor: 'opencode', label: 'OpenCode', sub: ['.local/share/opencode/storage/session'] },
    { editor: 'codebuff', label: 'Codebuff', sub: ['.config/codebuff/projects', '.config/manicode/projects'] },
    { editor: 'commandcode', label: 'Command Code', sub: ['.commandcode/projects'] },
    { editor: 'copilot', label: 'GitHub Copilot CLI', sub: ['.copilot/session-state'] },
    { editor: 'cursor-cli', label: 'Cursor Agent', sub: ['.cursor/projects'] },
    { editor: 'goose', label: 'Goose', sub: ['.local/share/goose/sessions'] },
    { editor: 'cursor', label: 'Cursor', sub: ['Library/Application Support/Cursor/User/workspaceStorage', '.config/Cursor/User/workspaceStorage', '.cursor/chats'] },
    { editor: 'kiro', label: 'Kiro', sub: ['Library/Application Support/Kiro', '.config/Kiro'] },
    { editor: 'zed', label: 'Zed', sub: ['Library/Application Support/Zed/threads', '.config/Zed/threads'] },
  ];
  for (const s of SIGS) {
    if (s.sub.some((rel) => exists(path.join(base, rel)))) {
      result.detected.push({ editor: s.editor, label: s.label });
    }
  }
  return result;
}

// --- Platform utilities ---

/**
 * Get platform-specific app data directory path for VS Code-like editors.
 * - macOS: ~/Library/Application Support/{appName}/User/...
 * - Windows: ~/AppData/Roaming/{appName}/User/...
 * - Linux: ~/.config/{appName}/User/...
 */
function getAppDataPath(appName, base = HOME) {
  switch (process.platform) {
    case 'darwin':
      return path.join(base, 'Library', 'Application Support', appName);
    case 'win32':
      return path.join(base, 'AppData', 'Roaming', appName);
    default: // linux, etc.
      return path.join(base, '.config', appName);
  }
}

/**
 * Every editor adapter must implement:
 *
 *   name        - string identifier (e.g. 'cursor', 'devin')
 *   getChats()  - returns array of chat objects:
 *       { source, composerId, name, createdAt, lastUpdatedAt, mode, folder, bubbleCount, encrypted }
 *   getMessages(chat) - returns array of message objects:
 *       { role: 'user'|'assistant'|'system'|'tool', content: string|Array }
 */

/**
 * Scan a project folder for artifact files.
 *
 * @param {string} folder - Absolute path to the project folder
 * @param {Object} opts
 * @param {string} opts.editor - Editor identifier (e.g. 'cursor', 'claude-code')
 * @param {string} opts.label - Display label (e.g. 'Cursor', 'Claude Code')
 * @param {string[]} [opts.files] - Relative file paths to check (e.g. ['CLAUDE.md'])
 * @param {string[]} [opts.dirs] - Relative directories to scan for .md/.yaml/.yml/.json files
 * @returns {Array} Array of artifact objects
 */
function scanArtifacts(folder, { editor, label, files = [], dirs = [] }) {
  const fs = require('fs');
  const artifacts = [];
  if (!folder || !fs.existsSync(folder)) return artifacts;

  for (const relPath of files) {
    const filePath = path.join(folder, relPath);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      artifacts.push({
        editor,
        editorLabel: label,
        name: relPath,
        path: filePath,
        relativePath: relPath,
        size: stat.size,
        modifiedAt: stat.mtime.getTime(),
        preview: content.substring(0, 500),
        lines: content.split('\n').length,
      });
    } catch { /* skip */ }
  }

  const isArtifactFile = (f) =>
    f.endsWith('.md') || f.endsWith('.mdc') || f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json');

  const addFile = (filePath, relPath, fileName) => {
    try {
      const fstat = fs.statSync(filePath);
      if (!fstat.isFile()) return;
      const content = fs.readFileSync(filePath, 'utf-8');
      artifacts.push({
        editor,
        editorLabel: label,
        name: fileName,
        path: filePath,
        relativePath: relPath,
        size: fstat.size,
        modifiedAt: fstat.mtime.getTime(),
        preview: content.substring(0, 500),
        lines: content.split('\n').length,
      });
    } catch { /* skip */ }
  };

  for (const dir of dirs) {
    const dirPath = path.join(folder, dir);
    try {
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) continue;
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        if (isArtifactFile(entry)) {
          addFile(entryPath, path.join(dir, entry), entry);
        } else {
          // Recurse one level into subdirectories (e.g. .kiro/specs/<name>/, .windsurf/skills/<name>/)
          try {
            const eStat = fs.statSync(entryPath);
            if (!eStat.isDirectory()) continue;
            const subEntries = fs.readdirSync(entryPath).filter(isArtifactFile);
            for (const subFile of subEntries) {
              addFile(path.join(entryPath, subFile), path.join(dir, entry, subFile), subFile);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  return artifacts;
}

/**
 * Parse a standard MCP config JSON file (mcpServers format).
 * Returns array of { name, command, args, env, envKeys, url, transport, disabled }.
 */
function parseMcpConfigFile(filePath, { editor, label, scope }) {
  const fs = require('fs');
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const servers = data.mcpServers || data.mcp_servers || data.servers || {};
    return Object.entries(servers).map(([name, cfg]) => ({
      name,
      editor,
      editorLabel: label,
      scope,
      configPath: filePath,
      command: cfg.command || null,
      args: cfg.args || [],
      _env: cfg.env || {},
      env: cfg.env ? Object.keys(cfg.env) : [],
      url: cfg.url || null,
      transport: cfg.url ? (cfg.transport || 'http') : (cfg.transport || 'stdio'),
      disabled: cfg.disabled || false,
      disabledTools: cfg.disabledTools || [],
    }));
  } catch { return []; }
}

/**
 * Query an MCP server for its tools list via JSON-RPC 2.0.
 * For stdio servers: spawns the command and communicates via stdin/stdout.
 * For HTTP servers: sends POST to the URL.
 * Returns a Promise<string[]> of tool names, or [] on failure.
 * Timeout: 10s per server.
 */
function queryMcpServerTools(server) {
  const TIMEOUT = 10000;

  if (server.url && !server.command) {
    // HTTP/SSE transport — send JSON-RPC via POST
    return queryMcpServerToolsHttp(server.url, TIMEOUT);
  }

  if (!server.command) return Promise.resolve([]);

  // stdio transport — spawn the process
  return queryMcpServerToolsStdio(server, TIMEOUT);
}

function queryMcpServerToolsHttp(url, timeout) {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); resolve([]); }, timeout);
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };

    const parseToolsFromResponse = async (r) => {
      const ct = r.headers.get('content-type') || '';
      const text = await r.text();
      if (ct.includes('text/event-stream')) {
        // Parse SSE: lines starting with "data: "
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.result && msg.result.tools) return msg.result.tools.map(t => t.name);
          } catch {}
        }
        return [];
      }
      try {
        const msg = JSON.parse(text);
        return (msg.result && msg.result.tools) ? msg.result.tools.map(t => t.name) : [];
      } catch { return []; }
    };

    // 1. Initialize
    fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'agentlytics', version: '1.0.0' } },
      }),
      signal: controller.signal,
    })
    .then(async (r) => {
      const sessionId = r.headers.get('mcp-session-id');
      const h = { ...headers };
      if (sessionId) h['mcp-session-id'] = sessionId;
      await r.text(); // consume body

      // 2. Send initialized notification
      await fetch(url, {
        method: 'POST', headers: h,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        signal: controller.signal,
      }).then(r2 => r2.text());

      // 3. Request tools/list
      const r3 = await fetch(url, {
        method: 'POST', headers: h,
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      resolve(await parseToolsFromResponse(r3));
    })
    .catch(() => { clearTimeout(timer); resolve([]); });
  });
}

function queryMcpServerToolsStdio(server, timeout) {
  const { spawn } = require('child_process');

  return new Promise((resolve) => {
    const env = { ...process.env, ...(server._env || {}) };
    let child;
    try {
      child = spawn(server.command, server.args || [], {
        env, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch { return resolve([]); }

    let stdout = '';
    let done = false;
    let initReceived = false;

    const finish = (tools) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve(tools);
    };

    const timer = setTimeout(() => finish([]), timeout);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      // Parse newline-delimited JSON-RPC responses
      const lines = stdout.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      stdout = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          // Got initialize response — now send initialized + tools/list
          if (msg.id === 1 && msg.result && !initReceived) {
            initReceived = true;
            try {
              child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
              child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
            } catch { finish([]); }
          }
          // Got tools/list response
          if (msg.id === 2 && msg.result && msg.result.tools) {
            finish(msg.result.tools.map(t => t.name));
            return;
          }
        } catch { /* incomplete JSON, skip */ }
      }
    });

    child.on('error', () => finish([]));
    child.on('exit', () => finish([]));

    // Send initialize
    const initMsg = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agentlytics', version: '1.0.0' },
      },
    }) + '\n';

    try { child.stdin.write(initMsg); } catch { finish([]); }
  });
}

module.exports = {
  HOME,
  getAppDataPath,
  getConfiguredSources,
  getScanBases,
  detectSourcesAt,
  isSubscriptionAccessAllowed,
  scanArtifacts,
  parseMcpConfigFile,
  queryMcpServerTools,
};
