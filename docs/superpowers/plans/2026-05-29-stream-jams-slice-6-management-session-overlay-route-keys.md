# Stream Jams Slice 6 Management Session And Overlay Route Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice 6 by separating management sessions from overlay route keys, storing only overlay key hashes, authorizing overlay output by route segment, and protecting management routes with local request throttling.

**Architecture:** Keep local authorization behavior in framework-independent services and inject those services into Fastify middleware. Core packages define the contracts and result unions; server modules own Node crypto, in-memory MVP storage, and Fastify integration. Management routes use opaque `mgmt_` bearer sessions with expiry, while overlay routes use independently generated `ovl_` route keys scoped by output type, purpose, overlay id, and module id.

**Tech Stack:** TypeScript, Node.js `crypto`, Fastify 5 pre-handler hooks, Zod-derived core types, Vitest, existing pnpm workspace scripts.

---

## Source Scope

Base slice: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, Slice 6.

Slice 6 required behavior:

- Management sessions use opaque random session IDs and expiry.
- Overlay route keys use opaque random raw keys and stored hashes.
- Live and test overlay keys are generated separately.
- Overlay keys are scoped to either one module-specific output or one unified output.
- Overlay key verification uses the route path segment, not query strings.
- Overlay keys can be revoked.
- The Slice 5 `GET /config/server` missing-rate-limiting warning is resolved with a shared local management throttling control.
- Test keys cannot authorize live overlay access.
- Revoked keys fail verification.
- Stored overlay key records never contain raw route keys.
- Repeated management requests are rejected before repeated filesystem-backed work.

## Baseline Evidence

- `git fetch origin` moved `origin/main` from `d1a6115` to `b5503c7`.
- Branch `codex/slice-6-implementation` was created from `origin/main`.
- Fresh `pnpm test` before build failed because server tests resolved `@stream-jams/core` to missing package `dist` output after a fresh install.
- `pnpm build` succeeded and generated package dist output.
- `pnpm test` after build passed: 21 test files, 61 tests.
- Node warning observed during validation: repo expects Node `24.16.0`; local runtime is Node `26.2.0`.

## File Ownership

- Create `packages/core/src/auth/management-session-service.ts`: management-session service contracts, verification result union, and repository boundary.
- Create `packages/core/src/overlays/overlay-access-service.ts`: overlay access service contracts, route-access requests, creation result union, and repository boundary.
- Modify `packages/core/src/index.ts`: export the new authorization contracts.
- Create `apps/server/src/modules/auth/management-session-service.ts`: Node-backed management session service with in-memory MVP repository and injectable clock/id generator.
- Create `apps/server/src/modules/auth/management-session-service.test.ts`: service tests for creation, expiry, revocation, and opaque session ids.
- Create `apps/server/src/modules/overlays/overlay-access-service.ts`: Node-backed overlay access service with in-memory MVP repository, key generation, hashing, verification, and revocation.
- Create `apps/server/src/modules/overlays/overlay-access-service.test.ts`: service tests for hash-only storage, live/test scope isolation, module/unified isolation, route key mismatch, and revocation.
- Create `apps/server/src/http/middleware/local-management-rate-limit.ts`: shared fixed-window local throttling pre-handler for management routes.
- Create `apps/server/src/http/middleware/local-management-rate-limit.test.ts`: throttling tests proving requests are capped per route/client window.
- Create `apps/server/src/http/routes/management-session.ts`: rate-limited route for issuing no-password MVP management sessions.
- Create `apps/server/src/http/routes/management-session.test.ts`: route tests for session issuance and request throttling.
- Create `apps/server/src/http/middleware/management-auth.ts`: Fastify pre-handler requiring `Authorization: Bearer mgmt_*` sessions.
- Create `apps/server/src/http/middleware/management-auth.test.ts`: middleware tests for missing, invalid, expired, overlay-key-as-session, and valid credentials.
- Create `apps/server/src/http/middleware/overlay-auth.ts`: Fastify pre-handler verifying `ovl_*` route-segment keys against resolved overlay output.
- Create `apps/server/src/http/middleware/overlay-auth.test.ts`: middleware tests for route-segment verification, query-string rejection, live/test mismatch, module/unified mismatch, revoked keys, and valid access.
- Modify `apps/server/src/http/routes/config.ts`: require management auth and local rate limiting before filesystem-backed config reads/writes.
- Modify `apps/server/src/http/routes/config.test.ts`: update existing config route tests for management sessions and rate limiting.
- Modify `apps/server/src/app.ts`: register management session routes when supplied and require auth dependencies when management/config routes are registered.
- Modify `apps/server/src/app.test.ts`: preserve health route coverage and add a route-registration assertion for protected config dependencies.
- Modify `apps/server/src/index.ts`: compose default in-memory management session service and shared local rate limiter for MVP runtime.
- Modify `apps/server/src/http/errors.ts`: extend error body support for auth and rate-limit responses.
- Modify `apps/server/src/modules/security/redactor.test.ts`: assert generated-style overlay keys continue to redact from log text.
- Modify `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`: mark Slice 6 complete only after implementation, validation, and gap analysis.
- Modify this plan as execution proceeds: check boxes only after tests pass for each sub-slice.

## Sub-Slice 6.1: Core Authorization Contracts

**Objective:** Add stable core interfaces and result unions for management sessions and overlay route-key verification without introducing server, Fastify, or crypto dependencies into `@stream-jams/core`.

**Expected files or areas touched:**

- `packages/core/src/auth/management-session-service.ts`
- `packages/core/src/overlays/overlay-access-service.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [x] Write failing import/typing tests through the first server service tests that reference the new core contracts.
- [x] Run `pnpm test -- apps/server/src/modules/auth/management-session-service.test.ts apps/server/src/modules/overlays/overlay-access-service.test.ts` and confirm missing-contract failures.
- [x] Add management session contracts with explicit `authorized` and denial reason unions.
- [x] Add overlay access contracts with explicit create, verify, revoke, repository, and denial reason unions.
- [x] Export the contracts from `packages/core/src/index.ts`.
- [x] Run `pnpm test -- apps/server/src/modules/auth/management-session-service.test.ts apps/server/src/modules/overlays/overlay-access-service.test.ts` and continue to the expected missing-implementation failures.

**Positive test cases:**

- Server services can import `ManagementSessionService`, `ManagementSessionVerification`, `OverlayAccessService`, and `OverlayAccessVerification` from `@stream-jams/core`.

**Negative test cases:**

- The core contracts must not import Fastify or Node-specific crypto types.

**Non-trivial assertions:**

- Type-level use in concrete service tests requires consumers to handle both authorized and denied verification branches.

**Validation commands:**

- `pnpm test -- apps/server/src/modules/auth/management-session-service.test.ts apps/server/src/modules/overlays/overlay-access-service.test.ts`

**Acceptance criteria:**

- Core authorization contracts are framework-independent and exported.

## Sub-Slice 6.2: Management Session Service

**Objective:** Implement expiring opaque local management sessions that can be created, verified, and revoked without coupling the service to HTTP.

**Expected files or areas touched:**

- `apps/server/src/modules/auth/management-session-service.ts`
- `apps/server/src/modules/auth/management-session-service.test.ts`

**Implementation steps:**

- [x] Write failing tests for session creation, `mgmt_` opaque id format, future expiry, expiry rejection, unknown id rejection, and revocation.
- [x] Run `pnpm test -- apps/server/src/modules/auth/management-session-service.test.ts` and confirm the tests fail before implementation.
- [x] Implement `LocalManagementSessionService` with injectable `clock`, `generateId`, `sessionTtlMs`, and repository dependencies.
- [x] Implement `InMemoryManagementSessionRepository` for the MVP boundary before SQLite repositories arrive.
- [x] Run `pnpm test -- apps/server/src/modules/auth/management-session-service.test.ts` and confirm focused tests pass.

**Positive test cases:**

- Creating a session returns an id beginning with `mgmt_`, an ISO `createdAt`, and an ISO `expiresAt` later than `createdAt`.
- A fresh session verifies as authorized and returns the stored session.

**Negative test cases:**

- Unknown session ids deny with `not-found`.
- Expired sessions deny with `expired`.
- Revoked sessions deny with `revoked`.
- Overlay-style ids such as `ovl_secret` never authorize as management sessions.

**Non-trivial assertions:**

- Assert exact generated expiry based on an injected clock and TTL.
- Assert the repository no longer returns an active session after revocation.

**Validation commands:**

- `pnpm test -- apps/server/src/modules/auth/management-session-service.test.ts`

**Acceptance criteria:**

- Management credential behavior is unit testable without Fastify.

## Sub-Slice 6.3: Overlay Access Service

**Objective:** Implement route-key creation, hash-only storage, verification, and revocation for module-specific and unified overlay outputs.

**Expected files or areas touched:**

- `apps/server/src/modules/overlays/overlay-access-service.ts`
- `apps/server/src/modules/overlays/overlay-access-service.test.ts`

**Implementation steps:**

- [x] Write failing tests for live/test key generation, stored hash shape, successful verification, live/test mismatch, module/unified mismatch, wrong module mismatch, wrong raw key mismatch, and revoked key denial.
- [x] Run `pnpm test -- apps/server/src/modules/overlays/overlay-access-service.test.ts` and confirm the tests fail before implementation.
- [x] Implement `LocalOverlayAccessService` with injectable `clock`, raw-key generator, id generator, and repository dependencies.
- [x] Implement SHA-256 hashing for high-entropy overlay keys and store only hash values in records.
- [x] Implement `InMemoryOverlayAccessKeyRepository` with create, find-by-output, update, and revoke methods.
- [x] Run `pnpm test -- apps/server/src/modules/overlays/overlay-access-service.test.ts` and confirm focused tests pass.

**Positive test cases:**

- A raw key returned from creation verifies for the same overlay id, purpose, scope, and module id.
- Separate live and test keys are generated for the same overlay id.

**Negative test cases:**

- A test key cannot authorize live overlay access.
- A module-specific key cannot authorize unified output.
- A unified key cannot authorize module output.
- A revoked key fails verification.
- A wrong raw key fails even when output metadata matches.

**Non-trivial assertions:**

- Persisted records contain `sha256:` hashes and never contain the raw `ovl_` key substring.
- Verification result denial reasons distinguish `scope-mismatch`, `purpose-mismatch`, `module-mismatch`, `key-mismatch`, and `revoked`.

**Validation commands:**

- `pnpm test -- apps/server/src/modules/overlays/overlay-access-service.test.ts`

**Acceptance criteria:**

- Overlay output credentials are separate from management credentials and can be rotated/revoked independently.

## Sub-Slice 6.4: Management Session Route, Auth, And Local Rate Limit Middleware

**Objective:** Protect management/config routes with session-based authorization and a shared local fixed-window throttle that runs before filesystem-backed work.

**Expected files or areas touched:**

- `apps/server/src/http/middleware/local-management-rate-limit.ts`
- `apps/server/src/http/middleware/local-management-rate-limit.test.ts`
- `apps/server/src/http/middleware/management-auth.ts`
- `apps/server/src/http/middleware/management-auth.test.ts`
- `apps/server/src/http/routes/management-session.ts`
- `apps/server/src/http/routes/management-session.test.ts`
- `apps/server/src/http/routes/config.ts`
- `apps/server/src/http/routes/config.test.ts`
- `apps/server/src/http/errors.ts`

**Implementation steps:**

- [x] Write failing rate-limiter tests for allowed requests, per-route/client isolation, fixed-window reset, and blocked requests.
- [x] Run `pnpm test -- apps/server/src/http/middleware/local-management-rate-limit.test.ts` and confirm failures.
- [x] Implement the local fixed-window limiter and Fastify pre-handler.
- [x] Run `pnpm test -- apps/server/src/http/middleware/local-management-rate-limit.test.ts`.
- [x] Write failing management-auth middleware tests for missing bearer token, invalid token, expired token, overlay key token, and valid session token.
- [x] Run `pnpm test -- apps/server/src/http/middleware/management-auth.test.ts` and confirm failures.
- [x] Implement bearer-token extraction and management-session verification middleware.
- [x] Add a rate-limited no-password MVP session issuance route.
- [x] Update config routes to run rate limiting and management auth before route handlers.
- [x] Update config route tests so valid sessions are required and repeated requests are rejected before additional config-store reads.
- [x] Run `pnpm test -- apps/server/src/http/middleware/local-management-rate-limit.test.ts apps/server/src/http/middleware/management-auth.test.ts apps/server/src/http/routes/config.test.ts apps/server/src/app.test.ts`.

**Positive test cases:**

- A valid management session can read and update server config.
- Rate-limit windows reset after the configured duration.

**Negative test cases:**

- Missing, malformed, expired, revoked, and overlay-style bearer tokens receive HTTP 401.
- Requests over the local rate limit receive HTTP 429.
- The rejected over-limit config request does not call the config store again.

**Non-trivial assertions:**

- Assert exact HTTP status and error code bodies.
- Assert config-store read/write counters remain unchanged for unauthorized and over-limit requests.

**Validation commands:**

- `pnpm test -- apps/server/src/http/middleware/local-management-rate-limit.test.ts apps/server/src/http/middleware/management-auth.test.ts apps/server/src/http/routes/config.test.ts apps/server/src/app.test.ts`

**Acceptance criteria:**

- The Slice 5 missing-rate-limiting warning is resolved with tested local throttling on management routes.

## Sub-Slice 6.5: Overlay Auth Middleware And Redaction Check

**Objective:** Verify overlay keys from path segments only, reject query-string credentials, and preserve overlay key redaction.

**Expected files or areas touched:**

- `apps/server/src/http/middleware/overlay-auth.ts`
- `apps/server/src/http/middleware/overlay-auth.test.ts`
- `apps/server/src/modules/security/redactor.test.ts`

**Implementation steps:**

- [x] Write failing overlay middleware tests for valid route-segment access, query-only key rejection, live/test mismatch, module/unified mismatch, revoked key rejection, and wrong module rejection.
- [x] Run `pnpm test -- apps/server/src/http/middleware/overlay-auth.test.ts` and confirm failures.
- [x] Implement route-segment extraction through an injected `resolveAccessRequest` callback so future overlay route shapes can reuse the middleware.
- [x] Add a redactor test for generated-style `ovl_` keys in overlay URLs.
- [x] Run `pnpm test -- apps/server/src/http/middleware/overlay-auth.test.ts apps/server/src/modules/security/redactor.test.ts`.

**Positive test cases:**

- A route segment key authorizes a matching module-specific live overlay output.
- A route segment key authorizes a matching unified test overlay output.

**Negative test cases:**

- `?key=ovl_*` query credentials are ignored and rejected.
- Test keys cannot authorize live output.
- Module keys cannot authorize unified output, and unified keys cannot authorize module output.
- Revoked keys fail verification.

**Non-trivial assertions:**

- Assert the service receives the raw key value from route params, never from query params.
- Assert redacted log text replaces generated-style `ovl_` route keys.

**Validation commands:**

- `pnpm test -- apps/server/src/http/middleware/overlay-auth.test.ts apps/server/src/modules/security/redactor.test.ts`

**Acceptance criteria:**

- Overlay route-key middleware is reusable by future overlay HTTP/WebSocket routes and does not accept query-string keys.

## Sub-Slice 6.6: Runtime Composition And Plan Reconciliation

**Objective:** Wire default services into runtime composition and reconcile the implementation against Slice 6 before final validation.

**Expected files or areas touched:**

- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/index.ts`
- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/plans/2026-05-29-stream-jams-slice-6-management-session-overlay-route-keys.md`
- Any implementation file needed to close a discovered gap.

**Implementation steps:**

- [x] Update `createServerApp` dependencies so config routes cannot be registered without management auth and rate-limit dependencies.
- [x] Compose `LocalManagementSessionService`, `InMemoryManagementSessionRepository`, and `LocalManagementRateLimiter` in `index.ts`.
- [x] Re-read MVP Slice 6 and this detailed plan.
- [x] Check every acceptance item against implemented tests and code.
- [x] Record completion evidence and any gap analysis in the MVP plan.
- [x] Implement and test any missing in-scope behavior found during reconciliation.
- [x] Run focused tests for any gap fixes.

**Positive test cases:**

- App factory tests prove config route registration uses protected dependencies.
- Every Slice 6 acceptance item maps to at least one implementation file and one focused test.

**Negative test cases:**

- Gaps cannot be marked complete unless tests cover the missing behavior.

**Non-trivial assertions:**

- Reconciliation notes list concrete validation commands and the final gap state.

**Validation commands:**

- Focused commands for any gap fixes.

**Acceptance criteria:**

- No in-scope Slice 6 feature gaps remain.

## Sub-Slice 6.7: Full Validation, Commit, PR, And Independent Review

**Objective:** Verify the whole repo, commit the complete Slice 6 change, push it, create a comprehensive PR, and launch an independent review subagent for security issues and code smells.

**Expected files or areas touched:**

- All Slice 6 changed files.
- GitHub PR metadata.

**Implementation steps:**

- [x] Run `pnpm lint`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm test:e2e`.
- [x] Run `pnpm build`.
- [x] Review `git diff --check`, `git diff --stat`, and the full diff for unrelated changes.
- [ ] Commit with message `feat: add local auth boundaries`.
- [ ] Push branch `codex/slice-6-implementation`.
- [ ] Create a draft PR into `main` with summary, implementation details, files changed, tests, validation, and reconciliation notes.
- [ ] Start an independent review subagent in a new context to review the PR for security vulnerabilities and code smells.
- [ ] If the review subagent finds required changes, implement them with tests, commit, push, and comment on the PR with the update details.

**Positive test cases:**

- Full validation commands complete successfully.

**Negative test cases:**

- A failing validation command blocks completion until fixed or explicitly documented as an environmental/pre-existing gap.
- Security/code-smell findings from the independent review cannot be ignored unless they are technically rebutted with code and test evidence.

**Non-trivial assertions:**

- PR body contains enough context for human review without chat history.
- Review comments list changed files, rationale, and validation evidence for any follow-up fixes.

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
- Any required review fixes are committed and pushed.

## Gap Analysis Result

Gap analysis completed after the first implementation pass. One coherence gap was found: config routes could be protected by sessions, but runtime had no HTTP route to issue an MVP no-password management session. That gap was closed by adding `POST /auth/management/sessions` with the same local management rate limiter used by config routes.

Focused validation after gap closure:

- `pnpm test -- apps/server/src/http/routes/management-session.test.ts apps/server/src/http/routes/config.test.ts apps/server/src/app.test.ts` passed: 27 test files, 83 tests.
- `pnpm test -- apps/server/src/http/routes/config.test.ts apps/server/src/http/middleware/overlay-auth.test.ts` passed: 26 test files, 81 tests.
- `pnpm typecheck` passed.

Full validation:

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed: 27 test files, 83 tests.
- `pnpm test:e2e` passed with the existing placeholder message: `Playwright e2e tests are introduced in a later slice.`
- `pnpm build` passed.
- `git diff --check` passed.

## Gap Analysis Checklist

- [x] Management credentials and overlay route keys are separate.
- [x] Overlay route keys cannot mutate app config.
- [x] Module-specific overlay keys cannot authorize unified overlay output.
- [x] Unified overlay keys cannot authorize module-specific output.
- [x] Test overlay keys cannot authorize live overlay output.
- [x] Revoked overlay keys fail verification.
- [x] Stored overlay keys are hashes, not raw keys.
- [x] Overlay route keys are redacted from logs.
- [x] Management/config routes have tested local throttling.
- [x] Repeated unauthorized or over-limit management requests do not repeat filesystem-backed work.
- [x] No in-scope Slice 6 behavior is deferred.
