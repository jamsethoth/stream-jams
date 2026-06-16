# Tasks

## 1. Dependency Gate

- [x] 1.1 Fetch latest remote state and verify `serve-overlay-safe-assets` is present in `origin/main`.
- [x] 1.2 Confirm asset picker selections can map to overlay-renderable media URLs.
- [x] 1.3 Stop implementation if overlay-safe asset serving is absent from remote `main`.

## 2. API And Draft Model

- [x] 2.1 Expand management alert API client types to cover full rule and variant payloads.
- [x] 2.2 Add typed draft conversion helpers for collections, rules, minimal normalized conditions, variants, layout, and assets.
- [x] 2.3 Keep React components free of core matching/resolution business logic.
- [x] 2.4 Define first-slice condition field metadata for normalized `amount`, `tier`, and `rewardId` only.

## 3. UI Implementation

- [x] 3.1 Build collection create/edit/enable/delete controls with delete confirmation and impact summary.
- [x] 3.2 Build rule create/edit/enable/delete controls with event type, collection membership, conditions, cooldown, priority, delete confirmation, and impact summary.
- [x] 3.3 Build variant create/edit/enable/delete controls with weight, priority, duration, text, assets, numeric layout fields, static preview, delete confirmation, and impact summary.
- [x] 3.4 Add visual/audio asset picker integration using existing asset metadata, with image/GIF/video filtering for visual assets and audio filtering for audio assets.
- [x] 3.5 Remove or defer misleading alert setup fields from the module wizard if they are not schema-backed module config.

## 4. Test Alert Workflow

- [x] 4.1 Define realistic sample payload inputs for Twitch MVP event types.
- [x] 4.2 Add or reuse a management route that runs sample events through normalization, matching, resolution, and playback.
- [x] 4.3 Put test-alert controls in the saved rule editor and show success, no-match, cooldown, and error states there.
- [x] 4.4 Label test alerts as local sample data and avoid Twitch/EventSub calls when generating them.

## 5. Verification

- [x] 5.1 Add core/API tests for full alert save payloads if gaps exist.
- [x] 5.2 Add UI tests for collections, rules, minimal conditions, variants, filtered asset selection, numeric layout editing, static preview, and delete confirmations.
- [x] 5.3 Add route tests for sample/test alert behavior.
- [x] 5.4 Add Playwright coverage for configuring and testing a media-backed alert.
- [x] 5.5 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and applicable e2e tests.

## 6. Archive Readiness

- [x] 6.1 Confirm `docs/future-features.md` tracks expanded condition fields, interactive layout canvas, and alert configuration backup/history/rollback as separate future features.
