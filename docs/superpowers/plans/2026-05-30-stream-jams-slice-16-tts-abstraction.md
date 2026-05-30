# Slice 16: TTS Abstraction

**Goal:** Add a provider-neutral TTS layer with a first local/browser speech provider, management visibility, and a test action without coupling alert resolution to provider implementations.

**Base requirements:** `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` Slice 16.

**Architecture:** Keep provider capability checks in `packages/core`. Server adapters register concrete providers and expose management-protected TTS endpoints. Alert resolution continues to emit provider-neutral TTS playback instructions, while provider testing and capability display flow through the management API.

## Sub-Slice 16.1: Core Provider And Service Contracts

**Objective:** Add `TtsProvider`, provider registry, and `TtsService` abstractions with capability validation and failure isolation.

**Files or areas:** `packages/core/src/tts/tts-provider.ts`, `packages/core/src/tts/tts-service.ts`, `packages/core/src/tts/*.test.ts`, `packages/core/src/index.ts`.

**Tests:**

- Rejects unsupported voice, rate, pitch, and volume options according to provider capabilities.
- Applies moderation before provider preview/test execution.
- Converts provider failures into typed TTS errors without crashing callers.
- Lists provider capabilities and voices through the service boundary.

- [x] Complete.

## Sub-Slice 16.2: Server Providers And Routes

**Objective:** Add the first local/browser speech provider registry and management-protected TTS routes.

**Files or areas:** `apps/server/src/modules/tts/tts-provider-registry.ts`, `apps/server/src/modules/tts/browser-speech-tts-provider.ts`, `apps/server/src/http/routes/tts.ts`, `apps/server/src/app.ts`, `apps/server/src/index.ts`.

**Tests:**

- Management sessions can list provider capabilities.
- Management sessions can run a TTS test action with sample text.
- Invalid provider options return 400.
- Provider failure returns a controlled 502-style error.
- Missing management sessions and overlay route keys are rejected before TTS work.

- [x] Complete.

## Sub-Slice 16.3: Management UI

**Objective:** Add a TTS management panel showing provider capabilities and a sample test action.

**Files or areas:** `apps/web/src/management/tts/`, `apps/web/src/management/ManagementApp.tsx`, `apps/web/src/management/navigation/`, `apps/web/src/management/management-api.ts`, management tests.

**Tests:**

- TTS tab displays provider capabilities and voices from the management API.
- Unsupported controls are hidden or absent when provider capabilities do not allow them.
- Test action sends sample text to the selected provider and reports controlled failures.

- [x] Complete.

## Sub-Slice 16.4: Alert Resolver Integration Check

**Objective:** Verify alert resolution remains provider-neutral while including moderated TTS instructions.

**Files or areas:** `packages/core/src/alerts/alert-resolver.ts`, existing resolver tests.

**Tests:**

- Resolved alerts include TTS playback instructions with provider id and voice id only.
- Alert resolver does not import concrete provider implementations.
- Visual alert playback remains valid when TTS provider testing fails elsewhere.

- [x] Complete.

## Reconciliation Checklist

- [x] Implement `TtsProvider` and provider registry.
- [x] Implement `TtsService` that applies moderation and provider capability checks.
- [x] Add browser speech as the first runnable MVP TTS provider while keeping the boundary aligned with the Speaker.bot product target.
- [x] Add provider capability display in the management UI.
- [x] Add TTS test action using sample event data.
- [x] Integrate TTS instructions into `AlertResolver`.
- [x] Unit test capability checks for unsupported voice, rate, pitch, and volume options.
- [x] Unit test provider failure behavior.
- [x] Commit with message `feat: add tts abstraction`.

## Final Validation

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm test:e2e` attempted locally; Chromium launch is blocked by missing `libnspr4.so` before app assertions
- [x] `pnpm build`
- [x] `git diff --check`
