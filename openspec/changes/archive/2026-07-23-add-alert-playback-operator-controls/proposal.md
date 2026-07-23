## Why

Stream Jams already supports protected playback snapshots and runtime controls, but the replacement management UI intentionally removed the legacy Playback page without providing the approved stream-time operator surface. Operators need direct, second-monitor-friendly control over active and recent alerts without mixing live operations into configuration workflows.

## What Changes

- Add a focused `/operator` playback surface that shows now playing, queued alerts, recent alerts, and the current paused, muted, and do-not-disturb states.
- Reuse the existing protected playback routes for pause/resume, mute/unmute, skip, replay, and do-not-disturb instead of adding a parallel queue or control API.
- Extend the existing overlay socket with stop and audio-state messages so skip removes active instructions before advancing and mute immediately affects connected browser-source media and browser speech.
- Dispatch remote TTS only when an item actually begins playback and suppress new remote triggers while muted; already-triggered external speech remains provider-owned and cannot be recalled.
- Add a management-header link to navigate to the operator surface in the current tab while preserving native modified-link behavior, plus correction links back to management or Diagnostics when configuration or runtime failures require deeper work.
- Preserve explicit feedback, accessible status, direct clearly labeled actions, redacted errors, and reference IDs where available.
- Keep intake control, queue clearing, normalized event history, attention workflows, and live moderation out of this playback-focused change.
- Require `refactor-management-ui-ux` and `improve-management-ui-ux-audit-followups` to be complete and present on `origin/main` before implementation begins.

## Capabilities

### New Capabilities

- `alert-playback-operator-controls`: A separate local operator surface for inspecting playback state and controlling current, queued, and recent alert playback.

### Modified Capabilities

- None.

## Impact

- Adds an operator route and production UI in `apps/web`, typed playback-client methods, Storybook states, and browser-visible tests.
- Reuses the existing core playback snapshot, server coordinator, protected HTTP routes, overlay WebSocket connection, management-session bootstrap, diagnostics, and logging boundaries.
- Does not add a second queue implementation, separate operator WebSocket, new runtime dependency, provider control, or alert configuration workflow.
