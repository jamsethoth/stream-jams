# Slice 18: Twitch EventSub WebSocket Provider

**Goal:** Add a testable Twitch EventSub WebSocket provider boundary that plans MVP subscriptions from granted scopes, normalizes Twitch EventSub notifications into `NormalizedStreamEvent`, handles WebSocket session lifecycle/reconnect status, and exposes provider status to management.

**Base requirements:** `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` Slice 18.

**Primary sources:**

- Twitch EventSub WebSocket messages: https://dev.twitch.tv/docs/eventsub/websocket-reference/
- Twitch EventSub WebSocket handling: https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
- Twitch Create EventSub Subscription API: https://dev.twitch.tv/docs/api/reference#create-eventsub-subscription
- Twitch EventSub subscription types: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/

**Source decisions:**

- WebSocket subscriptions use `transport.method = "websocket"` and the session ID received in `session_welcome`.
- Create EventSub Subscription requests for WebSocket transport use a user access token, not an app access token.
- A Twitch reconnect message supplies a `reconnect_url` that must be used as-is; a new session needs subscriptions recreated.
- Twitch can deliver duplicate notification message IDs, so ingestion deduplicates by message ID before forwarding.
- MVP subscriptions: follow, subscribe, resubscription message, cheer, raid, and custom reward redemption add.

## Sub-Slice 18.1: Subscription Planner And EventSub API Adapter

**Objective:** Build subscription request planning for the connected broadcaster and an injected HTTP adapter for Create EventSub Subscription.

**Files or areas:** `apps/server/src/modules/twitch/twitch-eventsub-client.ts`, tests.

**Tests:**

- Builds follow, subscription, resubscription, cheer, raid, and channel point redemption subscription requests with the WebSocket session ID.
- Omits scope-gated subscriptions when the connected account lacks the required scope.
- Uses the user access token and Client-Id headers for Create EventSub Subscription.
- Rejects malformed EventSub API responses without logging token values.

- [x] Complete.

## Sub-Slice 18.2: WebSocket Session Lifecycle

**Objective:** Add an injected WebSocket runtime that tracks connecting/connected/reconnecting/error statuses, handles welcome/keepalive/reconnect/revocation/notification messages, and reconnects with backoff after unexpected close.

**Files or areas:** `apps/server/src/modules/twitch/twitch-eventsub-client.ts`, lifecycle tests.

**Tests:**

- Welcome messages store the session ID and trigger subscription creation.
- Keepalive messages refresh last-message status without emitting stream events.
- Reconnect messages open the provided `reconnect_url` without recreating subscriptions on that reconnect path.
- Unexpected close schedules a fresh connection with backoff and recreates subscriptions for the new session.
- Revocation messages set provider status to degraded/error without stopping the local server.

- [x] Complete.

## Sub-Slice 18.3: Twitch Event Normalizer

**Objective:** Normalize MVP Twitch EventSub notification payloads into `NormalizedStreamEvent` and reject unsupported/malformed payloads.

**Files or areas:** `apps/server/src/modules/twitch/twitch-event-normalizer.ts`, normalizer tests.

**Tests:**

- Normalizes follow, subscription, resubscription, cheer, raid, and channel point redemption payloads.
- Preserves Twitch payload details only under safe metadata and maps user-facing fields into normalized actor/message/amount fields.
- Handles anonymous cheers with `actor.id = null`.
- Rejects unsupported EventSub subscription types and malformed payloads.

- [x] Complete.

## Sub-Slice 18.4: Event Ingestion Service And Management Status

**Objective:** Add an event ingestion service that deduplicates EventSub message IDs, forwards normalized events to an injected sink, stores current provider status, and exposes status to management UI.

**Files or areas:** `apps/server/src/modules/events/event-ingestion-service.ts`, `apps/server/src/http/routes/twitch-eventsub.ts`, `apps/web/src/management/twitch/TwitchPanel.tsx`, management API/tests.

**Tests:**

- Duplicate EventSub message IDs are acknowledged but not forwarded twice.
- Malformed events update provider status and do not crash ingestion.
- Management sessions can read EventSub provider status.
- Twitch management UI renders account and EventSub connection state.

- [x] Complete.

## Reconciliation Checklist

- [x] Implement EventSub WebSocket session lifecycle.
- [x] Register subscriptions for MVP Twitch event types based on granted scopes.
- [x] Normalize Twitch EventSub messages into `NormalizedStreamEvent`.
- [x] Reconnect with backoff on WebSocket disconnect.
- [x] Surface provider status to diagnostics and management UI.
- [x] Unit test each Twitch event normalizer.
- [x] Integration test reconnect behavior with a mocked EventSub WebSocket server.
- [x] Commit with message `feat: add twitch eventsub ingestion`.

## Final Validation

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [ ] `pnpm test:e2e` - attempted locally; blocked because Playwright Chromium cannot load `libnspr4.so` before app assertions run.
- [x] `pnpm build`
- [x] `git diff --check`

## Validation Evidence

- Focused tests passed: `pnpm test:unit apps/server/src/modules/twitch/twitch-event-normalizer.test.ts apps/server/src/modules/twitch/twitch-eventsub-client.test.ts apps/server/src/modules/events/event-ingestion-service.test.ts apps/server/src/http/routes/twitch-eventsub.test.ts apps/server/src/app.test.ts apps/web/src/management/ManagementApp.test.tsx apps/web/src/App.test.tsx` - 7 files, 30 tests.
- Full unit suite passed: `pnpm test` - 75 files, 288 tests.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- `pnpm test:e2e` was attempted locally and failed before app assertions because the Playwright Chromium runtime is missing `libnspr4.so`.
