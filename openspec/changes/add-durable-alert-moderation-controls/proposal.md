## Why

Stream Jams already moderates rendered and spoken alert text and exposes protected moderation routes, but the settings are runtime-only and the replacement UI no longer exposes them. Operators need durable, inspectable policy for viewer-controlled text before broader message, TTS, donation, or third-party event support is added.

## What Changes

- Persist independent rendered-text and TTS policies for maximum length, blocked terms, and URL stripping through a typed repository and load them before alert resolution starts.
- Add an explicit-save Alert safety configuration route within the Alerts module rather than turning global Settings or the live operator surface into a moderation dashboard.
- Normalize blocked terms, validate limits, show unsaved state, and reject invalid updates without replacing the last valid policy.
- Apply the same policy to local preview, Send test, live playback, and provider TTS execution, and show safe moderation-action summaries without retaining or logging raw viewer text.
- Include non-secret moderation policy in configuration backup/restore and restore defaults safely when upgrading installations with no stored policy.
- Keep manual approval queues, user blocklists, repeated-character heuristics, machine-learning classification, provider-specific AutoMod integration, and live event moderation out of this change.
- Require `refactor-management-ui-ux`, `improve-management-ui-ux-audit-followups`, and `add-speakerbot-tts-provider` to be complete and present on `origin/main` before implementation begins.

## Capabilities

### New Capabilities

- `alert-moderation-management`: Durable configuration and consistent enforcement of rendered-text and TTS moderation policy across preview, test, live playback, backup, and recovery.

### Modified Capabilities

- None.

## Impact

- Adds moderation-settings persistence and migration in `apps/server` while retaining framework-independent policy and transformation logic in `packages/core`.
- Adds an Alerts safety route, typed management-client behavior, stories, component tests, and browser-visible verification in `apps/web`.
- Extends configuration backup/restore allowlists without exporting viewer text, credentials, route keys, or operational logs.
