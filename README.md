# npx agentlytics

**Comprehensive analytics dashboard for your AI coding agents.**

Agentlytics reads local chat history from every major AI coding assistant — Cursor, Windsurf, Claude Code, VS Code Copilot, Zed, Antigravity, and OpenCode — and presents a unified analytics dashboard in your browser.

No data ever leaves your machine. Everything runs locally against SQLite databases and local files.

---

## Features

- **Dashboard** — KPI cards (total sessions, daily avg, current month), activity heatmap, editor breakdown with click-to-filter, mode distribution, top projects
- **Sessions** — Paginated list of every chat session with editor/project/mode badges, search, and editor filter. Click any session to see the full conversation with syntax-highlighted markdown, expandable tool call details, and diff views
- **Projects** — Per-project analytics: sessions, messages, tokens, tool calls, models, and editor breakdown. Filterable by editor and searchable
- **Deep Analysis** — Aggregated tool call frequency, model distribution (doughnut chart), token breakdown (input/output/cache read/write). Click any tool bar to drill down into individual calls with full arguments
- **Compare** — Side-by-side editor comparison: totals, efficiency ratios (avg msgs/session, output/input ratio, cache hit rate), grouped bar charts, tool and model breakdowns
- **Refetch** — One-click cache rebuild with live SSE progress streaming

### Supported Editors

| Editor | Source ID | Data Location | Messages | Tool Args | Models | Tokens |
|--------|-----------|---------------|----------|-----------|--------|--------|
| **Cursor** | `cursor` | `~/.cursor/chats/` + `~/Library/Application Support/Cursor/` | ✅ | ✅ | ⚠️ provider only | ⚠️ partial |
| **Windsurf** | `windsurf` | ConnectRPC from running language server | ✅ | ✅ | ✅ | ✅ |
| **Windsurf Next** | `windsurf-next` | ConnectRPC from running language server | ✅ | ✅ | ✅ | ✅ |
| **Antigravity** | `antigravity` | ConnectRPC from running language server (HTTPS) | ✅ | ✅ | ✅ | ✅ |
| **Claude Code** | `claude-code` | `~/.claude/projects/` | ✅ | ✅ | ✅ | ✅ |
| **VS Code** | `vscode` | `~/Library/Application Support/Code/` | ✅ | ✅ | ✅ | ✅ |
| **VS Code Insiders** | `vscode-insiders` | `~/Library/Application Support/Code - Insiders/` | ✅ | ✅ | ✅ | ✅ |
| **Zed** | `zed` | `~/Library/Application Support/Zed/threads/threads.db` | ✅ | ✅ | ✅ | ❌ |
| **OpenCode** | `opencode` | `~/.local/share/opencode/opencode.db` | ✅ | ✅ | ✅ | ✅ |

> **Note:** Windsurf, Windsurf Next, and Antigravity require their app to be running during scan — they expose data via a local ConnectRPC API from the language server process.

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **macOS** (currently the only supported platform — all editor paths are macOS-specific)

### Install & Run

```bash
git clone <repo-url> agentlytics
cd agentlytics

# Install backend dependencies
npm install

# Build the frontend
cd ui && npm install && npm run build && cd ..

# Start the dashboard
npm start
```

The dashboard will open automatically at **http://localhost:4637**.

On first run, Agentlytics scans all detected editors and populates a local SQLite cache at `~/.agentlytics/cache.db`. Subsequent launches skip unchanged sessions.

### Options

```bash
npm start              # normal start (uses cache)
npm start -- --no-cache  # wipe cache and rescan everything
```

### Development

```bash
# Start Vite dev server with hot reload (port 5173)
cd ui && npm run dev

# In another terminal, start the backend (port 4637)
npm start
```

The Vite dev server proxies API requests to the backend via `vite.config.js`.

---

### Data Flow

```
Editor Files/APIs ──► editors/*.js ──► cache.js (SQLite) ──► server.js (REST API) ──► ui/ (React SPA)
```

1. **Editor adapters** read chat data from local files, databases, or running processes
2. **Cache layer** normalizes everything into a single SQLite DB (`~/.agentlytics/cache.db`) with tables for `chats`, `messages`, `chat_stats`, and `tool_calls`
3. **Express server** exposes read-only REST endpoints against the cache
4. **React frontend** fetches data from the API and renders charts via Chart.js

---

## API Reference

All endpoints are `GET` and return JSON.

| Endpoint | Description | Query Params |
|----------|-------------|--------------|
| `/api/overview` | Dashboard overview: totals, editors, modes, monthly trend, top projects | `editor` |
| `/api/daily-activity` | Daily activity data for heatmap | `editor` |
| `/api/chats` | Paginated chat list | `editor`, `folder`, `named`, `limit`, `offset` |
| `/api/chats/:id` | Full chat detail with messages and stats | — |
| `/api/projects` | All projects with aggregated analytics | — |
| `/api/deep-analytics` | Aggregated tool/model/token analytics | `editor`, `folder`, `limit` |
| `/api/tool-calls` | Individual tool call instances | `name` (required), `folder`, `limit` |
| `/api/refetch` | SSE stream: wipe cache and rescan all editors | — |

---

## Cache Database Schema

Location: `~/.agentlytics/cache.db`

### `chats`
Stores one row per chat session, normalized across all editors.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Unique chat ID (composerId) |
| `source` | TEXT | Editor identifier (`cursor`, `windsurf`, `claude-code`, etc.) |
| `name` | TEXT | Chat title |
| `mode` | TEXT | Session mode (`agent`, `edit`, `chat`, `ask`, etc.) |
| `folder` | TEXT | Project working directory |
| `created_at` | INTEGER | Creation timestamp (ms) |
| `last_updated_at` | INTEGER | Last update timestamp (ms) |
| `bubble_count` | INTEGER | Number of messages/bubbles |
| `encrypted` | INTEGER | 1 if content is encrypted |

### `messages`
Individual messages per chat, stored with truncation at 50K characters.

| Column | Type | Description |
|--------|------|-------------|
| `chat_id` | TEXT FK | References `chats.id` |
| `seq` | INTEGER | Message sequence number |
| `role` | TEXT | `user`, `assistant`, `system`, or `tool` |
| `content` | TEXT | Message content (may contain `[tool-call:]` / `[tool-result:]` markers) |
| `model` | TEXT | Model name (if available) |
| `input_tokens` | INTEGER | Input token count |
| `output_tokens` | INTEGER | Output token count |

### `chat_stats`
Pre-aggregated statistics per chat, computed during analysis.

| Column | Type | Description |
|--------|------|-------------|
| `chat_id` | TEXT PK | References `chats.id` |
| `total_messages` | INTEGER | Total message count |
| `user_messages` | INTEGER | User message count |
| `assistant_messages` | INTEGER | Assistant message count |
| `tool_calls` | TEXT | JSON array of tool call names |
| `models` | TEXT | JSON array of model names |
| `total_input_tokens` | INTEGER | Sum of input tokens |
| `total_output_tokens` | INTEGER | Sum of output tokens |
| `total_cache_read` | INTEGER | Sum of cache read tokens |
| `total_cache_write` | INTEGER | Sum of cache write tokens |

### `tool_calls`
Individual tool call records with full argument JSON.

| Column | Type | Description |
|--------|------|-------------|
| `chat_id` | TEXT FK | References `chats.id` |
| `tool_name` | TEXT | Tool function name |
| `args_json` | TEXT | Full arguments as JSON |
| `source` | TEXT | Editor source |
| `folder` | TEXT | Project directory |
| `timestamp` | INTEGER | Call timestamp (ms) |

---

## Editor Adapters — Technical Details

### Cursor

Reads from **two separate data stores**:

1. **Agent Store** (`~/.cursor/chats/<workspace>/<chatId>/store.db`)
   - SQLite with `meta` table (hex-encoded JSON) and `blobs` table (content-addressed SHA-256 tree)
   - Meta contains: `agentId`, `latestRootBlobId`, `name`, `createdAt`
   - Messages are retrieved by walking the blob tree: tree nodes contain message refs and child refs
   - Tool calls extracted from OpenAI-format `tool_calls` array on assistant messages

2. **Workspace Composers** (`~/Library/Application Support/Cursor/User/`)
   - `workspaceStorage/<hash>/state.vscdb` — `composer.composerData` key holds all composer headers
   - `globalStorage/state.vscdb` — `cursorDiskKV` table with `bubbleId:<composerId>:<n>` keys
   - Each bubble is a JSON object with `type` (1=user, 2=assistant), `text`, `toolFormerData`, `tokenCount`
   - Tool args extracted from `toolFormerData.rawArgs` with fallback to `toolFormerData.params`

**Limitations:** Cursor does not persist model names per chat or per message. Provider name (e.g., "anthropic") is extracted from `providerOptions` when available.

### Windsurf / Windsurf Next / Antigravity

Connects to the **running language server** via ConnectRPC (buf Connect protocol):

1. Discovers process via `ps aux` — finds `language_server_macos_arm` with `--csrf_token`
2. Extracts CSRF token and PID, finds listening port via `lsof`
3. Calls `GetAllCascadeTrajectories` for session summaries
4. Calls `GetCascadeTrajectory` per session for full conversation data

**Requires the application to be running** — data is served from the language server process, not from files on disk.

### Claude Code

Reads from `~/.claude/projects/<encoded-path>/`:
- `sessions-index.json` — session index with titles and timestamps
- Individual `.jsonl` session files — each line is a JSON message with `type`, `role`, `content`, `model`, `usage`
- Tool calls extracted from `tool_use` content blocks and `tool_result` messages

### VS Code / VS Code Insiders

Reads from `~/Library/Application Support/{Code,Code - Insiders}/User/`:
- `workspaceStorage/<hash>/state.vscdb` — workspace-to-folder mapping
- Chat sessions stored as `.jsonl` files in the Copilot Chat extension directory
- JSONL reconstruction: `kind:0` = init state, `kind:1` = JSON patch at key path
- Messages, tool calls, and token usage extracted from reconstructed chat state

### Zed

Reads from `~/Library/Application Support/Zed/threads/threads.db`:
- SQLite database with `threads` table containing zstd-compressed JSON blobs
- Each thread decompressed via `zstd` CLI to extract messages, tool calls, and model info
- Messages in OpenAI format with `tool_calls` array on assistant messages

### OpenCode

Reads from `~/.local/share/opencode/opencode.db`:
- SQLite database with `session`, `message`, and `project` tables
- Messages queried directly via SQL with full content, model, and token data

---

## Adding a New Editor

1. Create `editors/<name>.js` exporting:

```javascript
const name = 'my-editor';

function getChats() {
  // Return array of chat objects:
  return [{
    source: name,         // editor identifier
    composerId: '...',    // unique chat ID
    name: '...',          // chat title (nullable)
    createdAt: 1234567,   // timestamp in ms (nullable)
    lastUpdatedAt: 1234567, // timestamp in ms (nullable)
    mode: 'agent',        // session mode (nullable)
    folder: '/path/to/project', // working directory (nullable)
    encrypted: false,     // true if messages can't be read
    bubbleCount: 10,      // message count hint (nullable)
  }];
}

function getMessages(chat) {
  // Return array of message objects:
  return [{
    role: 'user',         // 'user' | 'assistant' | 'system' | 'tool'
    content: '...',       // message text
    _model: 'gpt-4',     // model name (optional)
    _inputTokens: 500,   // input token count (optional)
    _outputTokens: 200,  // output token count (optional)
    _cacheRead: 100,      // cache read tokens (optional)
    _cacheWrite: 50,      // cache write tokens (optional)
    _toolCalls: [{        // tool calls (optional)
      name: 'read_file',
      args: { path: '/foo.js' },
    }],
  }];
}

module.exports = { name, getChats, getMessages };
```

2. Register in `editors/index.js`:

```javascript
const myEditor = require('./my-editor');
const editors = [...existingEditors, myEditor];
```

3. Add color and label in `ui/src/lib/constants.js`:

```javascript
export const EDITOR_COLORS = { ..., 'my-editor': '#hex' };
export const EDITOR_LABELS = { ..., 'my-editor': 'My Editor' };
```

---

## License

MIT
