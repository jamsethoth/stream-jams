# Streamer.bot Event Source Umbrella Analysis

**Date:** 2026-06-01
**Branch:** `analyze-streamerbot-event-source-spec`
**Reviewed document:** `docs/superpowers/specs/2026-05-31-streamerbot-event-source-design.md`
**Goal:** Validate umbrella assumptions, close design questions, and break the design into agentic execution slices.

## Summary

The umbrella direction is sound: Streamer.bot should be modeled as a broad local event aggregator, passive event intake should ship before automation control, and unknown source/type pairs should be accepted into diagnostics instead of forced through the Twitch alert model.

The umbrella spec has now been updated with these cleanup decisions:

1. Resolve the remaining alert semantics question by choosing the existing recommendation: Streamer.bot Twitch events are Twitch alert events with `sourcePlatform: "twitch"` and `ingestProvider: "streamerbot"`.
2. Correct the transport default. Streamer.bot's documented local default is plain `ws://127.0.0.1:8080/`, not `wss://`. Stream Jams should default to local `ws://`, reject non-local hosts in the first wave, and require explicit warnings/opt-ins for unauthenticated mode and credential-bearing local `ws://`.

There are no remaining umbrella-level design questions after the umbrella cleanup. Slice-specific specs still need exact file names, route names, migration IDs, UI copy, and normalizer fixture content.

## Sources Checked

Official Streamer.bot docs:

- WebSocket server configuration: https://docs.streamer.bot/api/websocket/guide/configuration
- WebSocket events guide: https://docs.streamer.bot/api/websocket/guide/events
- WebSocket authentication: https://docs.streamer.bot/api/websocket/guide/authentication
- WebSocket requests: https://docs.streamer.bot/api/websocket/requests
- Remote access recipe: https://docs.streamer.bot/api/websocket/recipes/remote-access
- Official client setup: https://streamerbot.github.io/client/get-started/setup
- Official client events guide: https://streamerbot.github.io/client/guide/events/

Repo docs and code:

- `docs/product-plan.md`
- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/plans/2026-05-30-stream-jams-slice-18-twitch-eventsub-ingestion.md`
- `docs/superpowers/plans/2026-05-31-stream-jams-eventsub-runtime-wiring.md`
- `docs/superpowers/plans/2026-05-31-stream-jams-slice-20-diagnostics.md`
- `docs/future-features.md`
- `packages/core/src/events/types.ts`
- `packages/core/src/events/schemas.ts`
- `packages/core/src/diagnostics/repository.ts`
- `packages/core/src/alerts/types.ts`
- `packages/core/src/alerts/condition-evaluator.ts`
- `apps/server/src/modules/events/event-ingestion-service.ts`
- `apps/server/src/modules/events/event-pipeline.ts`
- `apps/server/src/modules/diagnostics/sqlite-log-repository.ts`
- `apps/server/src/modules/diagnostics/diagnostics-service.ts`
- `apps/server/src/modules/twitch/twitch-eventsub-client.ts`
- `apps/server/src/index.ts`

`openspec list --json` now runs with `OPENSPEC_TELEMETRY=0`. Current active OpenSpec change at review time: `add-main-branch-changelog`, unrelated to Streamer.bot.

## Validated Assumptions

- Streamer.bot is broader than Twitch. The event catalog and client guide support Twitch, OBS, StreamElements, Ko-fi, Streamlabs, YouTube, custom, and application events.
- Passive intake can be implemented with `GetInfo`, `GetEvents`, `Subscribe`, `UnSubscribe`, event envelope handling, and optional authentication. `DoAction`, `SendMessage`, and code-trigger execution are separate active-control capabilities.
- Events require subscription. The protocol client must not assume all events arrive automatically.
- Received events preserve `event.source`, `event.type`, `timeStamp`, and `data`.
- The server sends an initial `Hello`. When auth is enabled, `Hello` includes challenge data that the direct client must answer with `Authenticate`.
- Streamer.bot's generic event envelope does not provide a documented stable base event ID. Stream Jams should generate IDs for accepted external events and use source-specific IDs only when a normalizer can prove they exist.
- Current Stream Jams code is Twitch-shaped: `NormalizedStreamEvent.providerId` is literal `"twitch"`, `EventIngestionService` exposes `ingestTwitchEventSubNotification`, and diagnostics rows store normalized event JSON.
- The current alert condition evaluator can already match arbitrary event field paths, so adding `sourcePlatform` and `ingestProvider` to normalized events makes provider-path conditions testable without changing the evaluator algorithm.
- Secret-store and redaction abstractions already exist, but `SecretRef.namespace` must be widened to include Streamer.bot.

## Corrections

### Transport Default

The previous umbrella draft said `wss://` should be the default. The umbrella now uses the corrected local `ws://` default.

Recommended first-wave default:

```text
protocol: ws
host: 127.0.0.1
port: 8080
endpoint: /
```

First-wave policy:

- `ws://` is allowed only for local loopback hosts.
- `wss://` is supported by the model but is not the default.
- Non-local host values are rejected regardless of protocol.
- Credential-bearing `ws://` requires `allowInsecureLocalConnection: true` and a management warning.
- Unauthenticated local `ws://` requires both `allowUnauthenticatedLocalConnection: true` and `allowInsecureLocalConnection: true`.
- Non-local Streamer.bot support remains deferred in `docs/future-features.md`.

### Alert Semantics

Resolve the remaining review question by using the umbrella's current recommendation:

- Direct Twitch EventSub events: `providerId: "twitch"`, `sourcePlatform: "twitch"`, `ingestProvider: "twitch"`.
- Streamer.bot Twitch events: `providerId: "twitch"`, `sourcePlatform: "twitch"`, `ingestProvider: "streamerbot"`.
- Preserve Streamer.bot `event.source`, `event.type`, and timestamp in metadata.

`providerId` should remain as a backward-compatible source-platform alias for existing alert rules, templates, diagnostics, playback dedupe, and tests. A later migration can rename or deprecate it once the broader provider model is established.

### Event Categories

`GetEvents` category keys and received `event.source` strings may not share the same casing or display form. Store subscription category keys separately from received envelope source/type values.

Recommended external event field:

```ts
readonly subscriptionSourceKey: string | null;
```

### Normalizer Fixtures

The umbrella does not include enough field-level detail to implement Twitch parity normalizers directly. Some official Streamer.bot event pages include schemas, while others do not. The normalizer slice must require committed fixtures for every supported source/type pair before mapping code is written.

## Umbrella Doc Cleanup Applied

- Status changed from draft to ready for the Slice 1 OpenSpec proposal.
- Replaced the `wss://` default policy with the local `ws://` policy above.
- Moved the remaining review question into resolved decisions.
- Added `Hello` and `Authenticate` to the protocol-client responsibilities.
- Added `subscriptionSourceKey` to the external event model.
- Stated that known normalizers are fixture-backed and must not guess raw payload fields.
- Replaced the high-level implementation outline with the execution slices below.

## Agentic Slice Breakdown

Each slice should get a committed slice-specific implementation spec before code changes. The first wave should be slices 1 through 4.

### Slice 1: Provider Boundary And Event Model

**Objective:** Make the current Twitch-only normalized event model able to represent source platform and ingestion provider without changing live behavior.

**In scope:**

- Add core types and schemas for `IngestProviderId`, `SourcePlatformId`, `ExternalStreamEvent`, and Streamer.bot subscription selections.
- Add `"streamerbot"` to `SecretRef.namespace`.
- Add `sourcePlatform` and `ingestProvider` to `BaseNormalizedStreamEvent`.
- Update direct Twitch EventSub normalization to set `sourcePlatform: "twitch"` and `ingestProvider: "twitch"`.
- Keep `providerId: "twitch"` for backward compatibility.
- Make diagnostics event-log parsing tolerate legacy rows that lack the new fields.
- Add alert-condition tests for `providerId`, `sourcePlatform`, and `ingestProvider`.

**Out of scope:** Streamer.bot network connection, Streamer.bot persistence, management UI.

**Acceptance:** Existing Twitch, alert, playback, diagnostics, export, typecheck, and unit tests pass. New schema tests cover legacy and new normalized event shapes.

### Slice 2: Streamer.bot Protocol Client

**Objective:** Add a direct, injected WebSocket protocol client for local Streamer.bot passive event intake.

**In scope:**

- Add `apps/server/src/modules/streamerbot/streamerbot-client.ts`.
- Build URLs from `protocol`, `host`, `port`, and `endpoint` using URL/path APIs.
- Default to `ws://127.0.0.1:8080/`.
- Parse `Hello`.
- Implement optional `Authenticate`.
- Implement `GetInfo`, `GetEvents`, `Subscribe`, and `UnSubscribe`.
- Correlate request responses by request ID.
- Validate event envelopes.
- Track connection status and reconnect with bounded backoff.
- Resubscribe after reconnect.
- Preserve subscription category keys separately from received `event.source`.

**Out of scope:** `DoAction`, `SendMessage`, code triggers, command/global mutation, `@streamerbot/client` dependency unless justified in the slice spec.

**Acceptance:** Unit tests cover unauthenticated Hello, authenticated challenge flow, bad auth, request correlation, malformed envelopes, subscribe/unsubscribe payloads, close/error behavior, reconnect/resubscribe, and redacted status messages.

### Slice 3: Connection Persistence, Secrets, And Management API

**Objective:** Persist local Streamer.bot connection settings, route secrets only through `SecretStore`, enforce local-only policy, and expose management-protected APIs.

**In scope:**

- Add a SQLite migration and repository for one active Streamer.bot connection record.
- Store enabled state, protocol, host, port, endpoint, selected subscriptions, security opt-ins, and status metadata.
- Store password values through `SecretStore`; persist only secret refs.
- Validate local-only hosts: `127.0.0.1`, `localhost`, `::1`, and equivalent loopback forms that Node can prove local.
- Reject non-local hosts.
- Reject credential-bearing `ws://` unless `allowInsecureLocalConnection` is true.
- Reject unauthenticated mode unless `allowUnauthenticatedLocalConnection` is true.
- Add management routes for read/update config, test connection, connect, disconnect, discover events, and update subscriptions.
- Return warning codes, never secret values.

**Out of scope:** Browser UI, LAN/remote support, production secret-store backend selection beyond using the existing interface.

**Acceptance:** Route and repository tests cover auth/rate-limit guards, local-only validation, secret redaction, warning opt-ins, test connection success/failure, and subscription update validation.

### Slice 4: Runtime Wiring And External Event Diagnostics

**Objective:** Wire Streamer.bot runtime startup/config changes and record generic external events without alert playback.

**In scope:**

- Add `StreamerBotRuntimeService`.
- Read persisted config and secret values, then start/stop the protocol client.
- Add generic external event intake for valid Streamer.bot envelopes.
- Assign Stream Jams IDs to accepted external events.
- Add external-event diagnostic persistence separate from current normalized `event_logs`.
- Store bounded, redacted raw payload JSON.
- Include ingest provider, subscription source key, upstream source/type, occurred/received timestamps, correlation ID, processing ID, status, normalized output ID when present, and error message.
- Add time-based retention and purge for raw external payload rows.
- Add Streamer.bot provider status to diagnostics and redacted export.
- Accept unknown source/type pairs into diagnostics without alert matching.

**Out of scope:** Known Twitch alert normalization, generic alert matching, full management UI.

**Acceptance:** Tests prove valid unknown events are stored, invalid envelopes fail safely, payload size is bounded, secret-like keys are redacted, purge removes expired rows, exports do not leak secrets, and provider status appears in diagnostics.

### Slice 5: Streamer.bot Twitch Normalizers

**Objective:** Normalize fixture-backed Streamer.bot Twitch events into existing Twitch alert behavior with provenance.

**In scope:**

- Add committed fixtures for `Twitch.Follow`, `Twitch.Sub`, `Twitch.ReSub`, `Twitch.Cheer`, `Twitch.Raid`, and `Twitch.RewardRedemption`.
- Map only fixture-backed fields required by current normalized event variants.
- Set `providerId: "twitch"`, `sourcePlatform: "twitch"`, and `ingestProvider: "streamerbot"`.
- Preserve upstream source/type and Streamer.bot timestamp in metadata.
- Use stable upstream payload IDs when present; otherwise deterministic IDs from timestamp, source/type, and selected stable fields.
- Forward successful normalized events to `EventPipeline`.
- Surface duplicate-risk when direct Twitch EventSub and overlapping Streamer.bot Twitch subscriptions are enabled, without automatic cross-provider suppression.

**Out of scope:** Generic JSON-path conditions, raw payload templating, automatic subscription to all Twitch events.

**Acceptance:** Tests prove each fixture maps correctly, malformed supported payloads fail safely, unknown source/type pairs remain diagnostics-only, and existing direct Twitch alert rules fire for Streamer.bot Twitch events unless conditions exclude `ingestProvider: "streamerbot"`.

### Slice 6: Management UI MVP Parity

**Objective:** Add a Streamer.bot management panel comparable to the current Twitch connection/status panel.

**In scope:**

- Add a Streamer.bot tab or event-source panel.
- Show configured endpoint without exposing secrets.
- Show disabled, disconnected, connecting, connected, degraded, and error states.
- Provide test connection, connect/enable, disconnect/disable, and save-settings actions.
- Show warnings for unauthenticated local mode, insecure local transport, and credential-bearing insecure transport.
- Prevent invalid non-local or insecure submissions.
- Add management API client types and methods.

**Out of scope:** Rich event picker, action execution UI.

**Acceptance:** Component tests and Playwright coverage exercise status loading, warnings, validation failures, successful save/test/connect/disconnect flows, and prove password values are never rendered back.

### Slice 7: Event Discovery And Subscription Picker

**Objective:** Add discovery and subscription selection grouped by Streamer.bot event category.

**In scope:**

- Use `GetEvents` through the management API.
- Render discovered categories and event names grouped by source/category key.
- Save selected subscriptions.
- Show duplicate-risk notice when direct Twitch EventSub is enabled and selected Streamer.bot subscriptions include Twitch parity event types.
- Preserve source/category casing from `GetEvents` and received event source/type casing in diagnostics.

**Out of scope:** Generic alert matching, arbitrary payload field extraction.

**Acceptance:** UI tests cover discovery success/failure, selection persistence, empty lists, duplicate-risk notice, and grouped rendering.

### Slice 8: Generic Streamer.bot Alert Matching

**Objective:** Allow alerts for non-normalized Streamer.bot events using only safe provider/source/type conditions.

**In scope:**

- Add a distinct generic alert event type named `streamerbot_external`.
- Create normalized generic alert events only from accepted external Streamer.bot events.
- Match only `ingestProvider`, `upstreamSource`, and `upstreamType` conditions.
- Expose safe generic template fields: source, type, occurred timestamp, and received timestamp.

**Out of scope:** JSON-path matching, raw payload templating, script execution.

**Acceptance:** Tests prove generic rules match exact source/type pairs, cannot inspect raw payload fields, and produce safe playback instructions without leaking raw payload content.

### Slice 9: Streamer.bot Action Execution Design

**Objective:** Write a separate design/spec for active Streamer.bot automation.

This is intentionally not implementable from the passive event-source umbrella. It needs a separate threat model covering local automation control, request authorization, audit logging, UI affordances, and failure recovery.

## Spec Generation Handoff

- Proposed OpenSpec change name: `add-streamerbot-event-source-foundation`.
- First target slice: Slice 1, Provider Boundary And Event Model.
- Primary capability name: `streamerbot-event-source`.
- Likely touched areas: `packages/core/src/events`, `packages/core/src/security`, Twitch normalizer tests, diagnostics parsing tests, alert condition tests, and type exports.
- Explicit Slice 1 non-goals: no WebSocket client, no Streamer.bot connection persistence, no management API, no management UI, no external-event diagnostics table, and no Streamer.bot Twitch normalizers.

## Recommended Next Step

Generate the OpenSpec change artifacts for Slice 1 using the handoff above.
