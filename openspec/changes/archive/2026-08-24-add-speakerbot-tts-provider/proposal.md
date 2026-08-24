# Proposal: Add Speaker.bot TTS Provider

## Why

The product plan identifies Speaker.bot as the first TTS target provider, but the runtime currently exposes only browser speech. The MVP needs a Speaker.bot-backed TTS provider plus per-alert TTS configuration so streamers can route alert speech through their local streaming audio setup.

## What Changes

- Add a Speaker.bot TTS provider implementation behind the existing TTS provider/service interfaces.
- Add configurable local connection settings for Speaker.bot without exposing secrets to browser bundles.
- Add provider test behavior that reports success/failure clearly in the management UI.
- Add per-alert TTS configuration controls integrated into the expanded alert editor.
- Resolve alert TTS instructions to Speaker.bot remote-trigger playback behavior when configured.
- Keep browser-speech as a test/development provider if still useful, but make Speaker.bot the MVP target provider.

## Capabilities

### New Capabilities

- `speakerbot-tts-provider`: Runtime can trigger local Speaker.bot TTS through the TTS provider abstraction.
- `alert-tts-configuration`: Management users can configure per-alert TTS behavior for supported providers.

### Modified Capabilities

None. No repo-local base specs exist yet for this behavior.

## Impact

- Affected code: TTS provider registry, provider implementation, server config, management TTS panel, alert editor, alert resolver/playback, diagnostics, tests, and runbook docs.
- Dependencies: implementation MUST wait until `expand-alert-configuration-ui` is merged and present in remote `main` so per-alert TTS controls attach to the final alert editing workflow.
