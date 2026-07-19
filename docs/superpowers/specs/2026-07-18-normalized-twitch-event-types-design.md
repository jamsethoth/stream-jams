# Normalized Twitch Event Types Design

**Date:** 2026-07-18

**Status:** Approved for written specification

## Goal

Expand Stream Jams from six normalized Twitch-origin events to the common subscription, engagement, and stream lifecycle events needed by alert authors. Alerts must remain independent of whether Twitch events arrive directly through EventSub or indirectly through Streamer.bot.

## Scope

The canonical catalog adds 14 event types:

| Group | Event types |
| --- | --- |
| Subscriptions | `gift_subscription`, `community_gift` |
| Hype Train | `hype_train_start`, `hype_train_progress`, `hype_train_end` |
| Poll | `poll_start`, `poll_progress`, `poll_end` |
| Prediction | `prediction_start`, `prediction_progress`, `prediction_lock`, `prediction_end` |
| Stream | `stream_online`, `stream_offline` |

Lifecycle phases are separate event types, not a required `phase` condition. The alert UI groups related types so the larger catalog remains scannable.

Third-party donations, Twitch charity donations, creator goals, and stream-driven intake control are out of scope. Donation support requires a separate source-platform and monetary payload design.

## Canonical Payloads

Every event retains the existing normalized base fields: stable event ID, source platform, ingest provider, occurrence time, actor, message, and metadata.

Stable fields added by family:

- Gift subscription: recipient, optional gifter, tier, and amount `1`.
- Community gift: gifter or anonymous identity, tier, gift count, and optional cumulative gift count.
- Hype Train: train ID, level, progress, goal, total, and applicable lifecycle timestamps.
- Poll: poll ID, title, choices with normalized vote counts, lifecycle timestamps, and terminal status.
- Prediction: prediction ID, title, outcomes with point and participant totals, lifecycle timestamps, terminal status, and winning outcome when available.
- Stream: broadcaster identity, optional stream ID, stream type, and start or end timestamp.

Channel-level lifecycle events use the broadcaster as `actor`. A gift-subscription event uses the recipient as `actor`; a community-gift event uses the gifter or an anonymous placeholder. Sanitized upstream source/type and provider-only extras remain in `metadata`, but alert behavior does not depend on raw provider fields.

## Provider Mapping

Direct Twitch EventSub maps the corresponding subscription types to the canonical catalog. Streamer.bot maps its Twitch events explicitly:

- `GiftSub` and `GiftBomb`.
- `HypeTrainStart`, `HypeTrainUpdate`, and `HypeTrainEnd`.
- `PollCreated`, `PollUpdated`, and the completed, archived, or terminated terminal events.
- `PredictionCreated`, `PredictionUpdated`, `PredictionLocked`, and completed or canceled terminal events.
- `StreamOnline` and `StreamOffline`.

Streamer.bot terminal variants collapse into the corresponding canonical `*_end` event while retaining a normalized terminal status. Unknown events remain diagnostic-only. A supported event with malformed required fields produces a diagnostic error and reference ID without terminating intake.

## Gift Semantics

Twitch emits recipient subscription notifications and an aggregate gift notification without reliable ordering or correlation. Stream Jams therefore preserves both meanings:

- `gift_subscription` fires once per recipient, including recipients within a community gift.
- `community_gift` fires once for the aggregate gift.
- `subscription` no longer fires for a gifted subscription.

An alert author who enables both gift triggers intentionally receives the aggregate alert and recipient alerts. The picker and samples explain this distinction; Stream Jams does not attempt heuristic cross-event suppression.

## Authorization

Direct Twitch intake adds `channel:read:hype_train`, `channel:read:polls`, and `channel:read:predictions` to the standard Device Code OAuth request. Existing account and refresh-token records remain saved.

When a saved account lacks any required scope, setup and live status show `Authorization update required`, name the missing capabilities, and provide a reconnect action. EventSub does not claim readiness or subscribe to unsupported types until the expanded authorization succeeds. Streamer.bot intake does not require Twitch reauthorization in Stream Jams.

## Alert Management UX

The new-alert workflow groups choices under Subscriptions, Hype Train, Polls, Predictions, and Stream. Existing and starter alert sets are unchanged. Every new type provides built-in normal and edge-case samples for local preview and send-test behavior.

The condition editor exposes useful normalized fields, including gift tier/count, Hype Train level/progress, poll vote totals/status, prediction point totals/status, and stream type. Provider-specific raw metadata is not offered as a condition source.

## Verification Boundary

Verification covers core schemas, direct Twitch and Streamer.bot normalizers, stable IDs, OAuth scope upgrades, subscription selection, pipeline matching, malformed-event diagnostics, sample construction, grouped alert creation, condition editing, Storybook states, and a browser workflow. Production artifacts must be rebuilt and affected local services restarted before live verification.

## References

- [Twitch EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Twitch EventSub reference](https://dev.twitch.tv/docs/eventsub/eventsub-reference/)
- [Streamer.bot WebSocket events](https://docs.streamer.bot/api/websocket/events)
- [Streamer.bot Twitch triggers](https://docs.streamer.bot/api/triggers/twitch)
