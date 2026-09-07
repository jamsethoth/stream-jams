# Alert audio routing: desktop playback and safety checkpoint

Implementation checkpoint: September 7, 2026. Scope: `add-alert-audio-routing` tasks 4.1–4.6, following the [canonical queue checkpoint](alert-audio-routing-canonical-queue.md). This is local implementation and silent packaged verification, not final physical-device/OBS acceptance.

## Implemented boundaries

- The service worker now injects a production desktop transport. Authorized asset IDs are resolved through the repository and contained asset store; renderers receive bytes, never filesystem paths or arbitrary URLs. Bounded file reads enforce 25 MiB per asset and 100 MiB per batch. Repeated assets are loaded once per batch; distinct layer/device instances remain distinct. Missing, changed or unsupported assets fail affected layers without suppressing healthy assets.
- Strict schemas validate worker/main/preload messages and replies. Requests carry worker/renderer generations and correlation IDs. The preload exposes only validated commands/results, not raw IPC. Its dependency bundle uses the same exact Vite version already used by the web app; Electron's sandbox, context isolation, app-owned origin, dedicated persistent session and output-only permissions remain enabled.
- Playback carries an absolute configured completion deadline and one absolute five-second startup deadline through asset loading, transport and sink selection. An expired or cancelled request cannot start later, including when timer callbacks lag. The outer occurrence watchdog remains configured duration plus five seconds.
- Every media element binds its explicit sink before play and re-reads authoritative mute after asynchronous binding. Completion, error, cancellation and deadline paths pause and remove media, detach listeners and revoke Blob URLs. No default-device or label-based fallback exists. Enumeration polling supplements `devicechange` while playback is active, reflecting the earlier physical-device findings.
- Browser instructions use occurrence-specific delivery IDs. Browser/device work is registered before dispatch and completed independently. Device-preparation timeout releases only the device recipient after silence; it does not truncate a healthy browser. Skip waits for stop; rejected silence acknowledgement holds the queue. Pause/DND retain advancement-only semantics, and shutdown does not advance. TTS routing remains unchanged.
- Main destroys only its owned audio renderer if stop cannot be acknowledged within two seconds. A crashed renderer may be recreated once for future requests; another failure requires explicit protected `POST /audio/retry`. Interrupted items are not replayed. Service loss destroys the player, with a two-second worker heartbeat and ten-second ownership lease as the backstop.
- Persisted mute is applied before first use, on recreation, and before committing configuration-reload state after restore. Existing restore rollback handles a failed audio mute update. Full active-playback restore exclusion remains task 6.

## Verification

- Final affected core/server/desktop batch: **188 tests across 28 files passed**. This includes queue/coordinator, audio contracts, sink/asset bounds, IPC/host/player, protected audio/playback HTTP, runtime configuration and existing TTS regressions.
- Existing operator/overlay regression batch: **55 tests across seven files passed**. Total focused unit coverage for this checkpoint: **243 passing tests**; this is not a full-repository test-suite claim.
- Repository TypeScript and ESLint gates passed. Desktop and web production builds passed. The existing web bundle-size advisory remains non-blocking.
- The packaged smoke passed twice, including once against the final reviewed build. It exercised production route enumeration, explicit binding, worker/main/preload byte delivery and native playback with volume forced to zero before `play()`. Media elements were removed afterward. Isolation, hidden/persistent player operation and management close-to-tray remained intact.
- Packaged cleanup used the existing native-process helper and unchanged **15-second shutdown deadline**. No Stream Jams process remained after the run. Temporary test data and generated package staging were confined to their existing isolated locations.
- One independent read-only review reported no remaining significant findings after regression-backed corrections for healthy-browser truncation, late sink starts, slow asset loading, restored mute propagation and an unhandled late asset-read rejection.
- Both `add-alert-audio-routing` and `add-windows-desktop-tray-runtime` passed strict OpenSpec validation. The routing task list now records 19/29 complete.

Key commands:

```powershell
corepack.cmd pnpm exec vitest run --project=node --pool=threads packages/core/src/audio packages/core/src/playback packages/core/src/tts apps/desktop/src apps/server/src/modules/audio apps/server/src/modules/assets/local-asset-store.test.ts apps/server/src/modules/playback/playback-coordinator.test.ts apps/server/src/modules/tts apps/server/src/http/routes/audio-outputs.test.ts apps/server/src/http/routes/playback.test.ts apps/server/src/http/routes/tts.test.ts apps/server/src/runtime/runtime-composition.test.ts
corepack.cmd pnpm exec vitest run --project=web --pool=threads apps/web/src/operator apps/web/src/overlay
corepack.cmd pnpm typecheck
corepack.cmd pnpm lint
corepack.cmd pnpm --filter @stream-jams/desktop build
corepack.cmd pnpm --filter @stream-jams/web build
node scripts/stage-desktop.mjs
node scripts/package-desktop.mjs
corepack.cmd pnpm exec playwright test --config playwright.desktop.config.ts tests/desktop/audio-routing.spec.ts --grep "packaged audio player is isolated"
```

## Remaining scope

This is the historical task-4 boundary. Tasks 5–6 subsequently continued in the [authoring and acceptance checkpoint](alert-audio-routing-authoring-acceptance.md); use that record and the OpenSpec task list for current completion and remaining manual gates.

Tasks 5–6 remain: named-route Settings and alert-wide authoring controls, destination-aware Send test, silent alert-video migration, restore/activity-race protection, user-facing diagnostics, final real-device and OBS checks, and final whole-feature gates. No management UI was changed in this slice; Storybook gates belong to the UI slice. Silent native playback does not prove physical output routing or OBS capture.

No user configuration, OBS/Wave Link settings or Windows audio defaults were changed. No audible tones were played. BL-044 remains separate and was not investigated. No commit, push, PR, merge, archive or main-spec synchronization was performed.
