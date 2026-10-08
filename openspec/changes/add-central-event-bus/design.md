# Design: Add Central Event Bus

## Context

Current intake (checked against `main` at 6f3a69c):

- `EventIngestionService` validates normalized events and Streamer.bot effect triggers, dedupes by event ID in memory (1,000 IDs), and calls one `EventSink`.
- `EventPipeline` is that sink. It logs, then calls `playbackCoordinator.enqueueEvent` (Alerts), `effectTriggerSink` (Screen Effects) and `timerEventSink` (Timers) directly. An Alerts failure marks the whole event failed.
- `syncEventSourceRuntimes` reads the single active `event-source` registration and disconnects the other runtime. The EventSub notification handler also drops events unless Twitch is active. Migration 005 (and its rebuild) enforces `provider_registrations_one_active_capability`.
- Direct Twitch events use the EventSub `message_id` as the event ID. Streamer.bot Twitch events use `streamerbot:twitch:<type>:<upstreamId>` or a hash fallback. The same real event therefore has different IDs per source.
- Screen Effects match `EffectTrigger`s (`twitch-reward`, `streamerbot-event`) built by `effect-trigger-adapter.ts`, not normalized events.
- Video shoutout intake is a Streamer.bot `customEventHandler` that runs before stream-event ingestion.
- `PlaybackDedupeService` and the Screen Effects dedupe are in memory.

## Goals / Non-Goals

**Goals**

- Any number of event-source provider kinds active together (today: direct Twitch and Streamer.bot).
- One stream of validated events that every module consumes the same way.
- Any module behavior can trigger on any canonical or external event type.
- The same real event from two sources is acted on once.
- An event accepted before a restart is still admitted by every consumer after restart, unless it is too old to be useful.
- Slow or failing consumers cannot stall or fail other consumers or intake.

**Non-Goals**

- Durable module playback queues (BL-066), new providers, money values, LAN sources, several registrations of one provider kind, operator replay console. See the proposal.

## Decisions

### 1. Bus event envelope

```ts
type BusEvent = {
  busId: string;                 // journal-assigned, monotonic sequence + random suffix
  sourceRegistrationId: string;  // provider registration that delivered it
  sourceKind: "twitch" | "streamerbot";
  receivedAt: string;
  correlationKey: string | null; // cross-source dedupe, see 3
} & (
  | { kind: "canonical"; event: NormalizedStreamEvent }
  | { kind: "external"; event: ExternalStreamEvent }
);
```

`NormalizedStreamEvent` and `ExternalStreamEvent` keep their current schemas. The envelope adds identity and routing, not new payload fields, so existing alert conditions and templates keep working. Overlays never receive raw envelopes; consumers still render normalized playback instructions.

### 2. Journal and per-consumer cursors

- SQLite tables `event_bus_journal` (sequence, bus ID, source, kind, event JSON, correlation key, received/occurred time) and `event_bus_consumer_cursors` (consumer ID, last delivered sequence, updated time), plus `event_bus_delivery_failures` for poisoned deliveries.
- Publishing validates, dedupes, and appends in one narrow transaction. Ingestion reports `accepted` once the row is committed, not once consumers finish.
- Each registered consumer runs one worker that reads the journal after its cursor in small batches (default 25) and advances its cursor after its handler returns an admission result. Publishing only wakes workers; there is no unbounded in-memory buffer.
- Delivery is at-least-once. Consumers stay idempotent by bus ID (Alerts and Screen Effects already dedupe by event ID; their dedupe moves to the bus ID).
- A consumer may instead take **transactional checkpoints**: its handler receives a checkpoint callback that writes its cursor inside the consumer's own SQLite transaction (same connection), so its state change and cursor commit together and each event applies exactly once. Custom data overlays (BL-061) use this.
- Replay age (decision 7) is set per consumer. Playback consumers use the short default; state consumers such as data overlays may opt out of expiry.
- A handler error is logged with the consumer, bus ID and reference ID, retried up to three times with backoff, then recorded in `event_bus_delivery_failures` and skipped so one bad event cannot block the consumer.
- Order is FIFO per consumer. There is no ordering guarantee across consumers.
- Retention: the journal keeps the newer of 7 days or 10,000 rows, pruned at startup and hourly, never pruning rows still ahead of any consumer cursor younger than the replay age.
- The journal is runtime data. It is excluded from configuration backup; a restore marks undelivered rows expired so restored configuration is not fed old events. WAL companion handling follows existing SQLite rules.
- `event_logs` diagnostics stay as they are; the journal is not a diagnostics store.

### 3. Dedupe: exact within a source, correlated across sources

Two keys:

- **Exact key** (`sourceKind` + event ID): a redelivery from the same source is a duplicate, as today, but now checked against the journal so it survives restart (window: 10 minutes).
- **Correlation key** for Twitch-origin canonical events, built from Twitch-native identity:
  - Redemptions: `twitch:redemption:<redemptionId>`.
  - Polls, predictions, hype trains: `twitch:<type>:<pollId|predictionId|trainId>:<status or level>`.
  - Follows, subs, resubs, gifts, cheers, raids, stream online/offline (no shared native ID): `twitch:<type>:<actorId or anon>:<amount>:<tier>:<sha256(message)>`.

A new event whose correlation key matches an event accepted from a **different** source within the correlation window (default 30 seconds) is recorded as `merged` and not journaled again. Each accepted event can absorb at most one copy from each other source, so two genuine identical cheers from the same viewer arriving through both sources still produce two events. Same-source events with different IDs are never merged. First arrival wins; the merged copy's source is recorded on the journal row for Diagnostics.

External events have no correlation key.

Rejected alternative: prefer one source per event type. It needs per-type configuration, loses events when the preferred source drops, and still needs correlation to know what to drop.

### 4. Multiple active event sources

- Replace the `event-source` part of the one-active-per-capability index with one active registration per `(capability, provider kind)`. Music and TTS keep one active provider per capability.
- `syncEventSourceRuntimes` starts or stops each runtime from its own registration and never disconnects one kind because another is active. The EventSub handler's "is Twitch active" check stays, but no longer depends on Streamer.bot.
- Activating a second registration of the same kind still replaces the first after confirmation.
- Streamer.bot registrations gain a `forwardTwitchEvents` setting (default on). Turning it off unsubscribes Streamer.bot's Twitch event types and keeps only configured external subscriptions, for streamers who want direct Twitch to be the only Twitch path.
- Activation impact adds an overlap warning when direct Twitch and a Streamer.bot registration with Twitch forwarding are both active, explaining that duplicates are merged and how to turn forwarding off.

### 5. Shared event trigger selector

```ts
type EventTriggerSelector = {
  match:
    | { kind: "canonical"; type: StreamEventType }
    | { kind: "twitch-reward"; broadcasterId: string; rewardId: string }
    | { kind: "external"; providerKind: "streamerbot"; sourceKey: string; eventType: string };
  sources: "any" | readonly ("twitch" | "streamerbot")[];
  conditions: readonly AlertCondition[];  // canonical only; existing typed condition model
};
```

- `twitch-reward` stays a first-class match so existing reward bindings migrate without rewriting IDs, and keeps matching by stable IDs when the reward is renamed.
- External matches use exact source/type identity only. Payload content is untrusted and cannot be used in selector conditions in this change. A consumer that needs payload fields (custom data overlays, Videos) validates its own payload schema after the selector matches, as Video shoutouts do today.
- `sources` replaces timer rules' ingestion-source selection and alert `ingestProvider` conditions keep working unchanged.
- A core `matchSelector(selector, busEvent)` is the only matcher. Alerts keep their rule/variant/condition evaluation; the selector decides eligibility, the existing evaluator handles conditions.

### 6. Consumers

| Consumer | Today | After |
| --- | --- | --- |
| Alerts | `playbackCoordinator.enqueueEvent` from pipeline | bus consumer; rules may be canonical or external |
| Screen Effects | `effectTriggerSink` with prebuilt triggers | bus consumer; bindings are selectors |
| Timers | `timerEventSink` from pipeline | bus consumer; rules are selectors |
| Video shoutouts | Streamer.bot `customEventHandler` | bus consumer for its configured external identity |
| Custom data overlays (BL-055) | not built | bus consumer |

`EventPipeline`'s hardcoded calls are removed. Diagnostics logging of alert matches and playback stays inside the Alerts consumer.

Streamer.bot General/Custom broadcasts become external bus events instead of being intercepted before ingestion. The Video shoutout consumer must stop treating "handled" as "not a stream event"; its existing payload validation stays.

### 7. Restart replay

On startup each consumer resumes after its cursor. Rows older than the replay age (default 2 minutes, configurable 0 to 30 minutes) are skipped and counted as `expired` for that consumer. Expired skips are visible in Diagnostics. Global safety (pause, mute, do-not-disturb) applies to replayed events as to live ones.

### 8. Management, operator, and Diagnostics

- Event sources page: several rows can be `In use`; each shows its own live status. The page drops any remaining "the active source" wording.
- Diagnostics: a bus view lists recent bus events with source, kind, type, outcome (`accepted`, `duplicate`, `merged`, `rejected`) and, per consumer, `admitted`, `no match`, `failed`, or `expired`.
- Operator queue items show which source delivered their event. A fuller event review console stays in BL-038.
- The bus has no overlay output, so the desktop/browser-source parity rule applies to its consumers, which keep their current outputs.

## Risks / Trade-offs

- **False merges.** Two genuinely distinct events with equal correlation keys from different sources within 30 seconds would merge. One-to-one pairing and the message hash make this rare; the `forwardTwitchEvents` switch removes it entirely.
- **Missed merges.** If Streamer.bot normalizes amount, tier or message differently from EventSub, both copies play. Slice 2 must test correlation keys against recorded fixtures from both normalizers for every Twitch-origin type.
- **Journal growth and write cost.** One insert per event plus cursor updates is small at stream event rates; retention bounds disk use.
- **Behavior change for Video shoutouts.** General/Custom events now flow through the bus. The Videos module work owns that module; this change only moves its intake and keeps the existing payload contract.
- **Migration.** Index replacement and selector migration run in one migration with a preflight that fails closed on unexpected binding rows.

## Migration Plan

1. Add journal tables and run the existing pipeline through the bus with Alerts, Screen Effects, and Timers as consumers. Single active source unchanged. No user-visible change.
2. Add correlation keys and journal-backed dedupe with fixtures from both normalizers.
3. Replace the active index, change runtime sync, add `forwardTwitchEvents`, overlap warning, and Event sources UI.
4. Introduce the selector; migrate effect bindings and timer rules; add external alert rules and editor support.
5. Move Video shoutout intake to a consumer; publish the consumer contract for BL-055.
6. Add restart replay age, expired handling, and the Diagnostics bus view.

Rollback: slices 1, 2, 5 and 6 are code-only. Slices 3 and 4 include forward-only migrations; the slice notes tell users to take a configuration backup first, and each migration's preflight fails closed instead of partially converting rows.

## Open Questions

- Default correlation window (30 s) and replay age (2 min) are proposals; confirm against live testing in slice 2 and slice 6.
