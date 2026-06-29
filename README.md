# claude-obsidian-memory

A Claude Code plugin that stores persistent memory as markdown files in an Obsidian-compatible vault. Works on Windows, macOS, and Linux.

## Features

- **Three lifecycle hooks** — SessionStart loads vault context, UserPromptSubmit surfaces relevant notes, SessionEnd journals and auto-commits
- **Two in-session skills** — vault-search and save-memory for on-demand lookup and capture
- **Custom memory types** — add, remove, or reset memory categories via `types` command
- **Usage tracking** — estimate token counts across all notes
- **Integrity audit** — validate frontmatter on all notes
- **Git auto-commit** — optional, auto-commits vault changes on session end
- **Plain markdown storage** with YAML frontmatter — every memory is a file you can open and edit
- **Windows-native** — Node.js, no WSL or Rust toolchain required
- **Zero npm dependencies** — uses only Node.js built-in modules

## Installation

Clone the repo and point hooks to the binary:

Clone the repo and configure hooks in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/claude-obsidian-memory/bin/claude-obsidian-memory.js",
            "args": ["hook", "session-start"],
            "statusMessage": "Loading vault context..."
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/claude-obsidian-memory/bin/claude-obsidian-memory.js",
            "args": ["hook", "session-end"],
            "statusMessage": "Writing session journal...",
            "async": true
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/claude-obsidian-memory/bin/claude-obsidian-memory.js",
            "args": ["hook", "user-prompt-submit"],
            "async": true
          }
        ]
      }
    ]
  }
}
```

Then initialize the vault:

```bash
node /path/to/claude-obsidian-memory/bin/claude-obsidian-memory.js setup
```

## Vault structure

```
~/Documents/Obsidian Memory/
├── Tools/          -- CLI, API, and tool references
├── Journals/       -- daily session logs (written by SessionEnd hook)
├── Notes/          -- decisions, preferences, findings, learnings
└── config.env      -- vault configuration
```

Each note uses YAML frontmatter with `type`, `description`, `created_at`, `updated_at`, and `project` fields.

## Slash commands

| Command                   | Description                            |
| ------------------------- | -------------------------------------- |
| `/obsidian-memory:status` | Vault health check and note counts     |
| `/obsidian-memory:usage`  | Estimated token usage across all notes |

## CLI commands

| Command                     | Description                               |
| --------------------------- | ----------------------------------------- |
| `setup`                     | Initialize vault and config               |
| `status`                    | Health check with counts, config, git     |
| `usage`                     | Estimated token usage (`--json` for JSON) |
| `vault search --keywords q` | Search notes by keyword                   |
| `vault list`                | List all notes by directory               |
| `vault audit`               | Check frontmatter integrity               |
| `types list`                | Configured memory types                   |
| `types add <name>`          | Add a memory type                         |
| `types remove <name>`       | Remove a memory type                      |
| `types reset`               | Reset to default types                    |

## In-session skills

- **vault-search** — search notes by keyword when you need project facts, troubleshooting context, or tool references
- **save-memory** — capture cross-session information (decisions, preferences, corrections)

## How it works

1. **SessionStart** — loads the vault overview into Claude's context so it knows what notes are available
2. **UserPromptSubmit** — checks if any notes match the current conversation and injects relevant context
3. **SessionEnd** — writes a journal entry for the session and auto-commits changes
4. **vault-search** — skill invoked when Claude needs to look up a fact not surfaced by the automatic gate
5. **save-memory** — skill invoked when Claude learns something worth remembering across sessions

## Requirements

- Node.js 18+
- Claude Code 2.0+

## License

MIT
