# Tasks

## 1. Dependency Gate

- [x] 1.1 Complete Tasks 1-3 of `docs/superpowers/plans/2026-07-18-mvp-spec-gap-closure.md`.
- [x] 1.2 Confirm stable variation persistence and the final alert variant editor TTS extension points.
- [x] 1.3 Stop runtime implementation if those alert authoring prerequisites are incomplete.

## 2. Speaker.bot API Decision

- [x] 2.1 Verify the current Speaker.bot local control API and supported connection settings.
- [x] 2.2 Document the selected API, supported version assumptions, and failure modes.
- [x] 2.3 Decide whether additional dependencies are necessary and justify exact versions if added.

## 3. Provider Implementation

- [x] 3.1 Add Speaker.bot config schema and server-side client interface.
- [x] 3.2 Implement the Speaker.bot TTS provider behind the existing provider abstraction.
- [x] 3.3 Register Speaker.bot in the runtime provider registry.
- [x] 3.4 Add redacted diagnostics for provider tests and trigger failures.

## 4. Alert TTS Configuration

- [x] 4.1 Extend alert variant API/UI support for Speaker.bot enablement, provider kind, and template text.
- [x] 4.2 Add compact per-variant controls without alert-level voice or safety overrides.
- [x] 4.3 Ensure alert resolution renders TTS text from normalized event fields.
- [x] 4.4 Trigger Speaker.bot through the playback/TTS service without exposing provider details to the overlay client.

## 5. Verification

- [x] 5.1 Add provider unit tests for success, unavailable Speaker.bot, unsupported options, and redaction.
- [x] 5.2 Add alert resolver/playback tests for Speaker.bot TTS config.
- [x] 5.3 Add management UI tests for per-alert TTS controls.
- [x] 5.4 Add route tests for provider list and test behavior.
- [ ] 5.5 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and applicable e2e tests.
