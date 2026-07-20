## 1. Planning Baseline And Slice Gates

- [ ] 1.1 Merge this OpenSpec change and `docs/superpowers/plans/2026-07-20-harden-sqlite-persistence.md` without production changes.
- [ ] 1.2 Before every implementation slice, fetch `origin`, confirm the preceding slice is present in `origin/main`, create a fresh `codex/` branch/worktree from that commit, run `openspec.cmd list --json`, and select migration IDs only after the refresh.
- [ ] 1.3 Keep each slice to one independently reviewable PR; update only that slice's task checkboxes and do not start the next slice until required checks pass and the PR is present in remote `main`.

## 2. Slice 1 — Backup Ordering Correctness

- [x] 2.1 Add failing core/server tests proving an alert whose lexical variant-ID order differs from `variant_order` does not round-trip today and that an affected archive-version-1 envelope receives a specific preflight blocker.
- [x] 2.2 Define archive version 2 in core backup contracts while retaining narrow version-1 envelope recognition only for the explicit lossy-order blocker.
- [x] 2.3 Add `variant_order` to the SQLite snapshot mapping, export variants by `(rule_id, variant_order, id)`, and validate non-negative and non-duplicate per-rule order values.
- [x] 2.4 Add an owned-column drift test comparing migrated portable table columns with snapshot mappings and an explicit allowlist for regenerated/local-only fields.
- [ ] 2.5 Verify backup service, snapshot repository, core contract, runtime restore smoke, server typecheck, and strict OpenSpec gates; then land Slice 1 before proceeding.

## 3. Slice 2 — Transaction Isolation

- [x] 3.1 Add a failing database regression that pauses an alert mutation, performs an unrelated diagnostic write, fails the alert mutation, and proves the unrelated row is currently rolled back.
- [x] 3.2 Replace the generic asynchronous alert-set transaction callback with a use-case-oriented synchronous SQLite mutation boundary that accepts fully materialized rule, metadata, and document changes.
- [x] 3.3 Move asynchronous reads, validation, ID generation, document construction, and external I/O before the synchronous transaction; recheck affected-row invariants inside the transaction.
- [x] 3.4 Convert every current `AlertSetManagementService` atomic workflow and the alert editor aggregate save to the synchronous boundary, remove production use of `runInTransactionAsync()`, and delete the helper if no production caller remains.
- [x] 3.5 Add success/rollback coverage for create, duplicate, reset, enable, delete, set deletion, and editor save workflows plus the unrelated-write regression.
- [ ] 3.6 Verify database, alert-management, editor, event-pipeline, runtime-composition, server typecheck, and strict OpenSpec gates; then land Slice 2 before proceeding.

## 4. Slice 3 — Hot-Path Bulk Alert Reads

- [x] 4.1 Add failing statement-count tests showing active-rule retrieval grows by three child SELECTs per rule and playback/management repeat document, asset, and metadata reads.
- [x] 4.2 Add the next-contiguous migration for `alert_rule_collections(collection_id, rule_id)` and `alert_variants(rule_id, variant_order, id)`, dropping the subsumed rule-only variant index after plan proof.
- [x] 4.3 Add repository `listActiveRules({ eventType })` that filters enabled rules through the active collection and bulk-hydrates collections, conditions, and variants in a fixed statement count; make `DefaultAlertService` delegate to it.
- [x] 4.4 Add deduplicating `AlertEditorDocumentRepository.findMany(editorIds)`, `AssetRepository.findManyByIds(assetIds)`, `AlertSetMetadataRepository.findSets(setIds)`, and `findRules(ruleIds)` methods; return empty maps without generating invalid `IN ()` SQL.
- [x] 4.5 Select variants before loading playback editor documents, bulk-load only selected documents/distinct assets, and replace management per-parent reads with the new bulk methods.
- [x] 4.6 Add representative `EXPLAIN QUERY PLAN`, behavior-equivalence, event-type-negative, empty-input, and 1-versus-100-rule statement-count coverage.
- [ ] 4.7 Verify core/server alert, playback, asset, management, migration, typecheck, build, and strict OpenSpec gates; then land Slice 3 before proceeding.

## 5. Slice 4 — SQL Diagnostics Lifecycle

- [x] 5.1 Add failing repository and maintenance tests for expired/current rows, identical timestamps larger than one batch, deterministic convergence, and file-plus-SQL retention counts.
- [x] 5.2 Add the next-contiguous migration replacing the three timestamp-only indexes with `(received_at,id)`, `(matched_at,id)`, and `(occurred_at,id)` indexes.
- [x] 5.3 Extend `DiagnosticsLogRepository` and its SQLite adapter with bounded `pruneBefore(cutoff, batchSize)` deletion for all three diagnostic tables and per-table deleted counts.
- [x] 5.4 Make local maintenance calculate one configured cutoff and run file cleanup plus repeated bounded SQL batches outside event processing without `VACUUM`.
- [x] 5.5 Add query-plan tests proving newest-first reads avoid temporary ordering and cutoff ranges still use the composite timestamp prefix.
- [ ] 5.6 Verify core diagnostics, repository, maintenance, runtime smoke, migration, typecheck, build, and strict OpenSpec gates; then land Slice 4 before proceeding.

## 6. Slice 5 — Referential And Restore Integrity

- [x] 6.1 Add failing tests for dangling variant assets, referenced-asset deletion, restore over a connected Twitch account, failed-restore rollback, orphan-secret warning, disabling the sole active set, and Twitch replacement failure between delete/upsert.
- [x] 6.2 Add the next-contiguous preflighted `alert_variants` rebuild migration with nullable visual/audio `ON DELETE RESTRICT` FKs, child indexes, all current columns/checks/defaults/order data, the rule-order index, and recreated variant document-delete trigger.
- [x] 6.3 Keep application asset-impact messaging, translate SQLite FK failures to the existing actionable management error surface, and assert unreferenced asset deletion still cascades owned library metadata.
- [x] 6.4 Include `twitch_accounts` in operational restore points but not portable archives; clear it on successful replacement, delete old token refs afterward, and keep DB status disconnected with a redacted warning if cleanup fails.
- [x] 6.5 Wrap Twitch delete-plus-upsert replacement in `runInTransaction()` and test rollback leaves the prior singleton account intact.
- [x] 6.6 Reject disabling the sole active set without an atomic replacement and remove read-side arbitrary self-healing while retaining first-run starter initialization.
- [ ] 6.7 Verify post-migration schema/FKs/indexes/triggers, `PRAGMA foreign_key_check`, backup rollback, Twitch/secret compensation, alert-set behavior, assets, typecheck, build, and strict OpenSpec gates; then land Slice 5 before proceeding.

## 7. Slice 6 — Overlay And Migration Hardening

- [x] 7.1 Add failing tests showing overlay verification loads historical candidates and migration startup accepts unknown, future, gapped, or reordered ledger IDs.
- [x] 7.2 Add the next-contiguous migration that preflights duplicate key hashes, creates unique `overlay_keys(key_hash)`, extends the output index through `(created_at,id)`, and drops subsumed overlay indexes after plan proof.
- [x] 7.3 Replace overlay candidate-list lookup with exact `findByHash(keyHash)` plus indexed output-existence lookup while preserving revoked, mismatched-output, and unrelated-key denial behavior.
- [x] 7.4 Validate the complete migration ledger as an exact known prefix before applying pending migrations or exposing repositories; keep checksum tracking out of scope.
- [x] 7.5 Add representative query-plan tests for unique hash/output history and database tests for future ID, gap, reordering, valid prefix upgrade, and idempotent reopen.
- [ ] 7.6 Verify overlay HTTP/WebSocket authorization, database/migration tests, runtime smoke, server typecheck/build, and strict OpenSpec gates; then land Slice 6.

## 8. Final Reconciliation

- [x] 8.1 Reconcile every requirement/scenario against merged code and tests, run the full repository gates required by repo instructions, and rebuild/restart the local server for live management/overlay smoke verification.
- [x] 8.2 Regenerate the relational schema explorer with the repo-local executable skill and confirm the final migration, table, FK, trigger, and index inventory matches the design.
- [x] 8.3 Record measured before/after statement counts and query plans in the audit or change notes; leave WAL, vacuuming, JSON normalization, row versions, migration checksums, and `PRAGMA optimize` unchanged.
- [ ] 8.4 Mark all completed tasks, run `openspec.cmd validate harden-sqlite-persistence --strict`, sync accepted delta specs, and archive the change only after every slice is present in `origin/main`.
