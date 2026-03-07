<p align="center">
  <img src="misc/logo.svg" width="120" alt="Agentlytics">
</p>

<h1 align="center">Agentlytics</h1>

<p align="center">
  <strong>Unified analytics for your AI coding agents</strong><br>
  <sub>Cursor · Windsurf · Claude Code · VS Code Copilot · Zed · Antigravity · OpenCode · Codex · Gemini CLI · Copilot CLI · Cursor Agent</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agentlytics"><img src="https://img.shields.io/npm/v/agentlytics?color=6366f1&label=npm" alt="npm"></a>
  <a href="#supported-editors"><img src="https://img.shields.io/badge/editors-13-818cf8" alt="editors"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%E2%89%A518-brightgreen" alt="node"></a>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/fdb0acb2-db0f-4091-af23-949ca0fae9c8" alt="Agentlytics demo" width="100%">
</p>

---

Agentlytics reads local chat history from every major AI coding assistant and presents a unified analytics dashboard in your browser. **No data ever leaves your machine.**

## Quick Start

```bash
npx agentlytics
```

Opens at **http://localhost:4637**. Requires Node.js ≥ 18, macOS.

For local development, run `npm run dev` from the repo root. That starts both the backend on `http://localhost:4637` and the Vite frontend on `http://localhost:5173`.

## Features

- **Dashboard** — KPIs, activity heatmap, editor breakdown, coding streaks, token economy, peak hours, top models & tools
- **Sessions** — Search, filter, full conversation viewer with syntax highlighting and diff views
- **Projects** — Per-project analytics: sessions, messages, tokens, models, editor breakdown
- **Deep Analysis** — Tool frequency, model distribution, token breakdown with drill-down
- **Compare** — Side-by-side editor comparison with efficiency ratios
- **Refetch** — One-click cache rebuild with live progress

## Supported Editors

| Editor | ID | Msgs | Tools | Models | Tokens |
|--------|----|:----:|:-----:|:------:|:------:|
| **Cursor** | `cursor` | ✅ | ✅ | ⚠️ | ⚠️ |
| **Windsurf** | `windsurf` | ✅ | ✅ | ✅ | ✅ |
| **Windsurf Next** | `windsurf-next` | ✅ | ✅ | ✅ | ✅ |
| **Antigravity** | `antigravity` | ✅ | ✅ | ✅ | ✅ |
| **Claude Code** | `claude-code` | ✅ | ✅ | ✅ | ✅ |
| **VS Code** | `vscode` | ✅ | ✅ | ✅ | ✅ |
| **VS Code Insiders** | `vscode-insiders` | ✅ | ✅ | ✅ | ✅ |
| **Zed** | `zed` | ✅ | ✅ | ✅ | ❌ |
| **OpenCode** | `opencode` | ✅ | ✅ | ✅ | ✅ |
| **Codex** | `codex` | ✅ | ✅ | ✅ | ✅ |
| **Gemini CLI** | `gemini-cli` | ✅ | ✅ | ✅ | ✅ |
| **Copilot CLI** | `copilot-cli` | ✅ | ✅ | ✅ | ✅ |
| **Cursor Agent** | `cursor-agent` | ✅ | ❌ | ❌ | ❌ |

> Windsurf, Windsurf Next, and Antigravity must be running during scan.

Codex sessions are read from `${CODEX_HOME:-~/.codex}/sessions/**/*.jsonl`. Reasoning summaries may appear in transcripts when Codex records them in clear text, but encrypted reasoning content is not readable. Codex Desktop and CLI sessions are aggregated into one `codex` editor in analytics.

## How It Works

```
Editor files/APIs → editors/*.js → cache.js (SQLite) → server.js (REST) → React SPA
```

All data is normalized into a local SQLite cache at `~/.agentlytics/cache.db`. The Express server exposes read-only REST endpoints consumed by the React frontend.

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/overview` | Dashboard KPIs, editors, modes, trends |
| `GET /api/daily-activity` | Daily counts for heatmap |
| `GET /api/dashboard-stats` | Hourly, weekday, streaks, tokens, velocity |
| `GET /api/chats` | Paginated session list |
| `GET /api/chats/:id` | Full chat with messages |
| `GET /api/projects` | Project-level aggregations |
| `GET /api/deep-analytics` | Tool/model/token breakdowns |
| `GET /api/tool-calls` | Individual tool call instances |
| `GET /api/refetch` | SSE: wipe cache and rescan |

All endpoints accept optional `editor` filter. See **[API.md](API.md)** for full request/response documentation.

## Roadmap

- [ ] **Offline Windsurf/Antigravity support** — Read cascade data from local file structure instead of requiring the app to be running (see below)
- [ ] **LLM-powered insights** — Use an LLM to analyze session patterns, generate summaries, detect coding habits, and surface actionable recommendations
- [ ] **Linux & Windows support** — Adapt editor paths for non-macOS platforms
- [ ] **Export & reports** — PDF/CSV export of analytics and session data
- [ ] **Cost tracking** — Estimate API costs per editor/model based on token usage

## Contributions Needed

**Windsurf / Windsurf Next / Antigravity offline reading** — Currently these editors require their app to be running because data is fetched via ConnectRPC from the language server process. Unlike Cursor or Claude Code, there's no known local file structure to read cascade history from. If you know where Windsurf stores trajectory data on disk, or can help reverse-engineer the storage format, contributions are very welcome.

**LLM-based analytics** — We'd love to add intelligent analysis on top of the raw data — session summaries, coding pattern detection, productivity insights, and natural language queries over your agent history. If you have ideas or want to build this, open an issue or PR.

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for development setup, editor adapter details, database schema, and how to add support for new editors.

## License

MIT — Built by [@f](https://github.com/f)
