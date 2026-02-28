# 🪝 claude-hooks

A CLI tool for managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook modules — install, uninstall, and manage extensions that give Claude long-term memory, custom behaviors, and more.

## ✨ Features

- 📦 **One-command install** — `chx --install <module>` copies files, installs deps, wires up hooks and MCP servers
- 🗑️ **Clean uninstall** — `chx --uninstall <module>` removes hooks from settings while preserving your data
- 🔌 **Modular architecture** — each module is self-contained with its own hooks, MCP servers, and settings
- 🔄 **Self-updating** — `chx --update` pulls the latest from git
- 🔀 **Model redirect** — `chx --redirect` points Claude Code at a different endpoint via `.env` (with `.gitignore` protection)
- 🚀 **Quick launch** — `chx --run` loads `.env` and starts Claude Code with `--dangerously-skip-permissions`
- 👥 **Agent teams** — `chx --teams` enables experimental multi-agent support via `.env`

## 📋 Requirements

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed

## 🚀 Quick Start

```bash
# Clone the repo
git clone <repo-url> claude-hooks
cd claude-hooks

# Link the CLI globally (installs both `chx` and `claude-hooks` commands)
npm link

# See available modules
chx --list

# Navigate to your project and install a module
cd /path/to/your/project
chx --install conversation-memory

# Restart Claude Code — hooks are now active! 🎉
```

## 📖 Usage

```
chx (claude-hooks) v0.1.0

Usage: chx [options]

Options:
  --help, -h                  Show this help message
  --version, -v               Show version number
  --list, -l                  List available hook modules
  --update                    Update repo and refresh all installed modules
  --install <module-name>     Install a hook module into current project
  --uninstall <module-name>   Uninstall a hook module from current project
  --redirect [url]            Redirect Claude Code to a different model endpoint
                              (default: http://localhost:8000)
      --api-token <token>       API token (default: none)
      --model <model>           Model name (default: redirected-model)
  --reset                     Remove redirect variables from .env
  --run                       Load .env and start Claude Code (--dangerously-skip-permissions)
  --teams                     Enable experimental agent teams in .env
  --no-teams                  Disable experimental agent teams from .env
```

## 🧩 Available Modules

### 🧠 conversation-memory

Gives Claude long-term memory across sessions by indexing conversations into a local vector database.

**How it works:**

| Hook | Event | What it does |
|------|-------|-------------|
| 🔍 `suggest-context.js` | `UserPromptSubmit` | Searches past conversations for relevant context and surfaces hints to Claude |
| 📝 `index-conversation.js` | `Stop` | Indexes the conversation transcript into LanceDB with vector embeddings |

**MCP Tools provided:**

| Tool | Description |
|------|-------------|
| 🔎 `search_past_conversations` | Semantic search across all past exchanges |
| 📄 `get_conversation_detail` | Retrieve the full prompt + response for a specific exchange |
| 🗂️ `get_session_exchanges` | Browse exchanges within a specific session |

**Tech stack:** [LanceDB](https://lancedb.com/) for vector storage, [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) for local embeddings via `@huggingface/transformers`.

### 🛠️ tool-call-memory

Records every tool call Claude makes with success/failure scoring, then uses time-weighted pattern analysis to warn Claude about historically problematic tool usage before it repeats the same mistakes.

**How it works:**

| Hook | Event | What it does |
|------|-------|-------------|
| 💡 `suggest-tool-context.js` | `UserPromptSubmit` | Searches past tool failures relevant to the prompt and surfaces warnings with time-weighted scores |
| ✅ `record-tool-success.js` | `PostToolUse` | Records successful tool calls with score +10 |
| ❌ `record-tool-failure.js` | `PostToolUseFailure` | Records failed tool calls with score -10, captures error message and full parameters |

**MCP Tools provided:**

| Tool | Description |
|------|-------------|
| 🔎 `search_tool_calls` | Semantic search across past tool executions with success/failure filtering |
| 📊 `get_tool_stats` | Aggregate success rate and cumulative score per tool |
| 📄 `get_tool_call_detail` | Retrieve full input parameters and error details for a specific call |

**Time-weighted scoring:** Failures decay with a 30-day half-life — a -10 failure from 30 days ago counts as -5, from 60 days ago as -2.5. As Claude gets tool calls right, the warnings naturally fade away. Only the top 5 most-failed tool patterns are surfaced per prompt.

**What gets recorded per call:** tool name, full input parameters (JSON), success/failure status, score, error message, session ID, timestamp, human-readable summary, and a 384-dim embedding vector for semantic search.

**Tech stack:** [LanceDB](https://lancedb.com/) for vector storage, [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) for local embeddings via `@huggingface/transformers`.

### 💻 code-memory

Indexes and searches project source code by file extension using vector embeddings. Unlike the other modules, this is MCP-only — no hooks, just tools you can call directly.

**MCP Tools provided:**

| Tool | Description |
|------|-------------|
| 📥 `index_code` | Walk a directory tree matching file patterns (e.g. `*.py`, `*.ts`), chunk each file, and embed into the vector database. Re-indexes files that were previously indexed. |
| 🔎 `search_code` | Semantic search across indexed source code with optional language and file path filters |
| 📋 `list_indexed_files` | List all files currently indexed in the code search database |

**Tech stack:** [LanceDB](https://lancedb.com/) for vector storage, [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) for local embeddings via `@huggingface/transformers`.

## 📁 Project Structure

```
claude-hooks/
├── bin/
│   └── claude-hooks.js          # CLI entrypoint
├── lib/
│   ├── cli.js                   # Argument parsing & command routing
│   ├── paths.js                 # Shared path resolution
│   ├── settings.js              # Settings merge/unmerge logic
│   └── commands/
│       ├── install.js           # --install implementation
│       ├── uninstall.js         # --uninstall implementation
│       ├── list.js              # --list implementation
│       ├── update.js            # --update implementation
│       ├── redirect.js          # --redirect implementation
│       ├── reset.js             # --reset implementation
│       ├── run.js               # --run implementation
│       └── teams.js             # --teams / --no-teams implementation
├── modules/
│   ├── conversation-memory/     # 🧠 Long-term conversation memory
│   │   ├── index-conversation.js
│   │   ├── suggest-context.js
│   │   ├── mcp-server.js
│   │   ├── settings.json        # Hook & MCP server definitions
│   │   ├── version.json
│   │   ├── package.json
│   │   └── lib/
│   │       ├── db.js            # LanceDB operations
│   │       ├── embeddings.js    # Local vector embeddings
│   │       └── transcript.js    # Transcript parsing
│   ├── code-memory/             # 💻 Source code semantic search
│   │   ├── mcp-server.js
│   │   ├── settings.json
│   │   ├── version.json
│   │   ├── package.json
│   │   └── lib/
│   │       ├── db.js            # LanceDB operations
│   │       └── embeddings.js    # Local vector embeddings
│   └── tool-call-memory/        # 🛠️ Tool call pattern tracking
│       ├── suggest-tool-context.js
│       ├── record-tool-success.js
│       ├── record-tool-failure.js
│       ├── mcp-server.js
│       ├── settings.json
│       ├── version.json
│       ├── package.json
│       └── lib/
│           ├── db.js            # LanceDB operations
│           ├── embeddings.js    # Local vector embeddings
│           ├── formatting.js    # Tool input summarization
│           └── scoring.js       # Time-weighted decay scoring
└── package.json
```

## 🔧 How Install Works

When you run `claude-hooks --install <module>`:

1. 📋 Validates the module exists in the `modules/` directory
2. 📂 Copies all module files to `.claude/claude-hooks/<module>/` (excluding `node_modules/` and `data/`)
3. 📥 Runs `npm install` in the target directory
4. ⚙️ Runs `npm run setup` if defined in the module's package.json
5. 🔗 Merges the module's `settings.json` into `.claude/settings.local.json` (hooks + MCP servers)
6. ✅ Done — restart Claude Code to activate

If any step fails, it rolls back by cleaning up the copied files.

## 🗑️ How Uninstall Works

When you run `claude-hooks --uninstall <module>`:

1. 🔍 Reads the installed module's `settings.json` to know what to remove
2. ✂️ Removes matching hook entries and MCP server entries from `.claude/settings.local.json`
3. 🧹 Deletes all module files **except** `data/` (preserves your LanceDB database and model cache)
4. 📁 Cleans up `.claude/claude-hooks/` if empty

> 💡 Existing hooks from other modules or manual configuration are preserved — only entries matching the module are removed.

## 📝 Creating a Module

Each module needs at minimum:

| File | Purpose |
|------|---------|
| `version.json` | Module name, version, and description |
| `settings.json` | Hook event bindings and MCP server definitions |
| `package.json` | Node.js dependencies |

The `settings.json` defines which Claude Code events your module hooks into. Commands should reference `$CLAUDE_PROJECT_DIR/.claude/claude-hooks/<module>/` so they resolve correctly in any project.

## 📄 License

MIT
