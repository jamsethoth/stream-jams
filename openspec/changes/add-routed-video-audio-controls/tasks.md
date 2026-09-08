## 1. Baseline and decoder/timing gate

- [ ] 1.1 Fetch and branch from current `origin/main`, confirm merged audio routing and unimplemented slice scope, and read this design plus all deltas. Preserve the independent video-shoutout proposal.
- [ ] 1.2 Add tiny neutral local video fixtures with audio/visual markers and a trackless case. Probe the existing desktop player and OBS without extraction; document supported containers/codecs, byte limits, onset skew/drift and failures in `docs/verification/routed-video-audio.md`.
- [ ] 1.3 Verify the 150 ms local timing target and existing background/Quit behavior before broad UI work. A failing endpoint/codec remains an explicit backend decision; do not add decoders/drivers or silent fallback implicitly.

## 2. Documents and normalized media audio

- [ ] 2.1 Locate the authoritative video-layer/document schema and migrations; add failing legacy-versus-new-layer cases and implement versioned `playEmbeddedAudio`/`audioVolume` with false legacy migration, true construction default and 0–1 volume validation.
- [ ] 2.2 Cover defaults/variations, duplication, backup/import/restore, round-trip persistence, Undo/Redo and theme behavior; preserve explicit sound and output fields without enabling old soundtracks during parsing.
- [ ] 2.3 Add shared normalized audio source-kind/timing contracts in `packages/core/src/audio` and update `resolve-alert-audio.ts`; test toggles, hidden sounds, distinct same-asset layers and one resolution before visual expansion.
- [ ] 2.4 Test Browser Source-only, device-only, combined and empty destinations for video audio, retaining an alert-compatible resolver wrapper and unchanged TTS routing.

## 3. Playback transport and safety

- [ ] 3.1 Extend core audio transport validation and `DesktopAudioSink` to the verified local video MIME set, preserving 25 MiB per asset, 100 MiB per batch, bounded reads and 5-second preparation. Test changed/missing/oversized/unauthorized assets.
- [ ] 3.2 Extend desktop player and browser rendering with a common start epoch, deadline and offset; test ready, late-seek, unseekable, ended, trackless, unsupported-codec and never-ready cases.
- [ ] 3.3 Keep all visual video elements internally muted in live/preview/test; emit soundtrack instructions only when enabled. Test that multiple profiles and desktop expansion do not multiply device soundtracks.
- [ ] 3.4 Test and implement global mute/unmute, cancellation during preparation, duration-plus-5-second expiry, stale generations and the existing 2-second stop/destruction silence boundary for video audio.
- [ ] 3.5 Verify binding snapshots, alias deduplication, missing-device no-fallback behavior and partial browser/device failure without holding healthy recipients or losing independent visual/sound completion.

## 4. In-editor controls and browser coverage

- [ ] 4.1 Add reusable soundtrack toggle, bounded volume and nonblocking multiple-source notice inside the Alert inspector. Retain `AlertAudioOutputs.tsx` item-wide destinations and named routes in Audio settings; add no Shared audio navigation page.
- [ ] 4.2 Test separate-sound edits without implicit video-toggle changes, explicit Save/live-impact confirmation, route validation, keyboard focus, Undo/Redo and legacy guidance.
- [ ] 4.3 Add Storybook production stories for new/legacy video, both sources, no destinations, unavailable devices and save errors; add Playwright persistence/source-independence/migration/output-choice coverage with safe fixtures.

## 5. Acceptance and reconciliation

- [ ] 5.1 Run affected regressions and the repository's `corepack.cmd pnpm` lint, typecheck, test, build, build-storybook, test:storybook:ci, test:e2e and test:desktop scripts; report non-passing gates precisely.
- [ ] 5.2 Rebuild and verify the live Windows/OBS workflow using two distinct explicit physical device destinations, hidden management, mute/skip and no unintended doubles; record marker timing and distinguish physical acceptance from silent-sink tests.
- [ ] 5.3 Reconcile every new/modified requirement, verify legacy alerts remain silent, update setup warnings/runbook and run `openspec.cmd validate add-routed-video-audio-controls --strict`. Sync specs only with completed implementation and leave TTS/video-shoutout/distribution scope unchanged.
