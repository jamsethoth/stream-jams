# Full Forge streaming acceptance checkpoint

September 30, 2026. This adds full Forge/ASAR main-process, owned utility-process service and production-server evidence to the earlier staged-host checkpoint. All runs used disposable OS temporary configuration, asset storage and Electron profiles. Playback safety stayed muted, audio layers used zero gain, management stayed hidden during media checks, and the formats run suppressed native `show`/`showInactive` before any desktop surface was created. Its final assertion confirmed every native window remained hidden. No user installation, user database, private original, commit, push or PR was changed.

## Reproduction and successful gates

- `corepack pnpm desktop:package`: **exit 0**. Full workspace production build, stage of 171 runtime packages and Forge packaging; `apps/desktop/out/streaming-package.log`.
- `node openspec/changes/stream-local-media/packaged-streaming-acceptance.mjs`: **exit 0**. `apps/desktop/out/streaming-acceptance/results.json` and `apps/desktop/out/streaming-acceptance-runtime.log`.
- `node openspec/changes/stream-local-media/packaged-streaming-acceptance.mjs --formats`: **exit 0**. `apps/desktop/out/streaming-acceptance/formats.json` and `apps/desktop/out/streaming-formats-runtime.log`.
- `node --expose-gc openspec/changes/stream-local-media/server-memory-acceptance.mjs`: **exit 0**. Actual built server media service/store and SQLite repositories in a separate Node process; `apps/desktop/out/streaming-acceptance/server-memory.json` and `apps/desktop/out/streaming-server-memory.log`.
- `node node_modules/@playwright/test/cli.js test --config playwright.desktop.config.ts tests/desktop/video-audio.spec.ts tests/desktop/runtime.spec.ts`: both runtime cases passed in this initial four-case run. Its decoder cases failed on subsequently corrected harness requests; aggregate **exit 1**, so do not call this combined run green. Runtime evidence is `apps/desktop/out/streaming-desktop-tests.log`.
- `node node_modules/@playwright/test/cli.js test --config playwright.desktop.config.ts tests/desktop/video-audio.spec.ts`: **exit 0, 2 tests passed** after all decoder fixture corrections; `apps/desktop/out/streaming-decoder-final.log`. WebM and MP4, each with soundtrack and trackless fixture, retained native play, end, synchronized clocks, 320×180 dimensions and five-second seek assertions. Two layers sharing one asset also completed through the actual private selected-device soundtrack path.
- Final scoped ESLint and `node node_modules/typescript/bin/tsc -b tsconfig.json`: **exit 0**, empty successful `streaming-scoped-lint.log` and `streaming-combined-typecheck.log` under desktop output. Root owns final aggregate publication gates.

The tested package is `apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe`, with `resources/app.asar` SHA-256 **2e48f9e5c110eb9db902054692fb0b4caee12c13f2b0fbf451dad9a4e2c77870**. Runtime asserted `app.isPackaged === true` and an `app.asar` app path. Electron 44.4.4 / Chromium 152.0.7977.130 ran its normal Chromium sandbox; no `--no-sandbox` workaround was used. The shell Node benchmark reported v24.15.0. Windows sandbox GPU subprocess DLL failures were avoided by the previously authorized outside-sandbox launch, with ordinary renderer isolation preserved.

## Full production playback and seeking

| Fixture | Bytes | First / repeat observed start, ms | Native private seek, ms |
| --- | ---: | ---: | ---: |
| Controlled MP4 1 MiB | 1,048,576 | 426 / 377 | 7 / 6 |
| Controlled MP4 25 MiB | 26,214,400 | 370 / 372 | 7 / 6 |
| Controlled MP4 100 MiB | 104,857,600 | 882 / 891 | 7 / 7 |
| Original Clean Screen WebM | 36,178,585 | 367 | 809 |
| Original Snowball WebM | 59,790,021 | 383 | 1,650 |

The size controls append an MP4 `free` box to the same redistributable neutral AVC/AAC fixture. They vary stored/verified/transport size while retaining the same decoder workload; they are not representative 100 MiB content-complexity benchmarks. “First” means first preparation of that registered asset in this process; the OS file cache was not flushed. “Repeat” means another playback of the same asset. Observed starts include request handling, preparation, scheduling and polling, rather than measuring decoder preparation alone. Production timing logs separately reported native preparations **38/15, 13/13, 13/30, 24 and 47 ms**, and actual onset **9/11, 12/11, 12/1, 1 and 2 ms** after scheduled starts, respectively.

Every case used a real privately scoped audio URL, an explicitly enumerated sink, authoritative mute, zero element volume and no native error. All fixtures sought to `min(5, duration/2)` and asserted the final native clock within 150 ms of that valid interior target. Controlled MP4 targets were about 4.97 seconds. Snowball's duration was about 5.045 seconds; its earlier hard-coded five-second near-end seek timed out, so the harness now records duration and uses an interior target.

Native private responses were **206** with real `Content-Range` headers for all fixtures. The full package's captured private audio/overlay IPC contained neither whole-body `bytes` fields nor trusted server `med_` handles; the size/original run's maximum observed envelope was **1,067 bytes**. Successful skip detached native audio elements before the next case. Quit took **363 ms**, returned exit **0**, and every captured native PID exited. This establishes process shutdown, rather than claiming inaccessible internal production reader/grant counters were measured.

Original private files were incrementally hashed and read in place; the real import API created copies only in the disposable OS temporary asset store. No original bytes were copied into tracked files or the package. The ignored JSON includes hashes and public asset-independent measurements; it omits credentials and private capability URLs.

## Format evidence

- Actual private production audio decoded, started and sought **PCM WAV**, **MP3**, **Ogg Vorbis**, and **audio/webm Opus**. The audio/webm MIME test reuses the neutral WebM fixture, which also contains VP9 video; it does not establish an audio-only WebM fixture. Generated WAV was 288,044 bytes; WPT MP3 23,442 bytes; WPT Ogg 18,541 bytes; WebM 171,805 bytes. All remained muted with zero gain and explicit sink IDs.
- Actual hidden private desktop Timer icons decoded **PNG, JPEG, WebP and GIF**, confirmed native dimensions and `stream-jams-overlay://surface/media/private_` URLs, then removed on Timer stop. PNG/WebP generation included transparent regions; this establishes native decoding, not visible compositing pixels. GIF was a static one-pixel fixture, not an animation continuity test. Format Quit took **356 ms**, exit **0**, with all captured PIDs exited (exact timing is in `formats.json`).
- Silent packaged WebM/MP4 codec probes now use real registered, session-owned management preview grants in the hidden management renderer. They no longer send fixture bytes to a private evaluator or depend on private CSP permitting Blob. The malformed-media negative uses the management renderer's allowed local Blob-preview context, keeping decoder rejection separate from private CSP rejection. Actual private soundtrack and private seek evidence are separate gates above.
- An intermediate trackless production selected-device attempt failed both layer bindings with native **AbortError**, stage **device-bind**. Its isolated server logs explicitly recorded no automatic fallback and the test app exited normally. This is retained negative evidence, not a claim that selected-device trackless playback succeeded. The final native trackless codec/seek cases pass through silent preview grants without binding a soundtrack-free file to physical hardware. Intermediate profile: `C:/Users/James/AppData/Local/Temp/stream-jams-video-codec-ofBVki`.

WPT MP3/Ogg fixtures were retrieved from the upstream [MP3](https://raw.githubusercontent.com/web-platform-tests/wpt/master/media/sound_5.mp3) and [Ogg](https://raw.githubusercontent.com/web-platform-tests/wpt/master/media/sound_5.oga) URLs, with the upstream [BSD 3-Clause license](https://raw.githubusercontent.com/web-platform-tests/wpt/master/LICENSE.md) preserved in ignored `apps/desktop/out/streaming-acceptance/wpt/LICENSE.md`. Fixture hashes are in `formats.json`; no encoder was installed and no upstream fixture was committed.

## Memory and cleanup measurements

Full-package snapshots sampled main-process `process.memoryUsage()`, Electron metrics for the utility process and renderers, and renderer `performance.memory`. Sampled main external memory ranged **5,311,613–63,382,124 bytes**; main RSS **164,319,232–233,598,976 bytes**; renderer JavaScript heap **6,735,184–17,395,551 bytes**. These are observations at before/seek/released checkpoints, not continuous peaks. Utility-process working set included import allocations and garbage-collection timing; it cannot isolate playback allocation or expose worker Node external memory.

The standalone built-server benchmark isolates incremental integrity verification and a 4,096-byte interval read from native decoding. It samples memory every millisecond and performs GC before each measured verification when available:

| Size | Verification first / repeat, ms | Sampled external peak first / repeat, bytes |
| --- | ---: | ---: |
| 1 MiB | 7.7 / 4.7 | 3,438,750 / 3,444,278 |
| 25 MiB | 52.7 / 43.4 | 17,969,102 / 26,054,630 |
| 100 MiB | 163.4 / 162.0 | 49,649,849 / 41,235,841 |

Each interval returned exactly **4,096 bytes**, and each terminal row reported **owners 0, grants 0, service readers 0, store readers 0**. Verification uses the actual 64 KiB incremental production reader; transient external allocations still vary with garbage collection. Neither these results nor small IPC envelopes prove constant total process memory: Electron/Chromium transport and native decoder buffering are separate costs. Packaged utility-process external memory remains unmeasured; the separate process benchmark is explicitly scoped.

## Remaining exact acceptance gaps

- Physical audible selected-device and two-device routing/aliases, amplification/fades, OBS/browser-source coexistence and visible transparent video/image compositing remain manual. No unexpected sound or desktop overlay was emitted by these checks.
- MP4 fixtures used beginning metadata / fragmented indexing. A redistributable **end-metadata MP4** has not been exercised. A valid unsupported-codec fixture and animated-GIF frame continuity have not been exercised; malformed decoder rejection is a separate narrower negative.
- Full-package simultaneous/transient private video visuals are supported by earlier staged-host evidence, but this full Forge run exercised original videos through private audio and images through private Timer icons. It does not replace visible transparent-video/OBS acceptance.
- “Cold” OS-cache preparation and continuous native decoder memory are unmeasured. Full-package active-reader/grant counters are not exposed; native teardown, bounded Quit and standalone production service counts supply distinct cleanup evidence.

Do not mark the whole OpenSpec change or these physical/fixture gates complete from this checkpoint. Root must reconcile the remaining requirements and aggregate verification before publication or canonical spec sync.
