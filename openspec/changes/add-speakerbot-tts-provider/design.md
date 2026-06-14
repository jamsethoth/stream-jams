# Design: Add Speaker.bot TTS Provider

## Context

Core TTS types already support playback modes such as `remote-trigger` and `browser-speech`. The app currently registers only `browser-speech`, and alert creation sets `ttsConfig: null`. Speaker.bot should become the first real local TTS target while preserving provider abstraction and testability.

## Goals / Non-Goals

**Goals:**

- Add a Speaker.bot provider through the existing provider registry and TTS service.
- Support local connection configuration with safe defaults and clear diagnostics.
- Let alert variants opt into TTS with provider, voice/options where supported, template text, and enablement controls.
- Keep provider calls server-side; do not expose Speaker.bot credentials or local control details to Vite client bundles.
- Add tests for provider success, provider failure, unsupported options, alert resolution, and UI behavior.

**Non-Goals:**

- Do not add cloud TTS providers.
- Do not add advanced voice marketplace management unless Speaker.bot requires a minimal voice list.
- Do not require OBS WebSocket or Electron.
- Do not replace the playback queue architecture.

## Dependency Gate

Implementation MUST NOT begin until `expand-alert-configuration-ui` has landed in remote `main`. The implementation must use the final alert variant editor structure for per-alert TTS controls.

## Assumptions

- Speaker.bot is reachable locally through an HTTP, WebSocket, or documented local control API.
- Provider connection settings are local configuration, not Vite client secrets.
- Alert TTS text should use the same normalized event template data as visual alert text.

## Decisions

- Implement Speaker.bot as a provider behind the existing `TtsProvider` abstraction instead of coupling it directly to alert resolution.
- Represent Speaker.bot playback as `remote-trigger` so the overlay does not need to synthesize speech in the browser.
- Keep provider test calls server-side and log redacted diagnostics for failures.
- Add per-alert TTS controls to the alert variant editor after the alert UI expansion lands.

## Initial Implementation Plan

1. Confirm the expanded alert editor is present in remote `main`.
2. Verify the Speaker.bot local API surface and choose the smallest server-side integration path.
3. Add provider config schema, registry entry, implementation, and diagnostics.
4. Extend alert variant UI/API support for TTS config.
5. Update alert resolution/playback to trigger Speaker.bot for configured variants.
6. Add tests and run validation.

## Risks / Trade-offs

- Speaker.bot API details may vary by installed version. Mitigation: isolate the client behind a narrow interface and document supported versions/settings.
- Remote trigger failures can make alerts appear silent. Mitigation: surface provider failure logs and keep visual alert playback independent.
- TTS controls can make the alert editor noisy. Mitigation: use a compact provider section that appears only when TTS is enabled for a variant.

## Open Questions

1. Which Speaker.bot control surface should the MVP target: HTTP endpoint, WebSocket, UDP, or another local API?
2. Should Speaker.bot be enabled by default when configured, or should each alert variant opt in explicitly?
3. Should failed TTS trigger attempts block alert completion, or log an error while visual/audio overlay playback continues?
