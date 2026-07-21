## Context

Stream Jams uses one `node:sqlite` `DatabaseSync` connection for migrations and all runtime repositories. The schema is currently at migration 011 with 18 relational tables. The 2026-07-20 audit confirmed good boundary validation, foreign-key enablement, short synchronous transactions, and deliberate logical backups, but reproduced two correctness failures: archive export omits `alert_variants.variant_order`, and `runInTransactionAsync()` can roll an unrelated repository write back with the transaction that happened to be open.

The same audit traced event playback and management reads, exercised representative query plans, and identified four bounded follow-on areas: linear alert hydration, append-only SQL diagnostics, unenforced asset references/stale credential-linked restore state, and overlay/migration hardening. The work crosses core contracts, server repositories, migrations, restore compensation, and runtime composition. It therefore needs explicit ordering and data-migration gates.

## Goals / Non-Goals

**Goals:**

- Make supported backup/restore lossless for ordered alert variants and explicit about incompatible legacy archives.
- Ensure a failed transaction cannot roll back or commit an unrelated operation on the shared connection.
- Bound event-path SQL statement count independently of total configured rules and cover deterministic hot-query ordering.
- Apply existing retention settings to relational diagnostics without long write locks.
- Enforce variant asset references, exactly-one-active-set mutation policy, and disconnected credential state after restore.
- Use exact indexed overlay-key verification and fail closed on unexpected migration ledgers.
- Organize the work as six independently testable technical slices and deliver their approved combined result through one consolidated integration gate.

**Non-Goals:**

- Enabling WAL, multiple database connections, raw database-file backup, auto-vacuum, scheduled `VACUUM`, or automatic database compaction.
- Normalizing JSON documents, adding broad JSON/timestamp checks, adding optimistic row versions, or adding OFFSET pagination.
- Adding diagnostic-history foreign keys, a Twitch timestamp index, or `UNIQUE(rule_id, variant_order)`.
- Running periodic `PRAGMA optimize` without field-size evidence that planner statistics matter.
- Changing public management/overlay authorization boundaries or adding dependencies.

## Decisions

### 1. One initiative, six technical slices, one approved delivery

The OpenSpec change is one persistence contract organized into backup correctness, transaction isolation, hot reads, diagnostic lifecycle, referential/restore integrity, and low-risk hardening. Those slices retain focused tests and review evidence, but their approved implementation was consolidated into PR #71 after rebasing onto current `origin/main`. Main's migration 012 therefore precedes this change's migrations 013 through 016.

Alternative: six sequential PRs. This was the original delivery plan, but it was explicitly superseded by the approved consolidated review and merge. Parallel migration development remains rejected because it would race for migration IDs and edit the shared registry.

### 2. Archive version 2 is lossless; affected version 1 archives fail preflight

New exports use archive version 2, include `variant_order`, and order variants by `(rule_id, variant_order, id)`. Preflight recognizes an archive-version-1 envelope only to produce a precise blocker explaining that variant order was not captured; it does not guess order by ID. Snapshot tests compare every portable owned table column with the declared export list, using an explicit allowlist for intentionally regenerated or local-only fields.

Alternative: infer legacy order from ID or priority. Rejected because migration 011 allowed subsequent manual reordering, so neither value reconstructs the user’s saved order.

### 3. No SQLite transaction crosses an asynchronous suspension point

Remove `runInTransactionAsync()` from production composition. Alert management performs asynchronous reads, validation, ID creation, filesystem/secret work, and document construction before entering the DB transaction. A server-owned synchronous mutation boundary then applies the fully materialized rule, metadata, and editor-document writes through existing synchronous repository primitives inside `runInTransaction()`.

The mutation boundary is use-case-oriented rather than a generic callback accepting promises. Tests may provide an in-memory fake, while runtime composition provides the SQLite implementation. Ordinary repository calls remain simple and do not require a global queue.

Alternatives: gate every repository call with an async mutex/`AsyncLocalStorage`, or open a second connection for long transactions. Rejected as larger architectural changes that preserve the underlying mistake of awaiting while holding a synchronous connection transaction.

### 4. Purpose-built bulk read models replace repeated row-oriented calls

Extend the alert repository with `listActiveRules({ eventType })`, implemented by selecting enabled rules through the active collection and hydrating collections, conditions, and variants in a fixed number of SQL statements. Playback chooses variants before requesting editor documents, then uses `AlertEditorDocumentRepository.findMany(editorIds)` and `AssetRepository.findManyByIds(assetIds)`. Management uses those document reads plus `AlertSetMetadataRepository.findSets(setIds)` and `findRules(ruleIds)` where it currently fans out per parent.

Add only indexes proven by representative `EXPLAIN QUERY PLAN`: collection-first junction, rule/variant order, timestamp-plus-ID diagnostic ordering, and output-plus-history ordering. Replacement indexes subsume their old prefixes; old indexes are dropped only after plan and behavior tests pass.

Alternative: one large join. Rejected because repeated child rows make mapping fragile and transfer redundant data; several bounded keyed queries are simpler and still constant in rule count.

### 5. Diagnostic pruning is bounded and shares the configured retention cutoff

Extend the diagnostic repository with one `pruneBefore(cutoff, batchSize)` operation returning per-table deleted counts. Each table deletes at most one batch through an ordered ID subquery using `(timestamp,id)`. `LocalMaintenanceService.clearOldLogs()` runs file cleanup and SQL pruning with the same computed cutoff; runtime startup/maintenance scheduling reuses the existing maintenance path rather than adding an event-path cleanup.

Alternative: one unbounded delete or automatic vacuum. Rejected because either can hold the single writer too long or add unnecessary file rewrite cost.

### 6. Asset integrity uses restrictive FKs; polymorphic document triggers stay

Rebuild `alert_variants` with nullable `visual_asset_id` and `audio_asset_id` foreign keys to `asset_metadata(id) ON DELETE RESTRICT`, plus child indexes. The migration aborts before destructive DDL if dangling references exist, copies all columns/defaults/checks/order values, recreates the rule-order index, and recreates the variant-delete editor-document trigger dropped with the old table.

Application impact checks remain for usable error messages; the DB is the final guard. Existing rule-owned cascades, historical diagnostic independence, and polymorphic editor-document triggers remain unchanged.

Alternative: rely only on service checks or cascade asset deletion. Rejected because service checks have crash/concurrency gaps and cascade would silently break configured alerts.

### 7. Credential-linked Twitch state is rollback-safe but not portable

`twitch_accounts` remains absent from exported configuration. Operational restore points include it so a failed restore can restore the prior row. A successful replacement clears the row, then removes the old account’s token references through existing secret-store APIs. Secret cleanup failure never reconnects the DB row; it produces an actionable warning for an orphaned local secret.

Alternative: export account metadata or leave destination state intact. Rejected because credentials are intentionally excluded and the post-restore contract requires reconnect.

### 8. Overlay verification starts with the unique hash

Add a unique index on `overlay_keys.key_hash` after duplicate preflight. Replace `findCandidates(overlayId)` with `findByHash(keyHash)`, then apply overlay, scope, purpose, module, profile, and revocation checks to that one row. A separate indexed output-existence lookup preserves current denial classification without scanning historical keys. Extend the output index with `(created_at,id)` and remove the redundant overlay-ID index after plan proof.

Alternative: retain overlay-first history scans and add only a sort index. Rejected because all current outputs share the default overlay ID, so exact hash lookup is both smaller and more selective.

### 9. Migration history must be an exact prefix

Before applying pending migrations or exposing the connection, read all ledger IDs in application order and require them to equal an exact prefix of the known migration list. Reject unknown/future IDs, gaps, or reordering with an actionable error. Migration checksums remain out of scope until edited migration bodies are an observed problem.

## Risks / Trade-offs

- **Legacy archive rejection surprises users** → Surface the specific variant-order loss reason and preserve the original archive; never mutate it during preflight.
- **Materializing alert mutations before the transaction can use stale reads** → Recheck affected-row existence/invariants synchronously at commit and make the mutation fail atomically if they changed.
- **Table rebuild can lose indexes or triggers** → Assert complete post-migration `table_xinfo`, `foreign_key_list`, `index_list`, trigger presence, and `PRAGMA foreign_key_check` in migration tests.
- **Composite indexes increase write cost** → Replace subsumed indexes rather than retaining both; compare representative plans before and after.
- **Retention competes with event writes** → Use small batches and invoke outside event processing; tests exercise equal timestamps and concurrent appends.
- **Secret cleanup occurs outside the DB transaction** → Keep the DB disconnected on cleanup failure and report the orphan; rollback DB state only for failures before replacement completes.
- **One consolidated PR broadens the review boundary** → Preserve focused verification by technical slice, rebase before final review, run full repository/CI gates on the combined head, and record the delivery exception explicitly rather than claiming sequential landings.

## Migration Plan

1. Implement archive version/order correction and drift tests; no DB migration.
2. Implement the synchronous alert mutation boundary and remove production use of async SQLite transactions; no DB migration.
3. Add alert read indexes and bulk read paths; prove fixed statement count and query plans.
4. Add diagnostic composite indexes and bounded retention.
5. Rebuild `alert_variants` for asset FKs/indexes, recreate dependent index/trigger objects, and add Twitch/active-set restore guards.
6. Add overlay indexes, exact verification, and migration-ledger prefix validation.
7. Rebase the combined implementation onto current `origin/main`, renumber migrations contiguously after main's migration 012, and run focused plus full repository/CI gates.
8. Merge the approved consolidated PR, reconcile delivery history, close any remaining requirement gap, then sync and archive the change.

The consolidated implementation landed through PR #71 as squash commit `147a7b0a042f5388b1ff61117f13014e1fc314fc`.

Each migration is forward-only. If a migration fails, its `BEGIN IMMEDIATE` transaction rolls back. After a migration commits, rollback is an application downgrade only to a build that knows the new schema; user configuration must not be destructively down-migrated.

## Open Questions

No blocking product decision remains: this design chooses explicit rejection of affected version-1 archives rather than lossy reconstruction. Actual live row counts and planner statistics remain unknown, so periodic `PRAGMA optimize`, WAL, vacuuming, and additional list indexes stay excluded until separately measured.
