---
type: reference
description: "Save an important fact, decision, or finding to the obsidian-memory vault for cross-session recall."
---

# save-memory

Capture stable cross-session information as a markdown note in the vault.

## Usage

To save a memory, create a new markdown file in the appropriate vault directory:

- `Notes/` — preferences, decisions, findings, learnings
- `Tools/` — CLI/API references, tool setup guides

Each note must include YAML frontmatter with `type`, `description`, `created_at`, and `updated_at` fields.

## When to use

- User states a preference or workflow choice
- You discover a project-specific fact (API key location, config path, team convention)
- A troubleshooting session reveals a root cause worth remembering
- A decision is made that future sessions should reference

## When not to use

- Temporary context that only matters this session
- Information already tracked in git (code structure, existing docs)
