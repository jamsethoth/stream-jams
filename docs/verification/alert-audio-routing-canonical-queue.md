# Alert audio routing: canonical resolution and queue checkpoint

Implementation checkpoint: September 6, 2026. Scope: `add-alert-audio-routing` tasks 3.1–3.4, following the [contracts and persistence foundation](alert-audio-routing-foundation.md). This is a local implementation checkpoint, not packaged audio or full-feature acceptance.

## Implemented behavior

- `resolveAlertAudio` normalizes visible explicit audio layers from one selected document. It retains document/layer identity, duration, volume and alert-wide output choices. It does not choose variations or consult visual-profile readiness. Live intake enforces matching and document enablement; normalization itself remains usable for explicitly selected drafts.
- The coordinator resolves this canonical content before expanding browser targets. Device batches are included only for configured device routes. Multiple ready profiles, no ready profiles and no connected OBS clients do not multiply or suppress device audio. Separate layers referencing the same asset remain separate.
- Browser Source opt-out is honored on profile and legacy outputs. Legacy visuals and TTS remain unchanged, while legacy explicit audio follows visible editor layers and their volumes instead of stale flattened variant audio. TTS routing and silent alert-video migration remain outside this slice.
- Queue contracts accept audio-only work and normalize omitted audio to an empty array. Admission and exposed snapshots defensively clone content. Replay retains original content and route IDs and assigns a new occurrence ID.
- `AudioOutputService.preparePlayback` synchronously captures current route bindings at occurrence start, before asynchronous device enumeration. Queued work has not yet captured bindings; replay captures them again. Rebinding cannot redirect the active occurrence. Missing/deleted/unbound routes have no fallback, and aliases of the same device share a destination without deduplicating layers.
- Runtime composition accepts an optional `AudioPlaybackSink`. A silent test backend verifies this injection; the production Electron adapter is still task 4. CLI operation does not gain an implicit/default-device backend.

## Safety plumbing pulled forward from task 4

Binding-at-start integration needs an actual start/completion boundary. The coordinator now registers pending device preparation before browser dispatch, waits independently for device and browser completion, waits for all audio documents after a sibling fails, and cancels pending preparation on Skip or Close. Skip waits for the sink's stop acknowledgement before advancing; a rejected stop leaves the occurrence blocked for explicit retry. Mute updates reach the optional sink, and pending preparation reads current mute before playback. Close awaits sink shutdown without advancing the queue.

A regression also reproduced an existing intake/shutdown race: `enqueueEvent` checked shutdown only before asynchronous document and asset resolution, allowing it to enqueue after Close. A final shutdown recheck before synchronous resolution/admission fixes that race. This is not evidence about BL-044 or Windows native process-exit behavior.

Task 4 remains unchecked: validated worker/main/preload transport, browser register-before-dispatch and generation-aware acknowledgements, loading/duration/stop watchdogs, renderer destruction/recovery, service-loss leases and packaged safety verification are not completed by this server-side plumbing. Sink promises must represent terminal silence, including rejected playback and successful Close, rather than merely media start.

## Fresh verification

- Core/server regression batch: **217 tests in 26 files passed**.
- Operator/overlay regression batch: **55 tests in seven files passed**.
- Chromium overlay playback: **four tests passed**.
- TypeScript build/typecheck for core, server, web and desktop: passed.
- Web production build: passed; existing greater-than-500-kB chunk advisory remains non-blocking.
- ESLint on affected implementation/contracts/fixtures: passed.
- Both audio-routing and desktop-tray OpenSpec changes: strict validation passed.
- One independent, read-only code review found no significant issues in this slice. Its assessment does not claim full-feature readiness.

```powershell
corepack.cmd pnpm exec vitest run --project=node --pool=threads packages/core/src/audio packages/core/src/playback packages/core/src/alerts packages/core/src/tts apps/server/src/modules/audio apps/server/src/modules/playback apps/server/src/modules/tts apps/server/src/modules/events apps/server/src/runtime/runtime-composition.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts apps/server/src/app.test.ts
corepack.cmd pnpm exec vitest run --project=web --pool=threads apps/web/src/operator apps/web/src/overlay
corepack.cmd pnpm exec tsc -b packages/core/tsconfig.json apps/server/tsconfig.json apps/web/tsconfig.json apps/desktop/tsconfig.json --pretty false
corepack.cmd pnpm --filter @stream-jams/web build
corepack.cmd pnpm exec playwright test tests/e2e/overlay-playback.spec.ts --project=chromium --workers=1
openspec.cmd validate add-alert-audio-routing --strict
openspec.cmd validate add-windows-desktop-tray-runtime --strict
```

Regression-first checks initially failed on absent canonical audio, audio-only admission/replay, Browser Source opt-out, legacy layer volume, playback preparation and runtime sink wiring. They pass after implementation. The shutdown-race regression also failed before its guard was added. Strict typing found three old queue fixtures missing normalized audio; those fixtures were updated without weakening compiler settings or assertions.

The isolated real-loopback runtime test checks health and protected route CRUD/test behavior, creates an explicitly bound route, delivers an audio-only occurrence to a silent fake sink with no OBS client, checks completion and sink shutdown, then restarts without a backend and verifies the binding remains saved but unavailable. It uses temporary data and cleans up after closing. The existing Chromium tests cover live/profile/unified overlay consumers, not physical audio routing.

## Remaining scope and UX boundary

Frontend guidance reviewed: MVP UX **Product Surfaces / Operator Console**, **Cross-Cutting UX Rules**, **Alerts Module / Browser Sources**, and **Alert Editor / Target Profiles**. The only web edits in this slice add `audio: []` to two typed operator test/story fixtures. No React markup, controls, keyboard behavior, visual state or accessibility behavior changed. The approved audio-routing follow-on extends the historical Browser Source-only MVP boundary. Full Storybook gates are deferred to the actual UI slice; targeted operator/overlay unit tests and existing Chromium overlay regressions passed here.

Production Electron playback/transport, destination-aware Settings/editor/Send test, mute/stop/crash watchdog acceptance, restore-during-device-playback protection, diagnostic correction links, and final real-device/OBS tests remain tasks 4–6. No live user data, OBS/Wave Link settings or Windows audio defaults were changed, and no tones were played. BL-044 remains in its separate investigation. No commit, push, PR, merge, archive or main-spec synchronization was performed.
