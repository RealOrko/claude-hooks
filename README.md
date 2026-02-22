# 🪝 claude-hooks

A CLI tool for managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook modules — install, uninstall, and manage extensions that give Claude long-term memory, custom behaviors, and more.

## ✨ Features

- 📦 **One-command install** — `claude-hooks --install <module>` copies files, installs deps, wires up hooks and MCP servers
- 🗑️ **Clean uninstall** — `claude-hooks --uninstall <module>` removes hooks from settings while preserving your data
- 🔌 **Modular architecture** — each module is self-contained with its own hooks, MCP servers, and settings
- 🔄 **Self-updating** — `claude-hooks --update` pulls the latest from git

## 📋 Requirements

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed

## 🚀 Quick Start

```bash
# Clone the repo
git clone <repo-url> claude-hooks
cd claude-hooks

# Link the CLI globally
npm link

# See available modules
claude-hooks --list

# Navigate to your project and install a module
cd /path/to/your/project
claude-hooks --install conversation-memory

# Restart Claude Code — hooks are now active! 🎉
```

## 📖 Usage

```
claude-hooks v0.1.0

Usage: claude-hooks [options]

Options:
  --help, -h                  Show this help message
  --version, -v               Show version number
  --list, -l                  List available hook modules
  --update                    Update claude-hooks via git pull
  --install <module-name>     Install a hook module into current project
  --uninstall <module-name>   Uninstall a hook module from current project
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

> 🚧 *Not yet implemented* — planned module for storing and querying Claude's tool executions to reduce repeated failures over time.

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
│       └── update.js            # --update implementation
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
│   └── tool-call-memory/       # 🛠️ (planned)
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
