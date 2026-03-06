#!/usr/bin/env node

const { program } = require('commander');
const Database = require('better-sqlite3');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const os = require('os');

// --- Paths ---

const HOME = os.homedir();
const CURSOR_CHATS_DIR = path.join(HOME, '.cursor', 'chats');
const WORKSPACE_STORAGE_DIR = path.join(HOME, 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage');
const GLOBAL_STORAGE_DB = path.join(HOME, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');

// ============================================================
// Source 1: ~/.cursor/chats/<hash>/<chatId>/store.db (agent KV)
// ============================================================

function getAgentStoreChats() {
  const results = [];
  if (!fs.existsSync(CURSOR_CHATS_DIR)) return results;

  for (const workspace of fs.readdirSync(CURSOR_CHATS_DIR)) {
    const wsDir = path.join(CURSOR_CHATS_DIR, workspace);
    if (!fs.statSync(wsDir).isDirectory()) continue;
    for (const chat of fs.readdirSync(wsDir)) {
      const dbPath = path.join(wsDir, chat, 'store.db');
      if (fs.existsSync(dbPath)) {
        results.push({ workspace, chatId: chat, dbPath });
      }
    }
  }
  return results;
}

function hexToString(hex) {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return str;
}

function readStoreMeta(db) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('0');
  if (!row) return null;
  const hex = typeof row.value === 'string' ? row.value : Buffer.from(row.value).toString('hex');
  try {
    return JSON.parse(hexToString(hex));
  } catch {
    try { return JSON.parse(row.value); } catch { return null; }
  }
}

function parseTreeBlob(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const messageRefs = [];
  const childRefs = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 34 > buf.length) break;
    const tag = buf[offset];
    const len = buf[offset + 1];
    if (len !== 0x20) break;
    const hash = buf.slice(offset + 2, offset + 2 + 32).toString('hex');
    if (tag === 0x0a) messageRefs.push(hash);
    else if (tag === 0x12) childRefs.push(hash);
    else break;
    offset += 2 + 32;
  }
  return { messageRefs, childRefs };
}

function collectStoreMessages(db, rootBlobId) {
  const allMessages = [];
  const visited = new Set();
  function walk(blobId) {
    if (visited.has(blobId)) return;
    visited.add(blobId);
    const row = db.prepare('SELECT data FROM blobs WHERE id = ?').get(blobId);
    if (!row) return;
    const data = row.data;
    try {
      const json = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString('utf-8'));
      if (json && json.role) { allMessages.push(json); return; }
    } catch { /* tree blob */ }
    const { messageRefs, childRefs } = parseTreeBlob(data);
    for (const ref of messageRefs) walk(ref);
    for (const ref of childRefs) walk(ref);
  }
  walk(rootBlobId);
  return allMessages;
}

// ============================================================
// Source 2: workspaceStorage + globalStorage (composer bubbles)
// ============================================================

function getWorkspaceMap() {
  const map = [];
  if (!fs.existsSync(WORKSPACE_STORAGE_DIR)) return map;
  for (const hash of fs.readdirSync(WORKSPACE_STORAGE_DIR)) {
    const dir = path.join(WORKSPACE_STORAGE_DIR, hash);
    const wsJson = path.join(dir, 'workspace.json');
    const stateDb = path.join(dir, 'state.vscdb');
    if (!fs.existsSync(wsJson) || !fs.existsSync(stateDb)) continue;
    try {
      const ws = JSON.parse(fs.readFileSync(wsJson, 'utf-8'));
      const folder = (ws.folder || '').replace('file://', '');
      map.push({ hash, folder, stateDb });
    } catch { /* skip */ }
  }
  return map;
}

function getComposerHeaders(stateDbPath) {
  try {
    const db = new Database(stateDbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerData'").get();
    db.close();
    if (!row) return [];
    const data = JSON.parse(row.value);
    return (data.allComposers || []).map((c) => ({
      composerId: c.composerId,
      name: c.name || null,
      createdAt: c.createdAt || null,
      lastUpdatedAt: c.lastUpdatedAt || null,
      mode: c.unifiedMode || c.forceMode || 'unknown',
      isAgentic: c.unifiedMode === 'agent',
    }));
  } catch { return []; }
}

function getComposerBubbles(globalDb, composerId) {
  const prefix = `bubbleId:${composerId}:`;
  const rows = globalDb.prepare(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE ? ORDER BY key"
  ).all(prefix + '%');

  const bubbles = [];
  for (const row of rows) {
    try {
      const obj = JSON.parse(row.value);
      bubbles.push(obj);
    } catch { /* binary blob, skip */ }
  }
  return bubbles;
}

function bubblesToMessages(bubbles) {
  const messages = [];
  for (const b of bubbles) {
    const type = b.type; // 1=user, 2=assistant
    if (type === 1) {
      const text = b.text || '';
      if (text) {
        messages.push({ role: 'user', content: text, _bubble: b });
      }
    } else if (type === 2) {
      const parts = [];
      // Thinking block
      const thinking = b.thinking;
      if (thinking && thinking.text) {
        parts.push({ type: 'reasoning', text: thinking.text });
      }
      // Tool calls
      const tfd = b.toolFormerData;
      if (tfd && tfd.name) {
        let args = {};
        try { args = typeof tfd.rawArgs === 'string' ? JSON.parse(tfd.rawArgs) : (tfd.rawArgs || {}); } catch { args = {}; }
        parts.push({
          type: 'tool-call',
          toolName: tfd.name,
          toolCallId: tfd.toolCallId || '',
          args,
          status: tfd.status || '',
          userDecision: tfd.userDecision || '',
        });
        // Tool result
        if (tfd.result) {
          const resultText = typeof tfd.result === 'string' ? tfd.result
            : (tfd.result.diff ? JSON.stringify(tfd.result.diff).substring(0, 500) : JSON.stringify(tfd.result).substring(0, 500));
          parts.push({
            type: 'tool-result',
            toolName: tfd.name,
            result: resultText,
            userDecision: tfd.userDecision || '',
          });
        }
      }
      // Main text (often empty for tool-heavy responses)
      if (b.text) {
        parts.unshift({ type: 'text', text: b.text });
      }
      // Code blocks
      if (b.codeBlocks && b.codeBlocks.length > 0) {
        for (const cb of b.codeBlocks) {
          const filePath = cb.uri ? cb.uri.path : '';
          if (filePath) {
            parts.push({ type: 'text', text: `[file: ${filePath}]` });
          }
        }
      }
      if (parts.length > 0) {
        messages.push({ role: 'assistant', content: parts, _bubble: b });
      }
    }
  }
  return messages;
}

// ============================================================
// Unified chat list
// ============================================================

function getAllChats() {
  const chats = [];

  // Source 1: ~/.cursor/chats store.db
  for (const { workspace, chatId, dbPath } of getAgentStoreChats()) {
    try {
      const db = new Database(dbPath, { readonly: true });
      const meta = readStoreMeta(db);
      db.close();
      if (meta) {
        chats.push({
          source: 'agent-store',
          composerId: chatId,
          name: meta.name || null,
          createdAt: meta.createdAt || null,
          folder: null,
          dbPath,
          rootBlobId: meta.latestRootBlobId,
        });
      }
    } catch { /* skip */ }
  }

  // Source 2: workspaceStorage composers
  let globalDb = null;
  try { globalDb = new Database(GLOBAL_STORAGE_DB, { readonly: true }); } catch { /* no global db */ }

  for (const { hash, folder, stateDb } of getWorkspaceMap()) {
    const headers = getComposerHeaders(stateDb);
    for (const h of headers) {
      // Check if this composer has any bubbles
      let bubbleCount = 0;
      if (globalDb) {
        try {
          const countRow = globalDb.prepare(
            "SELECT count(*) as cnt FROM cursorDiskKV WHERE key LIKE ?"
          ).get(`bubbleId:${h.composerId}:%`);
          bubbleCount = countRow ? countRow.cnt : 0;
        } catch { /* skip */ }
      }
      chats.push({
        source: 'workspace',
        composerId: h.composerId,
        name: h.name || null,
        createdAt: h.createdAt || null,
        lastUpdatedAt: h.lastUpdatedAt || null,
        mode: h.mode,
        folder,
        bubbleCount,
      });
    }
  }

  if (globalDb) globalDb.close();

  chats.sort((a, b) => {
    const ta = a.lastUpdatedAt || a.createdAt || 0;
    const tb = b.lastUpdatedAt || b.createdAt || 0;
    return tb - ta;
  });

  return chats;
}

function getMessagesForChat(chat) {
  if (chat.source === 'agent-store') {
    const db = new Database(chat.dbPath, { readonly: true });
    const msgs = collectStoreMessages(db, chat.rootBlobId);
    db.close();
    return msgs;
  }

  // workspace: read bubbles from global DB
  let globalDb;
  try { globalDb = new Database(GLOBAL_STORAGE_DB, { readonly: true }); } catch { return []; }
  const bubbles = getComposerBubbles(globalDb, chat.composerId);
  globalDb.close();
  return bubblesToMessages(bubbles);
}

// ============================================================
// Formatting (shared)
// ============================================================

function formatArgs(args, maxLen = 300) {
  if (!args || typeof args !== 'object') return '';
  const lines = [];
  for (const [key, val] of Object.entries(args)) {
    let display = typeof val === 'string' ? val : JSON.stringify(val);
    if (display && display.length > maxLen) {
      display = display.substring(0, maxLen) + chalk.dim(`… (${display.length} chars)`);
    }
    lines.push(`    ${chalk.dim(key + ':')} ${display}`);
  }
  return lines.join('\n');
}

function formatToolCall(item) {
  const name = item.toolName || 'unknown';
  const id = item.toolCallId || '';
  const decision = item.userDecision;
  const decisionStr = decision === 'accepted' ? chalk.green(' ✓accepted')
    : decision === 'rejected' ? chalk.red(' ✗rejected')
    : decision ? chalk.yellow(` ${decision}`) : '';
  let out = `  ${chalk.magenta('▶')} ${chalk.bold.magenta(name)}${decisionStr} ${chalk.dim(id)}`;
  if (item.args && Object.keys(item.args).length > 0) {
    out += '\n' + formatArgs(item.args);
  }
  return out;
}

function formatToolResult(item) {
  const name = item.toolName || 'unknown';
  const result = typeof item.result === 'string' ? item.result : JSON.stringify(item.result || '');
  const maxPreview = 500;
  const preview = result.length > maxPreview
    ? result.substring(0, maxPreview) + chalk.dim(`… (${result.length} chars)`)
    : result;
  const status = result.startsWith('Rejected') ? chalk.red('✗ rejected') : chalk.green('✓ ok');
  let out = `  ${chalk.yellow('◀')} ${chalk.bold.yellow(name)} ${status}`;
  if (preview.trim()) {
    out += '\n    ' + chalk.dim(preview.replace(/\n/g, '\n    '));
  }
  return out;
}

function extractText(content, { richToolDisplay = false } = {}) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (item.type === 'text') return item.text;
      if (item.type === 'reasoning') return `[thinking] ${item.text}`;
      if (item.type === 'tool-call') {
        return richToolDisplay
          ? formatToolCall(item)
          : `[tool-call: ${item.toolName || 'unknown'}(${Object.keys(item.args || {}).join(', ')})]`;
      }
      if (item.type === 'tool-result') {
        return richToolDisplay
          ? formatToolResult(item)
          : `[tool-result: ${item.toolName || 'unknown'}] ${(typeof item.result === 'string' ? item.result : '').substring(0, 200)}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function roleColor(role) {
  switch (role) {
    case 'user': return chalk.green;
    case 'assistant': return chalk.cyan;
    case 'system': return chalk.gray;
    case 'tool': return chalk.yellow;
    default: return chalk.white;
  }
}

function roleLabel(role) {
  switch (role) {
    case 'user': return '👤 User';
    case 'assistant': return '🤖 Assistant';
    case 'system': return '⚙️  System';
    case 'tool': return '🔧 Tool';
    default: return role;
  }
}

function formatDate(ts) {
  if (!ts) return 'unknown';
  return new Date(ts).toLocaleString();
}

function truncate(str, max = 120) {
  if (!str) return '';
  const oneLine = str.replace(/\n/g, ' ').trim();
  return oneLine.length > max ? oneLine.substring(0, max) + '…' : oneLine;
}

function shortenPath(p, maxLen = 40) {
  if (!p) return '';
  if (p.length <= maxLen) return p;
  const parts = p.split('/');
  if (parts.length <= 3) return p;
  return '…/' + parts.slice(-2).join('/');
}

function findChat(idPrefix) {
  const chats = getAllChats();
  return chats.find((c) => c.composerId.startsWith(idPrefix));
}

// ============================================================
// Commands
// ============================================================

function listChats(opts) {
  const chats = getAllChats();
  const folderFilter = opts.folder;

  let filtered = chats;
  if (folderFilter) {
    const f = folderFilter.toLowerCase();
    filtered = chats.filter((c) => c.folder && c.folder.toLowerCase().includes(f));
  }

  // Only show chats that have names or bubbles
  if (!opts.all) {
    filtered = filtered.filter((c) => c.name || (c.bubbleCount && c.bubbleCount > 0));
  }

  const limit = opts.limit ? parseInt(opts.limit) : filtered.length;
  const display = filtered.slice(0, limit);

  console.log(chalk.bold(`\n📋 Cursor Chats (${filtered.length} found, ${chats.length} total)\n`));
  console.log(chalk.gray('─'.repeat(110)));

  for (const chat of display) {
    const date = formatDate(chat.lastUpdatedAt || chat.createdAt);
    const name = (chat.name || '(untitled)').substring(0, 35);
    const folder = shortenPath(chat.folder, 30);
    const mode = chat.mode || chat.source || '';
    const modeTag = mode === 'agent' ? chalk.magenta(' agent')
      : mode === 'chat' ? chalk.blue(' chat')
      : mode === 'agent-store' ? chalk.magenta(' agent')
      : chalk.dim(` ${mode}`);

    console.log(
      `  ${chalk.bold.white(name.padEnd(36))}${modeTag.padEnd(18)} ${chalk.gray(date.padEnd(25))} ${chalk.dim(folder.padEnd(32))} ${chalk.dim(chat.composerId.substring(0, 8))}`
    );
  }

  console.log(chalk.gray('─'.repeat(110)));
  console.log(chalk.dim(`\nUse ${chalk.white('cursor-chat view <id-prefix>')} to view a conversation.`));
  console.log(chalk.dim(`Use ${chalk.white('--folder <path>')} to filter by project. Use ${chalk.white('--all')} to include empty chats.\n`));
}

function viewChat(chatIdPrefix, opts) {
  const chat = findChat(chatIdPrefix);
  if (!chat) {
    console.log(chalk.red(`No chat found matching "${chatIdPrefix}"`));
    return;
  }

  const messages = getMessagesForChat(chat);
  const showSystem = opts.system || false;
  const showTools = opts.tools || false;
  const showReasoning = opts.reasoning || false;

  console.log(chalk.bold(`\n💬 ${chat.name || '(untitled)'}`));
  console.log(chalk.gray(`   Created: ${formatDate(chat.createdAt)}`));
  if (chat.folder) console.log(chalk.gray(`   Project: ${chat.folder}`));
  console.log(chalk.gray(`   ID:      ${chat.composerId}`));
  console.log(chalk.gray(`   Source:  ${chat.source}`));
  console.log(chalk.gray('─'.repeat(80)) + '\n');

  let count = 0;
  for (const msg of messages) {
    if (msg.role === 'system' && !showSystem) continue;
    if (msg.role === 'tool' && !showTools) continue;

    const rich = showTools || msg.role === 'assistant' || msg.role === 'tool';
    const text = extractText(msg.content, { richToolDisplay: rich });
    if (!text.trim()) continue;

    const lines = text.split('\n');
    const filtered = showReasoning
      ? lines
      : lines.filter((l) => !l.startsWith('[thinking]'));

    const display = filtered.join('\n').trim();
    if (!display) continue;

    const color = roleColor(msg.role);
    console.log(color(chalk.bold(roleLabel(msg.role))));
    if (rich && (msg.role === 'assistant' || msg.role === 'tool')) {
      console.log(display);
    } else {
      console.log(color(display));
    }
    console.log('');
    count++;
  }

  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.dim(`${count} messages displayed (${messages.length} total)\n`));
}

function exportChat(chatIdPrefix, opts) {
  const chat = findChat(chatIdPrefix);
  if (!chat) {
    console.log(chalk.red(`No chat found matching "${chatIdPrefix}"`));
    return;
  }

  const messages = getMessagesForChat(chat);
  const includeSystem = opts.system || false;
  const includeTools = opts.tools || false;

  let md = `# ${chat.name || '(untitled)'}\n\n`;
  md += `- **Created**: ${formatDate(chat.createdAt)}\n`;
  if (chat.folder) md += `- **Project**: ${chat.folder}\n`;
  md += `- **Chat ID**: ${chat.composerId}\n\n---\n\n`;

  for (const msg of messages) {
    if (msg.role === 'system' && !includeSystem) continue;
    if (msg.role === 'tool' && !includeTools) continue;

    const text = extractText(msg.content);
    if (!text.trim()) continue;

    const label = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    md += `## ${label}\n\n${text}\n\n---\n\n`;
  }

  const outFile = opts.output || `cursor-chat-${chat.composerId.substring(0, 8)}.md`;
  fs.writeFileSync(outFile, md, 'utf-8');
  console.log(chalk.green(`Exported to ${outFile}`));
}

function searchChats(query, opts) {
  const chats = getAllChats();
  const queryLower = query.toLowerCase();
  const results = [];

  for (const chat of chats) {
    // Search in name
    if (chat.name && chat.name.toLowerCase().includes(queryLower)) {
      results.push({ ...chat, matchType: 'name', snippet: chat.name });
      continue;
    }

    // Search in folder
    if (chat.folder && chat.folder.toLowerCase().includes(queryLower)) {
      results.push({ ...chat, matchType: 'folder', snippet: chat.folder });
      continue;
    }

    // Search in message content (opt-in with --deep)
    if (opts.deep) {
      try {
        const messages = getMessagesForChat(chat);
        for (const msg of messages) {
          const text = extractText(msg.content);
          if (text.toLowerCase().includes(queryLower)) {
            results.push({
              ...chat,
              matchType: msg.role,
              snippet: truncate(text, 100),
            });
            break;
          }
        }
      } catch { /* skip */ }
    }
  }

  if (results.length === 0) {
    console.log(chalk.yellow(`No results for "${query}".`));
    if (!opts.deep) console.log(chalk.dim('Use --deep to also search message content.'));
    return;
  }

  console.log(chalk.bold(`\n🔍 Search results for "${query}" (${results.length} matches)\n`));
  for (const r of results) {
    const name = r.name || '(untitled)';
    const folder = r.folder ? chalk.dim(` ${shortenPath(r.folder, 40)}`) : '';
    console.log(`  ${chalk.bold.white(name)}${folder} ${chalk.gray(formatDate(r.lastUpdatedAt || r.createdAt))}`);
    console.log(`  ${chalk.dim(r.composerId.substring(0, 8))} ${chalk.dim(`[${r.matchType}]`)}`);
    if (r.snippet && r.matchType !== 'name') console.log(`  ${chalk.italic(truncate(r.snippet, 100))}`);
    console.log('');
  }
}

// ============================================================
// CLI
// ============================================================

program
  .name('cursor-chat')
  .description('CLI tool to browse and export Cursor IDE chat history')
  .version('1.0.0');

program
  .command('list')
  .description('List all Cursor chats across all workspaces')
  .option('-l, --limit <n>', 'Limit number of results')
  .option('-f, --folder <path>', 'Filter by project folder path')
  .option('-a, --all', 'Include empty/unnamed chats')
  .action(listChats);

program
  .command('view <chat-id>')
  .description('View a conversation (use composer/chat ID or prefix)')
  .option('-s, --system', 'Show system messages')
  .option('-t, --tools', 'Show tool call/result messages')
  .option('-r, --reasoning', 'Show reasoning/thinking blocks')
  .action(viewChat);

program
  .command('export <chat-id>')
  .description('Export a conversation to Markdown')
  .option('-o, --output <file>', 'Output file path')
  .option('-s, --system', 'Include system messages')
  .option('-t, --tools', 'Include tool messages')
  .action(exportChat);

program
  .command('search <query>')
  .description('Search chats by name, folder, or content')
  .option('-d, --deep', 'Also search message content (slower)')
  .action(searchChats);

program.parse();
