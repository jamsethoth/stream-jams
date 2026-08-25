## Context

The repository already contains a direct Streamer.bot WebSocket protocol client, persisted provider registrations, secret references, active-provider enforcement, and normalized event provenance. The registration adapter uses the client only for a connection test and disconnects immediately. Production startup connects Twitch EventSub regardless of which provider registration is active, while alert management treats `providerKind` metadata as an implicit alert target even though runtime alert matching uses canonical event type and explicit conditions only.

Official Streamer.bot documentation confirms that events require explicit subscription, use the `timeStamp`/`event.source`/`event.type`/`data` envelope, and expose `GetEvents` plus `Subscribe`. The event reference documents payload schemas for Follow, Cheer, Sub, and ReSub; Raid and RewardRedemption currently state that no generated WebSocket schema is available. Their official trigger references document the stable fields needed by Stream Jams (`viewers`, Twitch user variables, `redemptionId`, `rewardId`, `rewardName`, and `rawInput`).

Sources:

- https://docs.streamer.bot/api/websocket/guide/events
- https://docs.streamer.bot/api/websocket/requests
- https://docs.streamer.bot/api/websocket/events/twitch/follow
- https://docs.streamer.bot/api/websocket/events/twitch/cheer
- https://docs.streamer.bot/api/websocket/events/twitch/sub
- https://docs.streamer.bot/api/websocket/events/twitch/re-sub
- https://docs.streamer.bot/api/triggers/twitch/raid/raid
- https://docs.streamer.bot/api/triggers/twitch/channel-reward/reward-redemption

## Goals / Non-Goals

**Goals:**

- Make an active Streamer.bot registration a persistent live event source.
- Normalize the six MVP Twitch event families into existing alert behavior without duplicating rules per ingestion provider.
- Keep exactly one event-source runtime consuming events and synchronize it after every relevant lifecycle change.
- Preserve source and ingestion provenance for diagnostics and explicit conditions.
- Make unsupported, malformed, connection, authentication, discovery, and subscription failures visible with actionable runtime status/log entries.

**Non-Goals:**

- Generic alert matching for arbitrary Streamer.bot source/type pairs.
- Subscription selection UI or automatic subscription to every Streamer.bot event.
- Cross-provider duplicate suppression when multiple live sources are supported later.
- Raw payload persistence, arbitrary JSON-path extraction, action execution, or remote/LAN transport.
- Renaming persisted `providerKind` management metadata in this slice.

## Decisions

### Persistent runtime reuses the protocol client

Add one `StreamerBotRuntimeService` that owns a client created through a small injected factory. It reads the active provider registration, resolves its optional password through `SecretStore`, connects, discovers available events, subscribes to supported Twitch events, exposes status, and disconnects on deactivation/shutdown.

Alternative: extend the provider validation adapter to retain its socket. Rejected because validation objects are request-scoped and would blur connection testing with production lifecycle ownership.

### Use the `ws` adapter for Streamer.bot transport

The production Streamer.bot socket factory uses an explicit `ws` dependency while preserving the existing `StreamerBotSocket` boundary. Live validation against Streamer.bot 1.0.4 showed that its 10 KB compressed `GetEvents` response negotiated `permessage-deflate`; Node 24's built-in WebSocket exposed that response as an empty string and the request timed out, while `ws` decoded the same response correctly. A local compressed-response integration test protects this adapter requirement.

Alternative: keep Node's built-in WebSocket and skip discovery. Rejected because it would hide a transport incompatibility, weaken the discovery requirement, and leave other compressed responses at risk.

### One composition-level event-source synchronizer

Runtime composition will define one `syncEventSourceRuntime` operation. It reads the active event-source registration, disconnects the inactive runtime first, then connects the selected runtime. Startup, registration, activation, deactivation, and Twitch account changes call the same operation.

Alternative: let each runtime poll registration state. Rejected because it adds timers, races, and delayed provider switches without improving MVP behavior.

### Discover the subscription category key

The runtime calls `GetEvents`, locates the category key whose case-insensitive value is `twitch`, intersects its event names with the six supported names, and subscribes using the exact returned category key. This follows existing design guidance that discovery keys and emitted `event.source` casing are separate concerns.

If supported event names are missing, the runtime subscribes to those available and reports a degraded status naming the missing types. It never subscribes to all events.

### Explicit fixture-backed normalizers

A pure normalizer maps only these exact pairs:

- `Twitch.Follow` to `follow`
- `Twitch.Sub` to `subscription`
- `Twitch.ReSub` to `resubscription`
- `Twitch.Cheer` to `cheer`
- `Twitch.Raid` to `raid`
- `Twitch.RewardRedemption` to `channel_point_redemption`

Each mapping validates only fields needed by `NormalizedStreamEvent`. Fixtures for generated WebSocket schemas are synthetic examples derived from those official schemas. Raid and RewardRedemption fixtures are labeled synthetic and derived from official trigger variables because their WebSocket pages currently publish no schema. Unknown source/type pairs return an explicit unsupported result; malformed supported payloads return a safe normalization error.

All successful results use `providerId: "twitch"`, `sourcePlatform: "twitch"`, `ingestProvider: "streamerbot"`, and preserve upstream source/type/timestamp plus stable IDs in metadata. IDs prefer upstream message/redemption IDs and otherwise use a deterministic SHA-256 digest of stable envelope fields.

Alternative: infer event types from payload shape. Rejected because ambiguous payloads would create incorrect alerts and violate the existing explicit source/type design.

### Shared normalized-event ingestion

Extend `EventIngestionService` with an `ingestNormalizedEvent` entry point that deduplicates by normalized event ID, updates shared counters/status, and forwards to the existing `EventPipeline`. The Twitch-specific entry point keeps EventSub parsing and delegates accepted events to this shared path.

Alternative: call `EventPipeline` directly from Streamer.bot runtime. Rejected because it would bypass shared deduplication and status behavior.

### Canonical event compatibility, explicit provider-path conditions

Alert eligibility remains `eventType` plus explicit conditions. Provider-kind management metadata does not make a rule Twitch-only or Streamer.bot-only. Switching between direct Twitch and Streamer.bot therefore keeps supported canonical alerts matched and does not emit provider-kind mismatch warnings. `ingestProvider` remains available for a future explicit condition when users intentionally need path-specific behavior.

### Diagnostics without raw payload storage

The runtime contributes a provider status source. Accepted normalized events continue through existing structured event diagnostics. Unsupported and malformed events write bounded runtime log metadata containing source, type, status, and a reference ID, never raw payload or credentials.

Alternative: add a raw external-event table now. Rejected because retention, redaction, migration, export, and UI work are a separate capability and are not needed to correct live canonical alert behavior.

## Risks / Trade-offs

- [Raid and RewardRedemption lack official generated WebSocket schemas] -> Use narrowly validated, labeled synthetic fixtures derived from official trigger variables; keep normalizers isolated so captured local fixtures can tighten them without changing runtime contracts.
- [Streamer.bot versions may expose different category casing or omit event names] -> Discover and preserve the exact category key; subscribe only to available supported names; report missing names as degraded status.
- [Activation persists before runtime connection succeeds] -> Keep provider selection durable, expose failed runtime state in diagnostics, and allow retry via deactivate/activate or service restart. Do not roll back user configuration because a local dependency is temporarily offline.
- [Node WebSocket implementations differ for compressed Streamer.bot responses] -> Use the explicit `ws` adapter and cover a compressed `GetEvents` exchange with a real local WebSocket server test.
- [Deterministic fallback IDs can collide if identical same-timestamp payloads occur] -> Include source, type, timestamp, actor, amount, and stable event-specific fields. Prefer upstream IDs whenever present.
- [No raw unknown-event payload log] -> Record safe metadata now; leave bounded/redacted payload retention to its dedicated diagnostics slice.

## Migration Plan

1. Add tests and normalizer fixtures, then implement shared normalized ingestion.
2. Add runtime lifecycle and composition synchronization.
3. Correct compatibility warnings and UX documentation.
4. Build and restart the local production service. Existing registrations are reused without migration.
5. Rollback is code-only: disconnect the Streamer.bot runtime and restore prior warning behavior. No persisted schema is changed.

## Open Questions

None blocking. Captured payloads from the user's exact Streamer.bot version should replace or supplement the two trigger-derived fixtures when readily available.
