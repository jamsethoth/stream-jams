# Twitch Recovery And Alert Output Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover Twitch EventSub automatically from ordinary token and transport failures, and expose only one live browser source per alert target profile.

**Architecture:** Extend the existing `TwitchOAuthService` instead of adding a second token manager. EventSub reports HTTP 401 to the existing refresh pipeline, runtime composition performs startup/hourly validation, and the client owns keepalive timeout detection. Narrow the alert-specific management contract to live outputs while retaining the internal `live | test` transport boundary for compatibility and fail-closed test isolation.

**Tech Stack:** TypeScript, Node.js timers and WebSocket, Fastify runtime composition, React, Zod, Vitest, Storybook, Playwright, OpenSpec.

## Global Constraints

- Tokens remain only in the OS credential store and never enter logs, diagnostics, browser responses, SQLite, or UI state.
- Automatic recovery attempts one refresh; failed refresh requires explicit user reauthorization with actionable referenced diagnostics.
- Browser sources are Landscape and Vertical live outputs; test sends use the selected live output.
- No new dependencies or parallel OAuth/output services.

---

### Task 1: OAuth validation and refresh recovery

**Files:**
- Modify: `apps/server/src/modules/twitch/twitch-oauth-service.test.ts`
- Modify: `apps/server/src/modules/twitch/twitch-oauth-service.ts`

**Interfaces:**
- Produces: `validateConnectedAccount(options?): Promise<{ connection: TwitchConnectionStatus; refreshed: boolean }>`.
- Preserves: `refreshConnectedAccount()` for the management route.

- [ ] Write failing tests proving valid tokens do not refresh and HTTP 401 validation refreshes and rotates both secrets.
- [ ] Run the focused test and confirm the new assertions fail.
- [ ] Add the minimum validation method and notification option to the existing refresh/store pipeline.
- [ ] Run the focused test and confirm it passes.

### Task 2: EventSub unauthorized and keepalive recovery

**Files:**
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-client.test.ts`
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-client.ts`

**Interfaces:**
- Consumes: `onAuthorizationFailure(): Promise<void>` from runtime composition.
- Produces: one forced refresh callback on subscription HTTP 401 and watchdog reconnection after `keepalive_timeout_seconds`.

- [ ] Write failing tests proving HTTP 401 stops stale retries and invokes recovery once, and silence closes/reconnects the socket.
- [ ] Run the focused test and confirm both behaviors fail.
- [ ] Implement the callback branch and keepalive watchdog with injected deterministic timer functions.
- [ ] Run the focused test and confirm it passes.

### Task 3: Runtime startup and hourly validation

**Files:**
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts`
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-runtime-service.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`

**Interfaces:**
- Consumes: `TwitchOAuthService.validateConnectedAccount()` and `refreshConnectedAccount()`.
- Produces: startup validation, hourly validation, refreshed-token reconnection, referenced failure state, and timer cleanup.

- [ ] Write failing runtime tests for pre-connect validation, refresh failure status, hourly validation, and clean shutdown.
- [ ] Run focused tests and confirm the expected failures.
- [ ] Wire existing services with one hourly Node timer and clear it during composition close.
- [ ] Run focused tests and confirm they pass.

### Task 4: One browser source per target profile

**Files:**
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`

**Interfaces:**
- Produces: `AlertBrowserSourceView.purpose` fixed to `"live"` and exactly Landscape/Vertical browser-source rows.

- [ ] Write failing schema, composition, and UI tests that reject or omit separate test sources.
- [ ] Run focused tests and confirm they fail.
- [ ] Narrow the contract/mapping and update labels, copy, and stories.
- [ ] Run focused tests and confirm they pass.

### Task 5: Verification and runtime restart

**Files:**
- Modify: matching OpenSpec task checklists after each task passes.

- [ ] Run lint, typecheck, unit tests, build, Storybook interaction tests, and Playwright.
- [ ] Run strict validation for both affected OpenSpec changes and `git diff --check`.
- [ ] Rebuild and restart the local service on its configured port.
- [ ] Verify Twitch and Browser sources in the live management UI with no console errors.
