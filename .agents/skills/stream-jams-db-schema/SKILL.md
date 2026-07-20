---
name: stream-jams-db-schema
description: Use when regenerating, inspecting, documenting, or visualizing the Stream Jams relational SQLite schema from repository migrations.
---

# Stream Jams DB Schema

## Overview

Regenerate the interactive schema explorer from executable migrations. Treat migrations as the physical-schema source of truth; never ask the model to reconstruct tables or relationships.

## Regenerate

1. Locate the repository root containing `apps/server/src/modules/db/migrations`.
2. Select an absolute output path. In Codex desktop, use the current task's writable visualization directory and the filename `stream-jams-schema-explorer.html`.
3. Run the bundled generator without reading or rewriting it:

   ```powershell
   node "<skill-directory>\scripts\generate-schema-explorer.mjs" "<repo-root>" "<output-html>"
   ```

4. Require a successful exit and confirm the output exists. Report the migration and table counts printed by the script.
5. In Codex desktop, display the result with `::codex-inline-vis{file="stream-jams-schema-explorer.html"}`.

## Execution Contract

| Input | Requirement |
|---|---|
| Repository | Stream Jams layout with sorted TypeScript migrations exporting literal SQL |
| Runtime | Node.js with `node:sqlite` |
| Output | Self-contained interactive HTML fragment, UTF-8 with LF endings |

The script derives tables, columns, foreign keys, indexes, and triggers by applying migrations to an in-memory SQLite database. Its small purpose-label and logical-relationship maps are presentation metadata; update the bundled script only when those labels become stale.

## Common Failures

- Missing migration directory: verify the repository root.
- Unsupported interpolated migration SQL: change the generator only if Stream Jams adopts that migration shape.
- Missing output: use an existing writable parent directory and an absolute path.
