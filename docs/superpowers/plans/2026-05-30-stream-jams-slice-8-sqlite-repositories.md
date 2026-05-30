# Stream Jams Slice 8 SQLite Repositories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice 8 by adding deterministic SQLite initialization and migrations, then persist MVP repository boundaries for overlay module config, overlay route keys, alerts, assets, and diagnostic logs without leaking SQL into core domain services, HTTP handlers, or React components.

**Architecture:** Keep repository interfaces and domain record types in `@stream-jams/core`. Server code owns SQLite connection setup, migrations, row mapping, transaction boundaries, and tests against isolated temporary databases. Concrete SQLite adapters stay under `apps/server/src/modules/**` and remain replaceable behind typed core interfaces.

**Tech Stack:** TypeScript, Node `node:sqlite`, SQLite, Zod, Vitest, existing pnpm workspace scripts.

---

## Source Scope

Base slice: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, Slice 8.

Slice 8 required behavior:

- Add SQLite database initialization and migration runner.
- Create tables for overlay module config, alert collections, alert rules, alert variants, asset metadata, overlay keys, event logs, alert match logs, and playback logs.
- Implement typed repositories behind core interfaces with explicit row mappers between SQLite rows and domain types.
- Use transaction boundaries for alert rule plus variant writes.
- Unit test repositories against isolated temporary databases.
- Unit test that deleted alert collections do not leave rules in an impossible activation state.

Acceptance checks:

- Repository tests do not require the full server to run.
- Domain services depend on repository interfaces, not SQLite modules.
- No React component, Fastify route handler, overlay renderer, or domain service imports a SQLite implementation directly.
- Data migrations are deterministic.

Non-goals:

- Switching the default runtime wiring from in-memory repositories where later slices still need service integration decisions.
- Alert CRUD HTTP routes or management UI; Slice 10 owns those workflows.
- Asset import or serving routes; Slice 9 owns file validation, copying, and authenticated asset serving.
- Event ingestion, alert matching, playback queue dispatch, or diagnostics UI; later slices own those flows.
- Electron packaging changes.

## Baseline Evidence

- `origin/main` includes Slice 7 at `662505a`.
- Branch `codex/slice-8-sqlite-repositories` was created from fresh `origin/main`.
- Local shell sandbox wrapper is unavailable in this session, so repository commands are run with explicit escalated execution.
- Node runtime exposes built-in `node:sqlite` (`DatabaseSync`, `StatementSync`), avoiding native dependency and lockfile churn for this slice.

## File Ownership

- Create `apps/server/src/modules/db/database.ts`: database open/close helpers, deterministic migration runner, and transaction helper.
- Create `apps/server/src/modules/db/migrations/001-initial-schema.ts`: initial SQLite schema owned by Slice 8.
- Create `apps/server/src/modules/db/database.test.ts`: initialization, migration idempotency, deterministic ordering, and foreign-key tests.
- Create `apps/server/src/modules/overlay-modules/sqlite-module-config-repository.ts` and tests.
- Create `apps/server/src/modules/overlays/sqlite-overlay-access-key-repository.ts` and tests.
- Create `packages/core/src/alerts/repository.ts` and `apps/server/src/modules/alerts/sqlite-alert-repository.ts` with tests.
- Create `packages/core/src/assets/repository.ts` and `apps/server/src/modules/assets/sqlite-asset-repository.ts` with tests.
- Create `packages/core/src/diagnostics/repository.ts` and `apps/server/src/modules/diagnostics/sqlite-log-repository.ts` with tests.
- Modify `packages/core/src/index.ts` to export new repository contracts and diagnostic records.
- Modify `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` after validation to mark Slice 8 complete.
- Update this plan as execution proceeds: check boxes only after implementation and validation pass.

## Sub-Slice 8.1: Database Initialization And Migrations

**Objective:** Add a deterministic SQLite initialization boundary that enables foreign keys, runs ordered migrations exactly once, and is testable without the full server.

**Expected files or areas touched:**

- `apps/server/src/modules/db/database.ts`
- `apps/server/src/modules/db/migrations/001-initial-schema.ts`
- `apps/server/src/modules/db/database.test.ts`

**Implementation steps:**

- [ ] Write failing tests for creating all Slice 8 tables in an isolated database.
- [ ] Write failing tests for idempotent migration re-runs and sorted migration application.
- [ ] Write failing tests proving foreign-key enforcement is enabled.
- [ ] Run focused tests and confirm missing database modules fail.
- [ ] Implement the database open helper using Node `node:sqlite` with defensive defaults.
- [ ] Implement a migration runner backed by a `schema_migrations` table.
- [ ] Implement a transaction helper that commits successful work and rolls back failures.
- [ ] Run focused tests and confirm they pass.

**Positive test cases:**

- Initialization creates `schema_migrations` and every Slice 8 table.
- Running initialization twice leaves one applied migration record.
- Foreign-key constraints reject invalid child rows.

**Negative test cases:**

- Migration failures roll back without recording the failed migration.
- Transactions roll back writes after a thrown error.

**Non-trivial assertions:**

- Migration order is explicit and stable.
- The database helper does not import app services, HTTP handlers, React code, or domain service implementations.

**Validation commands:**

- `pnpm test -- apps/server/src/modules/db/database.test.ts`

**Acceptance criteria:**

- SQLite setup is deterministic, isolated, and reusable by repository adapters.

## Sub-Slice 8.2: Overlay Module Config And Route Key Repositories

**Objective:** Persist existing overlay module config and overlay route key repository interfaces with explicit row mapping and hash-only key storage.

**Expected files or areas touched:**

- `apps/server/src/modules/overlay-modules/sqlite-module-config-repository.ts`
- `apps/server/src/modules/overlay-modules/sqlite-module-config-repository.test.ts`
- `apps/server/src/modules/overlays/sqlite-overlay-access-key-repository.ts`
- `apps/server/src/modules/overlays/sqlite-overlay-access-key-repository.test.ts`

**Implementation steps:**

- [ ] Write failing module-config repository tests for save/read/update and JSON config round trips.
- [ ] Write failing overlay-key repository tests for create/find/update/candidate lookup and revoked-key persistence.
- [ ] Run focused tests and confirm missing repository failures.
- [ ] Implement SQLite module config row mapper behind `OverlayModuleConfigRepository`.
- [ ] Implement SQLite overlay key row mapper behind `OverlayAccessKeyRepository`.
- [ ] Run focused tests and confirm they pass.

**Positive test cases:**

- Saved Alerts module config round-trips with enabled state, config JSON, and `updatedAt`.
- Overlay route keys round-trip through hash-only records and candidate lookup by overlay id.
- Revocation updates are persisted and returned.

**Negative test cases:**

- Missing module configs and unknown key IDs return `null`.
- Updating a missing overlay key returns `null`.

**Non-trivial assertions:**

- SQLite adapters return domain-shaped records, not raw SQLite rows.
- Raw overlay keys are never stored in SQLite; only `keyHash` persists.

**Validation commands:**

- `pnpm test -- apps/server/src/modules/overlay-modules/sqlite-module-config-repository.test.ts apps/server/src/modules/overlays/sqlite-overlay-access-key-repository.test.ts`

**Acceptance criteria:**

- Existing core services can depend on the same interfaces with either in-memory or SQLite adapters.

## Sub-Slice 8.3: Alert And Asset Repositories

**Objective:** Add core repository contracts and SQLite adapters for alert collections/rules/variants and asset metadata.

**Expected files or areas touched:**

- `packages/core/src/alerts/repository.ts`
- `packages/core/src/assets/repository.ts`
- `packages/core/src/index.ts`
- `apps/server/src/modules/alerts/sqlite-alert-repository.ts`
- `apps/server/src/modules/alerts/sqlite-alert-repository.test.ts`
- `apps/server/src/modules/assets/sqlite-asset-repository.ts`
- `apps/server/src/modules/assets/sqlite-asset-repository.test.ts`

**Implementation steps:**

- [ ] Write failing alert repository tests for collection save/list/find/delete and rule save/find/list/delete with variants.
- [ ] Write failing alert repository tests proving rule plus condition/variant writes are transactional.
- [ ] Write failing tests proving deleted collections are removed from persisted rule collection IDs.
- [ ] Write failing asset repository tests for save/find/list/delete.
- [ ] Run focused tests and confirm missing contracts/adapters fail.
- [ ] Add core alert and asset repository interfaces.
- [ ] Implement explicit SQLite row mappers and JSON mapping for conditions, TTS config, and layouts.
- [ ] Implement transaction boundaries around alert rule, condition, collection-link, and variant writes.
- [ ] Run focused tests and confirm they pass.

**Positive test cases:**

- Alert collections and rules round-trip with collection IDs, conditions, variants, TTS config, layout, cooldown, and priority.
- Asset metadata round-trips with media type, MIME type, checksum, storage path, and byte size.

**Negative test cases:**

- Deleting a collection removes collection references from rules.
- A failed rule/variant write rolls back partial rows.
- Missing alert and asset records return `null`.

**Non-trivial assertions:**

- Repository tests verify domain equality rather than only row counts.
- Alert repository code is the only place in Slice 8 that knows the alert table layout.

**Validation commands:**

- `pnpm test -- apps/server/src/modules/alerts/sqlite-alert-repository.test.ts apps/server/src/modules/assets/sqlite-asset-repository.test.ts`

**Acceptance criteria:**

- Later alert and asset services can use typed repository contracts without importing SQLite.

## Sub-Slice 8.4: Diagnostic Log Repositories

**Objective:** Persist event ingestion, alert match, and playback log records behind a typed diagnostics repository contract.

**Expected files or areas touched:**

- `packages/core/src/diagnostics/repository.ts`
- `packages/core/src/index.ts`
- `apps/server/src/modules/diagnostics/sqlite-log-repository.ts`
- `apps/server/src/modules/diagnostics/sqlite-log-repository.test.ts`

**Implementation steps:**

- [ ] Write failing diagnostics repository tests for appending and listing event logs, alert match logs, and playback logs.
- [ ] Write failing tests for bounded list ordering.
- [ ] Run focused tests and confirm missing contract/adapters fail.
- [ ] Add core diagnostic log record types and repository interface.
- [ ] Implement SQLite row mappers using JSON for normalized events and alert IDs.
- [ ] Run focused tests and confirm they pass.

**Positive test cases:**

- Event logs preserve normalized event payloads, status, correlation ID, processing ID, and optional error message.
- Alert match logs preserve source event, rule, variant, and processing metadata.
- Playback logs preserve queue item, source event, alert IDs, status, and message.

**Negative test cases:**

- Empty log tables list as empty arrays.
- Limits produce newest-first bounded results.

**Non-trivial assertions:**

- Diagnostic log repositories are append-oriented and do not expose raw JSON strings to callers.

**Validation commands:**

- `pnpm test -- apps/server/src/modules/diagnostics/sqlite-log-repository.test.ts`

**Acceptance criteria:**

- Later diagnostics views can query typed records without knowing table details.

## Sub-Slice 8.5: Plan Reconciliation And Full Validation

**Objective:** Reconcile Slice 8 against the base MVP plan, run the standard validation suite, and prepare the PR packet.

**Expected files or areas touched:**

- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/plans/2026-05-30-stream-jams-slice-8-sqlite-repositories.md`

**Implementation steps:**

- [ ] Run architecture scans proving SQLite implementations are imported only by server SQLite adapter tests or future wiring boundaries.
- [ ] Update the base MVP plan Slice 8 checklist and completion evidence.
- [ ] Update this detailed plan with validation evidence.
- [ ] Run full validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `git diff --check`.
- [ ] Self-review the diff for scope creep and weak tests.
- [ ] Commit with message `feat: add sqlite repositories`.

**Positive test cases:**

- Full repository validation passes after typecheck has emitted package builds.

**Negative test cases:**

- Import scans find no accidental SQLite coupling from core/domain/route/UI code.

**Non-trivial assertions:**

- The Slice 8 PR documents deferred default runtime wiring decisions rather than silently changing unrelated app startup behavior.

**Validation commands:**

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `git diff --check`

**Acceptance criteria:**

- Slice 8 is implemented, tested, documented, and ready for PR review.
