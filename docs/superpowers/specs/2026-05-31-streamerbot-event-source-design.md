# Streamer.bot Event Source Umbrella Spec

**Date:** 2026-05-31
**Status:** Ready for Slice 1 OpenSpec proposal
**Scope:** Post-MVP event-source expansion

## Goal

Add Streamer.bot as a local event source option for Stream Jams, modeled as a broad local event aggregator rather than as a Twitch-only transport alternative.

Streamer.bot should let Stream Jams receive events from Twitch, OBS, StreamElements, Ko-fi, Streamlabs, YouTube, custom Streamer.bot events, and future upstream sources exposed through Streamer.bot. Stream Jams should preserve the original Streamer.bot event source/type and normalize only the event families it understands.

## Source Context

Current Stream Jams MVP behavior:

- Twitch EventSub WebSocket is the first live provider.
- `NormalizedStreamEvent` is currently Twitch-shaped and has `providerId: "twitch"`.
- `EventIngestionService` currently exposes a Twitch-specific ingestion entry point: `ingestTwitchEventSubNotification`.
- `EventPipeline` consumes `NormalizedStreamEvent`, writes diagnostics event logs, then calls alert playback.
- Alerts currently match a fixed `StreamEventType` union: follow, subscription, resubscription, cheer, raid, and channel point redemption.
- Diagnostics logs currently store normalized stream events, alert match logs, and playback logs.

Streamer.bot source docs reviewed:

- WebSocket server configuration defaults to local `127.0.0.1`, port `8080`, endpoint `/`, and optional authentication.
- The official client default connects to `ws://127.0.0.1:8080/`; the built-in Streamer.bot WebSocket server does not expose a TLS setting in its local server configuration docs.
- Streamer.bot events are sent only after subscription.
- Event payloads use a generic envelope with `timeStamp`, `event.source`, `event.type`, and `data`.
- The server sends an initial `Hello` message. When authentication is enabled, `Hello` includes `authentication.salt` and `authentication.challenge`; direct clients authenticate by sending an `Authenticate` request with the documented SHA-256/base64 challenge response.
- `GetEvents`, `Subscribe`, `UnSubscribe`, and `GetInfo` are sufficient for passive event-source integration.
- `GetEvents` response category keys are not guaranteed to have the same casing or display form as emitted `event.source` values, so subscription category keys must be stored separately from received envelope source/type values.
- `DoAction`, `SendMessage`, and code-trigger execution are outside passive event intake and should be treated as a separate automation-control feature.

Primary references:

- https://docs.streamer.bot/api/websocket/guide/configuration
- https://docs.streamer.bot/api/websocket/guide/events
- https://docs.streamer.bot/api/websocket/guide/authentication
- https://docs.streamer.bot/api/websocket/requests
- https://docs.streamer.bot/api/websocket/recipes/remote-access
- https://streamerbot.github.io/client/get-started/setup
- https://streamerbot.github.io/client/guide/events/

## Design Position

Streamer.bot will be modeled as:

```ts
provider: "streamerbot";
upstreamSource: string;
upstreamType: string;
timeStamp: string;
data: unknown;
```

It will not be modeled as:

```ts
provider: "twitch";
transport: "streamerbot";
```

This distinction matters because Streamer.bot can emit OBS, StreamElements, Ko-fi, Streamlabs, YouTube, custom, and application events in addition to Twitch events. The provider boundary must preserve that information even when a specific event is later normalized into an alert-compatible stream event.

## Target Data Flow

```text
Streamer.bot WebSocket
  -> Streamer.bot protocol client
  -> raw Streamer.bot event envelope validation
  -> generic external event intake
  -> diagnostics event record
  -> optional source/type normalizer
  -> alert/module event bus
  -> alert matching and overlay playback
```

Unknown source/type pairs are accepted as external events and visible in diagnostics. They are not forced through the existing alert event model until a matching or normalization slice supports them.

## Core Concepts

### Streamer.bot Connection

The connection record stores non-secret WebSocket settings:

- enabled state
- host
- port
- endpoint path
- selected subscriptions grouped by source/category
- coarse status metadata needed for diagnostics snapshots

The password, if configured, is stored through the existing `SecretStore` abstraction and is never returned from management APIs.

Default settings should target local Streamer.bot:

```text
protocol: ws
host: 127.0.0.1
port: 8080
endpoint: /
```

LAN or remote Streamer.bot connections are an advanced future feature because they change the security model. The first implementation must require local-only host values such as `127.0.0.1` and `localhost`, while keeping the connection model explicit enough that future non-local support can add network-binding, authentication, and warning requirements without replacing the provider boundary.

Deferred non-local Streamer.bot support is captured in `docs/future-features.md`.

Default transport policy must match Streamer.bot's actual local-first behavior without normalizing remote insecurity into the model.

The first implementation default is `ws://127.0.0.1:8080/`. The connection model still stores `protocol: "ws" | "wss"` so future local proxies, trusted tunnels, or non-local support can use secure transport without replacing the provider boundary.

For the local-only first wave:

- `ws://` is allowed only for local loopback host values.
- `wss://` is allowed for local loopback host values, but is not the default because Streamer.bot's documented server default is plain `ws://`.
- non-local host values are rejected regardless of protocol;
- credential-bearing `ws://` requires `allowInsecureLocalConnection: true` and a management warning;
- unauthenticated local `ws://` requires both `allowUnauthenticatedLocalConnection: true` and `allowInsecureLocalConnection: true`;
- non-local `ws://` remains invalid.

Credential values must be encrypted at rest inside Stream Jams. Passwords and future tokens are stored only through the app secret-store boundary, backed by an encrypted OS or application credential store for real runtime use. They must not be stored in SQLite/plain config, exported diagnostics, logs, or raw payload records. In-flight credential protection uses `wss://` when available and is waived only when the explicit insecure-communication override is enabled for a local connection.

### Streamer.bot Protocol Client

The protocol client owns:

- WebSocket connection lifecycle.
- Streamer.bot `Hello` parsing.
- Optional authentication handshake.
- `Authenticate` challenge response generation using the documented password, salt, and challenge flow.
- `GetInfo` request.
- `GetEvents` request.
- `Subscribe` and `UnSubscribe` requests.
- Parsing request responses by request ID.
- Failing pending requests on socket close, socket error, request timeout, or malformed response.
- Validating event envelopes.
- Reconnect/backoff behavior.
- Resubscribing after reconnect.
- Status reporting.

The first implementation should prefer a small direct protocol client over adding `@streamerbot/client`, unless slice work proves that the official client materially reduces complexity without conflicting with existing test and dependency rules. Default protocol-client behavior should use a 5 second request timeout, fail all pending requests on close/error, and start with bounded reconnect delays such as 1s, 2s, 5s, and 10s. The protocol client must reject credential-bearing authentication over insecure `ws://` unless the connection is local and the explicit insecure-communication override is enabled.

### External Event

Introduce a generic external event concept separate from the current Twitch-only `NormalizedStreamEvent`.

Recommended shape:

```ts
export interface ExternalStreamEvent {
  readonly id: string;
  readonly ingestProvider: "streamerbot" | "twitch";
  readonly subscriptionSourceKey: string | null;
  readonly upstreamSource: string;
  readonly upstreamType: string;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly payload: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
}
```

The name can change during slice design, but the boundary should remain:

- generic event intake preserves provider/source/type;
- known normalizers produce alert-compatible events;
- diagnostics can show both generic and normalized paths.

### Normalized Alert Event

Known Streamer.bot events can map into existing alert-compatible events. Initial mapping should focus on Twitch parity:

- `Twitch.Follow` -> `follow`
- `Twitch.Sub` -> `subscription`
- `Twitch.ReSub` -> `resubscription`
- `Twitch.Cheer` -> `cheer`
- `Twitch.Raid` -> `raid`
- `Twitch.RewardRedemption` -> `channel_point_redemption`

The normalized event should retain provenance:

```ts
providerId: "twitch"; // backward-compatible alert source/platform alias
sourcePlatform: "twitch";
ingestProvider: "streamerbot";
metadata: {
  ingestProvider: "streamerbot",
  upstreamSource: "Twitch",
  upstreamType: "Follow",
  streamerbotEventId: "...",
  streamerbotTimeStamp: "..."
}
```

Resolved decision: Streamer.bot Twitch events are Twitch alert events with Streamer.bot provenance.

For first-wave compatibility:

- keep `providerId: "twitch"` on Twitch-compatible normalized alert events;
- add `sourcePlatform: "twitch"` as the explicit semantic replacement for the current Twitch-only `providerId` meaning;
- add `ingestProvider: "twitch" | "streamerbot"` as a first-class normalized event field;
- direct Twitch EventSub events set `sourcePlatform: "twitch"` and `ingestProvider: "twitch"`;
- Streamer.bot Twitch events set `sourcePlatform: "twitch"` and `ingestProvider: "streamerbot"`;
- Streamer.bot source/type values are also retained in metadata.

`providerId` remains for existing alert rules, templates, diagnostics, and playback dedupe. Treat it as a backward-compatible alias for source platform until a later migration can rename it safely.

### Streamer.bot Twitch Alert Semantics Tradeoff

Option 1: Streamer.bot Twitch events behave as Twitch alerts with Streamer.bot provenance.

Behavior:

- Existing Twitch follow/sub/cheer/raid/reward alert rules can fire from either direct Twitch EventSub or Streamer.bot Twitch events.
- Alert conditions can later distinguish ingestion path with `ingestProvider`.
- Diagnostics show both the upstream source platform and the ingestion provider.

Pros:

- Lowest setup friction for streamers who want Streamer.bot as an alternate path for Twitch events.
- Reuses existing Twitch alert rules and templates.
- Keeps alert semantics aligned with what happened on stream: a Twitch follow is still a Twitch follow.
- Makes direct Twitch and Streamer.bot Twitch easier to compare in diagnostics.

Cons:

- Duplicate alerts are possible if direct Twitch EventSub and Streamer.bot Twitch subscriptions are both enabled.
- Some Streamer.bot Twitch payloads may not contain exactly the same fields as EventSub payloads, so normalizers need careful fixtures.
- Users who want different behavior for direct Twitch versus Streamer.bot Twitch need an additional ingest-provider condition.

Option 2: Streamer.bot Twitch events are distinct alert sources.

Behavior:

- Existing direct Twitch alert rules do not automatically fire for Streamer.bot Twitch events.
- Users configure separate Streamer.bot-sourced rules or explicitly opt alert rules into both sources.
- Streamer.bot-originated Twitch events can have different templates, assets, cooldowns, and routing by default.

Pros:

- Avoids surprising duplicate alert playback when both direct Twitch EventSub and Streamer.bot Twitch are enabled.
- Makes source-specific behavior obvious in alert configuration.
- Better if Streamer.bot enriches or transforms Twitch events enough that they should be treated as a separate automation feed.

Cons:

- More setup work for users who simply expect Twitch alerts to keep working through Streamer.bot.
- Duplicates rule configuration unless shared/multi-source rule support is added first.
- Can be conceptually awkward because the viewer-facing event still happened on Twitch.

Decision: use Option 1 for normalized Twitch parity, and make `ingestProvider` a first-class condition/diagnostic field before or alongside Streamer.bot alert normalizers. This keeps the user-facing behavior simple while preserving a clear way to separate direct Twitch and Streamer.bot Twitch behavior.

Known normalizers must not rely on guessed payload fields. Before each event mapping is implemented, the slice must include committed fixtures for representative Streamer.bot `data` payloads. Acceptable fixture provenance is an official Streamer.bot schema/example, a captured local Streamer.bot payload, or a synthetic fixture clearly labeled as synthetic and derived from one of those sources.

### Generic Event Matching

Generic matching should be a later slice after passive intake and known normalizers exist.

First generic matching capability:

- match `ingestProvider`
- match `upstreamSource`
- match `upstreamType`

The first generic matching slice should not add arbitrary JSON-path matching against raw payloads. That is powerful, but it expands validation, UI, security, and template-safety concerns. Payload-specific matching should arrive only after safe field extraction and clear UI constraints exist.

### Diagnostics

Diagnostics must show enough to debug event flow without leaking secrets or filling storage with unbounded payloads.

Required diagnostic fields:

- ingest provider
- upstream source
- upstream type
- occurred timestamp from Streamer.bot
- received timestamp from Stream Jams
- processing ID
- correlation ID
- status
- normalized output type, when normalization happens
- error message, when validation or normalization fails

Raw payload handling:

- Store raw payloads for diagnostics.
- Bound stored payload size.
- Redact secret-like keys.
- Avoid logging Streamer.bot password, overlay keys, OAuth tokens, chat authorization, or configured secret refs.
- Add retention controls from the first diagnostics implementation that stores raw payloads.
- Default raw payload retention is 48 hours, matching the existing logging posture, with a purge process.
- Default maximum stored raw payload size is 64 KiB per event. Larger payloads are truncated with an explicit truncation marker before persistence.
- Leave room for future archival/export before purge, but do not require archival in the first implementation unless the slice can keep it small and testable.

### Duplicate Handling

Twitch EventSub has stable message IDs and the current ingestion service deduplicates by message ID. Streamer.bot's generic event envelope does not document a stable event ID in the base schema.

First Streamer.bot duplicate handling should therefore be conservative:

- Generate a Stream Jams event ID for each accepted Streamer.bot envelope.
- Do not claim protocol-level deduplication unless a specific source/type payload exposes a stable ID.
- For known Twitch normalizers, use stable upstream payload IDs when present; otherwise use a deterministic hash of timestamp, source, type, and selected stable fields.
- If Twitch direct and Streamer.bot Twitch events are both enabled, surface duplicate-risk in management UI instead of silently suppressing events across providers.

### Security Model

The first Streamer.bot integration is passive event intake only.

In scope:

- connect to the local Streamer.bot WebSocket server;
- authenticate if Streamer.bot requires it;
- discover available events;
- subscribe and unsubscribe to configured events;
- receive event envelopes.

Out of scope:

- executing Streamer.bot actions;
- sending chat messages through Streamer.bot;
- creating or editing Streamer.bot actions;
- mutating Streamer.bot commands, triggers, or globals;
- remote/LAN operation guidance;
- exposing any Streamer.bot control surface to overlay clients.

Management APIs may test connection and update subscriptions. Overlay routes must not read Streamer.bot settings, secrets, or actions.

Unauthenticated local Streamer.bot connections are allowed only when explicitly configured. Insecure local transport is also allowed only when explicitly configured. The setup model must distinguish:

- authenticated local connection over `ws://` with a stored password and `allowInsecureLocalConnection: true`; this is allowed because Streamer.bot's documented local default is `ws://`;
- authenticated local connection over `wss://` when a future local proxy or supported endpoint makes it available;
- unauthenticated local connection over `ws://` with `allowUnauthenticatedLocalConnection: true` and `allowInsecureLocalConnection: true`;
- unauthenticated local connection over `wss://` when available;
- missing credentials where unauthenticated mode has not been explicitly allowed;
- invalid configuration where insecure non-local transport is requested or local insecure transport is used without the explicit insecure-communication override.

The management API and later UI must surface warnings for unauthenticated mode, insecure local transport, and credential-bearing insecure transport. It must reject non-local insecure transport.

### User Experience

The first wave should integrate protocol, persistence, API, intake, and diagnostics before building the management UI setup flow. When the Streamer.bot UI slice starts, its MVP should first reach parity with the current Twitch configuration UI before adding richer discovery or subscription management.

Management UI MVP parity with the current Twitch panel means the first Streamer.bot UI should provide:

- A Streamer.bot tab or event-source panel in management navigation.
- Current configured endpoint display without exposing secrets.
- Connected/disconnected/error status.
- Event-source runtime status, equivalent to Twitch EventSub status.
- Test connection or connect action.
- Disconnect/disable action.
- Explicit warning states for unauthenticated local mode and insecure local transport.

Management UI should eventually provide:

- Streamer.bot event source card.
- Connection settings: host, port, endpoint, transport security mode, and password.
- Connection status: disabled, disconnected, connecting, connected, degraded, error.
- Explicit unauthenticated local mode with warning copy and a clear opt-in control.
- Explicit insecure local transport mode with warning copy and a clear opt-in control.
- Validation that prevents sending stored credentials over insecure transport unless the explicit insecure-communication override is enabled for a local connection.
- Test connection action.
- Discover events action.
- Subscription picker grouped by upstream source.
- Duplicate-risk notice when direct Twitch EventSub and Streamer.bot Twitch subscriptions are both enabled.
- Diagnostics view showing recent Streamer.bot events.

The UI should not imply Stream Jams can configure Streamer.bot itself. Setup text should make clear that the Streamer.bot WebSocket server must already be enabled in Streamer.bot.

## Agentic Slice Breakdown

Slice specs will be generated separately after this umbrella spec is reviewed. Each slice below is independently reviewable and should leave the app runnable. The first wave should cover slices 1 through 4.

### Slice 1: Provider Boundary And Event Model

Objective: make the current Twitch-only normalized event model able to represent source platform and ingestion provider without changing live behavior.

In scope:

- Add core types and schemas for `IngestProviderId`, `SourcePlatformId`, `ExternalStreamEvent`, and Streamer.bot subscription selection records.
- Add `"streamerbot"` to `SecretRef.namespace`.
- Add `sourcePlatform` and `ingestProvider` to `BaseNormalizedStreamEvent`.
- Keep direct Twitch EventSub normalized events at `providerId: "twitch"`, `sourcePlatform: "twitch"`, `ingestProvider: "twitch"`.
- Make diagnostics event-log parsing tolerant of legacy rows that lack the new normalized event fields.
- Add alert-condition tests proving `sourcePlatform`, `ingestProvider`, and existing `providerId` conditions work through the current condition evaluator.

Out of scope:

- No Streamer.bot network connection.
- No Streamer.bot connection persistence.
- No management UI.

Acceptance:

- Existing Twitch EventSub, alert matching, playback, diagnostics, and export tests pass.
- New schema tests prove both legacy diagnostic rows and new normalized event rows are accepted as intended.

### Slice 2: Streamer.bot Protocol Client

Objective: add a small direct WebSocket protocol client that can connect to a local Streamer.bot server, authenticate when required, discover events, manage subscriptions, validate envelopes, reconnect, and report status.

In scope:

- Add `apps/server/src/modules/streamerbot/streamerbot-client.ts`.
- Build URLs from `protocol`, `host`, `port`, and `endpoint` using URL/path APIs.
- Default to `ws://127.0.0.1:8080/`.
- Parse `Hello`, including optional authentication data.
- Implement `Authenticate`, `GetInfo`, `GetEvents`, `Subscribe`, and `UnSubscribe`.
- Correlate responses by request ID and fail pending requests on close/error/timeout.
- Validate event envelopes with `timeStamp`, `event.source`, `event.type`, and object `data`.
- Track `idle`, `connecting`, `connected`, `reconnecting`, `degraded`, and `error` states.
- Reconnect with bounded backoff and resubscribe after reconnect.
- Preserve subscription category keys separately from received `event.source`.

Out of scope:

- No `DoAction`, `SendMessage`, `ExecuteCodeTrigger`, command mutation, or global variable APIs.
- No dependency on `@streamerbot/client` unless the slice spec explicitly justifies the dependency.

Acceptance:

- Unit tests cover Hello without auth, Hello with auth challenge, bad auth response, request correlation, malformed envelopes, subscribe/unsubscribe payloads, reconnect/resubscribe, and redacted status errors.

### Slice 3: Connection Persistence, Secrets, And Management API

Objective: persist local Streamer.bot connection settings, store password secrets only through `SecretStore`, validate local-only security policy, and expose management-protected APIs without building the full UI.

In scope:

- Add a SQLite migration and repository for one active Streamer.bot connection record.
- Store non-secret settings: enabled, protocol, host, port, endpoint, selected subscriptions, warning opt-ins, and coarse status metadata needed for diagnostics snapshots.
- Keep high-churn socket/runtime status in runtime services and diagnostics snapshots rather than treating it as durable connection configuration.
- Store password values through `SecretStore` using the new Streamer.bot namespace; persist only secret refs.
- Validate local-only host values: `127.0.0.1`, `localhost`, `::1`, and equivalent loopback forms that Node URL/address parsing can prove local.
- Reject non-local hosts in first-wave APIs.
- Reject credential-bearing `ws://` unless `allowInsecureLocalConnection` is true.
- Reject unauthenticated local mode unless `allowUnauthenticatedLocalConnection` is true.
- Add management routes for read/update config, test connection, connect, disconnect, discover events, and update subscriptions.
- Return warning codes instead of secret values.

Out of scope:

- No browser UI.
- No LAN/remote support.
- No production secret-store backend selection beyond using the existing `SecretStore` interface.

Acceptance:

- Route tests cover auth/rate-limit guards, local-only validation, secret redaction, warning opt-ins, test-connection success/failure, and subscription update validation.

### Slice 4: Runtime Wiring And External Event Diagnostics

Objective: wire the Streamer.bot runtime into server startup/config changes and record generic external events without alert playback.

In scope:

- Add a `StreamerBotRuntimeService` that reads persisted config, fetches secrets, starts/stops the protocol client, and exposes status to diagnostics.
- Add a generic external event intake service that accepts valid Streamer.bot envelopes and assigns Stream Jams event IDs.
- Add external-event diagnostic persistence separate from the current normalized `event_logs` table.
- Store bounded, redacted payload JSON with ingest provider, subscription source key, upstream source/type, occurred/received timestamps, correlation ID, processing ID, status, normalized output ID when present, and error message.
- Use 48 hour default raw-payload retention and a 64 KiB default maximum stored payload size with explicit truncation markers.
- Include Streamer.bot provider status in diagnostics and redacted export.
- Accept unknown source/type pairs into diagnostics without alert matching.

Out of scope:

- No known Twitch alert normalization yet.
- No generic alert matching yet.
- No UI beyond existing diagnostics views/API extensions if needed to verify the stored records.

Acceptance:

- Unit/repository/route tests prove valid unknown events are stored, invalid envelopes are rejected with safe errors, payload size is bounded, secret-like keys are redacted, purge removes expired raw payload rows, and exports do not leak passwords or overlay keys.

### Slice 5: Streamer.bot Twitch Normalizers

Objective: normalize fixture-backed Streamer.bot Twitch events into existing Twitch alert behavior with first-class provenance.

In scope:

- Add committed fixtures for `Twitch.Follow`, `Twitch.Sub`, `Twitch.ReSub`, `Twitch.Cheer`, `Twitch.Raid`, and `Twitch.RewardRedemption`.
- Add normalizers for only the fixture-backed fields required by current `NormalizedStreamEvent` variants.
- Set `providerId: "twitch"`, `sourcePlatform: "twitch"`, and `ingestProvider: "streamerbot"`.
- Preserve `upstreamSource`, `upstreamType`, Streamer.bot timestamp, and stable upstream IDs when present in metadata.
- Use stable upstream payload IDs when present; otherwise generate deterministic IDs from timestamp, source/type, and selected stable fields.
- Forward successful normalized events to the existing `EventPipeline`.
- Surface duplicate-risk when direct Twitch EventSub and overlapping Streamer.bot Twitch subscriptions are both enabled, but do not suppress cross-provider duplicates automatically.

Out of scope:

- No generic JSON-path conditions.
- No payload templating from raw Streamer.bot data.
- No automatic subscription to every Twitch event.

Acceptance:

- Tests prove each supported fixture maps to the expected alert event, malformed supported payloads fail safely, unknown source/type pairs remain diagnostics-only, and direct Twitch alert rules fire for Streamer.bot Twitch events unless conditions exclude `ingestProvider: "streamerbot"`.

### Slice 6: Management UI MVP Parity

Objective: add a Streamer.bot management panel that reaches parity with the current Twitch status/configuration surface before richer discovery UX.

In scope:

- Add a Streamer.bot tab or event-source panel.
- Show configured endpoint without exposing secrets.
- Show disabled, disconnected, connecting, connected, degraded, and error states.
- Provide test connection, connect/enable, disconnect/disable, and save-settings actions.
- Show explicit warnings for unauthenticated local mode, insecure local transport, and credential-bearing insecure transport.
- Prevent UI submission of non-local hosts or invalid insecure options.
- Add management API client types and methods.

Out of scope:

- No event picker beyond showing currently configured subscriptions.
- No action execution UI.

Acceptance:

- Component tests and Playwright coverage exercise status loading, warning states, validation failures, successful save/test/connect/disconnect flows, and prove password values are never rendered back.

### Slice 7: Event Discovery And Subscription Picker

Objective: add user-facing discovery and subscription selection grouped by Streamer.bot event category.

In scope:

- Use `GetEvents` through the management API.
- Render discovered categories and event names grouped by source/category key.
- Save selected subscriptions.
- Show a duplicate-risk notice when direct Twitch EventSub is enabled and selected Streamer.bot subscriptions include Twitch parity event types.
- Preserve source/category casing from `GetEvents` and received event source/type casing in diagnostics.

Out of scope:

- No generic alert matching.
- No arbitrary payload field extraction.

Acceptance:

- UI tests cover discovery success, discovery failure, selection persistence, empty event lists, duplicate-risk notice, and grouped rendering.

### Slice 8: Generic Streamer.bot Alert Matching

Objective: allow alerts for non-normalized Streamer.bot events using only safe provider/source/type conditions.

In scope:

- Add a distinct generic alert event type named `streamerbot_external`.
- Create a normalized generic alert event only from accepted external Streamer.bot events.
- Match only `ingestProvider`, `upstreamSource`, and `upstreamType` conditions.
- Expose only safe generic template fields: source, type, occurred timestamp, and received timestamp.

Out of scope:

- No arbitrary JSON-path matching.
- No raw payload templating.
- No script execution.

Acceptance:

- Tests prove generic rules can match exact source/type pairs, cannot inspect raw payload fields, and produce safe playback instructions without leaking raw payload content.

### Slice 9: Streamer.bot Action Execution Design

Objective: produce a separate design/spec for action execution if and when Stream Jams needs active Streamer.bot automation.

This is not implementable from the passive event-source umbrella. It requires a separate threat model covering local automation control, request authorization, audit logging, UI affordances, and failure recovery.

## Slice 1 OpenSpec Handoff

Use this handoff when generating the first OpenSpec change:

- Proposed change name: `add-streamerbot-event-source-foundation`.
- First target slice: Slice 1, Provider Boundary And Event Model.
- Primary capability name: `streamerbot-event-source`.
- Source documents: this umbrella spec, `docs/product-plan.md`, `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, and the current core event/security/diagnostics code.
- Likely touched areas: `packages/core/src/events`, `packages/core/src/security`, Twitch normalizer tests, diagnostics repository parsing tests, alert condition tests, and type exports.
- Explicit Slice 1 non-goals: no WebSocket client, no Streamer.bot connection persistence, no management API, no management UI, no external-event diagnostics table, and no Streamer.bot Twitch normalizers.

## Validated Assumptions

1. Streamer.bot should be a broad event aggregator, not a Twitch-only alternative.
2. Passive event intake should ship before action execution.
3. The first implementation should not subscribe to all Streamer.bot events by default.
4. Unknown Streamer.bot events should be accepted into diagnostics, not rejected, as long as the base envelope is valid.
5. Known normalizers should be explicit source/type mappings, not heuristic payload inspection.
6. Streamer.bot Twitch events should normalize as Twitch alert events with `sourcePlatform: "twitch"` and `ingestProvider: "streamerbot"`. Direct Twitch EventSub and Streamer.bot Twitch subscriptions may coexist, but duplicate-risk should be visible to the user.
7. Cross-provider duplicate suppression should not be automatic in the first implementation.
8. Generic event matching should start with provider/source/type conditions only.
9. Arbitrary JSON-path matching and payload templating should be deferred.
10. LAN/remote Streamer.bot connections should be out of first-slice scope, while the data model leaves room for future non-local support.
11. Streamer.bot password storage depends on the app's secret-store boundary and must not use normal config persistence.
12. Raw payload diagnostics must be bounded, redacted, and subject to retention/purge from the first diagnostics slice that stores raw payloads.
13. A direct WebSocket protocol client is preferred initially over adding the official Streamer.bot client dependency.
14. Streamer.bot action execution should require a separate design because it changes the feature from passive listening to local automation control.
15. Unauthenticated local Streamer.bot connections are allowed only with explicit configuration and warning.
16. Local `ws://127.0.0.1:8080/` is the first implementation default because it is Streamer.bot's documented default. Treat it as local-only, not as a general insecure transport policy.
17. Credential-bearing authentication uses `wss://` when available, but explicit insecure local communication may carry credentials when `allowInsecureLocalConnection: true` is enabled. Credential storage at rest inside Stream Jams must remain encrypted.
18. The setup UI should wait until the integration APIs and diagnostics foundation are in place.
19. The first Streamer.bot management UI slice should reach parity with the current Twitch connection/status panel before adding richer discovery or subscription-management UI.

## Resolved Review Questions

1. First implementation is local-only. Non-local support is deferred and tracked in `docs/future-features.md`.

2. Diagnostics should store raw payloads with redaction, bounds, and retention/purge.

3. First-wave work should integrate protocol, API, persistence, intake, and diagnostics before management UI setup.

4. Unauthenticated local Streamer.bot connections are allowed with explicit configuration and warning.

5. Streamer.bot Twitch alert semantics use Twitch alert behavior with `ingestProvider: "streamerbot"` provenance.

6. The earlier `wss://` default assumption was corrected. First-wave local Streamer.bot uses `ws://` by default and rejects non-local hosts.

## Review Question Status

No umbrella-level review questions remain. Slice-specific specs may still choose exact route names, migration IDs, UI copy, and fixture contents, but those choices are bounded by this design.

## Non-Goals

- No OBS WebSocket automation.
- No native OBS plugin.
- No Streamer.bot action execution in first-wave slices.
- No Streamer.bot command/trigger/global editing.
- No Twitch OAuth replacement work.
- No arbitrary payload scripting.
- No cloud or remote overlay source.
- No Electron-specific packaging work.

## Acceptance Criteria For The Umbrella Design

- The design preserves Streamer.bot source/type information.
- The design keeps passive event intake separate from action execution.
- The design identifies the existing Twitch-only event model changes needed before implementation.
- The design scopes generic event matching narrowly enough for reviewable slices.
- The design surfaces duplicate handling, secret storage, raw payload, and LAN assumptions for review before slice specs are generated.
