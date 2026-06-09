# Tasks

## 1. Core Event Identity

- [x] 1.1 Add `IngestProviderId` and `SourcePlatformId` core types.
- [x] 1.2 Add matching Zod schemas for ingest provider and source platform.
- [x] 1.3 Add `sourcePlatform` and `ingestProvider` to `BaseNormalizedStreamEvent`.
- [x] 1.4 Update `normalizedStreamEventSchema` and event-specific schemas.
- [x] 1.5 Update core exports.

## 2. External Event Contract

- [x] 2.1 Add a generic `ExternalStreamEvent` type with `id`, `ingestProvider`, `subscriptionSourceKey`, `upstreamSource`, `upstreamType`, `occurredAt`, `receivedAt`, `payload`, and `metadata`.
- [x] 2.2 Add an external event schema that validates the same shape.
- [x] 2.3 Add Streamer.bot subscription selection types or schemas needed by later slices without adding persistence.
- [x] 2.4 Add tests for valid and invalid external event values.

## 3. Secret Namespace

- [x] 3.1 Add `"streamerbot"` to `SecretRef.namespace`.
- [x] 3.2 Update `secretRefSchema`.
- [x] 3.3 Add or update secret-store tests proving Streamer.bot refs validate and malformed refs still fail.

## 4. Direct Twitch Compatibility

- [x] 4.1 Update `normalizeTwitchEventSubNotification()` so every direct Twitch event includes `sourcePlatform: "twitch"` and `ingestProvider: "twitch"`.
- [x] 4.2 Update Twitch normalizer tests for all MVP event types.
- [x] 4.3 Update existing test fixtures or helper factories that construct normalized Twitch events.

## 5. Diagnostics Legacy Read Compatibility

- [x] 5.1 Update diagnostics event-log parsing to accept legacy Twitch event JSON without `sourcePlatform` or `ingestProvider`.
- [x] 5.2 Ensure the legacy fallback only applies to otherwise-valid Twitch normalized events.
- [x] 5.3 Add repository tests for legacy and new event-log rows.

## 6. Alert Condition Coverage

- [x] 6.1 Add alert condition tests for `providerId`.
- [x] 6.2 Add alert condition tests for `sourcePlatform`.
- [x] 6.3 Add alert condition tests for `ingestProvider`.

## 7. Verification

- [x] 7.1 Run `pnpm typecheck`.
- [x] 7.2 Run `pnpm test`.
- [x] 7.3 Run `pnpm lint` if implementation touched linted files.
- [x] 7.4 Confirm no Streamer.bot runtime, API, persistence, or UI was added in this slice.
