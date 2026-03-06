# cursor-chat-cli

CLI tool to browse, search, and export Cursor IDE chat history across all your workspaces.

## Install

```bash
npm install
npm link   # optional: makes `cursor-chat` available globally
```

## Usage

```bash
# List all chats (named/non-empty by default)
node index.js list
node index.js list --limit 10
node index.js list --folder teknasyon    # filter by project path
node index.js list --all                 # include empty/unnamed chats

# View a conversation (use ID prefix from list output)
node index.js view 75ce5675
node index.js view 75ce5675 --system     # include system prompts
node index.js view 75ce5675 --tools      # include tool calls/results with details
node index.js view 75ce5675 --reasoning  # include thinking blocks

# Export to Markdown
node index.js export 75ce5675
node index.js export 75ce5675 -o chat.md --system --tools

# Search chats by name or folder
node index.js search "refactor"
node index.js search "metrics" --deep    # also search message content (slower)
```

## How It Works

Cursor stores chat data in **two locations** on macOS:

### Source 1: Agent Store (`~/.cursor/chats/`)
- Path: `~/.cursor/chats/<hash>/<chatId>/store.db`
- SQLite with `meta` (hex-encoded JSON) and `blobs` (content-addressed SHA-256 store)
- Tree blobs are protobuf-encoded; message blobs are JSON `{role, content}`
- Used by newer agent-mode conversations

### Source 2: Workspace + Global Storage (`~/Library/Application Support/Cursor/User/`)
- **Per-workspace**: `workspaceStorage/<hash>/state.vscdb`
  - `workspace.json` maps hash → project folder path
  - `composer.composerData` in `ItemTable` → composer headers (id, name, mode, dates)
- **Global**: `globalStorage/state.vscdb`
  - `cursorDiskKV` table with `bubbleId:<composerId>:<bubbleId>` entries
  - Bubble type 1 = user message (`text` field), type 2 = assistant (`thinking`, `toolFormerData`, `codeBlocks`)

The CLI unifies both sources into a single interface, sorted by last updated date, with project folder association.

## License

ISC
