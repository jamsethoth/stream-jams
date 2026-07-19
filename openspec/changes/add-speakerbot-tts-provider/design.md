# Design: Add Speaker.bot TTS Provider

## Context

Core TTS types already support playback modes such as `remote-trigger` and `browser-speech`. The app currently registers only `browser-speech`, and alert creation sets `ttsConfig: null`. Speaker.bot should become the first real local TTS target while preserving provider abstraction and testability.

## Goals / Non-Goals

**Goals:**

- Add a Speaker.bot provider through the existing provider registry and TTS service.
- Support local connection configuration with safe defaults and clear diagnostics.
- Let alert variants opt into TTS with provider kind, template text, and enablement controls.
- Keep provider calls server-side; do not expose Speaker.bot credentials or local control details to Vite client bundles.
- Add tests for provider success, provider failure, unsupported options, alert resolution, and UI behavior.

**Non-Goals:**

- Do not add cloud TTS providers.
- Do not add advanced voice marketplace management unless Speaker.bot requires a minimal voice list.
- Do not require OBS WebSocket or Electron.
- Do not replace the playback queue architecture.

## Dependency Gate

Runtime implementation MUST follow Tasks 1-3 of `docs/superpowers/plans/2026-07-18-mvp-spec-gap-closure.md`. Those tasks establish stable variation identities, persistence, and the final alert variant editor structure used by per-alert TTS controls.

## Assumptions

- Speaker.bot is reachable through its documented local WebSocket API.
- Provider connection settings are local configuration, not Vite client secrets.
- Alert TTS text should use the same normalized event template data as visual alert text.

## Decisions

- Implement Speaker.bot as a provider behind the existing `TtsProvider` abstraction instead of coupling it directly to alert resolution.
- Represent Speaker.bot playback as `remote-trigger` so the overlay does not need to synthesize speech in the browser.
- Keep provider test calls server-side and log redacted diagnostics for failures.
- Add per-alert TTS controls to the alert variant editor after the alert UI expansion lands.
- Keep voice selection and safety controls on the registered Speaker.bot provider. Alert documents store only enablement, provider kind, and template text; alert-level voice overrides remain backlog.
- Use Speaker.bot's documented defaults: `127.0.0.1`, port `7680`, and endpoint `/`. The setup flow tells users to enable **Auto Start** because Speaker.bot leaves it disabled by default.
- Send `Speak` requests with `id`, `request`, `voice`, `message`, and `badWordFilter`. The active provider's safety settings supply the voice alias; Stream Jams sets `badWordFilter` to `true`.
- Validate setup by opening the configured WebSocket and closing it after connection. Do not send undocumented or state-changing requests during validation.
- Reuse the server's injected WebSocket socket factory. No additional runtime dependency is required.

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

## Resolved Questions

1. Target Speaker.bot's documented local WebSocket request API.
2. Each alert variant opts in explicitly; registration alone does not enable alert TTS.
3. A failed remote TTS trigger produces redacted diagnostics while visual/audio overlay playback continues.
