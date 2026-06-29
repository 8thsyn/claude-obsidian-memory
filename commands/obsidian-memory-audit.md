---
description: "Run integrity checks on vault notes: validate frontmatter on all files."
---

# obsidian-memory:audit

Check all vault notes for complete and valid YAML frontmatter:

- Verifies every note has `type`, `description`, and `created_at` fields
- Reports missing fields by file path

Usage: `/obsidian-memory:audit`
