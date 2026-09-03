## Why

Streamers need alert sounds to reach their own headphones, a stream-facing mixer device, or both without adding extra OBS Browser Sources. Alert-wide output selection provides this flexibility while keeping individual audio layers simple.

## What Changes

- Add one output selection per alert/default/variation: an optional existing Browser Source plus zero or more reusable named physical/virtual-device routes. All visible explicit audio layers inherit it; no per-layer override or special `both` mode.
- Default old and new documents to Browser Source enabled with no device routes. Preserve assignments through duplication and visual re-theming.
- Add named-route management, device binding/status, explicit route tests, and a dedicated desktop-owned hidden audio renderer independent of management-window visibility.
- Resolve device audio once per selected alert occurrence, not once per visual target profile; include local playback in queue completion, mute, skip, replay, failure, and shutdown behavior.
- **BREAKING**: Permit Send test without a connected Browser Source when selected device audio is deliverable; replace the current unconditional browser-connection requirement with destination-aware validation.
- **BREAKING**: Make alert video layers visual-only, with explicit upgrade guidance to use audio layers for sound. This does not modify the separate video-shoutout module.
- Export route identities/names and assignments, but require device rebinding after portable restore; retain local bindings during failed-restore rollback.
- Keep browser speech and Speaker.bot routing unchanged. Do not add native audio drivers, automatic fallback destinations, per-device processing, sample-accurate synchronization, extra Browser Sources, OBS automation, or installer/updater work.

## Capabilities

### New Capabilities

- `alert-audio-routing`: Alert-wide outputs, named device routes, desktop audio transport, destination failures, diagnostics, timing, and background playback.

### Modified Capabilities

- `alert-configuration-management`: Destination-aware Send test while preserving local Preview, selected-document semantics, and explicit audio/TTS inclusion.
- `overlay-output-management`: Scope profile test delivery to connected browser recipients while allowing device-only tests without a second Browser Source.
- `alert-playback-operator-controls`: Extend authoritative mute, skip, and replay semantics to local device playback without changing TTS safety behavior.
- `configuration-backup-restore`: Define portable audio-route fields, local device binding exclusions, reference validation, and rollback.

## Impact

- Depends on implemented [Windows desktop/tray runtime](../add-windows-desktop-tray-runtime/proposal.md), plus an early real-device capability gate in the packaged application.
- Affects core editor/playback contracts and resolution, SQLite route persistence, server playback coordination and testing, desktop IPC/player, management Settings/editor/diagnostics, alert overlay rendering, backup mapping, and regression tests.
- Browser-source URLs and their authorization remain unchanged. New management mutations retain authentication, CSRF, origin restrictions, and rate limiting; no overlay key gains device-management privileges.
- [Implementation plan](../../../docs/superpowers/plans/2026-09-03-alert-audio-routing.md). Planning readiness does not mean the dependency or device gate has passed.
