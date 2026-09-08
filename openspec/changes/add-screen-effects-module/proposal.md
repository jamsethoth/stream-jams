## Why

Chat-triggered jumpscares and other local media effects need their own authoring and sequential playback workflow while ordinary Alerts continue independently. Operators need to see and control both queues together without creating a misleading global playback order.

## What Changes

- Add a local-first Screen Effects module with trusted local image/GIF/video assets, optional separate sound, audio-only effects, bounded durations, priorities, cooldowns, and weighted variants.
- Bind stable Twitch reward identities and configured Streamer.bot event identities through existing event-source boundaries; provide explicit manual tests.
- Select and snapshot one variant per admitted occurrence, then play a bounded sequential module queue without interrupting the current effect. Alerts may play simultaneously.
- Target desktop visuals, OBS browser visuals, or both independently of Browser Source audio and reusable named device-route selections.
- Extend `/operator` with merged current/pending/recent views, module badges and module queue positions, targeted skip/remove/replay/clear, module pause, and authoritative global pause/mute/DND.
- Generalize device playback ownership so one module's normal completion or skip cannot stop another module's active sound.

## Capabilities

### New Capabilities

- `screen-effects`: Local authoring, triggers, media resolution, safe admission, independent sequential queue, routing, and bounded lifecycle.
- `multi-module-playback-operations`: Merged queue projection, module-qualified controls, concurrent output ownership, and shared safety state.

### Modified Capabilities

- `alert-playback-operator-controls`: Broaden the separate Operator surface from one alert queue to independent module queues without moving configuration into Operator.
- `alert-audio-routing`: Expand route-reference checks to saved effects and preserve concurrent module playback when routes are rebound or a normal skip occurs.

## Impact

Depends on implementation and spec sync of `add-shared-desktop-overlay-surface` and `add-routed-video-audio-controls`; rebase its overlapping deltas after those land. Extends core module/queue contracts, typed SQLite repositories and backup validation, event fan-out, audio batch ownership, protected APIs, management authoring, browser sources, and Operator. The video-shoutout module remains an independent proposal, not a dependency or a shipped layer.

See [approved design and research](../../../docs/superpowers/specs/2026-09-07-screen-effects-design.md).

## Non-goals

Marketplace, viewer uploads, paid content infrastructure, remote media fetching, arbitrary scripts, additional providers, simultaneous Twitch/Streamer.bot provider activation, overlapping Screen Effect occurrences, preemptive playback, cloud deployment, cross-platform desktop output, game process manipulation, and implementation of the video-shoutout/music modules.
