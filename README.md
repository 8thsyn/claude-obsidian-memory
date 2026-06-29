# claude-obsidian-memory

A Claude Code plugin that stores persistent memory as markdown files in an Obsidian-compatible vault. Works on Windows, macOS, and Linux.

## Features

- **Three lifecycle hooks** that load vault context, surface relevant notes, and journal sessions automatically
- **Two in-session skills** for searching and saving memories on demand
- **Plain markdown storage** with YAML frontmatter — every memory is a file you can open and edit
- **Zero dependencies** — uses only Node.js built-in modules
- **Windows-native** — no Rust toolchain, no WSL required
- **Obsidian-optional** — vault is just markdown, works with any editor

## Installation

### Via plugin marketplace (recommended)

```text
/plugin marketplace add 8thsyn/claude-obsidian-memory
/plugin install obsidian-memory@8thsyn
/reload-plugins
```

The hooks auto-install on first session start. Answer **yes** to the setup prompt and Claude runs the initialization for you.

### Manual setup

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

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `/obsidian-memory:status` | Vault health check and note counts      |
| `/obsidian-memory:usage`  | Token breakdown for the current session |

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
