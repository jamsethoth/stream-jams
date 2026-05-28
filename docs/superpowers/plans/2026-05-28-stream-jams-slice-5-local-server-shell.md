# Stream Jams Slice 5 Local Server Shell And Configurable Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice 5 by turning the server scaffold into a dependency-injected local Fastify app that reads and updates non-secret server config, binds only to localhost, and reports actionable port-collision startup failures.

**Architecture:** Keep HTTP handlers thin by delegating config behavior to a `ServerConfigService`, and keep process startup testable through a small `startServer` function that accepts injected app factories and port-checking helpers. Port validation lives outside routes so future management UI and desktop shell entrypoints can reuse it without importing Fastify. Runtime wiring in `index.ts` should only compose adapters, read config, start the server, and translate structured startup results into process logging and exit code behavior.

**Tech Stack:** TypeScript, Node.js `net`, Fastify 5, Zod schemas from `@stream-jams/core`, Vitest, existing pnpm workspace scripts.

---

## Source Scope

Base slice: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, Slice 5.

Slice 5 required behavior:

- Fastify app factory accepts dependencies instead of constructing them internally.
- `GET /health` returns app status and version.
- Read/update endpoints exist for non-secret server config.
- Port updates are validated before saving.
- Runtime binds to `127.0.0.1` by default.
- Occupied startup ports produce a structured error with the configured port and suggested alternates.
- Config behavior and port collision behavior have positive and negative tests with non-trivial assertions.
- Route handlers stay thin and delegate to services.

## File Ownership

- Modify `apps/server/src/app.ts`: compose the Fastify app from injected dependencies and route modules.
- Modify `apps/server/src/app.test.ts`: verify route registration through the app factory.
- Modify `apps/server/src/index.ts`: compose runtime adapters and start the local server from config.
- Create `apps/server/src/config/default-config.ts`: central runtime defaults for local paths, port, and localhost host.
- Create `apps/server/src/config/server-config-service.ts`: reusable service for reading and validating server config updates.
- Create `apps/server/src/config/server-config-service.test.ts`: service tests with recording config and port checker doubles.
- Create `apps/server/src/http/errors.ts`: shared route error response helpers for validation and conflict responses.
- Create `apps/server/src/http/routes/health.ts`: health route registration.
- Create `apps/server/src/http/routes/config.ts`: server config route registration.
- Create `apps/server/src/http/routes/config.test.ts`: route tests for server config reads, updates, validation failures, and occupied ports.
- Create `apps/server/src/server/port-availability.ts`: local port availability and alternate-port discovery.
- Create `apps/server/src/server/port-availability.test.ts`: pure tests for alternate-port discovery.
- Create `apps/server/src/server/start-server.ts`: testable startup orchestration and structured startup errors.
- Create `apps/server/src/server/start-server.test.ts`: startup tests for successful listen and port collision results.
- Modify `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`: mark Slice 5 complete after validation and record evidence.
- Modify this plan as execution proceeds: check boxes only after tests pass for the sub-slice.

## Sub-Slice 5.1: Health Route And App Factory Dependencies

**Objective:** Preserve `/health` behavior while moving route registration out of `app.ts` and making app construction explicitly dependency-injected.

**Expected files or areas touched:**

- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/http/routes/health.ts`

**Implementation steps:**

- [x] Write the failing app-factory tests for injected version metadata and absence of runtime port binding.
- [x] Run `pnpm test -- apps/server/src/app.test.ts` and confirm the new route test fails before implementation.
- [x] Create `registerHealthRoutes` and update `createServerApp` to call route modules using injected dependencies.
- [x] Run `pnpm test -- apps/server/src/app.test.ts` and confirm the tests pass.

**Positive test cases:**

- `GET /health` returns HTTP 200 with `{ status: "ok", app: "stream-jams", version: "<injected>" }`.

**Negative test cases:**

- The app factory test must use `app.inject` only; it must not open a listening socket or rely on the production port.

**Non-trivial assertions:**

- Assert the response body exactly matches injected version metadata.
- Assert the response content type is JSON.

**Validation commands:**

- `pnpm test -- apps/server/src/app.test.ts`

**Acceptance criteria:**

- `createServerApp` constructs Fastify and route registration only from dependency objects.
- `/health` remains testable without process startup.

## Sub-Slice 5.2: Server Config Service And Config Routes

**Objective:** Add thin HTTP endpoints for reading and updating non-secret server config through a reusable service.

**Expected files or areas touched:**

- `apps/server/src/config/server-config-service.ts`
- `apps/server/src/config/server-config-service.test.ts`
- `apps/server/src/http/errors.ts`
- `apps/server/src/http/routes/config.ts`
- `apps/server/src/http/routes/config.test.ts`
- `apps/server/src/app.ts`

**Implementation steps:**

- [x] Write failing service tests for reading config, saving valid port updates, rejecting invalid ports, and rejecting occupied ports before persistence.
- [x] Run `pnpm test -- apps/server/src/config/server-config-service.test.ts` and confirm service tests fail before implementation.
- [x] Implement `ServerConfigService` with an injected `ConfigStore` and `PortAvailabilityChecker`.
- [x] Run `pnpm test -- apps/server/src/config/server-config-service.test.ts` and confirm service tests pass.
- [x] Write failing route tests for `GET /config/server`, `PATCH /config/server`, invalid payload responses, and occupied-port conflict responses.
- [x] Run `pnpm test -- apps/server/src/http/routes/config.test.ts apps/server/src/app.test.ts` and confirm route tests fail before route implementation.
- [x] Implement route registration and app-factory wiring.
- [x] Run `pnpm test -- apps/server/src/config/server-config-service.test.ts apps/server/src/http/routes/config.test.ts apps/server/src/app.test.ts` and confirm all focused tests pass.

**Positive test cases:**

- `GET /config/server` returns only the server config fields.
- `PATCH /config/server` persists a valid port through `ConfigStore.updateConfig({ server: { port } })`.

**Negative test cases:**

- Invalid ports such as `0` and `65536` return HTTP 400 and do not call persistence.
- Occupied-but-schema-valid ports return HTTP 409 and do not call persistence.
- Extra secret-shaped fields in the route body do not reach persistence.

**Non-trivial assertions:**

- Assert exact persisted patch objects.
- Assert response error codes and status codes.
- Assert rejected updates leave the underlying config unchanged.

**Validation commands:**

- `pnpm test -- apps/server/src/config/server-config-service.test.ts apps/server/src/http/routes/config.test.ts apps/server/src/app.test.ts`

**Acceptance criteria:**

- Route handlers validate and delegate; they do not own config merge or port availability logic.
- Server config updates are reusable outside HTTP.

## Sub-Slice 5.3: Port Availability And Structured Startup Results

**Objective:** Make startup use persisted config, bind to localhost, and return structured port-collision results with suggested alternates.

**Expected files or areas touched:**

- `apps/server/src/server/port-availability.ts`
- `apps/server/src/server/port-availability.test.ts`
- `apps/server/src/server/start-server.ts`
- `apps/server/src/server/start-server.test.ts`
- `apps/server/src/index.ts`

**Implementation steps:**

- [x] Write failing tests for alternate-port discovery that skips unavailable ports and stops at valid port bounds.
- [x] Run `pnpm test -- apps/server/src/server/port-availability.test.ts` and confirm port helper tests fail before implementation.
- [x] Implement injectable port availability helpers with a Node `net` based default checker.
- [x] Run `pnpm test -- apps/server/src/server/port-availability.test.ts` and confirm helper tests pass.
- [x] Write failing startup tests for successful listen, `EADDRINUSE` conversion, configured port reporting, and suggested alternate ports.
- [x] Run `pnpm test -- apps/server/src/server/start-server.test.ts` and confirm startup tests fail before implementation.
- [x] Implement `startServer` with injected config store, app factory, alternate-port finder, and structured result union.
- [x] Update `index.ts` to compose default config storage, config service, app factory, and startup result handling.
- [x] Run `pnpm test -- apps/server/src/server/port-availability.test.ts apps/server/src/server/start-server.test.ts` and confirm focused tests pass.

**Positive test cases:**

- Startup reads persisted config and calls listen with `host: "127.0.0.1"` and the configured port.
- Successful startup returns a started result with host, port, and local URL.

**Negative test cases:**

- A simulated `EADDRINUSE` listen error returns `status: "port-in-use"` instead of throwing.
- Suggested ports exclude the occupied configured port and unavailable alternates.
- Non-port startup errors remain unexpected errors and are not mislabeled as port collisions.

**Non-trivial assertions:**

- Assert exact `listen` arguments.
- Assert suggested port arrays.
- Assert structured error code, host, port, message, and cause preservation.

**Validation commands:**

- `pnpm test -- apps/server/src/server/port-availability.test.ts apps/server/src/server/start-server.test.ts`

**Acceptance criteria:**

- Startup behavior can be unit tested without opening the production port.
- `index.ts` is composition code only.

## Sub-Slice 5.4: Plan Reconciliation And Second-Pass Gap Fill

**Objective:** Compare implementation against the MVP Slice 5 feature text and fill any in-scope gaps before final validation.

**Expected files or areas touched:**

- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/plans/2026-05-28-stream-jams-slice-5-local-server-shell.md`
- Any implementation file needed to close a discovered gap.

**Implementation steps:**

- [x] Re-read MVP Slice 5 and this detailed plan.
- [x] Check each acceptance item against implemented tests and code.
- [x] Record completion evidence and any gap analysis in the MVP plan.
- [x] Implement and test any missing in-scope behavior found during reconciliation.
- [x] Run focused tests for any gap fixes.

**Positive test cases:**

- Every Slice 5 acceptance item maps to at least one implementation file and one focused test.

**Negative test cases:**

- Gaps cannot be marked complete unless a failing test was added or an existing test demonstrably covers the missing behavior.

**Non-trivial assertions:**

- The reconciliation notes must include concrete validation commands and test counts where available.

**Validation commands:**

- Focused commands for any gap fixes.

**Acceptance criteria:**

- No in-scope Slice 5 feature gaps remain.

## Sub-Slice 5.5: Class Documentation And Agentic Readability Pass

**Objective:** Add concise JSDoc comments to production and test helper classes so future agents can understand class boundaries without reading every method first.

**Expected files or areas touched:**

- Production class files under `apps/server/src`.
- Test helper classes under `apps/server/src`.

**Implementation steps:**

- [x] Scan class declarations with `rg -n "^export class |^class " apps packages --glob '*.ts'`.
- [x] Add concise JSDoc comments to all class declarations found in this repo, including test helper classes.
- [x] Avoid comments that merely restate method names; explain class purpose, boundary, or test role.
- [x] Run `pnpm lint` and fix any comment/style issues.

**Positive test cases:**

- Existing tests still pass after documentation comments.

**Negative test cases:**

- Comments must not change runtime behavior or introduce lint failures.

**Non-trivial assertions:**

- Class comments explain how the class should be used or what external boundary it wraps.

**Validation commands:**

- `pnpm lint`

**Acceptance criteria:**

- All class declarations in `apps` and `packages` have helpful class-level documentation.

## Sub-Slice 5.6: Full Validation, Diff Review, Commit, PR, And Independent Review

**Objective:** Verify the whole repo, commit the complete Slice 5 change, push it, create a comprehensive PR, and launch an independent code review workflow in a new workspace.

**Expected files or areas touched:**

- All Slice 5 changed files.
- GitHub PR metadata.

**Implementation steps:**

- [x] Run `pnpm lint`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm test:e2e`.
- [x] Run `pnpm build`.
- [x] Review `git diff --check`, `git diff --stat`, and the full diff for unrelated changes.
- [ ] Commit with message `feat: add local server shell`.
- [ ] Push branch `codex/slice-5-local-server-shell`.
- [ ] Create a draft PR into `main` with summary, implementation details, files changed, tests, validation, and reconciliation notes.
- [ ] Start an independent review subagent in a new workspace to review the PR for security vulnerabilities and code clarity.
- [ ] If the review subagent finds required changes, let it branch from the Slice 5 branch, implement, commit, push, and open a separate review PR with justification.

**Positive test cases:**

- Full validation commands complete successfully.

**Negative test cases:**

- A failing validation command blocks commit/PR until fixed or explicitly documented as unavailable.

**Non-trivial assertions:**

- PR body contains enough context for human review without requiring chat history.

**Validation commands:**

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`

**Acceptance criteria:**

- Branch is pushed.
- Draft PR exists.
- Independent review workflow is attempted and the result is reported.
