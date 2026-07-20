# Harden SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the two confirmed SQLite correctness defects, then land the approved query, retention, referential-integrity, restore, overlay, and migration hardening as six independently reviewable slices.

**Architecture:** Keep one `node:sqlite` connection and existing typed repository boundaries. Never hold its transaction across `await`; use synchronous materialized mutation commits, fixed-count bulk read models, bounded retention deletes, and four forward-only migrations. Merge each slice to remote `main` before the next agent starts so migration numbering and shared OpenSpec tasks remain deterministic.

**Tech Stack:** TypeScript 6, Node.js 24 `node:sqlite`, SQLite, Zod, Vitest, Fastify inject/runtime smoke tests, pnpm workspaces, OpenSpec.

## Global Constraints

- Baseline for this plan is `origin/main` commit `da7a21fce002cbe921e9ca9680b3a64100808347`, with migrations 001–011; stop and update migration filenames below if refreshed remote `main` differs.
- Merge this plan, the audit, and `openspec/changes/harden-sqlite-persistence/` before implementation; production slices branch from that planning commit on remote `main`.
- One slice per `codex/` branch, one implementer agent, one fresh reviewer agent, and one PR. Do not run migration-owning slices in parallel.
- Before every slice: `git fetch origin`, prove the prior slice is an ancestor of `origin/main`, run `openspec.cmd list --json`, and read the matching OpenSpec task/spec sections.
- Use TDD: focused failing regression first, minimum implementation, focused pass, affected package gates, then commit.
- Preserve strict TypeScript, explicit `.js` NodeNext imports, `import type`, repository boundaries, `127.0.0.1`, management/overlay authorization separation, and secret redaction.
- No new dependencies. Do not enable WAL, vacuuming, JSON normalization, optimistic row versions, migration checksums, or `PRAGMA optimize`.
- Do not weaken tests. Rebuild/restart and live-smoke affected server/UI workflows before each user-visible slice is declared complete.

---

## Agent Orchestration

The orchestrator owns integration only. For each slice it dispatches an implementer with:

1. The exact OpenSpec task range.
2. The matching section of this plan.
3. The audit finding IDs.
4. A fresh worktree rooted at current `origin/main`.
5. An output contract: commit hash, changed files, focused/full gate results, query-plan evidence, and unresolved risks.

After implementation, dispatch a fresh reviewer with no edit authority first. Reviewer checks requirements, data safety, test quality, and smallest-diff compliance. The implementer addresses accepted findings, reruns gates, and only then may the orchestrator publish. Never let two agents edit `database.ts`, migration registry, or `tasks.md` concurrently.

## Planned File Ownership

| Slice | Primary files |
|---|---|
| 1 | Core backup contracts/tests; configuration backup service/snapshot repository/tests; runtime restore smoke |
| 2 | DB transaction helper/tests; alert-set management/editor services/tests; new synchronous SQLite mutation boundary; runtime composition |
| 3 | Core alert/asset repository contracts; SQLite alert/document/asset/metadata repositories; playback/management services; migration 012 |
| 4 | Core diagnostics repository; SQLite diagnostics repository; local maintenance/runtime composition; migration 013 |
| 5 | Asset/alert/Twitch/backup repositories and services; migration 014; their named unit and runtime tests |
| 6 | Overlay access contract/repository/service; DB migration runner; migration 015; HTTP/WebSocket/runtime tests |

## Task 0: Land Planning Artifacts

**Files:**

- Create: `docs/audits/2026-07-20-sqlite-schema-query-index-audit.md`
- Create: `docs/superpowers/plans/2026-07-20-harden-sqlite-persistence.md`
- Create: `openspec/changes/harden-sqlite-persistence/**`

**Interfaces:**

- Consumes: audit findings F1–F12 and current OpenSpec base specs.
- Produces: apply-ready change `harden-sqlite-persistence`; task ranges 2–7 are the six implementation gates.

- [ ] **Step 1: Validate planning artifacts**

Run:

```powershell
openspec.cmd status --change harden-sqlite-persistence --json
openspec.cmd validate harden-sqlite-persistence --strict
```

Expected: `isComplete: true`; strict validation succeeds.

- [ ] **Step 2: Confirm planning-only scope**

Run:

```powershell
git status --short
git diff --check
```

Expected: only the audit, this plan, and `openspec/changes/harden-sqlite-persistence/` are new; no production file is modified.

- [ ] **Step 3: Commit planning**

```powershell
git add docs/audits/2026-07-20-sqlite-schema-query-index-audit.md docs/superpowers/plans/2026-07-20-harden-sqlite-persistence.md openspec/changes/harden-sqlite-persistence
git commit -m "docs: plan sqlite persistence hardening"
```

Expected: one planning-only commit. Publish/merge only when explicitly requested.

## Task 1: Slice 1 — Backup Ordering Correctness

**OpenSpec:** tasks 2.1–2.5; findings F1.

**Files:**

- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.test.ts`
- Test: `apps/server/src/runtime/runtime-composition.smoke.test.ts`

**Interfaces:**

- Consumes: current archive-version-1 schema and migration-011 `variant_order`.
- Produces: archive version 2; exact variant ordering; explicit version-1 blocker; owned-column drift guard.

- [ ] **Step 1: Write the order-loss regression**

Add a snapshot test with IDs deliberately opposite the saved order:

```ts
expect(snapshot.tables.alert_variants).toEqual([
  expect.objectContaining({ id: "variant-z", variant_order: 0 }),
  expect.objectContaining({ id: "variant-a", variant_order: 1 })
]);
```

Restore the snapshot into a new in-memory DB and assert repository output remains `variant-z`, then `variant-a`.

- [ ] **Step 2: Run the failing focused tests**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts packages/core/src/management/contracts.test.ts
```

Expected: FAIL because `variant_order` is absent and archive version accepts only 1.

- [ ] **Step 3: Add version-2 contracts and legacy-envelope classification**

Use one exported current version constant and keep legacy recognition narrow:

```ts
export const currentConfigurationBackupArchiveVersion = 2 as const;

const configurationBackupManifestV2Schema = configurationBackupManifestBaseSchema.extend({
  archiveVersion: z.literal(currentConfigurationBackupArchiveVersion)
});

const legacyConfigurationBackupEnvelopeSchema = z.object({
  manifest: z.object({ archiveVersion: z.literal(1), schemaVersion: nonNegativeIntegerSchema }).passthrough()
}).passthrough();
```

`preflight()` checks the legacy envelope before returning the generic invalid-archive blocker. It returns: summary `Backup variant order was not captured`; next step `Export a new backup from the source installation.` It never mutates or restores the legacy payload.

- [ ] **Step 4: Correct snapshot columns and order**

Change the variant table definition to:

```ts
{
  name: "alert_variants",
  columns: [
    "id", "rule_id", "name", "enabled", "weight", "visual_asset_id",
    "audio_asset_id", "text_template", "tts_config_json", "duration_ms",
    "layout_json", "conditions_json", "priority", "variant_order"
  ],
  orderBy: ["rule_id", "variant_order", "id"]
}
```

Validate `variant_order` is a non-negative integer and reject duplicate `(rule_id, variant_order)` pairs during snapshot validation.

- [ ] **Step 5: Add owned-column drift protection**

In the repository test, compare `PRAGMA table_xinfo(<table>)` names with each portable table definition. Use one explicit allowlist:

```ts
const intentionallyExcludedColumns = new Map([
  ["asset_metadata", new Set(["storage_path"])],
  ["provider_registrations", new Set(["secret_ref_json"])]
]);

const intentionallyExcludedTables = new Set([
  "schema_migrations", "overlay_keys", "event_logs", "alert_match_logs",
  "playback_logs", "twitch_accounts"
]);
```

Fail if any other migrated column is missing from the mapping.

- [ ] **Step 6: Run focused and affected gates**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/management/contracts.test.ts apps/server/src/modules/backup/configuration-backup-service.test.ts apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
corepack.cmd pnpm typecheck
openspec.cmd validate harden-sqlite-persistence --strict
```

Expected: all pass; exact-order round trip and version-1 blocker are covered.

- [ ] **Step 7: Commit Slice 1**

```powershell
git add packages/core/src/management apps/server/src/modules/backup apps/server/src/runtime/runtime-composition.smoke.test.ts openspec/changes/harden-sqlite-persistence/tasks.md
git commit -m "fix: preserve alert variant backup order"
```

## Task 2: Slice 2 — Transaction Isolation

**OpenSpec:** tasks 3.1–3.6; findings F2.

**Files:**

- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`
- Create: `apps/server/src/modules/alerts/sqlite-alert-set-mutation-store.ts`
- Create: `apps/server/src/modules/alerts/sqlite-alert-set-mutation-store.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Test: `apps/server/src/runtime/runtime-composition.test.ts`

**Interfaces:**

- Consumes: fully validated/materialized alert rules, metadata, and editor documents.
- Produces: `AlertSetMutationStore.commit(input): void`, implemented by SQLite with `runInTransaction()` and no Promise callback.

- [ ] **Step 1: Add the unrelated-write regression**

Reproduce the failure with the existing helper before removing it:

```ts
const transaction = runInTransactionAsync(database.connection, async () => {
  database.connection.prepare("INSERT INTO overlay_module_config VALUES (?, ?, ?, ?)")
    .run("transaction-write", 1, "{}", now);
  await paused;
  throw new Error("rollback");
});

database.connection.prepare("INSERT INTO overlay_module_config VALUES (?, ?, ?, ?)")
  .run("outside-write", 1, "{}", now);
release();
await expect(transaction).rejects.toThrow("rollback");
expect(database.connection.prepare("SELECT module_id FROM overlay_module_config").all())
  .toEqual([{ module_id: "outside-write" }]);
```

Expected before fix: assertion fails because both rows are rolled back.

- [ ] **Step 2: Define a materialized mutation contract**

Keep the contract use-case-oriented and synchronous:

```ts
export type AlertSetMutation =
  | { readonly kind: "save"; readonly rules: readonly AlertRule[]; readonly setMetadata: readonly AlertSetMetadata[]; readonly ruleMetadata: readonly AlertRuleManagementMetadata[]; readonly documents: readonly AlertEditorDocument[]; readonly deletedRuleIds: readonly string[]; readonly deletedDocumentIds: readonly string[]; readonly deletedSetIds: readonly string[] }
  | { readonly kind: "activate"; readonly setId: string };

export interface AlertSetMutationStore {
  commit(mutation: AlertSetMutation): void;
}
```

Use complete arrays, including empty arrays; do not add optional fields or generic async callbacks.

- [ ] **Step 3: Implement the SQLite commit boundary**

`SqliteAlertSetMutationStore.commit()` calls only existing synchronous adapter primitives inside:

```ts
runInTransaction(this.#connection, () => {
  assertMutationPreconditions(this.#connection, mutation);
  applyDeletes(mutation);
  applySaves(mutation);
});
```

`assertMutationPreconditions` checks referenced set/rule IDs and active-set invariants at commit time. No `await`, filesystem call, secret-store call, or network call is permitted in this file.

- [ ] **Step 4: Materialize each management mutation before commit**

For create, duplicate, reset, enable, delete, and set deletion: perform reads, schemas, ID generation, copies, and live-impact checks first; produce one `AlertSetMutation`; call `commit()` once; then perform response reads. Do not call async repositories from inside `commit()`.

The alert editor aggregate save uses the same rule/metadata/document `save` mutation instead of `runInTransactionAsync()`.

- [ ] **Step 5: Remove the unsafe helper**

After `rg -n "runInTransactionAsync" apps packages` returns tests/imports only, delete its production implementation and obsolete queue tests. Retain `runInTransaction()` and nested savepoint coverage.

- [ ] **Step 6: Verify atomic behavior**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/db/database.test.ts apps/server/src/modules/alerts/sqlite-alert-set-mutation-store.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/events/event-pipeline.test.ts apps/server/src/runtime/runtime-composition.test.ts
corepack.cmd pnpm typecheck
openspec.cmd validate harden-sqlite-persistence --strict
```

Expected: alert mutations are all-or-nothing; the outside diagnostic/module write survives failed mutation; no production async transaction helper remains.

- [ ] **Step 7: Commit Slice 2**

```powershell
git add apps/server/src/modules/db apps/server/src/modules/alerts apps/server/src/runtime/runtime-composition.ts apps/server/src/runtime/runtime-composition.test.ts openspec/changes/harden-sqlite-persistence/tasks.md
git commit -m "fix: isolate sqlite alert transactions"
```

## Task 3: Slice 3 — Hot-Path Bulk Alert Reads

**OpenSpec:** tasks 4.1–4.7; findings F3 and alert-related F8.

**Files:**

- Modify: `packages/core/src/alerts/repository.ts`
- Modify: `packages/core/src/alerts/alert-service.ts`
- Modify: `packages/core/src/alerts/alert-service.test.ts`
- Modify: `packages/core/src/assets/repository.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-repository.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-repository.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.test.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-set-metadata-repository.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.ts`
- Modify: `apps/server/src/modules/assets/sqlite-asset-repository.ts`
- Modify: `apps/server/src/modules/playback/playback-coordinator.ts`
- Create: `apps/server/src/modules/db/migrations/013-alert-read-indexes.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Test: `apps/server/src/modules/alerts/sqlite-alert-repository.test.ts`
- Test: `apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.test.ts`
- Test: `apps/server/src/modules/alerts/sqlite-alert-set-metadata-repository.test.ts`
- Test: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- Test: `apps/server/src/modules/assets/sqlite-asset-repository.test.ts`
- Test: `apps/server/src/modules/playback/playback-coordinator.test.ts`

**Interfaces:**

- Consumes: `StreamEventType`, active collection, stored normalized rules/documents/assets.
- Produces:

```ts
export interface ListActiveAlertRulesQuery {
  readonly eventType?: StreamEventType;
}

// AlertRepository
listActiveRules(query?: ListActiveAlertRulesQuery): Promise<readonly AlertRule[]>;

// AssetRepository
findManyByIds(assetIds: readonly string[]): Promise<ReadonlyMap<string, AssetRecord>>;

// AlertEditorDocumentRepository
findMany(editorIds: readonly string[]): Promise<ReadonlyMap<string, AlertEditorDocument>>;

// AlertSetMetadataRepository
findSets(setIds: readonly string[]): Promise<ReadonlyMap<string, AlertSetMetadata>>;
findRules(ruleIds: readonly string[]): Promise<ReadonlyMap<string, AlertRuleManagementMetadata>>;
```

Each `findMany` deduplicates IDs and returns an empty map for empty input.

- [ ] **Step 1: Add fixed-statement-count tests**

Instrument `DatabaseSync.prepare` in the SQLite alert test and count executed SELECTs for one and 100 rules. Both calls to `listActiveRules({ eventType: "follow" })` must use the same count. Include unrelated event types and disabled collections/rules.

Add playback expectations proving only the selected variant document and distinct referenced assets are fetched.

- [ ] **Step 2: Run tests and record the failure**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/alerts/sqlite-alert-repository.test.ts apps/server/src/modules/playback/playback-coordinator.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts
```

Expected: current statement count grows as `2 + 3N`; document/asset spies show repeated reads.

- [ ] **Step 3: Add migration 012**

Use this exact DDL if migration 011 remains latest:

```sql
CREATE INDEX alert_rule_collections_collection_rule_idx
  ON alert_rule_collections(collection_id, rule_id);

CREATE INDEX alert_variants_rule_order_id_idx
  ON alert_variants(rule_id, variant_order, id);

DROP INDEX alert_variants_rule_id_idx;
```

Register `alertReadIndexesMigration` after migration 011. Migration tests assert the old index is absent and both new indexes have exact column order.

- [ ] **Step 4: Implement active-rule bulk hydration**

Select parent IDs first:

```sql
SELECT DISTINCT r.id, r.name, r.event_type, r.enabled, r.cooldown_seconds, r.priority
FROM alert_collections AS c
JOIN alert_rule_collections AS rc ON rc.collection_id = c.id
JOIN alert_rules AS r ON r.id = rc.rule_id
WHERE c.enabled = 1
  AND r.enabled = 1
  AND (? IS NULL OR r.event_type = ?)
ORDER BY r.id;
```

Then execute one query each for collection links, ordered conditions, and ordered variants using placeholders for returned rule IDs. Assemble maps exactly as current `mapRule` behavior does. Empty parent result returns immediately.

`DefaultAlertService.listActiveRules(input)` delegates directly to `repository.listActiveRules(input)`; keep its existing domain tests to prove behavior equality.

- [ ] **Step 5: Add bulk document, asset, and metadata reads**

Use a shared local placeholder helper only if one already exists; otherwise keep this private pattern in each adapter implementing `findManyByIds`, `findMany`, `findSets`, or `findRules`:

```ts
const ids = [...new Set(inputIds)];
if (ids.length === 0) return new Map();
const placeholders = ids.map(() => "?").join(", ");
const rows = this.#connection.prepare(
  `SELECT ${columns} FROM ${table} WHERE ${idColumn} IN (${placeholders})`
).all(...ids);
return new Map(rows.map((row) => [String(row[idColumn]), mapRow(row)]));
```

Do not add a generic SQL repository abstraction. Add only typed `findMany` methods beside existing `find`/`findById` methods.

- [ ] **Step 6: Reorder playback reads**

In `PlaybackCoordinator`, resolve the selected variant for each ready rule first. Build document IDs (`rule.id` for default index 0; selected `variant.id` otherwise), load documents once, collect distinct visual/audio asset IDs from selected variants, and load those assets once. Preserve current missing-document/asset fail-closed behavior.

- [ ] **Step 7: Bulk management rows**

In `listSets()`/`getSet()`, load set metadata, rule metadata, and editor documents once and pass maps into pure overview/inventory mapping. Do not make `#toOverview` or `#toInventoryRows` execute repository calls.

- [ ] **Step 8: Prove query plans**

Test `EXPLAIN QUERY PLAN` contains the expected index names and no `USE TEMP B-TREE` for:

```sql
SELECT rule_id FROM alert_rule_collections WHERE collection_id = ? ORDER BY rule_id;
SELECT id FROM alert_variants WHERE rule_id = ? ORDER BY variant_order, id;
```

- [ ] **Step 9: Run affected gates**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/alerts/alert-service.test.ts apps/server/src/modules/alerts apps/server/src/modules/assets apps/server/src/modules/playback/playback-coordinator.test.ts apps/server/src/modules/db/database.test.ts
corepack.cmd pnpm typecheck
corepack.cmd pnpm build
openspec.cmd validate harden-sqlite-persistence --strict
```

Expected: fixed statement count for 1/100 rules; no selected-result drift; plan assertions pass.

- [ ] **Step 10: Commit Slice 3**

```powershell
git add packages/core/src/alerts packages/core/src/assets apps/server/src/modules/alerts apps/server/src/modules/assets apps/server/src/modules/playback apps/server/src/modules/db openspec/changes/harden-sqlite-persistence/tasks.md
git commit -m "perf: bound sqlite alert reads"
```

## Task 4: Slice 4 — SQL Diagnostics Lifecycle

**OpenSpec:** tasks 5.1–5.6; findings F4 and diagnostic F8.

**Files:**

- Modify: `packages/core/src/diagnostics/repository.ts`
- Modify: `apps/server/src/modules/diagnostics/sqlite-log-repository.ts`
- Modify: `apps/server/src/modules/diagnostics/sqlite-log-repository.test.ts`
- Modify: `apps/server/src/modules/settings/local-maintenance-service.ts`
- Modify: `apps/server/src/modules/settings/local-maintenance-service.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Test: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Create: `apps/server/src/modules/db/migrations/014-diagnostic-retention-indexes.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`

**Interfaces:**

```ts
export interface DiagnosticsPruneResult {
  readonly eventLogs: number;
  readonly alertMatchLogs: number;
  readonly playbackLogs: number;
}

pruneBefore(cutoff: string, batchSize: number): Promise<DiagnosticsPruneResult>;
```

- Consumes: one ISO cutoff computed from `LogSettings.retentionHours` and maintenance `now`.
- Produces: at most `batchSize` deletes per table per call; caller repeats until all three counts are below the batch size.

- [ ] **Step 1: Write retention regressions**

Seed old/current rows in all three tables, with more than one batch sharing the same timestamp. Assert one call deletes no more than `batchSize` per table, repeated calls converge, and boundary rows (`timestamp === cutoff`) remain.

Extend maintenance tests so `clearOldLogs()` returns both file and row counts:

```ts
expect(result).toEqual({
  deletedFileCount: 2,
  deletedDiagnosticRows: { eventLogs: 4, alertMatchLogs: 3, playbackLogs: 2 }
});
```

- [ ] **Step 2: Run the failing tests**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/diagnostics/sqlite-log-repository.test.ts apps/server/src/modules/settings/local-maintenance-service.test.ts
```

Expected: repository lacks `pruneBefore`; maintenance only returns file count.

- [ ] **Step 3: Add migration 013**

```sql
CREATE INDEX event_logs_received_at_id_idx ON event_logs(received_at, id);
CREATE INDEX alert_match_logs_matched_at_id_idx ON alert_match_logs(matched_at, id);
CREATE INDEX playback_logs_occurred_at_id_idx ON playback_logs(occurred_at, id);

DROP INDEX event_logs_received_at_idx;
DROP INDEX alert_match_logs_matched_at_idx;
DROP INDEX playback_logs_occurred_at_idx;
```

Register after migration 012 and assert exact index order.

- [ ] **Step 4: Implement bounded pruning**

Use one private synchronous helper per table inside a short transaction:

```sql
DELETE FROM event_logs
WHERE id IN (
  SELECT id FROM event_logs
  WHERE received_at < ?
  ORDER BY received_at, id
  LIMIT ?
);
```

Use equivalent `matched_at` and `occurred_at` queries. Validate `cutoff` as an ISO timestamp and `batchSize` as a positive integer before opening the transaction. Return `StatementResultingChanges.changes` values.

- [ ] **Step 5: Wire maintenance, not the event path**

Compute once:

```ts
const cutoff = new Date(
  this.#now().getTime() - this.#options.logSettings.retentionHours * 60 * 60 * 1_000
).toISOString();
```

Run existing file cleanup, then call `pruneBefore(cutoff, 500)` until every returned count is `< 500`. Do not invoke pruning from `EventPipeline`, append methods, or a DB trigger. Do not call `VACUUM`.

- [ ] **Step 6: Add plan assertions**

Newest-first SELECTs must use the new composite indexes without `USE TEMP B-TREE`; cutoff queries must show `SEARCH ... (timestamp<?)` using the same indexes.

- [ ] **Step 7: Run affected gates**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/diagnostics apps/server/src/modules/diagnostics apps/server/src/modules/settings/local-maintenance-service.test.ts apps/server/src/modules/db/database.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
corepack.cmd pnpm typecheck
corepack.cmd pnpm build
openspec.cmd validate harden-sqlite-persistence --strict
```

- [ ] **Step 8: Commit Slice 4**

```powershell
git add packages/core/src/diagnostics apps/server/src/modules/diagnostics apps/server/src/modules/settings apps/server/src/runtime apps/server/src/modules/db openspec/changes/harden-sqlite-persistence/tasks.md
git commit -m "feat: retain sqlite diagnostic history"
```

## Task 5: Slice 5 — Referential And Restore Integrity

**OpenSpec:** tasks 6.1–6.7; findings F5, F6, F7, and F10.

**Files:**

- Create: `apps/server/src/modules/db/migrations/015-alert-variant-asset-foreign-keys.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`
- Modify: `apps/server/src/modules/assets/asset-library-service.ts`
- Modify: `apps/server/src/modules/assets/asset-library-service.test.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.test.ts`
- Modify: `apps/server/src/modules/twitch/sqlite-twitch-account-repository.ts`
- Modify: `apps/server/src/modules/twitch/sqlite-twitch-account-repository.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- Modify: `packages/core/src/alerts/alert-service.ts`
- Modify: `packages/core/src/alerts/alert-service.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`

**Interfaces:**

- Asset IDs remain nullable in domain models; SQLite rejects only dangling non-null values.
- Portable backup still excludes `twitch_accounts`; operational restore points include it.
- Successful restore receives a post-DB callback for prior Twitch token-reference cleanup and warning collection.

- [ ] **Step 1: Add failing FK migration tests**

Cover:

```ts
expect(() => connection.prepare(
  "UPDATE alert_variants SET visual_asset_id = ? WHERE id = ?"
).run("missing", variantId)).toThrow(/FOREIGN KEY/);

expect(() => connection.prepare(
  "DELETE FROM asset_metadata WHERE id = ?"
).run(referencedAssetId)).toThrow(/FOREIGN KEY/);
```

Also create a pre-migration DB with one dangling asset ID, run migrations, and assert migration 014 is not recorded and the original `alert_variants` row remains.

- [ ] **Step 2: Add migration 014 with preflight**

Create `alert_variants_next` with its asset FKs before copying. The explicit `INSERT ... SELECT` is the preflight: with `foreign_keys=ON`, a dangling non-null asset ID makes the copy fail before the old table is dropped. The migration runner's existing transaction rolls back the new table and leaves migration 014 unrecorded. Assert the thrown error identifies a foreign-key violation; do not add an out-of-transaction probe.

- [ ] **Step 3: Rebuild `alert_variants` completely**

Create `alert_variants_next` with every migration-011 column, check, default, rule cascade, and:

```sql
FOREIGN KEY (visual_asset_id) REFERENCES asset_metadata(id) ON DELETE RESTRICT,
FOREIGN KEY (audio_asset_id) REFERENCES asset_metadata(id) ON DELETE RESTRICT
```

Copy all 14 columns explicitly; drop old table; rename next; recreate:

```sql
CREATE INDEX alert_variants_rule_order_id_idx
  ON alert_variants(rule_id, variant_order, id);
CREATE INDEX alert_variants_visual_asset_id_idx
  ON alert_variants(visual_asset_id);
CREATE INDEX alert_variants_audio_asset_id_idx
  ON alert_variants(audio_asset_id);
CREATE TRIGGER alert_editor_documents_delete_variant
AFTER DELETE ON alert_variants
BEGIN
  DELETE FROM alert_editor_documents WHERE alert_id = OLD.id;
END;
```

Migration tests compare all columns/defaults/checks, two asset FKs, three indexes, trigger presence, order preservation, and `PRAGMA foreign_key_check`.

- [ ] **Step 4: Preserve actionable asset errors**

Keep the existing usage preview/check. If a direct/concurrent delete reaches SQLite and gets `SQLITE_CONSTRAINT_FOREIGNKEY`, map it to the existing “asset is in use” management error. Do not convert every SQLite constraint into that error.

- [ ] **Step 5: Make Twitch replacement atomic**

Wrap current delete-plus-upsert exactly once:

```ts
return runInTransaction(this.#connection, () => {
  this.#connection.prepare("DELETE FROM twitch_accounts WHERE account_id <> ?").run(normalized.accountId);
  this.#upsert(normalized);
  return normalized;
});
```

Extract only the existing upsert statement into `#upsert`; do not add a generic singleton repository. Test a forced throw after delete leaves the previous row.

- [ ] **Step 6: Include Twitch rows in operational restore only**

Add `twitch_accounts` to `captureRestorePoint()` and `restoreRestorePoint()` table lists. Do not add it to `tableDefinitions` used by `snapshot()`/portable archive. `replace()` clears `twitch_accounts` in the same DB transaction that replaces configuration and overlay keys.

Capture the prior account ID before replacement. After DB/config replacement succeeds, delete its deterministic access/refresh token refs through the injected secret store. On cleanup error, append a redacted warning and leave the DB row absent. If replacement fails, restore point restores the prior row and no token deletion runs.

- [ ] **Step 7: Enforce active-set mutations**

Remove read-side arbitrary activation from `listSets()`. First-run `#ensureStarterSet()` remains the only zero-to-one initialization path. In `DefaultAlertService.setCollectionEnabled`, reject `false` for the sole active collection:

```ts
if (!enabled && collection.enabled) {
  throw new LastActiveAlertCollectionError(collectionId);
}
```

Only `AlertSetMetadataRepository.activateSet(setId)` performs the atomic old-off/new-on transition. Keep the partial unique index; add no trigger.

- [ ] **Step 8: Run affected gates**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/db/database.test.ts apps/server/src/modules/assets apps/server/src/modules/backup apps/server/src/modules/twitch apps/server/src/modules/alerts/alert-set-management-service.test.ts packages/core/src/alerts/alert-service.test.ts apps/server/src/runtime/runtime-composition.test.ts
corepack.cmd pnpm typecheck
corepack.cmd pnpm build
openspec.cmd validate harden-sqlite-persistence --strict
```

Expected: migration is lossless/fail-closed, referenced deletion fails, restore disconnects Twitch, failed restore restores prior row, cleanup failure warns without reconnecting, and exactly one active set remains after supported mutations.

- [ ] **Step 9: Commit Slice 5**

```powershell
git add packages/core/src/alerts apps/server/src/modules/db apps/server/src/modules/assets apps/server/src/modules/backup apps/server/src/modules/twitch apps/server/src/modules/alerts apps/server/src/runtime openspec/changes/harden-sqlite-persistence/tasks.md
git commit -m "fix: enforce sqlite reference and restore integrity"
```

## Task 6: Slice 6 — Overlay And Migration Hardening

**OpenSpec:** tasks 7.1–7.6; findings F9 and F11 plus overlay F8.

**Files:**

- Modify: `packages/core/src/overlays/overlay-access-service.ts`
- Modify: `apps/server/src/modules/overlays/overlay-access-service.ts`
- Modify: `apps/server/src/modules/overlays/overlay-access-service.test.ts`
- Modify: `apps/server/src/modules/overlays/sqlite-overlay-access-key-repository.ts`
- Modify: `apps/server/src/modules/overlays/sqlite-overlay-access-key-repository.test.ts`
- Create: `apps/server/src/modules/db/migrations/016-overlay-key-verification-indexes.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`
- Test: `apps/server/src/http/middleware/overlay-auth.test.ts`
- Test: `apps/server/src/http/routes/overlays.test.ts`
- Test: `apps/server/src/websocket/overlay-gateway.test.ts`
- Test: `apps/server/src/runtime/runtime-composition.smoke.test.ts`

**Interfaces:**

Replace:

```ts
findCandidates(overlayId: string): Promise<readonly OverlayAccessKey[]>;
```

With:

```ts
findByHash(keyHash: string): Promise<OverlayAccessKey | null>;
hasOutput(input: CreateOverlayKeyInput): Promise<boolean>;
```

Keep `findByOutput()` for management/history behavior.

- [ ] **Step 1: Add exact-verifier regressions**

Seed 100 historical keys for the default overlay. Verify authorization calls `findByHash` once and `hasOutput` only when needed for existing denial classification. Cover active, revoked, wrong scope/module/profile/purpose, missing hash, and unrelated active keys.

Attempt duplicate `key_hash` insertion and expect a uniqueness failure after migration.

- [ ] **Step 2: Add migration-ledger regressions**

Directly seed `schema_migrations` with:

- a future ID after 011,
- a missing middle ID,
- the known IDs in a reordered insertion/application sequence,
- a valid prefix.

Assert the first three fail before applying another migration and valid prefix upgrades/reopens idempotently.

- [ ] **Step 3: Add migration 015**

Preflight duplicate hashes before DDL. Then:

```sql
CREATE UNIQUE INDEX overlay_keys_key_hash_unique
  ON overlay_keys(key_hash);

CREATE INDEX overlay_keys_output_created_idx
  ON overlay_keys(
    overlay_id, scope, module_id, target_profile_id, purpose, created_at, id
  );

DROP INDEX overlay_keys_overlay_id_idx;
DROP INDEX overlay_keys_output_idx;
```

Register after 014. Assert exact index columns and that the old indexes are absent.

- [ ] **Step 4: Implement exact verification**

`SqliteOverlayAccessKeyRepository.findByHash()` executes one equality query. `OverlayAccessService.verify()` hashes input once, fetches one row, and then applies existing overlay/output/revocation checks in the same order used to produce current denial reasons. A missing hash may call `hasOutput(input)`; it must not load key history.

- [ ] **Step 5: Validate the migration ledger before applying**

After creating `schema_migrations`, read IDs in row insertion order:

```sql
SELECT id FROM schema_migrations ORDER BY rowid;
```

Then compare exactly:

```ts
const appliedIds = rows.map((row) => String(row.id));
const expectedPrefix = migrations.slice(0, appliedIds.length).map((migration) => migration.id);
if (appliedIds.some((id, index) => id !== expectedPrefix[index])) {
  throw new Error(`SQLite migration ledger is not a known prefix: ${appliedIds.join(", ")}`);
}
```

Only after this check may pending migrations run. Do not add a checksum column.

- [ ] **Step 6: Prove query plans**

`EXPLAIN QUERY PLAN` must show the unique hash index for exact verification and `overlay_keys_output_created_idx` with no temp B-tree for exact-output history. Also confirm active-output backup enumeration remains correctly ordered.

- [ ] **Step 7: Run affected gates**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/overlays/overlay-access-service.test.ts apps/server/src/modules/overlays/sqlite-overlay-access-key-repository.test.ts apps/server/src/http/middleware/overlay-auth.test.ts apps/server/src/http/routes/overlays.test.ts apps/server/src/websocket/overlay-gateway.test.ts apps/server/src/modules/db/database.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
corepack.cmd pnpm typecheck
corepack.cmd pnpm build
openspec.cmd validate harden-sqlite-persistence --strict
```

Expected: all exact overlay service, repository, HTTP middleware/route, WebSocket gateway, database, and runtime smoke tests pass.

- [ ] **Step 8: Commit Slice 6**

```powershell
git add packages/core/src/overlays apps/server/src/modules/overlays apps/server/src/modules/db apps/server/src/runtime openspec/changes/harden-sqlite-persistence/tasks.md
git commit -m "perf: harden overlay key and migration lookup"
```

## Task 7: Final Reconciliation And Archive Readiness

**OpenSpec:** tasks 8.1–8.4.

**Files:**

- Modify: `openspec/changes/harden-sqlite-persistence/tasks.md`
- Modify: `docs/audits/2026-07-20-sqlite-schema-query-index-audit.md` only to append measured final evidence
- Regenerate outside source tree: schema explorer visualization

**Interfaces:**

- Consumes: all six slice commits present in `origin/main`.
- Produces: requirement-to-test reconciliation, full gates, live smoke, current schema explorer, archive-ready OpenSpec change.

- [ ] **Step 1: Reconcile requirements**

For every scenario in the five delta specs, record the exact test file/test name that proves it. Any missing scenario gets a failing test and the minimum fix before proceeding. Do not mark an OpenSpec checkbox from intent alone.

- [ ] **Step 2: Run full repository gates**

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm test:e2e
openspec.cmd validate harden-sqlite-persistence --strict
git diff --check
```

Expected: all pass. If frontend files were not changed, Storybook gates are not required; if any were changed, follow `docs/ai/frontend-agent-guide.md` and run its complete routed gates.

- [ ] **Step 3: Rebuild, restart, and live-smoke**

Use the repo’s established local startup procedure. Wait for health, reload management UI, then verify:

1. Version-2 backup preserves manually reordered variants.
2. Legacy version-1 preflight blocks with precise copy.
3. Active alert event reaches playback.
4. Manual log cleanup prunes old SQL diagnostics.
5. Referenced asset deletion is rejected.
6. Restore requires Twitch reconnect.
7. Active and revoked overlay URLs authorize/reject correctly.

Capture no route keys, tokens, or secret refs in screenshots/logs.

- [ ] **Step 4: Regenerate schema evidence**

Run the repo-local `stream-jams-db-schema` executable generator. Confirm final migration/table/FK/index/trigger totals against `PRAGMA` output and attach the explorer to review. Append before/after statement counts and plan summaries to the audit; do not rewrite historical findings.

- [ ] **Step 5: Final OpenSpec state**

Mark tasks complete only after their evidence exists:

```powershell
openspec.cmd status --change harden-sqlite-persistence --json
openspec.cmd validate harden-sqlite-persistence --strict
```

Expected: every task complete and validation successful. Sync/archival is a separate explicit action after the final implementation PR is merged.

- [ ] **Step 6: Commit final evidence**

```powershell
git add docs/audits/2026-07-20-sqlite-schema-query-index-audit.md openspec/changes/harden-sqlite-persistence/tasks.md
git commit -m "docs: record sqlite hardening verification"
```

## Execution Handoff

Recommended execution is **Subagent-Driven**: the orchestrator dispatches one fresh implementer and one fresh reviewer per task/slice, integrates sequentially, and never overlaps migration-owning work. Inline execution is supported with `superpowers:executing-plans`, using one slice per checkpoint.
