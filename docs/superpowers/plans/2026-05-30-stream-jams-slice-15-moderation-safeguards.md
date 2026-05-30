# Slice 15: Moderation Safeguards

**Goal:** Add moderation controls for viewer-controlled alert text and TTS text so rendered overlay output, browser speech, and future provider calls receive bounded, escaped, URL-controlled, blocked-term-filtered text.

**Base requirements:** `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` Slice 15.

**Architecture:** Keep moderation rules in framework-independent core services. Alert resolution uses safe template renderers for rendered text and TTS text, while the local backend exposes management-protected moderation settings routes. The management UI edits the same settings surface through the `ManagementApi` boundary.

## Sub-Slice 15.1: Core Moderation Service

**Objective:** Add reusable moderation settings, defaults, and text transformation results for rendered alert text and TTS text.

**Files or areas:** `packages/core/src/moderation/moderation-service.ts`, `packages/core/src/moderation/default-rules.ts`, `packages/core/src/index.ts`.

**Tests:**

- Replaces blocked terms case-insensitively.
- Strips `http://`, `https://`, and `www.` URLs when enabled.
- Enforces per-target maximum lengths.
- Reports moderation actions without carrying raw input text.

- [x] Complete.

## Sub-Slice 15.2: Safe Template Rendering And Alert Integration

**Objective:** Add safe template renderers and use them for alert overlay text and TTS text.

**Files or areas:** `packages/core/src/templates/safe-template-renderer.ts`, `packages/core/src/alerts/alert-resolver.ts`, existing template/resolver tests.

**Tests:**

- XSS-like display names render escaped HTML.
- Rendered alert text and TTS text apply independent max lengths.
- TTS text is moderated before the instruction/provider payload boundary.
- Blocked terms and URLs are removed from resolved alert instructions.

- [x] Complete.

## Sub-Slice 15.3: Backend Moderation Settings Routes

**Objective:** Expose management-protected moderation settings reads and updates.

**Files or areas:** `apps/server/src/http/routes/moderation.ts`, `apps/server/src/app.ts`, `apps/server/src/index.ts`, route tests.

**Tests:**

- Authenticated management sessions can read and update blocked terms and URL stripping settings.
- Invalid settings return 400 without mutating current settings.
- Missing management sessions and overlay route keys are rejected before settings are read or updated.
- Rate limiting runs before repeated moderation settings work.

- [x] Complete.

## Sub-Slice 15.4: Management UI Controls

**Objective:** Add basic moderation controls to the management settings panel.

**Files or areas:** `apps/web/src/management/management-api.ts`, `apps/web/src/management/settings/SettingsPanel.tsx`, management component tests.

**Tests:**

- Settings panel loads blocked terms and URL stripping settings.
- Saving settings calls the management API with normalized blocked terms.
- Rendered and TTS URL stripping can be toggled independently.

- [x] Complete.

## Reconciliation Checklist

- [x] Implement max length controls for rendered alert text and TTS text.
- [x] Implement blocked terms with case-insensitive matching.
- [x] Implement URL stripping option for TTS and rendered messages.
- [x] Implement HTML escaping as the default rendering behavior.
- [x] Add management UI for basic blocked terms and URL stripping settings.
- [x] Unit test XSS-like strings, long messages, URL stripping, and blocked term replacement.
- [x] Commit with message `feat: add moderation safeguards`.

## Final Validation

- [x] `pnpm lint` passed locally.
- [x] `pnpm typecheck` passed locally.
- [x] `pnpm test` passed locally: 64 files, 238 tests.
- [x] `pnpm test:e2e` was attempted locally; Chromium fails before test execution because `libnspr4.so` is missing in this Ubuntu 26.04 environment.
- [x] `pnpm build` passed locally.
- [x] `git diff --check` passed locally.
- [x] Diff self-review completed; generated Playwright artifacts were removed.
