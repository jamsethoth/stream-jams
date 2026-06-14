# Tasks

## 1. Dependency Gate

- [ ] 1.1 Fetch latest remote state and verify `serve-overlay-safe-assets` is present in `origin/main`.
- [ ] 1.2 Confirm asset picker selections can map to overlay-renderable media URLs.
- [ ] 1.3 Stop implementation if overlay-safe asset serving is absent from remote `main`.

## 2. API And Draft Model

- [ ] 2.1 Expand management alert API client types to cover full rule and variant payloads.
- [ ] 2.2 Add typed draft conversion helpers for collections, rules, conditions, variants, layout, and assets.
- [ ] 2.3 Keep React components free of core matching/resolution business logic.

## 3. UI Implementation

- [ ] 3.1 Build collection create/edit/enable/delete controls.
- [ ] 3.2 Build rule create/edit/enable/delete controls with event type, collection membership, conditions, cooldown, and priority.
- [ ] 3.3 Build variant create/edit/enable/delete controls with weight, priority, duration, text, assets, and layout fields.
- [ ] 3.4 Add visual/audio asset picker integration using existing asset metadata.
- [ ] 3.5 Remove or defer misleading alert setup fields from the module wizard if they are not schema-backed module config.

## 4. Test Alert Workflow

- [ ] 4.1 Define realistic sample payload inputs for Twitch MVP event types.
- [ ] 4.2 Add or reuse a management route that runs sample events through normalization, matching, resolution, and playback.
- [ ] 4.3 Show success, no-match, cooldown, and error states in the UI.

## 5. Verification

- [ ] 5.1 Add core/API tests for full alert save payloads if gaps exist.
- [ ] 5.2 Add UI tests for collections, rules, conditions, variants, assets, and layout editing.
- [ ] 5.3 Add route tests for sample/test alert behavior.
- [ ] 5.4 Add Playwright coverage for configuring and testing a media-backed alert.
- [ ] 5.5 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and applicable e2e tests.

## 6. Handoff

- [ ] 6.1 Merge this change to remote `main` before starting `add-speakerbot-tts-provider`, which depends on the alert editor structure for per-alert TTS controls.
