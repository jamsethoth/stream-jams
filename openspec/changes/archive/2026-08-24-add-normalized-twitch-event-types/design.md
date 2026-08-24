## Context

The canonical event union, runtime schemas, alert schemas, two provider normalizers, subscription lists, sample builders, and alert UI currently encode the same six Twitch-origin types independently. The change adds 14 types across those boundaries without changing the rule-matching pipeline or introducing a second provider-specific alert model.

Twitch and Streamer.bot use different names and terminal-event variants. Twitch also requires new read scopes for Hype Trains, polls, and predictions, while stream online/offline and the existing subscription scope cover the other additions.

The approved product design is documented in `docs/superpowers/specs/2026-07-18-normalized-twitch-event-types-design.md`.

## Goals / Non-Goals

**Goals:**

- Define one exhaustive canonical event-type list shared by event and alert schemas.
- Add typed normalized payloads that are useful to matching, templates, samples, and diagnostics.
- Preserve identical alert behavior across direct Twitch and Streamer.bot intake.
- Make the required Twitch authorization upgrade explicit and recoverable.
- Keep existing and starter alert sets unchanged while making every new type creatable and testable.

**Non-Goals:**

- Third-party donations or a non-Twitch source-platform model.
- Twitch charity donations or creator goals.
- Automatic intake activation from stream lifecycle events.
- Raw provider-payload conditions, heuristic event mapping, or cross-event gift suppression.

## Decisions

### Use separate canonical types for lifecycle phases

Hype Train, poll, prediction, and stream phases are distinct `StreamEventType` values. A single family type plus a required phase condition was rejected because it makes every alert easier to misconfigure and complicates samples and editor validation. The UI groups related types without weakening the domain distinction.

### Make the canonical type tuple the source of truth

Core exports one readonly event-type tuple and derives `StreamEventType` and the alert event-type schema from it. The discriminated event schema remains the runtime validator for payload shape. This removes the current duplicated enum knowledge without introducing a generic registry or provider-aware domain abstraction.

### Normalize stable fields and retain bounded provenance

Each event family receives an explicit interface and Zod schema. Stable cross-provider fields are first-class; optional provider-only values remain in sanitized metadata. Provider normalizers use explicit source/type switches and fixture-backed parsers rather than payload heuristics.

Nested poll choices and prediction outcomes are normalized value objects. The first condition-builder pass exposes only scalar summary fields and statuses; arbitrary nested matching remains out of scope.

### Preserve upstream gift meanings

Gifted `channel.subscribe` notifications map to `gift_subscription`, and aggregate gift notifications map to `community_gift`. The runtime does not buffer or correlate the two because Twitch does not guarantee ordering and does not provide a reliable shared correlation key. Enabling both triggers intentionally produces aggregate and recipient alerts.

### Expand authorization through the existing reconnect flow

The standard Device Code OAuth scopes add `channel:read:hype_train`, `channel:read:polls`, and `channel:read:predictions`. Token validation compares granted scopes with the required set. A scope-deficient account remains persisted but is not reported ready; management status identifies the missing authorization and uses the existing reconnect flow. No token migration or secret rewrite is needed.

### Collapse provider terminal variants into normalized end events

Streamer.bot poll completed, archived, and terminated events map to `poll_end`; prediction completed and canceled map to `prediction_end`. A normalized terminal status preserves the distinction. Hype Train level-up is not subscribed separately because the approved canonical trigger is progress and Streamer.bot update events provide that path without risking duplicate level-change alerts.

### Reuse the existing alert pipeline

New events enter the current ingestion, diagnostics, matching, resolution, queue, and playback path. Alert creation adds grouped presentation metadata, built-in samples, and relevant scalar conditions. Existing collections and starter creation logic are not expanded.

## Risks / Trade-offs

- **Community gifts can produce multiple alerts when both gift types are enabled** -> Explain recipient versus aggregate behavior in the picker and samples; do not use unreliable suppression.
- **Existing Twitch grants lack new scopes** -> Preserve account data, show `Authorization update required`, and provide the established reconnect action.
- **Streamer.bot payload shapes can vary by version** -> Commit representative fixtures, parse only required normalized fields, and diagnose supported malformed payloads with reference IDs.
- **Lifecycle progress events can be frequent** -> Keep them explicit and disabled unless the user creates/enables an alert; existing queue behavior remains authoritative.
- **A larger union increases exhaustive-switch work** -> Derive type/schema membership from one tuple and rely on TypeScript exhaustiveness plus focused tests.

## Migration Plan

1. Add the canonical types and schemas before provider mappings and UI choices.
2. Expand both provider adapters, subscriptions, samples, and diagnostics behind the same build.
3. Existing persisted alerts continue to parse because event-type expansion is additive and SQLite stores the value as text.
4. Existing Twitch accounts missing scopes enter the authorization-update state until the user reconnects.
5. Rollback requires removing alerts saved with new event types before running an older build; no database schema rollback is required.

## Open Questions

None. Donation sources and other deferred Twitch families require separate designs.
