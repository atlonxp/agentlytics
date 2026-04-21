const path = require('path');
const fs = require('fs');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

// ============================================================
// Adapter interface
// ============================================================

const name = 'claude';

// Return every Claude Code projects-root directory reachable from $HOME.
// Scans `$HOME/.claude*/projects*` so that:
//   • ~/.claude/projects/                 (live)
//   • ~/.claude/projects_dec16/           (in-place user split)
//   • ~/.claude.20260131_0811/projects/   (timestamped full-dir backup)
// are all merged into a single logical chat stream.
function getProjectRoots() {
  const home = os.homedir();
  const roots = [];
  let siblings;
  try { siblings = fs.readdirSync(home); } catch { return roots; }
  for (const sib of siblings) {
    if (!sib.startsWith('.claude')) continue;
    const sibPath = path.join(home, sib);
    try { if (!fs.statSync(sibPath).isDirectory()) continue; } catch { continue; }
    let inner;
    try { inner = fs.readdirSync(sibPath); } catch { continue; }
    for (const sub of inner) {
      if (!sub.startsWith('projects')) continue;
      const p = path.join(sibPath, sub);
      try { if (fs.statSync(p).isDirectory()) roots.push(p); } catch {}
    }
  }
  return roots;
}

// Recursively collect all .jsonl files beneath `root`.
function walkJsonl(root, out) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const p = path.join(root, ent.name);
    if (ent.isDirectory()) walkJsonl(p, out);
    else if (ent.isFile() && ent.name.endsWith('.jsonl')) out.push(p);
  }
}

// Derive sessionId from a jsonl path relative to the project dir.
//   <projDir>/<sid>.jsonl               -> sid (old flat layout)
//   <projDir>/<sid>/subagents/foo.jsonl -> sid (new per-session subdir layout)
function sessionIdForPath(fullPath, projDir) {
  const rel = path.relative(projDir, fullPath);
  const parts = rel.split(path.sep);
  if (parts.length === 1) return parts[0].replace(/\.jsonl$/, '');
  return parts[0];
}

function getChats() {
  const chats = [];

  for (const projectsRoot of getProjectRoots()) {
    let projDirs;
    try { projDirs = fs.readdirSync(projectsRoot); } catch { continue; }

    for (const projDir of projDirs) {
      const dir = path.join(projectsRoot, projDir);
      try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }

      // Decode folder path from dir name (e.g. -Users-fka-Code-foo -> /Users/fka/Code/foo)
      const decodedFolder = projDir.replace(/-/g, '/');

      // Read sessions-index.json for indexed sessions
      const indexPath = path.join(dir, 'sessions-index.json');
      const indexed = new Map();
      try {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const entry of index.entries || []) {
          indexed.set(entry.sessionId, entry);
        }
      } catch { /* no index */ }

      // Recursively scan every .jsonl under the project dir — Claude Code now
      // stores subagent transcripts under <sid>/subagents/*.jsonl, and older
      // flat <sid>.jsonl files may have been deleted during archive merges.
      const allJsonl = [];
      walkJsonl(dir, allJsonl);

      // Group files under their owning sessionId so one logical session
      // collapses all of: main jsonl + every subagent jsonl beneath it.
      const filesBySid = new Map();
      for (const fp of allJsonl) {
        const sid = sessionIdForPath(fp, dir);
        if (!filesBySid.has(sid)) filesBySid.set(sid, []);
        filesBySid.get(sid).push(fp);
      }

      for (const [sessionId, paths] of filesBySid) {
        paths.sort((a, b) => a.length - b.length); // main top-level file first
        const topFile = paths[0];
        const entry = indexed.get(sessionId);

        if (entry) {
          chats.push({
            source: 'claude-code',
            composerId: sessionId,
            name: cleanPrompt(entry.firstPrompt),
            createdAt: entry.created ? new Date(entry.created).getTime() : null,
            lastUpdatedAt: entry.modified ? new Date(entry.modified).getTime() : null,
            mode: 'claude',
            folder: entry.projectPath || decodedFolder,
            encrypted: false,
            bubbleCount: entry.messageCount || 0,
            _fullPath: paths,
            _gitBranch: entry.gitBranch,
          });
        } else {
          try {
            const stat = fs.statSync(topFile);
            const meta = peekSessionMeta(topFile);
            chats.push({
              source: 'claude-code',
              composerId: sessionId,
              name: meta.firstPrompt ? cleanPrompt(meta.firstPrompt) : null,
              createdAt: meta.timestamp || stat.birthtime.getTime(),
              lastUpdatedAt: stat.mtime.getTime(),
              mode: 'claude',
              folder: meta.cwd || decodedFolder,
              encrypted: false,
              _fullPath: paths,
            });
          } catch { /* skip */ }
        }

        indexed.delete(sessionId);
      }

      // Index entries with no jsonl on disk at all — surface the metadata so
      // the session still appears in the UI even without body/token data.
      for (const [sessionId, entry] of indexed) {
        chats.push({
          source: 'claude-code',
          composerId: sessionId,
          name: cleanPrompt(entry.firstPrompt),
          createdAt: entry.created ? new Date(entry.created).getTime() : null,
          lastUpdatedAt: entry.modified ? new Date(entry.modified).getTime() : null,
          mode: 'claude',
          folder: entry.projectPath || decodedFolder,
          encrypted: false,
          bubbleCount: entry.messageCount || 0,
          _fullPath: [],
          _gitBranch: entry.gitBranch,
        });
      }
    }
  }

  return chats;
}

function peekSessionMeta(filePath) {
  const meta = { firstPrompt: null, cwd: null, timestamp: null };
  try {
    const buf = fs.readFileSync(filePath, 'utf-8');
    for (const line of buf.split('\n')) {
      if (!line) continue;
      const obj = JSON.parse(line);
      if (!meta.cwd && obj.cwd) meta.cwd = obj.cwd;
      if (!meta.timestamp && obj.timestamp) {
        meta.timestamp = typeof obj.timestamp === 'string'
          ? new Date(obj.timestamp).getTime() : obj.timestamp;
      }
      if (!meta.firstPrompt && obj.type === 'user' && obj.message?.content) {
        const text = typeof obj.message.content === 'string'
          ? obj.message.content
          : obj.message.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
        meta.firstPrompt = text.substring(0, 200);
      }
      if (meta.cwd && meta.firstPrompt) break;
    }
  } catch {}
  return meta;
}

function cleanPrompt(prompt) {
  if (!prompt || prompt === 'No prompt') return null;
  // Strip XML tags and system-reminder blocks
  let clean = prompt
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 120);
  return clean || null;
}

function getMessages(chat) {
  const raw = chat._fullPath;
  const paths = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const rows = [];

  for (const filePath of paths) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);

    for (const line of lines) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : 0;

      if (obj.type === 'user' && obj.message) {
        const content = extractContent(obj.message.content);
        if (content) rows.push({ _ts: ts, msg: { role: 'user', content } });
      } else if (obj.type === 'assistant' && obj.message) {
        const { text, toolCalls } = extractAssistantContent(obj.message.content);
        const usage = obj.message.usage;
        if (text) rows.push({ _ts: ts, msg: {
          role: 'assistant', content: text, _model: obj.message.model,
          _inputTokens: usage?.input_tokens, _outputTokens: usage?.output_tokens,
          _cacheRead: usage?.cache_read_input_tokens, _cacheWrite: usage?.cache_creation_input_tokens,
          _toolCalls: toolCalls,
        }});
      } else if (obj.type === 'system') {
        const text = typeof obj.message?.content === 'string' ? obj.message.content : '';
        if (text) rows.push({ _ts: ts, msg: { role: 'system', content: text } });
      }
    }
  }

  // Merge main + subagent streams in chronological order so token/time math is coherent.
  rows.sort((a, b) => a._ts - b._ts);
  return rows.map(r => r.msg);
}

function extractContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n') || '';
}

function extractAssistantContent(content) {
  if (typeof content === 'string') return { text: content, toolCalls: [] };
  if (!Array.isArray(content)) return { text: '', toolCalls: [] };
  const parts = [];
  const toolCalls = [];
  for (const block of content) {
    if (block.type === 'thinking' && block.thinking) {
      parts.push(`[thinking] ${block.thinking}`);
    } else if (block.type === 'text' && block.text) {
      parts.push(block.text);
    } else if (block.type === 'tool_use') {
      const args = block.input || {};
      const argKeys = Object.keys(args).join(', ');
      parts.push(`[tool-call: ${block.name || 'unknown'}(${argKeys})]`);
      toolCalls.push({ name: block.name || 'unknown', args });
    } else if (block.type === 'tool_result') {
      const text = typeof block.content === 'string' ? block.content : '';
      parts.push(`[tool-result: ${block.name || 'tool'}] ${text.substring(0, 500)}`);
    }
  }
  return { text: parts.join('\n') || '', toolCalls };
}

// ============================================================
// Usage / quota data from Anthropic OAuth API
// ============================================================

function getClaudeCredentials() {
  // macOS: Keychain; Linux: secret-tool; Windows: not yet supported
  // Requires explicit user permission (allowSubscriptionAccess in config)
  const { isSubscriptionAccessAllowed } = require('./base');
  if (!isSubscriptionAccessAllowed()) return null;
  try {
    const { execSync } = require('child_process');
    let raw;
    if (process.platform === 'darwin') {
      raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', { encoding: 'utf-8', timeout: 5000 }).trim();
    } else if (process.platform === 'linux') {
      raw = execSync('secret-tool lookup service "Claude Code-credentials"', { encoding: 'utf-8', timeout: 5000 }).trim();
    } else {
      return null;
    }
    const creds = JSON.parse(raw);
    const oauth = creds.claudeAiOauth;
    if (!oauth || !oauth.accessToken) return null;
    return oauth;
  } catch { return null; }
}

function claudeApiFetch(token) {
  return new Promise((resolve) => {
    const https = require('https');
    const req = https.get('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'agentlytics/1.0',
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function getUsage() {
  const creds = getClaudeCredentials();
  if (!creds) return null;

  const usage = await claudeApiFetch(creds.accessToken);
  if (!usage) return null;

  const result = {
    source: 'claude-code',
    plan: {
      name: creds.subscriptionType || null,
    },
    usage: {},
    extraUsage: null,
  };

  if (usage.five_hour) {
    result.usage.fiveHour = {
      utilization: usage.five_hour.utilization,
      resetsAt: usage.five_hour.resets_at || null,
    };
  }
  if (usage.seven_day) {
    result.usage.sevenDay = {
      utilization: usage.seven_day.utilization,
      resetsAt: usage.seven_day.resets_at || null,
    };
  }
  if (usage.seven_day_sonnet) {
    result.usage.sevenDaySonnet = {
      utilization: usage.seven_day_sonnet.utilization,
      resetsAt: usage.seven_day_sonnet.resets_at || null,
    };
  }
  if (usage.seven_day_opus) {
    result.usage.sevenDayOpus = {
      utilization: usage.seven_day_opus.utilization,
      resetsAt: usage.seven_day_opus.resets_at || null,
    };
  }
  if (usage.extra_usage) {
    result.extraUsage = {
      isEnabled: usage.extra_usage.is_enabled || false,
      monthlyLimit: usage.extra_usage.monthly_limit || null,
      usedCredits: usage.extra_usage.used_credits || null,
      utilization: usage.extra_usage.utilization || null,
    };
  }

  return result;
}

const labels = { 'claude-code': 'Claude Code' };

function getArtifacts(folder) {
  const { scanArtifacts } = require('./base');
  return scanArtifacts(folder, {
    editor: 'claude-code',
    label: 'Claude Code',
    files: ['CLAUDE.md', '.claude/settings.json', '.claude/settings.local.json', '.mcp.json'],
    dirs: ['.claude/commands'],
  });
}

function getMCPServers() {
  const { parseMcpConfigFile } = require('./base');
  const results = [];
  // Global: ~/.claude.json (has mcpServers key)
  const globalFile = path.join(os.homedir(), '.claude.json');
  results.push(...parseMcpConfigFile(globalFile, { editor: 'claude-code', label: 'Claude Code', scope: 'global' }));
  // Project-level: .mcp.json (scanned per-project later via getAllMCPServers)
  return results;
}

module.exports = { name, labels, getChats, getMessages, getUsage, getArtifacts, getMCPServers };
