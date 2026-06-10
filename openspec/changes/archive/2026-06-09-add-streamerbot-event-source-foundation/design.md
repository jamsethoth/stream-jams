# Design: Add Streamer.bot Event Source Foundation

## Technical Approach

This change updates shared core contracts and the existing Twitch normalizer so normalized events carry both source-platform and ingest-provider identity.

Current behavior remains:

```text
Twitch EventSub
  -> normalizeTwitchEventSubNotification()
  -> NormalizedStreamEvent
  -> EventPipeline
  -> alert matching/playback/diagnostics
```

After this change, direct Twitch events still flow through the same pipeline, but the normalized event includes:

```ts
providerId: "twitch";
sourcePlatform: "twitch";
ingestProvider: "twitch";
```

The Streamer.bot runtime is not introduced in this slice. The new external event model is a core contract for future slices, not a persisted or ingested runtime path yet.

## Architecture Decisions

### Decision: Keep `providerId` for compatibility

`providerId` remains on `BaseNormalizedStreamEvent` and stays `"twitch"` for Twitch-compatible alert events. Existing alert rules, template context, playback dedupe, diagnostics views, and tests already depend on it.

`sourcePlatform` becomes the explicit semantic replacement for the current meaning of `providerId`. Future Streamer.bot Twitch normalizers will use `providerId: "twitch"` and `sourcePlatform: "twitch"` so existing Twitch alert rules can continue to fire.

### Decision: Add `ingestProvider`

`ingestProvider` identifies how Stream Jams received the event. Direct Twitch EventSub uses `"twitch"`. Future Streamer.bot events will use `"streamerbot"`.

This lets alert conditions and diagnostics distinguish duplicate-risk paths without treating the viewer-facing event as a different platform.

### Decision: Define generic external events now

Future Streamer.bot intake needs a type that preserves raw aggregator identity without forcing unknown source/type pairs through the alert model. This slice defines the shared type and schema only.

The future runtime and diagnostics slices will decide persistence details, raw payload retention, purge behavior, and management API shape.

### Decision: Legacy diagnostics are read-compatible

Existing SQLite event log rows store normalized event JSON. Rows written before this change do not have `sourcePlatform` or `ingestProvider`.

The diagnostics repository should parse legacy rows by treating missing fields as direct Twitch values:

```ts
sourcePlatform: "twitch";
ingestProvider: "twitch";
```

This keeps old logs readable without mutating stored JSON.

### Decision: Streamer.bot gets its own secret namespace

`SecretRef.namespace` should include `"streamerbot"` so password secrets and future tokens are never stored under the Twitch namespace or plain configuration.

## File Changes

Expected code areas:

- `packages/core/src/events/types.ts`
- `packages/core/src/events/schemas.ts`
- `packages/core/src/events/schemas.test.ts`
- `packages/core/src/security/types.ts`
- `packages/core/src/security/schemas.ts`
- `packages/core/src/security/*.test.ts`
- `packages/core/src/alerts/condition-evaluator.test.ts`
- `packages/core/src/index.ts`
- `apps/server/src/modules/twitch/twitch-event-normalizer.ts`
- `apps/server/src/modules/twitch/twitch-event-normalizer.test.ts`
- `apps/server/src/modules/diagnostics/sqlite-log-repository.ts`
- `apps/server/src/modules/diagnostics/sqlite-log-repository.test.ts`
- Any tests that construct `NormalizedStreamEvent` fixtures.

## Test Strategy

- Schema tests accept normalized events with `sourcePlatform` and `ingestProvider`.
- Schema tests or repository tests cover legacy event JSON without the new fields.
- Twitch normalizer tests prove direct Twitch events set `sourcePlatform: "twitch"` and `ingestProvider: "twitch"`.
- Secret schema tests prove `"streamerbot"` is accepted and malformed refs are still rejected.
- Alert condition tests prove conditions can read `providerId`, `sourcePlatform`, and `ingestProvider`.
- Full validation should include `pnpm typecheck` and `pnpm test`.

## Risks

- Many tests may construct `NormalizedStreamEvent` fixtures. The implementation should update shared fixture helpers where they exist instead of scattering broad test churn.
- If diagnostics parsing becomes too permissive, malformed future events could be accepted accidentally. Legacy fallback should apply only when `providerId` is `"twitch"` and the rest of the normalized event is otherwise valid.
- `providerId` and `sourcePlatform` will be redundant for now. That is intentional until a later migration can rename or deprecate `providerId` safely.
