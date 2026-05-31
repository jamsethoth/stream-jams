# Streamer.bot Event Source Umbrella Spec

**Date:** 2026-05-31
**Status:** Draft with reviewed assumptions
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
- Streamer.bot events are sent only after subscription.
- Event payloads use a generic envelope with `timeStamp`, `event.source`, `event.type`, and `data`.
- `GetEvents`, `Subscribe`, `UnSubscribe`, and `GetInfo` are sufficient for passive event-source integration.
- `DoAction`, `SendMessage`, and code-trigger execution are outside passive event intake and should be treated as a separate automation-control feature.

Primary references:

- https://docs.streamer.bot/api/websocket/guide/configuration
- https://docs.streamer.bot/api/websocket/guide/events
- https://docs.streamer.bot/api/websocket/requests
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
- connection status metadata

The password, if configured, is stored through the existing `SecretStore` abstraction and is never returned from management APIs.

Default settings should target local Streamer.bot:

```text
host: 127.0.0.1
port: 8080
endpoint: /
```

LAN or remote Streamer.bot connections are an advanced future feature because they change the security model. The first implementation must require local-only host values such as `127.0.0.1` and `localhost`, while keeping the connection model explicit enough that future non-local support can add network-binding, authentication, and warning requirements without replacing the provider boundary.

Deferred non-local Streamer.bot support is captured in `docs/future-features.md`.

Default transport policy must require encrypted WebSocket connections. The connection model should distinguish `wss://` from `ws://`; `wss://` is the default for all connections and the default for credential-bearing authentication. Insecure `ws://` connections are allowed only for explicitly configured local connections. Credential-bearing authentication may use insecure local `ws://` only when the user has explicitly enabled an insecure-communication override such as `allowInsecureLocalConnection: true`.

Credential values must be encrypted at rest inside Stream Jams. Passwords and future tokens are stored only through the app secret-store boundary, backed by an encrypted OS or application credential store for real runtime use. They must not be stored in SQLite/plain config, exported diagnostics, logs, or raw payload records. In-flight credential encryption is required by default and waived only when the explicit insecure-communication override is enabled for a local connection.

### Streamer.bot Protocol Client

The protocol client owns:

- WebSocket connection lifecycle.
- Optional authentication handshake.
- `GetInfo` request.
- `GetEvents` request.
- `Subscribe` and `UnSubscribe` requests.
- Parsing request responses by request ID.
- Validating event envelopes.
- Reconnect/backoff behavior.
- Status reporting.

The first implementation should prefer a small direct protocol client over adding `@streamerbot/client`, unless slice work proves that the official client materially reduces complexity without conflicting with existing test and dependency rules. The protocol client must reject credential-bearing authentication over insecure `ws://` unless the connection is local and the explicit insecure-communication override is enabled.

### External Event

Introduce a generic external event concept separate from the current Twitch-only `NormalizedStreamEvent`.

Recommended shape:

```ts
export interface ExternalStreamEvent {
  readonly id: string;
  readonly ingestProvider: "streamerbot" | "twitch";
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
metadata: {
  ingestProvider: "streamerbot",
  upstreamSource: "Twitch",
  upstreamType: "Follow",
  streamerbotEventId: "...",
  streamerbotTimeStamp: "..."
}
```

The existing `providerId` field needs a design update before implementation. Two likely options remain under review:

1. Treat Streamer.bot Twitch events as Twitch alert events with `sourcePlatform: "twitch"` and `ingestProvider: "streamerbot"`.
2. Treat Streamer.bot Twitch events as distinct Streamer.bot-originated alert sources.

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

Current recommendation: use Option 1 for normalized Twitch parity, but make `ingestProvider` a first-class condition/diagnostic field before or alongside Streamer.bot alert normalizers. This keeps the user-facing behavior simple while preserving a clear way to separate direct Twitch and Streamer.bot Twitch behavior.

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
- Default to time-based retention with a purge process. The exact default should be chosen in the diagnostics slice spec, but the implementation must not retain raw payloads indefinitely.
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

- authenticated connection over `wss://` with a stored password;
- authenticated local connection over `ws://` with a stored password and `allowInsecureLocalConnection: true`;
- unauthenticated local connection over `wss://`;
- unauthenticated local connection over `ws://` with `allowUnauthenticatedLocalConnection: true` and `allowInsecureLocalConnection: true`;
- missing credentials where unauthenticated mode has not been explicitly allowed;
- invalid configuration where insecure transport is used without the explicit insecure-communication override.

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

## Implementation Slice Outline

Slice specs will be generated separately after this umbrella spec is reviewed.

Recommended sequence:

1. Streamer.bot provider boundary and generic event model.
2. Streamer.bot protocol client.
3. Config, persistence, encrypted secrets, TLS-by-default transport policy, explicit unauthenticated/insecure-local opt-ins, and management API.
4. Generic event intake, raw-payload diagnostics, and retention/purge.
5. Known alert normalizers for Streamer.bot Twitch parity.
6. Management UI MVP parity with the Twitch configuration UI.
7. Management UI event discovery and subscription picker.
8. Generic Streamer.bot event alert matching.
9. Optional Streamer.bot action execution integration.

The first wave should cover slices 1 through 4. That creates a correct aggregator foundation before alert behavior depends on it.

## Assumptions For Review

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
16. Insecure local `ws://` transport is allowed only with explicit configuration and warning.
17. Credential-bearing authentication uses encrypted transport by default, but explicit insecure local communication may carry credentials when `allowInsecureLocalConnection: true` is enabled. Credential storage at rest inside Stream Jams must remain encrypted.
18. The setup UI should wait until the integration APIs and diagnostics foundation are in place.
19. The first Streamer.bot management UI slice should reach parity with the current Twitch connection/status panel before adding richer discovery or subscription-management UI.

## Resolved Review Questions

1. First implementation is local-only. Non-local support is deferred and tracked in `docs/future-features.md`.

2. Diagnostics should store raw payloads with redaction, bounds, and retention/purge.

3. First-wave work should integrate protocol, API, persistence, intake, and diagnostics before management UI setup.

4. Unauthenticated local Streamer.bot connections are allowed with explicit configuration and warning.

## Remaining Review Question

1. For normalized Streamer.bot Twitch events, should alert semantics treat the source platform as Twitch with `ingestProvider: "streamerbot"`, or should Streamer.bot-originated Twitch events be distinct alert sources from direct Twitch EventSub?

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
