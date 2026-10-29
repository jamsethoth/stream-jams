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
6. **Measurements.** Output delay from a timestamp strip the pipeline stamps on each frame (hidden in the matte row when packed). Glass-to-OBS delay from a timing screen the camera films (see below). Frame rate per receiver, encoder and codec from `getStats`, CPU and memory over app processes, and GPU engine use per type (3D, video encode, video decode) from the Windows GPU Engine counters, for the app and the whole PC.
7. **GPU gate.** The check waits for the GPU process, then refuses to run, with the reason, unless Chromium reports hardware WebGL and GPU compositing and the pipeline's own WebGL2 renderer is not a software one.

Boundary rules: every page request needs the token path; static files are an allowlist built from the bundled `app` folder; reports, commands and signals are parsed with zod (signals with the core mirror schemas) before they are used; pipeline results returned to the main process are parsed too.

Everything runs offline. PixiJS, MediaPipe and the One Euro filter are bundled into the check's pages at build time; MediaPipe's WASM runtime comes from the pinned npm package; the two models are committed under `apps/desktop/assets/camera-effects-check/` with their source URL and SHA-256 in `models.json`. The build refuses to package a model that does not match its digest, and a unit test checks the same.

## How To Run It On Windows

1. Download the `windows-desktop-package` artifact from the latest CI run on this PR and unzip it.
2. Close Stream Jams if it is running.
3. In PowerShell, from the unzipped folder, run `& ".\Stream Jams.exe" --camera-effects-check`. Two windows open: the control window and the pipeline window (camera on the left, processed output on the right). If the control window says **Blocked**, copy the results and stop there.
4. **Physical camera first.**
   1. Press **List cameras**, pick the physical camera, press **Probe formats**.
   2. Pick **1080p30**, tick **Face tracking**, and press **Open camera**.
   3. In OBS, add a **Browser Source** at 1920 × 1080 with the URL the window shows (**Copy URL**). Press **Open desktop overlay receiver** too.
   4. Tick **Bulge on both eyes**, then **Big eyes**, then **Glitch**, one at a time. Move your head normally and watch whether the effects stay on your eyes.
   5. Try the layout buttons. The camera should move in OBS and the desktop window without a reconnect.
   6. Let each setting run for at least a minute before reading numbers: WebRTC raises its bitrate gradually after each connection.
   7. Repeat with **1440p30** and **2160p30** if the probe marked them native. For 4K, also try **Receiver encode size: Camera size** (copy the URL again into a second browser source).
5. **Glass-to-OBS delay.** Untick the effects. Press **Open the timing screen**, put it on a monitor the camera can see, press F11, and aim the camera so the grid fills the dashed box in the pipeline window. The OBS source's status line shows `glass … ms` when it reads the grid. Hold it for about 30 seconds. The figure includes the monitor's own delay of one or two frames.
6. **NVIDIA Broadcast.**
   1. In NVIDIA Broadcast, turn on **Background removal** for the camera. In the check, pick the NVIDIA Broadcast camera, open it with **Keep the camera picture**, and look at `cameraAlpha` in the results and at the desktop window. Tick whether the transparency survived.
   2. In Broadcast, switch to **Background replacement** with a solid green image. In the check, choose **Key colour**, set the colour, adjust the tolerance, and tick **Pack the alpha matte**. With the matte packed, the pipeline window shows the matte in grey below the picture.
   3. Switch to **MediaPipe selfie segmentation** on the physical camera (Broadcast off) and compare its matte with Broadcast's on hair, hands and chair edges. Write what you saw in the text boxes.
   4. Check that OBS shows the camera transparent around you with the matte packed, and opaque without it.
7. **With a game.** Choose **With a game running**, name the game, start it, and repeat steps 4.2 to 4.6 at 1080p30 with the matte packed and all three effects on. Results for idle and game runs are kept apart.
8. Tick what you saw, press **Copy results** and paste them in the thread.

## What The Results Mean

Measurements are grouped under `runs`, one per camera, format, packed or plain, and idle or game (`"<camera> 1920x1080 packed idle"`).

| Field | Gate question |
| --- | --- |
| `gpu.blocked`, `gpu.featureStatus`, `gpu.renderer` | GPU acceleration is on and WebGL2 runs on the real GPU. A blocked check never runs in software. |
| `cameras.<label>.presets` | Which formats the camera advertises and opens natively (`native: true`), and the frame rate it actually delivers. |
| `opened[].alphaSurvives`, `runs.*.pipeline.cameraAlpha` | Whether alpha from NVIDIA Broadcast survives into Chromium. Decides key colour, MediaPipe segmentation or OBS-side removal. |
| `runs.*.pipeline.cameraFps`, `processedFps`, `skippedFrames` | The pipeline keeps up with the camera at 30 fps. `skippedFrames` counts camera frames not processed since the camera opened, including about 2 s while models load. |
| `runs.*.pipeline.tracking.medianMs`, `p95Ms`, `delegate`, `blendshapes` | Tracking under 15 ms per frame on the GPU, with blendshapes on (52 when a face is seen). |
| `runs.*.pipeline.segmentation` | MediaPipe segmentation time per frame; `personPercent` is how much of the picture the matte keeps. |
| `runs.*.pipeline.frameMs` | Whole-frame time in the pipeline (tracking, segmentation, effects and drawing); must stay under 33 ms. |
| `runs.*.publisher[].codec`, `encoder`, `powerEfficient` | Whether Chromium used a hardware encoder (for example `MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)`, `powerEfficient: true`). |
| `runs.*.publisher[].width`, `height`, `qualityLimitation` | The encode size each receiver gets, and whether bandwidth or CPU held it back. A packed 1080p frame is 1920 × 1620; at 4K it is 3840 × 3240. |
| `runs.*.receivers.<id>.fps`, `presentedFps`, `userAgent` | Frame rate at each receiver; `userAgent: obs` is the OBS source. |
| `runs.*.receivers.<id>.outputDelay` | Delay from the processed frame to the receiver (encode, transport, decode). |
| `runs.*.receivers.<id>.glassDelay` | Glass-to-OBS delay from the timing screen: camera capture, processing and the output path. |
| `runs.*.receivers.<id>.packed`, `reconnects` | The receiver recombined a packed frame; layout changes caused no reconnects. |
| `runs.*.metrics` | CPU and memory over app processes, and GPU engine use for the app (`average`, `peak`) and the whole PC (`systemPeak`), idle and with a game. |
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

Observations for the gate run:
- In two early runs with H.264 from the first connection, no receiver ever connected, and nothing was reported; later runs with the same settings connected at once. The cause was not found. The check now records a failed connection, with the frame size and codec, under `errors`, so a repeat on the maintainer's PC is visible.
- With VP8, a new connection starts at a low bitrate and lowers the resolution for the first 30 to 40 seconds while WebRTC raises its estimate. Read numbers after a minute.
- Packed 1080p frames are 1920 × 1620, past H.264 level 4.2's frame size. NVIDIA's encoder accepted them here. If an encoder refuses them, **Receiver encode size: 1536 × 864** keeps a packed frame inside level 4.2.
