---
type: reference
description: "Search the obsidian-memory vault for notes by keyword. Use when you need project facts, troubleshooting context, or tool references."
---

# vault-search

Search the vault for notes matching the given keywords. Results include path, type, and description for each match.

## Usage

```
claude-obsidian-memory vault search --keywords "<search terms>"
```

## When to use

- Looking up a specific fact (ID, channel, config, endpoint)
- Troubleshooting an error that may match a saved learning
- Checking for prior decisions before recommending
- Finding tool setup instructions

## When not to use

- Generic programming questions not related to stored context
- Ordinary file edits already visible in the conversation
