# PR 108 review corrections

## Scope

The independent review of head `50310f39d27c732be57835533a54f71dae659d39` against main `386b35a25ef4a8b82656ada0be80023582ea2f4c` identified four P2 findings. This local follow-up corrects all four:

1. Packaged desktop workflows open the Settings disclosures and use current module and saved-test labels. Their persistence, output, and failure assertions remain intact.
2. Saved enabled desktop surfaces with failed or unavailable output report attention. Unused unavailable desktop output does not create a false warning.
3. Editor readiness follows current draft targets rather than stale inventory. Successful saves refresh set facts and preserve concurrent edits; refresh failure reports saved-but-unconfirmed and clears stale readiness.
4. Home and editor reuse a small core content/profile assessment backed by canonical audio resolution. Empty content needs review, device-only audio does not require visual profiles, and mixed visual/audio configuration retains applicable profile review. Browser Source audio enablement does not govern visual or TTS delivery. Relevant soundtrack changes refresh asset media types; unavailable checks do not claim readiness.

## UX contract

Applicable MVP UX spec sections: Cross-Cutting UX Rules (Save And Auto-Save, Error Handling), Home, Alert Editor (Inspector And Layers, Preview And Test Draft, Target Profiles), and Settings And Backup. These are corrections within existing management workflows, with no new output transport, dependency, or backlog feature.

States covered include missing display, unused desktop, empty content, current versus stale profile intent, device-only and mixed outputs, asset lookup failure, and successful save followed by failed status refresh. Configuration readiness does not certify delivery or connected devices. The empty-content action opens Layers and focuses the existing Text control. Native disclosure keyboard semantics are retained.

Production-component stories cover unavailable desktop output, empty content, and device-only configuration. Served-app Playwright checks cover automatic Settings attention disclosure, draft/save readiness with stale inventory, and the empty-content correction action. The missing-display scenario uses a typed synthetic surface response; it does not disconnect a real display. Editor routes use typed synthetic documents. Existing served-app infrastructure uses isolated storage, secrets, and a separate port.

## Validation

- `corepack.cmd pnpm lint` — passed.
- `corepack.cmd pnpm typecheck` — passed.
- `corepack.cmd pnpm exec vitest run --reporter=dot --maxWorkers=1` — 233 files, 2,041 tests passed.
- `node --test scripts/desktop-shutdown-fixture-data.test.mjs scripts/desktop-shutdown-exit.test.mjs scripts/portable-desktop-artifact.test.mjs` — 9 passed.
- `corepack.cmd pnpm build` — passed.
- `corepack.cmd pnpm --filter @stream-jams/web build-storybook` — passed.
- `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci` — 22 suites, 230 interaction/accessibility tests passed.
- `$env:CI='1'; corepack.cmd pnpm exec playwright test` after the successful production build — 48 passed, server reuse disabled.
- `node scripts/stage-desktop.mjs` then `corepack.cmd pnpm --filter @stream-jams/desktop package` after the production build — passed.
- `$env:CI='1'; corepack.cmd pnpm exec playwright test --config playwright.desktop.config.ts tests/desktop/audio-harness.spec.ts tests/desktop/native-binary.spec.ts tests/desktop/runtime.spec.ts tests/desktop/shutdown-diagnostics.spec.ts tests/desktop/utility-worker.spec.ts tests/desktop/windows-close.spec.ts tests/desktop/windows-lifecycle.spec.ts` — 18 passed.
- `openspec.cmd validate simplify-live-management-ux --strict` — passed.

Intermediate test defects were corrected without weakening assertions: the new served-app empty-content assertion was aligned with the actual message, the stale inventory fixture was applied to the intended scenario, and a new Storybook query dropped an unsupported Testing Library option. The final results above are from the corrected tree. Existing Vite chunk-size and Storybook deprecation notices remain nonblocking.

## Visual evidence and limits

One additional isolated Settings test passed with screenshots retained at `C:\Users\James\.codex\visualizations\2026\09\15\01a0a5da-5be8-7732-9f0a-fd1343b7208d\pr108-review-corrections`. The desktop capture was visually inspected: the attention summary and saved-display explanation are visible in the automatically opened section. Captures also include the open Server section and phone layout.

Local execution excludes `audio-routing`, `overlay-host`, `overlay-window`, `overlay-bootstrap`, and `video-audio` because their ordinary scenarios select actual audio devices or displays. The explicit hardware suite, including Screen Effects, was also not run. The corrected physical desktop interactions require CI or separately authorized hardware execution; this record does not claim the entire desktop suite is green. The selected 18 checks used isolated temporary profiles and owned processes. The running app on port 39187, user configuration, real providers, and OBS were not changed.

The Sol medium implementation agent hit its usage limit after the focused checks; the parent completed the fixture correction, Storybook coverage, final validation, and documentation. No follow-up changes were pushed, no review comments were posted, and no PR state was changed.
