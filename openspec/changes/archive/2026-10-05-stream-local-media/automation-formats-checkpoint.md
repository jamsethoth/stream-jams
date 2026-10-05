# Durable format and compositing automation

September 30, 2026. `tests/desktop/media-streaming-formats.spec.ts` adds repeatable packaged-runtime coverage with small tracked fixtures and provenance. It uses the existing production Forge/ASAR package, disposable configuration/storage/Electron profiles, real registered preview grants and real private desktop media URLs. Management is hidden before playback; native overlay `show` and `showInactive` are suppressed before creating any overlay. Every media element is muted, selected-device layers have zero gain, and final native window/process checks run during normal Quit. No production source, installed application, user database or private original media changed. No encoder was installed.

## Verified commands

| Command | Result | Retained evidence under `apps/desktop/out/streaming-automation-formats/` |
| --- | --- | --- |
| `node node_modules/@playwright/test/cli.js test --config playwright.desktop.config.ts tests/desktop/media-streaming-formats.spec.ts` | **5 passed, exit 0**, 6.0 s | `software-final.log`, `software-results.json` |
| `node node_modules/@playwright/test/cli.js test --config playwright.hardware.config.ts tests/desktop/media-streaming-formats.spec.ts` | **1 passed, exit 0**, 4.7 s | `hardware-final.log`, `hardware-results.json` |
| `node node_modules/typescript/bin/tsc -b tests/desktop` | **exit 0** | `typecheck.log` |
| `node node_modules/eslint/bin/eslint.js tests/desktop/media-streaming-formats.spec.ts` | **exit 0** | `lint.log` |

The default command lists five software cases and has no explicit audio-device prerequisite. The single selected-device case is marked `@hardware`; only it enumerates an available output, creates an explicit route and obtains the audio player. Missing output hardware fails that optional hardware gate rather than silently skipping or breaking all software format coverage. Package scripts include the file in the hardware command.

Native launches ran outside the filesystem sandbox because the normal sandbox blocks GPU subprocess dependencies on this machine. Chromium's regular sandbox remains enabled; no `--no-sandbox` argument or CSP relaxation was used. Runtime assertions confirmed `app.isPackaged`, an `app.asar` path, Electron 44.4.4 and Chromium 152.0.7977.130. Both runs used package SHA-256 `2e48f9e5c110eb9db902054692fb0b4caee12c13f2b0fbf451dad9a4e2c77870`, exited normally with code 0, confirmed all captured native PIDs exited, and reported no cleanup failures.

## What each test catches

- **Progressive end-metadata MP4:** the derived 173,934-byte AVC/AAC fixture contains `ftyp`, original `mdat`, then conventional sample-indexed `moov`; it has no `moof`. The native preview reports 320 x 180 and 9.934542 seconds and seeks to 4.967271 seconds. The optional private selected-device case independently seeks to the same midpoint. This catches dependence on faststart/fragmented indexing and broken end-index range delivery.
- **Valid unsupported ADPCM codec:** a structurally valid Microsoft ADPCM WAVE imports successfully and receives exact original bytes through a real registered preview grant. The native decoder returns error code 4 in about 4.3 ms and records zero CSP violations. This catches unbounded codec failure or a negative test that merely corrupts a container or violates private CSP. The fixture's validity/provenance is distinct from the existing malformed-byte negative.
- **Audio-only Opus WebM:** a 982-byte authored native MediaRecorder fixture decodes in a video element with both video dimensions zero and native duration 2.879961 seconds. Normal preview and optional selected-device private playback seek to one second. This closes the prior audio/webm test's accidental reuse of a VP9 video fixture.
- **Animated private Timer GIF:** actual hidden native compositor snapshots of the streamed Timer image show both red and blue frames and at least four changes. A static image, stopped animation or restarted element that never advances fails. Native screenshot RGB includes display color conversion; the test requires strongly red/blue opaque frames rather than exact sRGB channel values. Native canvas `drawImage` would use a GIF's default frame, so it is not used to infer animation continuity.
- **Transparent private Timer PNG:** the streamed native image retains exact transparent `[0,0,0,0]` and opaque red `[255,0,0,255]` pixels. Destination-over green produces exactly `[0,255,0,255]` through the transparent half. This catches alpha loss during registered/private delivery and decoding.
- **Two private transient VP9-alpha videos:** two distinct production video elements consume real private URLs, remain muted, decode concurrently and have clocks within 150 ms. The pinned Chromium fixture uses partial alpha: the observed 320 x 240 frame has 76,800 pixels with alpha 68, rather than binary zero/full alpha. A decoded `[71,71,71,68]` pixel becomes `[19,206,19,255]` over green, matching source-over math within one channel value of quantization. Skip detaches both native elements. This catches opaque transport/decoding, loss of concurrent layer identity and leftover playback after skip.

Tracked fixtures and the upstream BSD license are documented in `tests/fixtures/media/media-streaming-provenance.md`. The upstream VP9-alpha clip is pinned to Chromium commit `93f03265ed42c6f22e7b17c0f3502ed980e41251`; no custom remuxer remains as ongoing application/test maintenance. The derived MP4 sample tables and native seek validation are preserved as the static fixture and acceptance test.

Early harness failures are retained in ignored output and were corrected without changing production behavior or reducing the required frame-change, seek, mute, alpha or teardown guarantees. They are not counted as successful suite runs.

## Exact remaining limits

This closes the end-metadata fixture, valid unsupported-codec, animated-GIF continuity, audio-only WebM, private transient video and renderer pixel/compositing automation gaps. The video and PNG alpha assertions run in native renderer canvases; GIF continuity uses actual hidden compositor capture. These checks do **not** establish visible Windows/OBS compositor coexistence or physical audible output/device aliases, amplification/fades or two-device audible routing. Those remain explicitly separate manual acceptance gates. Cold OS-cache/continuous decoder memory and full-package reader/grant counters remain outside this format suite. Root owns aggregate verification and OpenSpec task reconciliation.
