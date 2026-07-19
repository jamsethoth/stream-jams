# Slice 17: Twitch OAuth And Account Connection

> **Superseded (2026-07-16):** This historical Authorization Code flow is retained as its original implementation record. Stream Jams now uses Twitch Device Code OAuth; see `docs/superpowers/plans/2026-07-16-twitch-device-code-oauth.md`. Do not use this plan for current client-secret or callback setup.

**Goal:** Add a testable Twitch authorization-code connection flow that stores OAuth tokens only through `SecretStore`, persists non-secret account metadata in SQLite, and exposes management UI status, connect, refresh, and disconnect workflows.

**Base requirements:** `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` Slice 17.

**Primary sources:** Twitch authentication docs for authorization-code, refresh, and token validation flows; Twitch EventSub subscription type docs for MVP scope selection.

**Scope set for MVP EventSub:** `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`, and `channel:read:redemptions`. Raid subscription setup does not require a user scope, but the account connection still stores broadcaster identity for later EventSub conditions.

## Sub-Slice 17.1: OAuth Service And Account Repository

**Objective:** Add server-side Twitch account models, state handling, token secret references, and SQLite-backed non-secret account metadata.

**Files or areas:** `apps/server/src/modules/twitch/twitch-oauth-service.ts`, `apps/server/src/modules/twitch/twitch-account-repository.ts`, `apps/server/src/modules/twitch/sqlite-twitch-account-repository.ts`, `apps/server/src/modules/db/migrations/003-twitch-accounts.ts`, database tests.

**Tests:**

- Authorization URL includes response type, client id, redirect uri, state, and sorted MVP scopes.
- Callback rejects missing or mismatched state before token exchange.
- Successful callback stores only access/refresh tokens through `SecretStore` and persists non-secret account metadata.
- Disconnect deletes token secret refs and non-secret account metadata.

- [x] Complete.

## Sub-Slice 17.2: Twitch API Client

**Objective:** Add a fetch-injected Twitch API adapter for token exchange, token refresh, token validation, and current-user lookup.

**Files or areas:** `apps/server/src/modules/twitch/twitch-api-client.ts`, API client tests.

**Tests:**

- Exchanges authorization codes and refresh tokens with form-encoded Twitch token requests.
- Sends Bearer and Client-Id headers when validating tokens and reading Helix user data.
- Rejects malformed Twitch token, validation, and user responses without logging token values.

- [x] Complete.

## Sub-Slice 17.3: HTTP Routes And Server Wiring

**Objective:** Expose management-protected Twitch auth status/start/refresh/disconnect routes plus the state-verified OAuth callback route.

**Files or areas:** `apps/server/src/http/routes/twitch-auth.ts`, `apps/server/src/app.ts`, `apps/server/src/index.ts`, route tests.

**Tests:**

- Management sessions can read connection status and start authorization.
- Callback can complete with valid state without management bearer headers.
- Invalid callbacks return controlled 400 responses.
- Missing management sessions and overlay route keys are rejected before protected Twitch auth work.
- Refresh failures return controlled provider errors without exposing token values.

- [x] Complete.

## Sub-Slice 17.4: Management UI

**Objective:** Add a Twitch management panel with connection status, connect URL handoff, refresh, and disconnect actions.

**Files or areas:** `apps/web/src/management/twitch/`, `apps/web/src/management/management-api.ts`, management navigation and shell tests.

**Tests:**

- Twitch tab displays disconnected and connected account states.
- Connect action requests an authorization URL and exposes it to the user.
- Refresh and disconnect delegate to the management API and update status.
- Error diagnostics never include token-shaped values.

- [x] Complete.

## Reconciliation Checklist

- [x] Implement Twitch OAuth authorization URL generation with required scopes.
- [x] Implement OAuth callback handling.
- [x] Store access and refresh tokens through `SecretStore`.
- [x] Store non-secret account metadata in SQLite.
- [x] Implement token refresh through a Twitch API client adapter.
- [x] Add management UI connection status and disconnect action.
- [x] Unit test scope generation and secret references.
- [x] Integration test OAuth callback with mocked Twitch responses.
- [x] Commit with message `feat: add twitch account connection`.

## Final Validation

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [ ] `pnpm test:e2e` - attempted locally; blocked because Playwright Chromium cannot load `libnspr4.so` in this environment before app assertions run.
- [x] `pnpm build`
- [x] `git diff --check`

## Validation Evidence

- Focused tests passed: `pnpm test:unit apps/server/src/modules/twitch/twitch-api-client.test.ts apps/server/src/modules/twitch/twitch-oauth-service.test.ts apps/server/src/modules/twitch/sqlite-twitch-account-repository.test.ts apps/server/src/modules/db/database.test.ts apps/server/src/http/routes/twitch-auth.test.ts apps/server/src/app.test.ts apps/web/src/management/ManagementApp.test.tsx apps/web/src/App.test.tsx` - 8 files, 37 tests.
- Full unit suite passed: `pnpm test` - 71 files, 273 tests.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- `pnpm test:e2e` was attempted locally and failed before app assertions because the Playwright Chromium runtime is missing `libnspr4.so`.
