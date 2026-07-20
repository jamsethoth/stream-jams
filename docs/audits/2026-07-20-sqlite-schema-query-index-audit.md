# Stream Jams SQLite Schema, Query, and Index Audit

Date: 2026-07-20
Scope: relational SQLite schema and actual server/core database usage
Mode: read-only audit; no schema, migration, repository, or production-code changes
Baseline: `HEAD == origin/main == da7a21fce002cbe921e9ca9680b3a64100808347`

## Executive summary

Current relational design is small, understandable, and mostly well bounded. Migration execution is transactional; one shared connection explicitly enables foreign keys, rejects unsafe SQLite features, and waits up to five seconds on locks. Aggregate-owned child rows usually use correct `ON DELETE CASCADE` policies. Provider and active-alert-set uniqueness constraints are strong. Server SQL stays behind repository/service boundaries.

Two high-severity correctness defects need first attention:

1. Supported configuration backups omit `alert_variants.variant_order`. Export sorts variants by ID, restore applies the column default `0`, and variant/default-alert order changes silently.
2. `runInTransactionAsync()` holds a `DatabaseSync` transaction across `await`. It serializes other calls to the same helper, but ordinary repository writes can enter that open transaction and be rolled back by another request.

Next priorities: remove hot-path N+1 alert hydration, add retention for three append-only SQL diagnostic tables, enforce asset references, and clear stale Twitch connection state during restore. Index tuning is useful, but should follow these correctness and lifecycle fixes.

## Audit basis

### Git and OpenSpec

- Fetched `origin` immediately before analysis.
- Confirmed parent-provided commit remains current: local `HEAD`, fetched `origin/main`, and merge base all equal `da7a21fce002cbe921e9ca9680b3a64100808347`.
- Worktree began clean and detached.
- `openspec.cmd list --json` was checked before schema analysis. In-progress changes were `refactor-management-ui-ux` (86/87), `add-video-shoutout-overlay-module` (0/23), `add-speakerbot-tts-provider` (18/19), and `add-main-branch-changelog` (0/22). Five other listed changes were complete. No listed change owns a DB schema/query audit.

### Executable evidence

- Repo-local schema generator applied all executable migrations and produced an interactive explorer from **11 migrations and 18 tables**.
- `PRAGMA table_xinfo`, `foreign_key_list`, `index_list`, `index_xinfo`, and `sqlite_schema` were inspected on a migrated in-memory database.
- Representative data: 100 alert rules, two variants per rule, 1,000 rows in each diagnostic table, and 100 historical overlay keys split across representative outputs. `ANALYZE` ran before current-plan checks.
- `EXPLAIN QUERY PLAN` covered repository reads, ordering, cascade/reverse lookups, retention ranges, provider selection, Twitch-account selection, and overlay-key lookup.
- Candidate composite indexes were applied only to a separate in-memory database; their plans were rechecked.
- Focused baseline verification passed: **12 test files, 46 tests** covering database migrations/transactions, all SQLite repositories, and configuration snapshot/restore logic.
- A file-backed probe confirmed default `journal_mode=delete`, `foreign_keys=1`, and `busy_timeout=5000`. No live user database was opened or mutated.

Representative current plans:

| Query shape | `EXPLAIN QUERY PLAN` result | Assessment |
|---|---|---|
| All rules `ORDER BY id`; collections/conditions by rule | PK/composite-PK index scans/searches | Individually covered, but repeated `3N` child execution is the defect. |
| Variants `WHERE rule_id=? ORDER BY variant_order,id` | Uses `alert_variants_rule_id_idx`; temp B-tree for order | Hot child query needs `(rule_id,variant_order,id)`. |
| Rules by `collection_id` through junction | Full junction scan | Reverse `(collection_id,rule_id)` index is missing. |
| Newest event/match/playback rows by timestamp then ID | Uses timestamp index; temp B-tree for final ID term | Replace with `(timestamp,id)` indexes. |
| Diagnostic retention `WHERE timestamp < ?` | Timestamp-index range search | Existing indexes support cutoff; composite replacements preserve this prefix. |
| Overlay candidates `WHERE overlay_id=? ORDER BY created_at,id` | Representative plan scanned/sorted table | Exact key-hash lookup is the better verification shape. |
| Overlay exact output equality plus history order | Uses `overlay_keys_output_idx`; temp B-tree for order | Add `(created_at,id)` suffix. |
| Active overlay outputs for backup | Scans `overlay_keys_output_idx`; no temp sort | Intentional full active-output enumeration, already ordered. |
| Providers by capability/name | Covering `provider_registrations_capability_name` | Correct column order; keep. |
| Active provider by capability | Partial unique `provider_registrations_one_active_capability` | Correct lookup/invariant index; keep. |
| Twitch connected account newest-first | Scan plus temp sort | Do not index: repository maintains intended cardinality of one. |

Candidate indexes were created on a separate representative database and removed with it. Each F8 candidate eliminated its target scan/temp sort; the unique key-hash candidate produced an exact unique-index search. Candidate testing did not mutate repository migrations or user data.

## Ranked findings

| ID | Severity | Class | Finding |
|---|---:|---|---|
| F1 | High | Concrete defect | Backup/restore silently loses alert variant order. |
| F2 | High | Concrete defect | Async transactions can absorb and roll back unrelated writes. |
| F3 | Medium | Concrete performance defect | Every event hydrates all rules through `2 + 3N` SELECTs before event filtering, then performs more per-document/per-asset reads. |
| F4 | Medium | Concrete lifecycle defect | SQL diagnostic tables grow without retention. |
| F5 | Medium | Concrete integrity gap | Variant asset IDs are logical references without foreign keys. |
| F6 | Medium | Concrete restore defect | Restore leaves destination `twitch_accounts` state intact despite reconnect semantics. |
| F7 | Low | Concrete invariant gap | “Exactly one active alert set” is validator/service policy, but DB and legacy service mutation allow zero. |
| F8 | Low | Confirmed tuning | Four ordering/reverse-lookup query families are not fully covered by current indexes. |
| F9 | Low | Confirmed tuning | Overlay verification scans historical keys for the effectively constant overlay ID. |
| F10 | Low | Concrete atomicity gap | Single-account Twitch replacement uses delete-plus-upsert without a transaction. |
| F11 | Low | Migration hardening | Migration ledger does not reject unknown/future IDs, gaps, or edited migration bodies. |
| F12 | Optional | Tuning | No `PRAGMA optimize`/planner-statistics lifecycle exists. |

## Detailed recommendations

### F1 — Backup/restore loses `variant_order`

**Affected data and code**

- `alert_variants.variant_order`
- `apps/server/src/modules/db/migrations/011-alert-variant-order.ts:4-12`
- `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts:38-58`
- `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts:70-76`
- `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts:172-204`
- Default-variant semantics in `packages/core/src/alerts/alert-resolver.ts:103-111`

**Current behavior**

Migration 011 adds non-null `variant_order` and backfills it. Backup `tableDefinitions` omits that column and orders exported variants by `(rule_id, id)`. Restore inserts the exported column set, so SQLite supplies default `0` for every row. Subsequent repository reads order by `(variant_order, id)`, making ID order the restored order.

Executable reproduction:

- Stored order: `variant-000-z` at `0`, then `variant-000-a` at `1`.
- Exported order: `variant-000-a`, then `variant-000-z`.
- Neither exported row contained `variant_order`.

This can change which variant is treated as default. Editor-document ownership also depends on the first variant: the default document uses rule ID while variations use variant IDs.

**Risk**

Silent configuration corruption in a supported backup/restore path. Existing schema-11/archive-version-1 backups may already lack irrecoverable ordering information.

**Exact change**

- Add `variant_order` to the `alert_variants` backup columns.
- Export variants using `ORDER BY rule_id, variant_order, id`.
- Require and validate non-negative integer order values; reject duplicate `(rule_id, variant_order)` values in backup validation even if DB uniqueness is not added.
- Add a schema-drift test that compares owned backup columns with migrated table columns, with explicit allowlisted omissions such as `asset_metadata.storage_path` and provider secret refs.
- Bump archive contract version. Safest policy: reject affected legacy archives with a precise “variant order was not captured” error instead of silently guessing. If product chooses best-effort import, label ID-order reconstruction as lossy in preflight.

**Migration implications**

No DB migration is required: column already exists. Archive compatibility changes are required. Do not leave old and corrected payloads both labeled archive version 1/schema 11 without an explicit compatibility rule.

**Validation**

- Export/restore a rule whose ID order differs from `variant_order`.
- Assert full rule equality and same default editor document after restore.
- Assert reordered variants survive export/import.
- Assert legacy affected archive receives explicit reject/warning behavior.
- Assert backup column drift test fails when a future owned column is omitted.

### F2 — Async transaction isolation is incomplete

**Affected code**

- `apps/server/src/modules/db/database.ts:65-113`
- `apps/server/src/runtime/runtime-composition.ts:556-570`
- Atomic alert workflows in `apps/server/src/modules/alerts/alert-set-management-service.ts:139-474`

**Current behavior**

`runInTransactionAsync()` opens `BEGIN IMMEDIATE`, awaits arbitrary work, then commits or rolls back. Its `WeakMap` queue serializes only other calls to `runInTransactionAsync()`. Ordinary repository methods use the same shared `DatabaseSync` directly and do not join that queue.

Executable reproduction paused one async transaction after its own insert, performed an ordinary “outside” insert on the same connection, then threw from the transaction. Querying afterward returned no rows: both the transaction-owned and unrelated writes were rolled back.

Existing tests prove two queued async transactions do not erase each other; they do not cover a normal repository write during the paused transaction.

**Risk**

Cross-request data loss or unintended commits under concurrent management/event activity. Diagnostic writes are especially plausible unrelated participants because the event pipeline writes through ordinary repository calls.

**Exact change**

- Never hold this synchronous SQLite connection inside an `await` gap.
- Move each aggregate mutation into a synchronous transaction-scoped repository/unit-of-work method using `runInTransaction()` and the existing rule, management-metadata, and editor-document synchronous save primitives.
- Perform external I/O and non-DB preflight before opening the transaction.
- Keep compensation boundaries for filesystem/secret-store operations outside the DB transaction.
- If synchronous aggregate methods cannot cover all callers, introduce one connection execution gate and require every repository operation to use it; partial gating is not sufficient.

**Migration implications**

None.

**Validation**

- Add the reproduction above as a regression test; outside write must survive rollback.
- Run concurrent alert-set mutation and event diagnostic append tests.
- Assert no transaction remains open after success/failure.
- Retain nested synchronous savepoint tests.

### F3 — Per-event alert hydration is N+1

**Affected queries and call sites**

- `packages/core/src/alerts/alert-service.ts:274-305`
- `apps/server/src/modules/alerts/sqlite-alert-repository.ts:217-295`
- `apps/server/src/modules/playback/playback-coordinator.ts:108-138`
- `apps/server/src/modules/playback/playback-coordinator.ts:339-388`
- Management amplification in `apps/server/src/modules/alerts/alert-set-management-service.ts:105-131,574-646`
- Asset amplification in `apps/server/src/modules/assets/asset-library-service.ts:73-85,214-224`

**Current behavior**

`listRules()` runs one parent query, then three child queries per rule: collections, conditions, and variants. `listActiveRules()` adds a collection query and filters event type only after every rule is hydrated. Per event, base cost is therefore `2 + 3N` SELECTs for `N` configured rules, even when few rules match the event type.

After matching, playback loads an editor document for every variant of every ready rule, although variant selection occurs afterward and only the selected editor document is needed. Distinct asset IDs are then loaded one at a time.

Management alert-set and asset views compound this with per-set metadata, per-rule metadata, per-variant documents, and per-asset metadata queries.

**Risk**

Latency and event-loop blocking scale with total configured rules rather than matching rules. `DatabaseSync` makes each extra statement synchronous on the Node thread.

**Exact change**

- Add a repository-level `listActiveRules(eventType)` read model that filters enabled rules against the active collection in SQL.
- Hydrate collections, conditions, and variants in bulk queries keyed by returned rule IDs; assemble maps in memory. Target a constant query count, not one query per rule.
- Add `alert_rule_collections(collection_id, rule_id)` so active-collection traversal is indexed.
- Select variants before loading editor documents. Add `findMany(ids)` for editor documents and assets; query only selected editor IDs and referenced assets.
- Add bulk-list methods for alert-set and asset metadata before optimizing management views further.
- Do not add `alert_rules(event_type, enabled, id)` until the rewritten query is measured; the reverse junction index may be enough because only one collection is active.

**Migration implications**

One additive index migration for `(collection_id, rule_id)`. Repository/query changes otherwise need no schema change.

**Validation**

- Statement-count test with 1 and 100 rules; count should remain constant.
- Event-type negative case must not hydrate unrelated rule children.
- Compare hydrated domain results against current repository for representative rules.
- Re-run `EXPLAIN QUERY PLAN` after rewrite and benchmark on production-like counts.

### F4 — SQL diagnostics have no retention

**Affected tables and code**

- `event_logs`, `alert_match_logs`, `playback_logs`
- Append path: `apps/server/src/modules/events/event-pipeline.ts:47-125`
- Repository: `apps/server/src/modules/diagnostics/sqlite-log-repository.ts:53-177`
- Existing retention: `apps/server/src/modules/diagnostics/log-retention-service.ts:1-110`

**Current behavior**

Each processed event writes a received event row, then a processed/failed event row, plus zero or more match rows and normally one playback row. No production `DELETE` targets any SQL diagnostic table. Configured log retention deletes only JSONL/log files.

Existing timestamp indexes can already locate retention ranges efficiently; representative `DELETE ... WHERE received_at < ?` used `event_logs_received_at_idx`.

**Risk**

Unbounded database growth, increasing backup-independent disk use, write amplification, and read/sort cost on long-running streams.

**Exact change**

- Add batched repository pruning using the same cutoff as runtime log retention:

```sql
DELETE FROM event_logs
WHERE id IN (
  SELECT id FROM event_logs
  WHERE received_at < ?
  ORDER BY received_at, id
  LIMIT ?
);
```

- Equivalent queries use `matched_at` and `occurred_at`.
- Run bounded batches outside event processing, with a short transaction per batch.
- Replace each timestamp-only index with `(timestamp, id)` as described in F8.
- Do not run automatic `VACUUM`; deleted pages will be reused. Offer explicit offline compaction only if shrinking the file is a product requirement.

**Migration implications**

Index replacement migration only. Row deletion is operational behavior and needs a documented retention contract.

**Validation**

- Seed old/new rows including identical timestamps; prune only expired rows.
- Verify bounded batches converge and live inserts remain responsive.
- Verify diagnostics still return newest rows in deterministic order.
- Measure database page reuse after repeated prune/append cycles.

### F5 — Asset references are not relationally enforced

**Affected data and code**

- `alert_variants.visual_asset_id`, `alert_variants.audio_asset_id`
- Schema: `apps/server/src/modules/db/migrations/001-initial-schema.ts:41-55`
- Application guard: `apps/server/src/modules/assets/asset-library-service.ts:104-159`
- Backup-only reference validation: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts:515-534`

**Current behavior**

Asset usage is derived by hydrating all alert rules. Asset deletion checks that derived view, then deletes metadata/files with manual compensation. DB permits missing asset IDs and permits an asset row to be deleted while variants still reference it.

**Risk**

Concurrent changes, direct repository use, crash gaps, or future code paths can create dangling references. Overlay rendering then fails later rather than rejecting the invalid mutation.

**Exact change**

- Rebuild `alert_variants` with nullable foreign keys:

```sql
FOREIGN KEY (visual_asset_id) REFERENCES asset_metadata(id) ON DELETE RESTRICT,
FOREIGN KEY (audio_asset_id) REFERENCES asset_metadata(id) ON DELETE RESTRICT
```

- Add child-key indexes on `visual_asset_id` and `audio_asset_id`; SQLite otherwise scans the child table when deleting an asset.
- Preserve existing service impact checks for user-facing warnings; DB constraints are final integrity enforcement.

SQLite’s official FK guidance recommends child-key indexes because parent deletion otherwise performs a linear child-table scan: [SQLite Foreign Key Support](https://www.sqlite.org/foreignkeys.html#fk_indexes).

**Migration implications**

SQLite table rebuild. Preflight must detect and block existing dangling references before copy/rename. Preserve every current column, default, check, FK, and `variant_order` value.

**Validation**

- `PRAGMA foreign_key_check` after migration.
- Insert/update with missing asset must fail.
- Deleting referenced asset must fail; deleting unreferenced asset must succeed.
- Existing alert/asset management tests remain green.

### F6 — Restore retains stale Twitch account state

**Affected data and code**

- `twitch_accounts`
- Backup-owned table list: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts:38-58`
- Restore replacement/restore-point lists: same file `:97-122,172-204`
- Twitch status reads: `apps/server/src/modules/twitch/sqlite-twitch-account-repository.ts:45-55`
- Product contract: `docs/design/ui-refactor-mvp-ux-spec.md:712-725`

**Current behavior**

Provider registrations restore disconnected without secret refs, and overlay keys are explicitly cleared/regenerated. `twitch_accounts` is neither archived nor cleared nor captured in the operational restore point. Destination-machine account metadata therefore survives a restore. Twitch status maps that row to a connected account before proving its token exists.

This conflicts with the stated restore behavior: credentials are excluded and restored providers needing credentials show “Needs reconnect.”

**Risk**

UI/runtime can report or attempt the previous destination account after restoring different configuration. Existing deterministic OS token refs may also remain usable, defeating reconnect expectations.

**Exact change**

- Treat `twitch_accounts` as runtime credential-linked state, not portable configuration.
- Include it in the in-memory operational restore point, but not the exported archive.
- Clear `twitch_accounts` during successful replacement, like `overlay_keys`.
- After DB replacement succeeds, remove prior account token refs from secret storage. If cleanup fails, keep DB disconnected and surface an actionable orphan-secret warning.
- Resynchronize provider runtimes and assert management status is reconnect-required.

**Migration implications**

None.

**Validation**

- Restore over a connected destination account; resulting account status must be disconnected/reconnect-required.
- Force later restore failure; restore point must restore prior account row.
- Force secret deletion failure; DB must remain disconnected and warning must be reported.

### F7 — Active-set invariant permits zero rows

**Affected data and code**

- `alert_collections.enabled`
- Partial unique index: `apps/server/src/modules/db/migrations/007-alert-set-management.ts:32-34`
- Save behavior: `apps/server/src/modules/alerts/sqlite-alert-repository.ts:59-76`
- Self-repair: `apps/server/src/modules/alerts/alert-set-management-service.ts:105-112`
- Backup validation: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts:452-474`

**Current behavior**

DB enforces at most one active set. It cannot enforce at least one with this partial index. Generic collection mutation may disable the current set, management listing silently activates the first set, and backup export rejects configurations without exactly one active set.

**Risk**

State depends on which read surface runs next; a valid mutation can temporarily make export invalid and later reactivate an arbitrary first set.

**Exact change**

- Make activation the only supported active-state transition.
- Reject attempts to disable the current active set without atomically selecting a replacement.
- Keep current partial unique index; do not add trigger machinery solely to enforce “at least one.”

**Migration implications**

None.

**Validation**

- Disabling active set without replacement fails.
- Activation atomically swaps sets.
- Export always sees exactly one active set after supported mutations.

### F8 — Confirmed index coverage gaps

**Current plans and exact index changes**

| Query | Current plan | Proposed change | Candidate plan |
|---|---|---|---|
| Variants by rule ordered by `(variant_order,id)` | Uses `alert_variants_rule_id_idx`, then temp B-tree | Replace with `alert_variants(rule_id, variant_order, id)` | Covering index search; no temp sort |
| Junction lookup/cascade by `collection_id` | Full scan of `alert_rule_collections` | Add `(collection_id, rule_id)` | Covering index search |
| Newest event/match/playback rows | Uses timestamp index, then temp B-tree for `id` tie-break | Replace each with `(timestamp, id)` | Index scan; no temp sort |
| Overlay output history ordered by creation | Uses `overlay_keys_output_idx`, then temp B-tree | Extend to `(overlay_id, scope, module_id, target_profile_id, purpose, created_at, id)` | Covering search; no temp sort |

Suggested DDL names:

```sql
CREATE INDEX alert_rule_collections_collection_rule_idx
  ON alert_rule_collections(collection_id, rule_id);

CREATE INDEX alert_variants_rule_order_id_idx
  ON alert_variants(rule_id, variant_order, id);

CREATE INDEX event_logs_received_at_id_idx
  ON event_logs(received_at, id);
CREATE INDEX alert_match_logs_matched_at_id_idx
  ON alert_match_logs(matched_at, id);
CREATE INDEX playback_logs_occurred_at_id_idx
  ON playback_logs(occurred_at, id);

CREATE INDEX overlay_keys_output_created_idx
  ON overlay_keys(
    overlay_id, scope, module_id, target_profile_id, purpose, created_at, id
  );
```

After validating candidate plans, drop replaced prefix indexes:

- `alert_variants_rule_id_idx`
- `event_logs_received_at_idx`
- `alert_match_logs_matched_at_idx`
- `playback_logs_occurred_at_idx`
- `overlay_keys_output_idx`

SQLite documents using multi-column indexes for simultaneous filtering and ordering: [SQLite Query Planning](https://www.sqlite.org/queryplanner.html#searching_and_sorting_with_a_multi_column_index).

**Risk**

Current gaps are bounded today but amplify F3/F4 as configuration and diagnostics grow.

**Migration implications**

One additive/replacement index migration. Create candidates before dropping old indexes. No table rebuild.

**Validation**

- Assert no `USE TEMP B-TREE` for target queries.
- Assert retention range queries still use timestamp-prefix indexes.
- Benchmark read improvement and write cost with representative counts.

### F9 — Overlay verification scans historical keys

**Affected data and code**

- `overlay_keys`
- `apps/server/src/modules/overlays/sqlite-overlay-access-key-repository.ts:68-102`
- `apps/server/src/modules/overlays/overlay-access-service.ts:101-153`
- Existing indexes in migrations 001 and 006.

**Current behavior**

Verification hashes the request, loads every key for `overlay_id`, sorts by creation, then linearly finds the hash. Product uses `default` as the effective overlay ID, so representative planning chose a full table scan. Revoked rotation history is never pruned.

`findByOutput()` does use `overlay_keys_output_idx`, but still sorts because creation fields are absent from the index.

**Risk**

Authentication work grows with all historical route keys. Present volume is probably small, so severity remains low.

**Exact change**

- Add `CREATE UNIQUE INDEX overlay_keys_key_hash_unique ON overlay_keys(key_hash)`.
- Replace `findCandidates(overlayId)` with one exact hash lookup, then validate overlay/scope/purpose/module/profile in service code.
- Preserve denial semantics with a second indexed output-existence query only when no hash row exists.
- Extend output index as in F8.
- Drop `overlay_keys_overlay_id_idx` after plan verification; other indexes cover remaining real queries.
- Do not add revoked-key pruning until audit/history retention is specified.

**Migration implications**

Additive unique index, followed by redundant-index removal. Preflight duplicate hashes before creating uniqueness.

**Validation**

- Exact hash query uses unique index.
- Existing mismatch/revoked denial reasons remain unchanged.
- Duplicate stored hash is rejected.
- Rotation tests cover multiple historical keys.

### F10 — Twitch singleton replacement is not atomic

**Affected code**

- `apps/server/src/modules/twitch/sqlite-twitch-account-repository.ts:20-42`

**Current behavior**

Save deletes every other account, then upserts target account in a separate autocommit statement. JavaScript cannot interleave inside the method because it contains no `await`, but process failure between statements leaves no account.

**Risk**

Small crash-consistency window in authentication state.

**Exact change**

- Wrap delete-plus-upsert in `runInTransaction()`.
- Keep table scan/order query; intended cardinality is one, so a `connected_at` index is unnecessary.
- Do not add an exotic constant-expression singleton index unless another write boundary is introduced.

**Migration implications**

None.

**Validation**

- Throw between delete and upsert; old account must remain.
- Saving a replacement leaves exactly one row.

### F11 — Migration ledger lacks downgrade/drift guards

**Affected code**

- `apps/server/src/modules/db/database.ts:27-41,139-178`

**Current behavior**

Runner checks each known ID independently and applies missing IDs transactionally. It does not reject an unknown migration from a newer app, a non-prefix/gapped applied set, or a changed SQL body for an already-applied ID.

**Risk**

Older code may open a newer database and report its own lower `currentSchemaVersion`, or a damaged ledger may run against an unexpected shape.

**Exact change**

- On startup, read all applied migration IDs and require them to be an exact prefix of the known ordered migration list.
- Fail closed on unknown IDs, gaps, or reordering before running application queries.
- Keep migration IDs immutable. Add checksums only if migration editing has been an observed problem; prefix validation is the smallest useful guard now.

**Migration implications**

None for prefix validation. A future checksum column would require ledger backfill and is not recommended in the first slice.

**Validation**

- Unknown future ID, missing middle ID, and reordered ledger all fail with actionable messages.
- Normal prefix upgrade and idempotent reopen still pass.

### F12 — Optional planner-statistics lifecycle

No `ANALYZE` or `PRAGMA optimize` path exists. Current queries are simple and DBs are expected to be small, so this is not a defect.

SQLite currently recommends `PRAGMA optimize` after schema changes and periodically for long-lived connections: [SQLite PRAGMA documentation](https://www.sqlite.org/pragma.html#pragma_optimize), [ANALYZE guidance](https://www.sqlite.org/lang_analyze.html#periodically_run_pragma_optimize_).

Smallest future change:

- Run `PRAGMA optimize` after migrations that add indexes and before clean close.
- Add periodic execution only after field DBs become large enough for planner statistics to matter.

No migration required. Validate it remains fast/no-op on small databases and never runs inside a latency-sensitive request.

## Migration-by-migration review

| Migration | Physical effect | Audit assessment |
|---|---|---|
| `001-initial-schema` | Creates 11 domain tables: module config, alert aggregates, assets, overlay keys, and three diagnostic logs. Adds one variant, one overlay, and three timestamp indexes. | Aggregate ownership/cascades are sound. Initial gaps carried forward are asset references without FKs, collection-first junction lookup without an index, and timestamp indexes without the ID ordering tie-break. |
| `002-alert-variant-selection` | Adds non-null `conditions_json DEFAULT '[]'` and integer `priority DEFAULT 0` to variants. | Safe additive backfill. JSON is boundary-validated and not queried by SQL; no JSON normalization/index is justified. |
| `003-twitch-accounts` | Adds the six-column Twitch account table keyed by `account_id`. | Appropriate for intended singleton scale, but singleton replacement is repository policy and is not transactionally crash-safe (F10). |
| `004-overlay-key-secret-ref` | Adds nullable `route_key_secret_ref_json`. | Correct separation: only a secret reference reaches SQLite. Portable backup deliberately omits it. |
| `005-provider-registrations` | Adds provider table, enum/compatibility checks, partial unique active-capability index, and capability/name list index. | Strongest constrained table. Both indexes match/enforce current queries; keep them. |
| `006-overlay-key-target-profile` | Adds nullable target profile with module-scope/profile check and the output lookup index. | Check protects its narrow invariant. Output index has correct equality prefix but lacks the history ordering suffix (F8/F9). |
| `007-alert-set-management` | Repairs duplicate names/multiple-or-zero active sets, adds case-insensitive name uniqueness and at-most-one-active partial uniqueness, creates/backfills set/rule management metadata. | Migration is deterministic and preserves FK ownership. Runtime can later return to zero active sets, so mutation policy needs tightening (F7). |
| `008-asset-library-metadata` | Creates one-to-one cascading library metadata and backfills all assets with timestamped defaults. | Correct aggregate extension. No independent reverse index is needed because `asset_id` is the PK. |
| `009-alert-editor-documents` | Creates one-to-one rule-owned editor documents with cascade. | Correct for rule-only ownership at that schema version. |
| `010-variant-alert-editor-documents` | Rebuilds documents without an FK; adds two owner-validation and two owner-delete triggers for polymorphic rule/variant ownership. | Reasonable SQLite representation. All four triggers are needed and should remain. Existing rows are copied before the original table is dropped. |
| `011-alert-variant-order` | Adds non-null integer `variant_order DEFAULT 0` and backfills per-rule order using `(priority DESC,id)`. | DB evolution is valid; backup schema failed to evolve with it, causing F1. Current index does not cover the new order (F8). |

Every migration runs with its ledger insert in one `BEGIN IMMEDIATE` transaction. The runner correctly avoids partially applied known migrations, but ledger prefix/future-version validation remains F11.

## Database-use and query-boundary inventory

| Adapter / workflow | Tables and operation shape | Call-site and assessment |
|---|---|---|
| `sqlite-module-config-repository.ts` | PK lookup and upsert on `overlay_module_config`. | Runtime module configuration; PK-covered, constant-time, no issue. |
| `sqlite-alert-repository.ts` | Collection CRUD/activation; aggregate rule upsert followed by delete/reinsert of junctions and conditions plus variant upserts/deletes; parent list plus three child reads per rule. | Used by alert services, management, and playback. Writes are synchronously transactional; read shape is the central F3 N+1. |
| `sqlite-alert-set-metadata-repository.ts` | PK reads/upserts/deletes for set/rule metadata; transactional active-set swap. | Management-only. PK-covered, but callers repeat metadata reads per parent. Generic collection save can bypass intended activation policy (F7). |
| `sqlite-alert-editor-document-repository.ts` | PK read/delete/upsert. | Playback and editor management. Individually efficient; repeated per-variant reads cause F3. Trigger ownership is final DB validation. |
| `sqlite-asset-repository.ts` | Asset PK upsert/read/delete and unindexed full list ordered by ID. | Asset-library management and playback. Full list is intentional for current UI scale; repeated PK reads should be bulked before adding list indexes. |
| `sqlite-asset-library-metadata-repository.ts` | PK read/upsert/delete. | Management-only. PK-covered; caller repetition is the issue, not individual plans. |
| `sqlite-overlay-access-key-repository.ts` | Insert; PK lookup; overlay candidate history lookup; exact-output history lookup; revoke update. | Overlay issue/verify services. Exact-output equality is indexed, ordering is not fully covered; candidate verification is F9. |
| `sqlite-provider-registration-repository.ts` | Upsert; PK read; capability list; partial-unique active read; transactional activation; TTS safety update. | Provider management/runtime. Query plans use the two designed indexes; no change recommended. |
| `sqlite-twitch-account-repository.ts` | Delete-other then upsert; singleton newest read; PK delete. | Twitch authentication/status. Scan/sort is bounded by intended singleton; write atomicity is F10. |
| `sqlite-log-repository.ts` | Append and bounded newest-first read for each diagnostic table. | `event-pipeline.ts` writes received plus processed/failed events, matches, and playback. Reads are bounded, but append-only lifecycle is F4 and ordering indexes are F8. |
| `sqlite-configuration-snapshot-repository.ts` | Deterministic full-table logical export, transactional delete/insert restore, operational restore point, output-key discovery. | Backup service. Full scans are intentional and off the event path. Owned column drift and Twitch-state omission cause F1/F6. |
| `database.ts` / runtime composition | One shared `DatabaseSync`, migrations, synchronous savepoints/transactions, queued async transactions. | All adapters share the connection. Normal synchronous calls are not gated while an async transaction awaits, causing F2. |

No SQL occurs in Fastify route handlers or React. Core services call typed repository interfaces; server composition supplies SQLite adapters. Full scans in configuration backup and small singleton/list surfaces are deliberate. The high-value changes are purpose-built bulk read methods, not joins or SQL leaking across the boundary.

## Complete physical-schema inventory

All tables are ordinary, non-`STRICT`, rowid tables. Unless noted, columns are non-null and have no DB default. Every declared FK uses default `ON UPDATE NO ACTION`. Enum-like text fields without an explicit check below are unconstrained by SQLite and are validated at application boundaries.

| Table | Key, nullability, defaults, checks, and uniqueness | Relationships / indexes |
|---|---|---|
| `schema_migrations` | `id TEXT PK`; `applied_at TEXT` | PK autoindex only |
| `overlay_module_config` | `module_id TEXT PK`; `enabled INTEGER CHECK 0/1`; `config_json TEXT`; `updated_at TEXT` | PK autoindex |
| `alert_collections` | `id TEXT PK`; `name TEXT`; `enabled INTEGER CHECK 0/1`; unique `name COLLATE NOCASE`; partial unique `enabled WHERE enabled=1` | PK + two explicit unique indexes |
| `alert_rules` | `id TEXT PK`; `name`, `event_type`; `enabled CHECK 0/1`; `cooldown_seconds CHECK >=0`; integer `priority` | PK autoindex |
| `alert_rule_collections` | Composite PK `(rule_id,collection_id)` | Both columns FK with `ON DELETE CASCADE`; PK covers rule-first reads, not collection-first reads |
| `alert_rule_conditions` | Composite PK `(rule_id,position)`; `position CHECK >=0`; `field`, `operator`, `value_json` | `rule_id -> alert_rules` cascade; PK covers current filter/order |
| `alert_variants` | `id TEXT PK`; `enabled CHECK 0/1`; `weight CHECK >0`; nullable visual/audio asset IDs; nullable `tts_config_json`; `duration_ms CHECK >0`; `conditions_json DEFAULT '[]'`; `priority DEFAULT 0`; `variant_order DEFAULT 0` | `rule_id -> alert_rules` cascade; explicit `rule_id` index; no asset FKs |
| `asset_metadata` | `id TEXT PK`; filename/type/MIME/checksum/path; `size_bytes CHECK >0` | PK only; no checksum/path uniqueness |
| `overlay_keys` | `id TEXT PK`; nullable `module_id`, secret ref, revoke timestamp, target profile; target-profile check requires module scope and fixed profile enum when non-null | `overlay_id` index and composite output index; no FK |
| `event_logs` | `id TEXT PK`; event ID/type/JSON/time/status/correlation; nullable processing/error | Timestamp index; no FK by design |
| `alert_match_logs` | `id TEXT PK`; source event/rule/variant/time/correlation; nullable processing | Timestamp index; no FK by design |
| `playback_logs` | `id TEXT PK`; queue/source/alert IDs JSON/status/time/correlation; nullable processing/message | Timestamp index; no FK by design |
| `twitch_accounts` | `account_id TEXT PK`; login/display/scopes JSON/connected/updated | PK only; intended singleton is repository policy |
| `provider_registrations` | `id TEXT PK`; checked kind/capability/connection/intake enums and kind-capability/intake compatibility; `active CHECK 0/1`; nullable `secret_ref_json`, `intake_state`, `validated_at`, `error_json`, `tts_safety_json`; all other fields non-null | Partial unique active capability; `(capability,name,id)` list index |
| `alert_set_metadata` | `set_id TEXT PK`; three booleans and three review-state enum checks | `set_id -> alert_collections` cascade |
| `alert_rule_management_metadata` | `rule_id TEXT PK`; provider/review enums; profiles JSON | `rule_id -> alert_rules` cascade |
| `asset_library_metadata` | `asset_id TEXT PK`; display/tags JSON/created/updated | `asset_id -> asset_metadata` cascade |
| `alert_editor_documents` | `alert_id TEXT PK`; document JSON; updated timestamp | Polymorphic ownership enforced by four triggers, not FK |

### Foreign-key and cascade disposition

| Child | Parent | Delete policy | Assessment |
|---|---|---|---|
| `alert_rule_collections.rule_id` | `alert_rules.id` | Cascade | Correct aggregate ownership |
| `alert_rule_collections.collection_id` | `alert_collections.id` | Cascade | Correct; add reverse child index |
| `alert_rule_conditions.rule_id` | `alert_rules.id` | Cascade | Correct |
| `alert_variants.rule_id` | `alert_rules.id` | Cascade | Correct |
| `alert_set_metadata.set_id` | `alert_collections.id` | Cascade | Correct |
| `alert_rule_management_metadata.rule_id` | `alert_rules.id` | Cascade | Correct |
| `asset_library_metadata.asset_id` | `asset_metadata.id` | Cascade | Correct |
| `alert_editor_documents.alert_id` | Rule or variant | Trigger cascade | Reasonable polymorphic design; keep |
| `alert_variants.visual_asset_id/audio_asset_id` | `asset_metadata.id` | None | Gap; add `RESTRICT` FKs |

No FKs should be added from diagnostic logs to mutable alerts/events. Those rows are historical evidence and should survive configuration deletion until retention removes them.

### Timestamp and version fields

| Area | Fields | Current use |
|---|---|---|
| Migration ledger | `applied_at` | Audit only; no ordering/version guard |
| Module config | `updated_at` | Returned with config |
| Overlay keys | `created_at`, `revoked_at` | Deterministic history and revocation |
| Diagnostics | `received_at`, `matched_at`, `occurred_at` | Newest-first reads; proposed retention cutoffs |
| Twitch account | `connected_at`, `updated_at` | Connected status/order; singleton intent |
| Providers | `validated_at`, `created_at`, `updated_at` | Runtime status and management display |
| Asset library | `created_at`, `updated_at` | Management display |
| Alert editor docs | `updated_at` | Persisted but not used for optimistic concurrency |

ISO timestamps are produced/validated by application boundaries, and uniform UTC ISO text sorts correctly. DB does not validate timestamp format. No row-version/optimistic-lock column exists. Do not add one until simultaneous editor behavior is specified; current local-first UI is last-write-wins.

## Current index disposition

| Explicit index | Current evidence | Disposition |
|---|---|---|
| `alert_variants_rule_id_idx` | Filters child rows; temp sort remains | Replace with `(rule_id,variant_order,id)` |
| `overlay_keys_overlay_id_idx` | Representative default-overlay verification scanned table | Drop after exact hash/output indexes cover queries |
| `event_logs_received_at_idx` | Used, but temp sort on ID tie-break | Replace with `(received_at,id)` |
| `alert_match_logs_matched_at_idx` | Used, but temp sort on ID tie-break | Replace with `(matched_at,id)` |
| `playback_logs_occurred_at_idx` | Used, but temp sort on ID tie-break | Replace with `(occurred_at,id)` |
| `provider_registrations_one_active_capability` | Used by active-provider query; enforces invariant | Keep |
| `provider_registrations_capability_name` | Covering list query; correct column order | Keep |
| `overlay_keys_output_idx` | Used for exact output and active-output backup order; history sort remains | Extend with `(created_at,id)` |
| `alert_collections_unique_name_nocase` | Enforces product name invariant | Keep |
| `alert_collections_one_active_set` | Enforces at most one active set | Keep |

All PK autoindexes are justified. `alert_rule_collections` and `alert_rule_conditions` composite PKs correctly cover rule-first ordered reads.

## SQLite runtime-practice assessment

### Strong current practices

- `enableForeignKeyConstraints: true` plus explicit `PRAGMA foreign_keys = ON` on the sole production connection.
- `defensive: true`, extension loading disabled, double-quoted string literals disabled, and unknown named parameters rejected.
- `timeout: 5_000`, confirmed as `busy_timeout=5000`.
- Migration body and ledger insert run in one `BEGIN IMMEDIATE` transaction.
- Nested synchronous work uses savepoints and has rollback tests.
- DB closes explicitly after Fastify/runtime shutdown.
- Restore replaces relational configuration inside a transaction and has a pre-restore safety archive plus filesystem compensation.
- Secrets and raw overlay keys are excluded from SQLite/archives; only hashes and secret references persist.

### Journal/WAL and backup implications

- Production code never enables WAL. File-backed probe returned `journal_mode=delete`.
- App uses one shared connection; WAL would add little today and introduce checkpoint/companion-file obligations.
- Configuration backups are logical row snapshots plus verified asset bytes, not raw `.sqlite` copies. No code copies a live DB file, so WAL companion handling is not currently applicable.
- Do not enable WAL merely as generic tuning. Revisit only if the app adopts multiple concurrent connections or measured read/write contention. If enabled later, raw backup/copy behavior must use SQLite backup APIs or include/checkpoint `-wal` state. See [SQLite WAL documentation](https://www.sqlite.org/wal.html) and [SQLite Backup API](https://www.sqlite.org/backup.html).

### Transactions and concurrency

`BEGIN IMMEDIATE` is appropriate for short aggregate writes. Problem is holding that transaction across `await`, not begin mode. Single connection avoids inter-connection write races but does not prevent JavaScript tasks from entering the same open transaction.

### Normalization

Current JSON fields are reasonable when values are fetched and validated as complete documents: module config, provider config, editor documents, layouts, variant predicates, event payloads, TTS config, tags, and immutable playback alert IDs. Do not normalize them without a real SQL filtering/join requirement.

Good normalized relationships already exist where ordering/referential updates matter: rule collections, rule conditions, variants, set metadata, rule management metadata, and asset library metadata.

Potential future triggers for normalization:

- Server-side tag filtering at large asset counts.
- SQL querying of diagnostic payload fields.
- Dynamic target-profile cardinality beyond fixed landscape/vertical profiles.

None is current scope.

## Repository-boundary assessment

SQL production use is limited to:

- DB/migration runner.
- SQLite repository adapters for alerts, documents, metadata, assets, overlays, providers, Twitch, and diagnostics.
- Configuration snapshot/restore repository.

Fastify routes call services rather than SQL. Core owns framework-independent interfaces for alerts, assets, diagnostics, overlay access, and module config. Server-specific workflows own their repository contracts where appropriate. Runtime composition injects one connection into adapters.

Boundary weakness is aggregate reads: generic row-oriented interfaces force services to reconstruct read models through repeated calls. F3 should add purpose-built bulk/read-model methods rather than leaking SQL into React, routes, or core business logic.

## Unknowns and limits

- No live user DB was opened. Existing orphan rows, file size, page count, fragmentation, and real `sqlite_stat1` state remain unknown.
- Actual maximum alert, variant, asset, diagnostic, and overlay-key counts are not documented. Severity uses call frequency plus asymptotic behavior, not a production trace.
- Number of already-exported schema-11/archive-version-1 backups is unknown.
- Multi-tab concurrent alert editing behavior is unspecified; no recommendation adds optimistic locking yet.
- External tools/multiple-process access to the DB is unsupported/unknown. Current timeout helps but does not establish a multi-process ownership model.
- It is unclear whether the legacy generic collection enable/disable route remains product-supported; active-set management treats activation as the intended flow.

## Items that should not change now

- Do not add FKs from diagnostic history to mutable rule/variant/event rows.
- Keep existing aggregate `ON DELETE CASCADE` policies.
- Keep polymorphic editor-document triggers; splitting documents into rule/variant tables adds complexity without a current query benefit.
- Keep provider indexes and active-provider partial uniqueness.
- Keep bounded newest-first diagnostics API. Add keyset pagination only if browsing older retained history becomes a requirement; do not add OFFSET pagination now.
- Do not add a Twitch `connected_at` index if singleton intent is retained.
- Do not add `UNIQUE(rule_id,variant_order)` until save/reorder logic handles swaps without transient uniqueness violations.
- Do not rebuild every table for JSON/timestamp `CHECK` constraints. Boundary schemas already validate these documents; prioritize proven integrity gaps.
- Do not enable WAL, auto-vacuum, or scheduled `VACUUM` without measured need.
- Do not normalize JSON documents that are never filtered or joined in SQL.

## Prioritized implementation slices

Each slice should receive its own OpenSpec change or be added to an explicitly matching active change before implementation.

### Slice 1 — Backup ordering correctness

- Add `variant_order` to backup schema and ordering.
- Add owned-column drift test.
- Define archive-version compatibility/rejection for affected backups.
- Add end-to-end order/default-document round-trip tests.

No DB migration. Highest priority because current backup can silently change behavior.

### Slice 2 — Transaction isolation

- Remove `await` gaps from synchronous SQLite transactions.
- Move multi-repository alert mutations into synchronous units of work.
- Add unrelated-write rollback regression and concurrent event/management tests.

No DB migration.

### Slice 3 — Hot-path bulk alert reads

- Add SQL-filtered/bulk-hydrated active-rule read model.
- Select variants before document reads.
- Add bulk document/asset lookup.
- Add `(collection_id,rule_id)` index and statement-count tests.

One additive index migration.

### Slice 4 — SQL diagnostics lifecycle

- Define SQL diagnostic retention semantics from existing logging retention.
- Add batched prune methods and scheduling.
- Replace timestamp indexes with timestamp-plus-ID indexes.
- Add retention and newest-order plan tests.

One index migration; no table rebuild.

### Slice 5 — Referential and restore integrity

- Add asset FKs/indexes through `alert_variants` rebuild.
- Clear/capture Twitch account state during restore and clean secret refs after success.
- Guard active-set disable-without-replacement.

This can be split if reviewers want DB rebuild isolated from restore behavior. Asset work requires one carefully validated table-rebuild migration; other work requires none.

### Slice 6 — Low-risk index/security hardening

- Add unique key-hash lookup and extend overlay output index.
- Remove redundant overlay indexes after plan proof.
- Add migration-ledger prefix/future-version rejection.
- Consider `PRAGMA optimize` only after field-size evidence.

Additive/replacement index migration; no table rebuild.

## Final assessment

Schema is healthy enough for current local-first MVP scale, but backup order loss and async transaction leakage are release-blocking correctness risks for their affected workflows. Hot-path alert hydration and diagnostic retention are next operational priorities. Remaining index and hardening work is small, measurable, and should not be allowed to expand into a broad persistence rewrite.

## Post-implementation verification addendum

The approved `harden-sqlite-persistence` implementation was verified locally after all six slices were applied. This addendum records final evidence without changing the audit's historical baseline findings.

### Statement counts

| Read path | Baseline | Final | Evidence |
|---|---:|---:|---|
| Active rules, 1 configured rule | 5 SELECTs | 4 SELECTs | Baseline `2 + 3N`; final SQLite authorizer count in `sqlite-alert-repository.test.ts`. |
| Active rules, 100 configured rules | 302 SELECTs | 4 SELECTs | Final test asserts the same four statements for 1 and 100 rules. |

The four final statements select matching active rules, then bulk-load their collection memberships, conditions, and ordered variants. Event-type filtering happens in the parent SQL. Playback selects variants before one bulk editor-document read and one deduplicated bulk asset read.

### Final representative query plans

| Query shape | Final plan evidence |
|---|---|
| Active collection membership | Uses `alert_rule_collections_collection_rule_idx`; no full junction scan. |
| Variants by rule and saved order | Uses `alert_variants_rule_order_idx`; no temporary ordering B-tree. |
| Newest diagnostics and retention cutoff | Uses the matching `(timestamp,id)` composite index for both order and range; no temporary ordering B-tree. |
| Exact overlay-key verifier | Uses unique `overlay_keys_key_hash_unique`. |
| Exact output history | Uses `overlay_keys_output_history_idx`; no temporary ordering B-tree. |

The old rule-only variant, timestamp-only diagnostic, overlay-ID, and short output indexes were removed after their replacements proved the required prefix/order plans.

### Final physical inventory and live smoke

- Executable migrations: **16**, ending at `016-overlay-key-lookup-indexes`.
- Relational tables: **18**.
- Explicit indexes: **13**; total indexes including SQLite autoindexes: **31**.
- Foreign-key entries: **9**.
- Triggers: **4**.
- `PRAGMA foreign_key_check` is empty in migration coverage.
- The regenerated executable schema explorer reported 16 migrations and 18 tables.
- Fresh post-rebase tests opened schema 16; the runtime, backup, and overlay suites verified archive version 2 with ordered variants, generated overlay routes, and HTTP 401 rejection for wrong route keys.

The implementation deliberately leaves journal mode/WAL policy, vacuuming, JSON normalization, optimistic row versions, migration checksums, and periodic `PRAGMA optimize` unchanged pending separate field evidence.

## Post-rebase audit disposition

The implementation commit was rebased onto `origin/main` at `212f8fed3eb20673c2437f5f8ee88c7f3ac72d34`, whose `012-revoke-unsupported-overlay-keys` migration now precedes this change's renumbered `013` through `016` migrations. The executable schema explorer and focused migration/repository/service tests confirm that integration is structurally sound. No additional schema, foreign-key, or index migration is required by the rebase.

Two changes remain before merge: one hot-query rewrite and one artifact-truth correction. Two residual database-use improvements are worth separate follow-up. None was introduced by the rebase, and none requires another migration.

### Required — Remove temporary B-trees from the active-rule parent query

**Affected query:** `SqliteAlertRepository.listActiveRules()`.

**Current behavior:** The fixed four-statement path uses `alert_collections_one_active_set`, covering `alert_rule_collections_collection_rule_idx`, and the alert-rule PK, but the parent `SELECT DISTINCT ... ORDER BY rules.id` still reports both `USE TEMP B-TREE FOR DISTINCT` and `USE TEMP B-TREE FOR ORDER BY`. `DISTINCT` is unnecessary because `(rule_id, collection_id)` is unique and the partial unique active-set index permits at most one enabled collection.

**Risk:** Every event pays two avoidable temporary-sort operations on the otherwise-hardened hot path. The work is bounded by matching rules, so this is a confirmed performance defect rather than a correctness defect.

**Exact change:** Drive the query from `alert_rule_collections`, resolve the one active collection with a scalar subquery, remove `DISTINCT`, and order by `memberships.rule_id`:

```sql
SELECT rules.id, rules.name, rules.event_type, rules.enabled,
       rules.cooldown_seconds, rules.priority
FROM alert_rule_collections AS memberships
JOIN alert_rules AS rules ON rules.id = memberships.rule_id
WHERE memberships.collection_id = (
  SELECT id FROM alert_collections WHERE enabled = 1
)
  AND rules.enabled = 1
  AND rules.event_type = ?
ORDER BY memberships.rule_id;
```

The representative plan uses the covering collection/rule index, scalar active-set lookup, and alert-rule PK without a temporary B-tree.

**Migration implications:** None. Migration 013 already supplies the required index in the correct column order.

**Validation:** Extend the existing 1-versus-100-rule statement-count/behavior test with parent-query `EXPLAIN QUERY PLAN` assertions for all three expected indexes and no `USE TEMP B-TREE`; retain negative event-type, disabled-rule, and inactive-collection cases.

### Optional — Residual management read amplification

**Affected code:** `SqliteAlertRepository.listRulesSync()`, `AlertSetManagementService.listSets()` / `getSet()`, and `AssetLibraryService.listItems()` / `#deriveUsage()`.

**Current behavior:** The event path is fixed at four SELECTs, and the management code now uses the promised bulk set/rule-metadata and document methods. The general rule reader still executes one parent SELECT plus three child SELECTs per rule, however. `getSet()` calls `listSets()` and then repeats `listRules()` and browser-source loading. Asset usage also performs one `findRule()` metadata query for every rule that references an asset.

**Risk:** Larger profiles can make alert-set and asset-library management increasingly slow on the single SQLite connection. These are user-driven management paths, not the fixed per-event path, and no production-sized row counts currently justify holding this PR for them. Repeated reads can also assemble one response from different snapshots when another management request commits between them.

**Exact change:** Bulk-hydrate general rule lists with the same keyed child-query pattern used by `listActiveRules()` or add a collection-scoped bulk reader; refactor `getSet()` to build its overview and detail from one collections/rules/browser-source snapshot instead of calling `listSets()` first; and use `AlertSetMetadataRepository.findRules()` once in asset usage derivation. If asset-library row metadata is also observed as material at field scale, add a typed `findMany()` beside its existing `find()` rather than a generic repository abstraction.

**Migration implications:** None. Existing PK and composite indexes cover the proposed bulk lookups.

**Validation:** Add SQLite authorizer statement-count tests for one versus 100 rules on `listSets()`, `getSet()`, and asset usage. Assert stable result equivalence, empty inputs, deduplication, and no repeated browser-source load in `getSet()`.

### Optional — Recheck activation state inside the atomic swap

**Affected code:** `AlertSetManagementService.activateSet()` and `SqliteAlertSetMetadataRepository.activateSet()`.

**Current behavior:** Eligibility and confirmation are computed through several asynchronous reads, then the repository transaction only rechecks that the target collection exists before disabling the current set and enabling it. A concurrent rule or collection mutation between those phases can make the approved target snapshot stale and still be activated.

**Risk:** Two concurrent management requests can activate a set whose blocker/warning decision no longer matches the committed rows. The swap remains exactly-one and atomic, and supported edits can also change an active set immediately after activation, so this is optimistic-concurrency hardening rather than a rebase regression.

**Exact change:** Pass the expected target collection and affected rule snapshots into a synchronous activation mutation. Inside the same `runInTransaction()` that swaps `enabled`, re-read and compare those rows; reject on drift so the caller can reload impact and retry. Keep external I/O and user confirmation outside the transaction.

**Migration implications:** None.

**Validation:** Add a regression that pauses after activation impact is calculated, mutates a target rule or collection, resumes activation, and proves the swap is rejected while the original active set remains enabled. Retain the existing successful atomic replacement and partial-unique-index tests.

### Required — Reconcile OpenSpec delivery state with the rebased PR

**Affected artifacts:** `openspec/changes/harden-sqlite-persistence/design.md`, `tasks.md`, and this addendum's live-smoke evidence.

**Current behavior:** The change is strict-valid but remains 34 of 44 tasks complete. Its design requires six sequential slice PRs landing in `main`; the implementation is instead consolidated in one PR, so the unchecked planning/landing tasks cannot truthfully be completed as written. The prior addendum also reported schema 15 after the rebase introduced schema 16; that statement is corrected above.

**Risk:** Merging leaves the authoritative OpenSpec change permanently in-progress and records a delivery process that did not occur. Strict validation checks artifact shape, not task truth or runtime smoke freshness.

**Exact change:** Before merge, either split delivery to match the approved design or amend the design/tasks to explicitly record an approved consolidated-PR exception. Mark only freshly verified gates complete. Re-run and record the schema-16 disposable runtime smoke, then strict-validate. Sync and archive only after the implementation is in `main`.

**Migration implications:** None.

**Validation:** `openspec.cmd list --json`, `openspec.cmd validate harden-sqlite-persistence --strict`, full repository gates, schema-16 runtime smoke, and confirmation that the final task state matches actual Git history.

### Confirmed strengths and deliberate non-changes

- Main's migration 012 composes cleanly with 013–016; ledger prefix validation rejects unknown, reordered, gapped, and future histories.
- The alert-variant rebuild preserves ordering/default/check semantics, recreates dependent triggers and indexes, rejects dangling assets before mutation, and leaves `PRAGMA foreign_key_check` clean.
- The event hot path, playback document/assets, diagnostic retention/order, exact overlay-key lookup, backup variant order, restore compensation, and Twitch singleton replacement have focused regression coverage.
- Keep foreign keys enabled per connection, the 5-second busy timeout, rollback journal mode, narrow synchronous transactions, current cascade/restrict policies, and deliberate absence of `VACUUM`, WAL, migration checksums, optimistic row versions, and periodic `PRAGMA optimize` until field evidence justifies a separate change.
