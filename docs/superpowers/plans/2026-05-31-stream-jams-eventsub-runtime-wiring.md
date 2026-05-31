# EventSub Runtime Wiring Hardening

**Goal:** Close the remaining MVP gap where the Twitch EventSub WebSocket client existed and was tested but was not wired into production startup, OAuth account changes, management status, or diagnostics.

**Base requirement:** `docs/superpowers/plans/2026-05-30-stream-jams-slice-18-twitch-eventsub-ingestion.md` requires EventSub WebSocket lifecycle, subscription registration, reconnect status, and management-visible provider status.

## Root Cause Evidence

- `apps/server/src/modules/twitch/twitch-eventsub-client.ts` implemented `TwitchEventSubClient`, subscription planning, reconnect handling, and notification forwarding.
- `apps/server/src/index.ts` did not instantiate `TwitchEventSubClient` or `DefaultTwitchEventSubApiClient`.
- `/twitch/eventsub/status` returned ingestion counters only, so management could show ingestion status without confirming whether the live EventSub WebSocket was connected.

## Sub-Slice 1: Runtime Coordinator

**Objective:** Add a testable runtime boundary that connects the stored Twitch account to the EventSub WebSocket client using the stored access token and reports combined connection plus ingestion status.

**Files or areas:** `apps/server/src/modules/twitch/twitch-eventsub-runtime-service.ts`, tests.

**Validation evidence:**

- Red test: focused unit run failed because `twitch-eventsub-runtime-service.ts` did not exist.
- Green test: focused unit run passed after adding the runtime service.

- [x] Complete.

## Sub-Slice 2: OAuth And Startup Wiring

**Objective:** Reconnect EventSub whenever Twitch OAuth creates, refreshes, or disconnects a stored account, and reconnect any persisted account on local server startup.

**Files or areas:** `apps/server/src/modules/twitch/twitch-oauth-service.ts`, `apps/server/src/index.ts`, tests.

**Validation evidence:**

- Red test: focused unit run failed because OAuth connection-change notifications were never emitted.
- Green test: focused unit run passed after adding the hook and production wiring.

- [x] Complete.

## Sub-Slice 3: Management And Diagnostics Status

**Objective:** Expose actual EventSub connection state to the management status route and diagnostics provider errors while preserving ingestion counters.

**Files or areas:** `apps/server/src/http/routes/twitch-eventsub.ts`, `apps/server/src/app.ts`, `apps/web/src/management/management-api.ts`, `apps/web/src/management/twitch/TwitchPanel.tsx`, tests.

**Validation evidence:**

- Focused tests passed: `pnpm test:unit apps/server/src/modules/twitch/twitch-oauth-service.test.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts apps/server/src/modules/twitch/twitch-eventsub-client.test.ts apps/server/src/http/routes/twitch-eventsub.test.ts apps/server/src/app.test.ts apps/web/src/management/ManagementApp.test.tsx apps/web/src/App.test.tsx` - 7 files, 36 tests.
- Typecheck passed: `pnpm typecheck`.

- [x] Complete.

## Final Validation

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `env LD_LIBRARY_PATH=/tmp/playwright-deps/extract/usr/lib/x86_64-linux-gnu pnpm test:e2e`
- [x] `pnpm build`
- [x] `git diff --check`


## Final Validation Evidence

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed: 80 files, 309 tests.
- `env LD_LIBRARY_PATH=/tmp/playwright-deps/extract/usr/lib/x86_64-linux-gnu pnpm test:e2e` passed: 8 Chromium tests.
- `pnpm build` passed.
- `git diff --check` passed.
