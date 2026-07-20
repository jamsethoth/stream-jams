## Why

The SQLite audit found two release-blocking correctness defects—lossy alert-variant backup ordering and async transaction leakage—plus bounded integrity, lifecycle, and hot-query gaps that will worsen as local profiles accumulate configuration and diagnostics. Addressing them as one dependency-ordered initiative keeps the persistence contract coherent while preserving six independently reviewable implementation slices.

## What Changes

- Preserve alert variant order exactly across supported backup and restore, detect backup-schema drift, and define explicit handling for already-exported lossy archives.
- Prevent unrelated repository operations from entering an async SQLite transaction and make multi-repository alert mutations atomic without holding the synchronous connection across `await`.
- Replace per-rule/per-variant alert hydration with SQL-filtered bulk reads and add only the measured composite indexes needed by hot queries.
- Apply the configured retention window to append-only SQL diagnostic rows through bounded pruning.
- Enforce variant-to-asset references with SQLite foreign keys and indexes, and keep exactly one active alert set after supported mutations.
- Treat Twitch account connection state as non-portable credential-linked runtime state during restore.
- Make overlay-key verification use an exact unique verifier lookup while preserving scoped authorization and denial behavior.
- Reject unknown, future, gapped, or reordered migration ledgers before normal application queries.
- Keep WAL, automatic vacuuming, broad JSON normalization, timestamp checks, optimistic row versions, and periodic planner optimization out of scope until measured evidence requires them.

## Capabilities

### New Capabilities

- `configuration-backup-restore`: Defines lossless configuration round trips, explicit archive compatibility, non-portable credential-state handling, and owned-column drift protection.
- `sqlite-persistence-integrity`: Defines transaction isolation, relational asset integrity, bounded hot-path query behavior, deterministic indexed ordering, and migration-ledger safety.

### Modified Capabilities

- `alert-configuration-management`: Requires supported active-set mutations to preserve exactly one active alert set.
- `runtime-log-operations`: Extends configured retention to relational diagnostic history using bounded deletion.
- `overlay-output-management`: Requires exact verifier uniqueness/lookup while preserving output-scoped authorization and historical-key denial semantics.

## Impact

- Server DB runner, migrations, backup/restore, alert, asset, diagnostic, overlay-key, Twitch, and runtime-composition code.
- Core/server repository interfaces for purpose-built bulk alert/document/asset reads and diagnostic pruning.
- Existing SQLite profiles require additive/replacement index migrations and one preflighted `alert_variants` table rebuild for asset foreign keys.
- Backup archive compatibility changes; affected legacy archives cannot recover variant order and must be rejected or explicitly accepted as lossy by a product decision before implementation.
- No new runtime dependency, public network API, browser storage, WAL mode, or raw database-file backup behavior.
