# Camera Effects Feasibility (BL-068)

Dated record and slice spec for the camera effects feasibility gate. The design and the decisions it tests are in the camera effects module research record (`docs/design/2026-10-29-camera-effects-module-research.md`, sections "Module Decisions" and "Proposed Feasibility Gate"). The gate comes before the OpenSpec proposal, as the Videos mirror did ([video mirror feasibility](video-mirror-feasibility.md)).

The check is built into the desktop app as a diagnostic mode, `--camera-effects-check`. It runs instead of the normal app, with GPU acceleration on and its own temporary profile (`%TEMP%\stream-jams-camera-effects-check`). It changes no Stream Jams settings and serves its pages on `127.0.0.1` only, under a random per-run token in the URL path.

## What The Check Does

This is the slice spec. Code: `apps/desktop/src/camera-effects-check/`.

1. **Cameras and formats.** Lists cameras, then probes the chosen one: Chromium reports capability ranges, so a format is *advertised* when it fits them and *native* only when the camera accepts it with resizing off (`resizeMode: "none"`). Formats: 1080p30, 1440p30, 2160p30 and 720p30. Probing closes the camera. Mirror image is optional and applies before tracking.
2. **Background.** *Keep the camera picture* passes the camera's own alpha through, which answers whether NVIDIA Broadcast's transparency survives `getUserMedia` (`cameraAlpha` samples it every 2 seconds). *Key colour* keys a chosen colour in the YCbCr chroma plane with a tolerance. *MediaPipe selfie segmentation* uses the selfie segmenter on the GPU. Keying runs before any warp, so warps move the person and the matte together.
3. **Tracking.** MediaPipe Face Landmarker (`@mediapipe/tasks-vision`) with the GPU delegate, blendshapes on and one face, on a 640-pixel-wide copy of each frame. Eye anchors are smoothed with the One Euro filter (`1eurofilter`) and scale with face width. When the face is lost, eye effects hold for 0.5 s and fade over 0.5 s. If the GPU delegate fails, tracking falls back to the CPU and the results say so (`tracking.delegate`).
4. **Effects** (PixiJS v8 and `pixi-filters`, each toggleable): bulge on both eyes (`BulgePinchFilter`), glitch across the frame (`GlitchFilter`), and big eyes as a 96 × 54 mesh warp around the eye anchors.
5. **Outputs.** The processed canvas is published over loopback WebRTC to every receiver, with the Videos mirror's contract: core signal schemas, host-only ICE, one encode per receiver capped to the size it asks for, and the core mirror receiver with its reconnects. Receivers are the OBS browser source page and a transparent, frameless desktop window. Each composes a 1920 × 1080 scene and places the camera with the current layout (position and size, picture fitted inside). Layout changes reach receivers by polling and never reconnect. With **Pack the alpha matte**, the frame carries the matte at half resolution below the picture, and the receiver's shader recombines them, so the page renders transparent. Codec preference (H.264 by default, VP8, VP9 or AV1) applies on the next connection.
6. **Measurements.** Output delay from a timestamp strip the pipeline stamps on each frame (hidden in the matte row when packed). Glass-to-OBS delay from a timing screen the camera films (see below). Frame rate per receiver, encoder and codec from `getStats`, CPU and memory over app processes, and whole-GPU use from `nvidia-smi` (the Windows GPU Engine counters took 13 to 15 s per read, so they timed out in every earlier run). Per-stage counters and a time series per run locate where frames are lost; see the [second run](#second-run-locating-the-frame-loss).
7. **GPU gate.** The check waits for the GPU process, then refuses to run, with the reason, unless Chromium reports hardware WebGL and GPU compositing and the pipeline's own WebGL2 renderer is not a software one.

Boundary rules: every page request needs the token path; static files are an allowlist built from the bundled `app` folder; reports, commands and signals are parsed with zod (signals with the core mirror schemas) before they are used; pipeline results returned to the main process are parsed too.

Everything runs offline. PixiJS, MediaPipe and the One Euro filter are bundled into the check's pages at build time; MediaPipe's WASM runtime comes from the pinned npm package; the two models are committed under `apps/desktop/assets/camera-effects-check/` with their source URL and SHA-256 in `models.json`. The build refuses to package a model that does not match its digest, and a unit test checks the same.

## How To Run It On Windows

1. From the latest CI run on PR #200, download the portable artifact the `windows-desktop-package` job uploads (`stream-jams-windows-x64-200-…`, not the installer) and unzip it.
2. Close the production OBS. It holds the camera, and the check must not compete with it (BL-103 makes the check refuse while production OBS runs). The installed Stream Jams can stay open: the check uses its own temporary profile and never reads or writes Stream Jams data. Start the dev OBS (`C:\StreamJamsDev\obs\Start Dev OBS.cmd`) for the OBS parts; its own camera sources are disabled.
3. In PowerShell, from the unzipped folder, run `& ".\Stream Jams.exe" --camera-effects-check`. Two windows open: the control window and the pipeline window (camera on the left, processed output on the right). If the control window says **Blocked**, copy the results and stop there.
4. **Physical camera first.**
   1. Press **List cameras**, pick the physical camera, press **Probe formats**.
   2. Pick **1080p30**, tick **Face tracking**, and press **Open camera**.
   3. In the **dev OBS** (title "Portable Mode - Profile: StreamJamsDev"), add a **Browser Source** at 1920 × 1080 with the URL the window shows (**Copy URL**). Press **Open desktop overlay receiver** too. "OBS" in the steps below means the dev OBS.
   4. Tick **Bulge on both eyes**, then **Big eyes**, then **Glitch**, one at a time. Move your head normally and watch whether the effects stay on your eyes.
   5. Try the layout buttons. The camera should move in OBS and the desktop window without a reconnect.
   6. Let each setting run for at least a minute before reading numbers: WebRTC raises its bitrate gradually after each connection.
   7. Repeat with **1440p30** and **2160p30** if the probe marked them native. For 4K, also try **Receiver encode size: Camera size** (copy the URL again into a second browser source).
5. **Glass-to-OBS delay.** This needs the camera to face a monitor head-on; if it cannot, the grid gets no samples (see the 2026-11-05 results for a clock-based alternative). Untick the effects. Press **Open the timing screen**, put it on a monitor the camera can see, press F11, and aim the camera so the grid fills the dashed box in the pipeline window. The OBS source's status line shows `glass … ms` when it reads the grid. Hold it for about 30 seconds. The figure includes the monitor's own delay of one or two frames.
6. **NVIDIA Broadcast.**
   1. Close the check first if Broadcast says the camera device is in use: the check and Broadcast cannot share the webcam, so start the check again after Broadcast has the camera. In NVIDIA Broadcast, turn on **Background removal** for the camera. In the check, pick the NVIDIA Broadcast camera, open it with **Keep the camera picture**, and look at `cameraAlpha` in the results and at the desktop window. Tick whether the transparency survived.
   2. In Broadcast, switch to **Background replacement** with a solid green image. In the check, choose **Key colour**, set the colour, adjust the tolerance, and tick **Pack the alpha matte**. With the matte packed, the pipeline window shows the matte in grey below the picture.
   3. Switch to **MediaPipe selfie segmentation** on the physical camera (Broadcast off) and compare its matte with Broadcast's on hair, hands and chair edges. Write what you saw in the text boxes.
   4. Check that OBS shows the camera transparent around you with the matte packed, and opaque without it.
7. **With a game.** Choose **With a game running**, name the game, start it, and repeat steps 4.2 to 4.6 at 1080p30 with the matte packed and all three effects on. Results for idle and game runs are kept apart.
8. Tick what you saw, press **Copy results** and paste them in the thread.
9. Put NVIDIA Broadcast's effects back to your streaming settings, close the check and the dev OBS, then reopen the production OBS.

## Second Run: Locating The Frame Loss

The [performance research](../design/2026-11-05-camera-tracking-performance-research.md#measurement-plan) explains this plan and [what each result points to](../design/2026-11-05-camera-tracking-performance-research.md#what-the-results-mean). Use 1080p30 and the webcam unless a step says otherwise. Before starting, follow steps 1 to 3 above and point the dev OBS at a clean scene collection with only the check's browser source.

The **Performance experiments** defaults reproduce the 2026-11-05 run. For each step, set **Experiment name** first, so the step gets its own run. Hold each step for 70 seconds and use the last 30. Keep a setting for later steps if it helped, and turn it back if it hurt. These settings do not reconnect the receivers. Packing the matte does, which restarts WebRTC's bitrate ramp.

| Step | Experiment name | Setup |
| --- | --- | --- |
| 1 | baseline | Bulge, big eyes and glitch on, OBS and desktop receivers |
| 2 | one receiver | Close the desktop receiver; reopen it afterwards |
| 3 | capture paint | **Canvas capture**: every paint |
| 4 | light tracking | **Blendshapes** off; **Tracking input**: 640-wide canvas |
| 5 | track every 2 | **Track every** 2 frames. The maintainer moves their head and rates drift |
| 6 | segmenter | MediaPipe segmentation, matte packed |
| 7 | segment every 2 | **Segment every** 2 frames; raise the encoder caps. The maintainer rates the matte's edges |
| 8 | game | **With a game running**, effects on, plain, two receivers. Allow a minute after the game starts |
| 9 | game one receiver | Close the desktop receiver; reopen it afterwards |
| 10 | game obs 60 | Dev OBS browser source: **Use custom frame rate** at 60 |
| 11 | game segmenter | MediaPipe segmentation, matte packed |
| 12 | broadcast tracking off, broadcast tracking on | If time allows: reopen the check with the NVIDIA Broadcast camera, with **Face tracking** off and then on |

At the end, press **Record a 10-second trace** on the worst step. It is heavy and saves to the temp folder, and the file holds the run's page URLs. If time remains, close the check and film the running clock through the same camera directly in the dev OBS, for the delay baseline.

To analyse a step, difference the counters between samples in `series`. Compare processed frames, then `source.frames`, `framesEncoded`, `framesDecoded` and `presentedFrames`: the first large gap is where frames are lost. Check `targetBitrate` too, because raising the cap does not by itself raise the rate WebRTC targets.

## What The Results Mean

Measurements are grouped under `runs`, one per camera, format, packed or plain, and idle or game (`"<camera> 1920x1080 packed idle"`).

| Field | Gate question |
| --- | --- |
| `gpu.blocked`, `gpu.featureStatus`, `gpu.renderer` | GPU acceleration is on and WebGL2 runs on the real GPU. A blocked check never runs in software. |
| `cameras.<label>.presets` | Which formats the camera advertises and opens natively (`native: true`), and the frame rate it actually delivers. |
| `opened[].alphaSurvives`, `runs.*.pipeline.cameraAlpha` | Whether alpha from NVIDIA Broadcast survives into Chromium. Decides key colour, MediaPipe segmentation or OBS-side removal. |
| `runs.*.pipeline.cameraFps`, `cameraTrack`, `processedFps`, `skippedFrames` | The pipeline keeps up with the camera at 30 fps. `cameraFps` and `cameraTrack` come from the camera track's own counters, so they show the source's real rate. In runs before 2026-11-07, `cameraFps` only counted frame callbacks. `skippedFrames` counts camera frames not processed since the camera opened, including about 2 s while models load. |
| `runs.*.pipeline.tracking.medianMs`, `p95Ms`, `delegate`, `blendshapes` | Tracking under 15 ms per frame on the GPU, with blendshapes on (52 when a face is seen). |
| `runs.*.pipeline.segmentation` | MediaPipe segmentation time per frame; `personPercent` is how much of the picture the matte keeps. |
| `runs.*.pipeline.frameMs` | Whole-frame time in the pipeline (tracking, segmentation, effects and drawing); must stay under 33 ms. |
| `runs.*.publisher[].codec`, `encoder`, `powerEfficient` | Whether Chromium used a hardware encoder (for example `MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)`, `powerEfficient: true`). |
| `runs.*.publisher[].width`, `height`, `qualityLimitation` | The encode size each receiver gets, and whether bandwidth or CPU held it back. A packed 1080p frame is 1920 × 1620; at 4K it is 3840 × 3240. |
| `runs.*.receivers.<id>.fps`, `presentedFps`, `userAgent` | Frame rate at each receiver; `userAgent: obs` is the OBS source. |
| `runs.*.receivers.<id>.outputDelay` | Delay from the processed frame to the receiver (encode, transport, decode). |
| `runs.*.receivers.<id>.glassDelay` | Glass-to-OBS delay from the timing screen: camera capture, processing and the output path. |
| `runs.*.receivers.<id>.packed`, `reconnects` | The receiver recombined a packed frame; layout changes caused no reconnects. |
| `runs.*.pipeline.stages`, `eventLoopLag`, `gpuFence` | Main-thread time per stage, how late a 50 ms timer fires (main-thread blocking), and submission to completion of a frame's GPU work (GPU contention). |
| `runs.*.publisher[].source`, `counters`, `limitedSeconds` | Canvas capture's output before the encoder, and cumulative encoder and send counters. |
| `runs.*.receivers.<id>.counters`, `presentedFrames`, `presentedGaps` | Cumulative receive, decode, jitter buffer and presentation counters. |
| `runs.*.metrics` | CPU and memory over app processes, and whole-GPU use (`average`, `peak`), idle and with a game. |
| `series.<run>` | Every report of a run over time, bounded to 400 per run. Only **Copy results** and `/results/full` carry it. |
| `manual` | What the maintainer saw: transparency in OBS and the desktop window, Broadcast alpha, effect drift, matte quality notes. |
| `errors` | Anything that failed, including a WebRTC connection that failed for a frame size and codec. |

## Pass Criteria

From the research record:

- 30 fps sustained at each receiver.
- Tracking under 15 ms per frame on the maintainer's GPU.
- Glass-to-OBS delay under 150 ms.
- No visible effect drift during normal head movement.

If the delay fails while everything else passes, the next step is a Spout2 or virtual camera spike, not abandoning the pipeline.

## Results

### 2026-11-07: Second-run instrumentation, fake camera (not the gate)

Every new toggle was exercised through the control API with Chromium's fake camera and one desktop receiver, for about 14 seconds each: no errors, no reconnects, and all new counters reported values. The fake camera runs at 20 fps and shows no face, so this does not measure performance or show what the blendshape, tracking interval and video input settings do with a real face.

### 2026-11-05: Real hardware run (the gate)

Windows 10.0.26200, NVIDIA GeForce RTX 4070 Ti SUPER, OBSBOT Meet 2 webcam, NVIDIA Broadcast, dev OBS 33.0.1 (production OBS closed), Control (DX12, borderless). An agent drove the check through its local API while the maintainer sat on camera, switched NVIDIA Broadcast modes and played the game. Both receivers (dev OBS browser source and desktop window) were connected throughout, each with its own encode. All encodes used `MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)`, and tracking used the GPU delegate. Numbers are the check's rolling figures after about a minute on each setting.

| Setup (1080p30 unless noted) | Processed fps | Tracking median / p95 (ms) | Segmentation (ms) | Fps at receivers | Output delay (ms) |
| --- | --- | --- | --- | --- | --- |
| Webcam, no effects | 29.6 | 14.2 / 23.1 | - | 29, 29 | 108, 109 |
| Webcam, bulge + big eyes + glitch | 30.2 | 13.9 / 20.2 | - | 27, 27 | 103, 111 |
| Webcam at 2160p30, all effects, receivers capped to 1080p | 30.8 | 14.8 / 29.5 | - | 22, 24 | 146, 159 |
| Webcam at 2160p30, OBS receiver at camera size | 29.8 | 15.1 / 45.1 | - | 18, 18-21 | 136-205 |
| Webcam, MediaPipe segmentation, matte packed, all effects | 20.7 | 25.9 / 36.9 | 13.5 | 10, 11 | 269, 270 |
| NVIDIA Broadcast camera, background removal | 21.1 | 34.6 / 51.1 | - | 13, 13 | 237, 238 |
| NVIDIA Broadcast camera, green replacement, key colour, matte packed | 22.8 | 33.0 / 57.6 | - | 14, 14 | 236, 303 |
| Webcam, all effects, Control in gameplay | 29.8 | 18.6 / 28.2 | - | 18, 20 | 186, 324 |
| Webcam, MediaPipe, matte packed, all effects, Control in gameplay | 17.6 | 29.2 / 46.3 | 16.8 | 10, 11 | 261, 322 |

**Against the pass criteria:**

- **30 fps at each receiver: not met overall.** Webcam only reaches 27 to 29 fps with effects. MediaPipe segmentation, NVIDIA Broadcast and a game each cut it to 10 to 20 fps.
- **Tracking under 15 ms: met only without other GPU work** (about 14 ms). It rises to 18.6 ms with the game, about 26 ms beside the segmenter and about 34 ms with Broadcast. Together, tracking and segmentation exceed the 33 ms frame budget.
- **Glass-to-OBS under 150 ms: not met, by a small margin and with a rough measurement.** About 180 ms (±30). The camera cannot face any monitor here, so the grid reader had no samples (`glassDelay` is empty). Instead, four desktop screenshots each captured a running 10 ms clock and the camera's view of it at an angle. Differences from the live clock: pipeline window 130, 120, 130, 160 ms; dev OBS preview about 170, 100, 230, 190 ms; desktop receiver 230, 180, 200, 180 ms. These figures include the monitor's delay. About 130 ms exists before the pipeline does any work, so the output path adds about 50 ms. The same camera's delay through OBS's own capture was not measured for comparison.
- **No effect drift: met.** The maintainer saw bulge and big eyes stay on their eyes during normal head movement.

**Other results:**

- **Camera formats:** the OBSBOT opens 720p30, 1080p30 and 2160p30 natively. 1440p30 fails with `OverconstrainedError`. At camera size, one 3840 × 2160 H.264 connection failed and the encode fell back to 2560 × 1440 limited by bandwidth, so 4K output is not viable.
- **NVIDIA Broadcast alpha does not survive** (`cameraAlpha: false`, `alphaSurvives: false`). Background removal arrives as the person on opaque black.
- **Transparency:** a packed matte renders transparent in the dev OBS and the desktop window. Key colour on Broadcast's green replacement is clean apart from a green fringe at the edges, and Broadcast keeps the chair. The MediaPipe matte is rough: blocky edges, the chair kept and background patches leaking through. The maintainer rated Broadcast's cut-out clearly better. Broadcast's cost is high, because it loads the same GPU.
- **Layouts:** moving the camera on the scene caused no reconnects.
- The camera device is exclusive between the check and NVIDIA Broadcast: Broadcast reports "camera device in use" while the check holds the webcam.

**Bugs this run found, fixed on this branch and verified with Chromium's fake camera:**

- **List cameras failed outside the fake-UI flag.** The permission check compared origins exactly, and enumeration then returned blank device IDs. The fake-camera baseline hid this, because its flag skips the check. The real-hardware run above used `--use-fake-ui-for-media-stream` with the real camera to get past it, which does not affect the measurements. Fixed with `isCheckOrigin`.
- **Reopening a camera broke tracking for good.** The old `requestVideoFrameCallback` chain kept running beside the new one (camera reads 60 fps), and the duplicate timestamps put MediaPipe's graph into a permanent error. Fixed by cancelling the chain when the camera stops.
- **The pipeline stayed at 0 fps until its window was explicitly shown once**, whether or not it was covered. Once shown, it keeps running hidden or covered. Fixed by showing the window when a camera opens. This matters for the product's hidden renderer: a pipeline that is hidden before its first frame will not start, so it needs a show-once step or a frame source independent of presentation, such as `MediaStreamTrackProcessor`.

**Not measured:** a single receiver alone (every row above encodes twice), the grid-based glass delay, and a game with Broadcast active. The first game-scenario reading was discarded because the game had not started yet; the table uses readings taken after confirming `Control_DX12` was running, though the run's averaged CPU figure still includes that discarded period. The game was sampled at about 24% of the GPU's 3D engine, so a heavier scene could cost more.

### 2026-10-29: Windows fake-camera baseline (not the gate)

Windows 10.0.26200 x64, Electron 44.6.0 (Chrome 152), NVIDIA GeForce RTX 4070 Ti SUPER (WebGL2 on ANGLE Direct3D11). Chromium's fake camera (`--use-fake-device-for-media-stream=fps=30 --use-fake-ui-for-media-stream`), the desktop receiver window, and a separate headless Chromium page standing in for the OBS source. Driven by a local Playwright script (not committed). This proves the pipeline runs end to end; it says nothing about a real face, a real camera, NVIDIA Broadcast or OBS.

- **GPU gate:** Chromium reports the GPU about 3 seconds after start, so the check waits for it. Hardware WebGL and compositing were on.
- **Formats:** the fake camera advertises 1 to 3840 × 1 to 2160 at up to 30 fps; 1080p30, 2160p30 and 720p30 opened natively, 1440p30 did not (`OverconstrainedError`). The probe tells native and scaled modes apart as intended.
- **Camera alpha:** reported lost, as expected for the fake camera.
- **Pipeline at 1080p30**, matte packed, MediaPipe segmentation, bulge, big eyes and glitch on: 30 fps processed. Face Landmarker on the GPU delegate: median 6.1 ms, 95th percentile 12.2 ms per frame (no face in the fake picture, so this is detection only). Segmentation median 8.3 ms. Whole frame median 14.9 ms, 95th percentile 28.6 ms. Model loading took about 1.8 s, during which frames were skipped.
- **Key colour and segmentation** both produced a matte; the pipeline window showed it in grey below the picture, and the key turned the fake camera's green background transparent.
- **Hardware encoding:** with H.264, both receivers got `MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)` with `powerEfficient: true`, packed (1920 × 1620) and plain (1920 × 1080), with no quality limitation. App GPU video-encode engine use peaked at 19%.
- **Frame rate at the receivers:** H.264 packed: publisher 30 fps to each receiver, the desktop window received 26 fps. VP8 (software) plain: 24 to 26 fps; VP8 packed 1920 × 1620 managed only 17 fps. The headless page presented fewer frames than it received (headless rendering), so its `presentedFps` is not meaningful.
- **Output delay** (processed frame to receiver): H.264 packed median 83 to 89 ms; VP8 plain 59 to 63 ms, maximum about 130 ms. Glass-to-OBS was not measured: the fake camera cannot film the timing screen.
- **Layout:** moving the camera to the bottom-right placement changed both receivers without a reconnect.
- **CPU:** all app processes averaged 9% with an 11% peak at 1080p30 with everything on.
- **Packaged build:** the same run against the locally packaged app (`pnpm desktop:package`, pages, WASM and models served from the app archive) behaved the same: 30 fps processed, tracking median 7.4 ms on the GPU, both receivers at 30 fps over packed H.264 with output delay medians of 84 and 93 ms.

Observations for the gate run:
- In two early runs with H.264 from the first connection, no receiver ever connected, and nothing was reported; later runs with the same settings connected at once. The cause was not found. The check now records a failed connection, with the frame size and codec, under `errors`, so a repeat on the maintainer's PC is visible.
- With VP8, a new connection starts at a low bitrate and lowers the resolution for the first 30 to 40 seconds while WebRTC raises its estimate. Read numbers after a minute.
- Packed 1080p frames are 1920 × 1620, past H.264 level 4.2's frame size. NVIDIA's encoder accepted them here. If an encoder refuses them, **Receiver encode size: 1536 × 864** keeps a packed frame inside level 4.2.
