const path = require('path');
const os = require('os');
const chalk = require('chalk');

const HOME = os.homedir();

// --- Platform utilities ---

/**
 * Get platform-specific app data directory path for VS Code-like editors.
 * - macOS: ~/Library/Application Support/{appName}/User/...
 * - Windows: ~/AppData/Roaming/{appName}/User/...
 * - Linux: ~/.config/{appName}/User/...
 */
function getAppDataPath(appName) {
  switch (process.platform) {
    case 'darwin':
      return path.join(HOME, 'Library', 'Application Support', appName);
    case 'win32':
      return path.join(HOME, 'AppData', 'Roaming', appName);
    default: // linux, etc.
      return path.join(HOME, '.config', appName);
  }
}

// --- Formatting utilities shared across all editor adapters ---

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

/**
 * Every editor adapter must implement:
 *
 *   name        - string identifier (e.g. 'cursor', 'windsurf')
 *   getChats()  - returns array of chat objects:
 *       { source, composerId, name, createdAt, lastUpdatedAt, mode, folder, bubbleCount, encrypted }
 *   getMessages(chat) - returns array of message objects:
 *       { role: 'user'|'assistant'|'system'|'tool', content: string|Array }
 */

module.exports = {
  getAppDataPath,
  formatArgs,
  formatToolCall,
  formatToolResult,
  extractText,
  roleColor,
  roleLabel,
  formatDate,
  truncate,
  shortenPath,
};
