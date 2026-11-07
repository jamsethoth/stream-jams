# Camera Tracking Performance Research

Dated research record, November 5, 2026, for [BL-068](../backlog.md#modules-outputs-and-platform) after the [2026-11-05 feasibility run](../verification/camera-effects-feasibility.md#2026-11-05-real-hardware-run-the-gate) did not pass. Nothing here is implemented or approved. It builds on the [module research](2026-10-29-camera-effects-module-research.md). No benchmark, camera, Stream Jams instance or OBS was run for this record.

Versions checked: Electron 45.2.0 (Chromium 156.0.8078.49, read from the run's own results), `@mediapipe/tasks-vision` 1.2.0, `pixi.js` 8.22.0, dev OBS 33.0.1 with CEF 150.0.7871.252. Source links are pinned to those versions, except where a section says otherwise.

Evidence labels: **measured here** (this PC's run data), **source** (read from the owner's code), **documented** (owner's docs or spec), **anecdotal** (user reports in an owner's tracker), **inferred** (my reasoning, unproven).

## Summary

**Main finding.** Frames are lost on the publisher, before or at the encoder's output. In every row, frames decoded at the receivers roughly match frames encoded, and `framesDropped` is 0. So the network and decoding are not the main loss. OBS adds a separate second loss: under load it presents only 12 to 16 fps, even when it decodes more, while the desktop receiver presents nearly everything it decodes.

**Top recommendations, in order:**

1. **Record the missing stats first.** The check cannot yet tell canvas capture from encoder drops, and its GPU figures are empty because of a bug in the sampling.
2. **Measure one receiver.** It needs no code, and every row so far encodes twice.
3. **Remove the timer from canvas capture:** `captureStream()` instead of `captureStream(30)`. One line.
4. **Reduce main-thread blocking with small edits:** blendshapes off, stop resetting the tracking canvas every frame, try tracking every second frame.
5. **If blocking proves to be the cause,** move tracking to a worker and pair each result with its frame.
6. **Treat Spout2 as a delay decision, not a frame-rate fix.** About 130 ms exists before the pipeline, so WebRTC cannot meet a 150 ms target with this camera.

**Main open question.** Between the canvas paint and the encoder's output, which stage drops frames, and is the cause main-thread blocking or GPU contention? The game row's cause stays unproven. Encoded fps falls as frame time rises (r = -0.93 across 7 conditions), but heavier frames also mean a busier GPU, so the data cannot separate the two. The [measurement plan](#measurement-plan) is built to settle this.

**Also new:** the NVIDIA Broadcast rows look limited by the source, at about 21 fps, not by the pipeline.

## What The Raw Data Shows

Analysis of `C:\StreamJamsDev\camera-check-results\*.json` with a throwaway script. All figures are **measured here**.

| Condition (final reading of each run) | Processed fps | Frame ms | Frame minus tracking and segmentation, ms | Encoded fps (mean of two) | Decoded / encoded | Presented / decoded |
| --- | --- | --- | --- | --- | --- | --- |
| Webcam, effects, idle | 30.2 | 14.8 | 1.5 | 28.5 | 1.00 | 1.01 |
| Webcam, no effects, clock run (face in 38% of frames) | 29.7 | 20.8 | 1.8 | 19.5 | 1.13 | 1.01 |
| Webcam 2160p, capped to 1080p | 29.8 | 16.4 | 1.3 | 17 | 1.15 | 0.85 |
| Broadcast, plain | 20.2 | 32.6 | 2.1 | 16.5 | 0.94 | 0.89 |
| Broadcast, key colour, packed | 22.5 | 34.1 | 2.2 | 14.5 | 1.14 | 0.85 |
| Webcam, MediaPipe, packed, idle | 22.0 | 45.2 | 3.2 | 11 | 1.00 | 1.04 |
| Webcam, effects, game | 27.7 | 30.4 | 2.0 | 16 | 1.13 | 0.87 |
| Webcam, MediaPipe, packed, game | 17.6 | 49.1 | 3.1 | 11 | 0.95 | 1.00 |

The last two columns are means over both receivers. Medians are not strictly subtractable, so the fourth column is approximate. Decoded and encoded fps are `framesPerSecond` on `inbound-rtp` and `outbound-rtp`. The latter [counts encoded frames in the last second and may be lower than the source's rate](https://w3c.github.io/webrtc-stats/#dom-rtcoutboundrtpstreamstats-framespersecond).

**What this shows:**

- **The loss is upstream of the receivers.** Decoded fps stays within about 15% of encoded fps, with no drops reported. Decoded above encoded just reflects two rolling windows read at different times.
- **The encoder's own time is not rising to match.** Lifetime average encode time was 7 to 15 ms per frame at 1080p and packed sizes. `qualityLimitation` was `none`, except on the failed 4K encode. Two encodes at 30 fps fit within that time on paper (inferred).
- **Encoded fps falls as main-thread frame time rises.** r = -0.93 over the 7 distinct 1080p conditions. A related data point is the [fake-camera baseline](../verification/camera-effects-feasibility.md#2026-10-29-windows-fake-camera-baseline-not-the-gate): packed, segmented and all effects, with a 14.9 ms frame and no face, still published 30 fps. So GPU passes and two encodes alone did not cost frames there. That run used an older Electron, so treat the comparison with care.
- **Frame time is not the whole story.** The 2160p row has a 16.4 ms frame but only 17 fps encoded, which suggests canvas copy size also matters (inferred).
- **JS outside tracking and segmentation is small.** The fourth column is 1.3 to 3.2 ms. That includes the 96 × 54 mesh update and Pixi's draw submission. It does not include the GPU's time, which is not measured.
- **OBS is a second, separate limit.** Taken alone, the OBS receiver presents 0.71 to 0.78 of what it decodes in the Broadcast, 2160p and plain game rows, which is 12 to 16 fps. The desktop receiver presents about all of it in the same rows. OBS keeps up at idle (29.9 of 31 fps) and in the 10 to 11 fps rows. So fixing the publisher alone may still leave OBS near 15 fps under load (inferred).

**Camera delivery, from the cumulative counters** (`processed + skipped` between readings):

| Run | Processed fps | Skipped fps | Sum | Reading |
| --- | --- | --- | --- | --- |
| Webcam, MediaPipe, packed, idle | 23.9 | 6.6 | 30.5 | Camera delivers 30; the pipeline skips |
| Webcam, effects, game (472 s) | 28.8 | 1.6 | 30.3 | Camera delivers 30 |
| Webcam, MediaPipe, packed, game | 16.9 to 18.8 | 12.0 to 12.5 | 29 to 31 | Camera delivers 30; the pipeline skips |
| Broadcast, plain (288 s) | 21.2 | 0.1 | 21.3 | Almost nothing skipped |
| Broadcast, key colour, packed (112 s) | 21.0 | 0.4 | 21.4 | Almost nothing skipped |

So the Broadcast rows appear limited by the source (inferred). `presentedFrames` counts [frames submitted for composition](https://wicg.github.io/video-rvfc/#dom-videoframecallbackmetadata-presentedframes), so this is strong evidence but not proof of Broadcast's output rate. Whether it would reach 30 with less GPU load is unknown.

**What the data does not show, and bugs in the instrumentation:**

- **No GPU figures exist.** `metrics.gpu` is `null` in every run. The check's [counter script](../../apps/desktop/src/camera-effects-check/gpu-usage.ts) has an 8 s timeout, and one read just now took 13.5 and 15.3 s on this PC, using 12.2 s of CPU (**measured here, idle PC**). So during the run it probably kept starting PowerShell and killing it, which would hold about one logical core out of 20 (inferred). Whether that affected results is unknown. The "24% of the 3D engine" figure in the record is not in these files.
- **Each run keeps only its last reading.** [`recordReport`](../../apps/desktop/src/camera-effects-check/check-results.ts) overwrites. Some table rows in the record no longer exist in the JSON, and readings differ: the record's game row says tracking 18.6 ms median, while the last JSON reading says 28.4. A single reading cannot show the steady state or any trend during a run.
- **`cameraFps` is not the camera's rate.** It counts `requestVideoFrameCallback` callbacks, so it always equals `processedFps`. The `busy` guard at [pipeline-page.ts line 329](../../apps/desktop/src/camera-effects-check/pipeline-page.ts#L329) can never be true, because `processFrame` is synchronous.
- **`encodeMsPerFrame` is a lifetime average** ([line 509](../../apps/desktop/src/camera-effects-check/pipeline-page.ts#L509)), and connections span several run keys, so it blends scenarios.
- **`decoder` is always `null` at receivers.** The field [must not exist unless exposing hardware is allowed](https://w3c.github.io/webrtc-stats/#dom-rtcinboundrtpstreamstats-decoderimplementation), and those pages have no capture permission (inferred). Whether receivers decode in hardware is unknown.
- **The dev OBS scene collection was not clean.** Its two scene files hold 10 and 11 other browser sources (`C:\StreamJamsDev\obs\config\obs-studio\basic\scenes`), and the run's log has 1,630 console lines from two widgets retrying a connection. Their cost is unknown.
- **The check measures itself a little.** Each receiver draws half of every sampled frame to a CPU canvas and reads it back four times a second ([receiver-page.ts lines 153 to 160](../../apps/desktop/src/camera-effects-check/receiver-page.ts#L153)). The pipeline window also composites both previews, which the hidden product window would not.

**OBS itself looks healthy.** The dev OBS profiler for the whole session reports `obs_graphics_thread` median 5.7 ms, with 98.7% of frames under the 33.3 ms budget (**measured here**, `2026-11-05 18-20-38.txt`). This is a session-wide figure with no output running, so it cannot isolate the game rows.

A packed frame is 1.5 times the size of a plain one (1920 × 1620 against 1920 × 1080), not double.

## A. Face Tracking

### What Runs Per Frame

Model shapes were read from the committed model files with a throwaway parser (**measured here**).

| Stage | Input | Runs when | Where | Evidence |
| --- | --- | --- | --- | --- |
| Upload | Any `TexImageSource` | Every call | [`texImage2D` in the graph runner](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/web/graph_runner/graph_runner.ts#L243) | Source |
| Face detector | 128 × 128 whole image | Only when the previous frame gave too few faces: [stream mode skips it](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/tasks/cc/vision/face_landmarker/face_landmarker_graph.cc#L475-L478) | GPU delegate | Source |
| Landmarks | 256 × 256 crop of the face | Every frame with a face | GPU delegate, then [read back with `glReadPixels`](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/framework/formats/tensor.cc#L667) for CPU decoding (the read is inferred to apply on the web path) | Source |
| Smoothing | 478 landmarks | Stream mode, one face: [on by default](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/tasks/cc/vision/face_landmarker/face_landmarker_graph.cc#L453), a [One Euro filter](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/tasks/cc/vision/face_landmarker/face_landmarks_detector_graph.cc#L160-L163) | CPU | Source |
| Blendshapes | 146 points as 2D coordinates | Every frame with a face, when enabled | [Forced to XNNPACK](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/tasks/cc/vision/face_landmarker/face_landmarker_graph.cc#L170-L176): CPU, even with the GPU delegate. [Confirmed in the v1.2.0 notes](https://github.com/google-ai-edge/mediapipe/releases/tag/v1.2.0) and in the installed WASM's strings | Source |

`detectForVideo` [blocks until results are ready](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/tasks/web/vision/core/vision_task_runner.ts#L226). The web API has [only `IMAGE` and `VIDEO` modes](https://github.com/google-ai-edge/mediapipe/issues/4608), with no asynchronous `LIVE_STREAM` as on other platforms. So tracking time on the main thread includes waiting for the GPU process (inferred). That fits it rising from 14 to about 27 ms beside the segmenter, and to about 31 ms beside Broadcast, though the same model runs in each.

**Detection is not the cost.** `facePercent` is 95 to 100 in all normal rows, so the detector rarely runs. On the fake camera, with no face and only the detector, tracking was 6.1 ms; with a real face it is 13 to 14 ms. So landmarks, readback and blendshapes cost more than detection (inferred, different Electron version).

### Blendshapes

The check sets [`outputFaceBlendshapes: true`](../../apps/desktop/src/camera-effects-check/pipeline-page.ts#L64) and only counts the result. Its [documented default is false](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker). The gate required blendshapes on, to prove the cost of later expression triggers ([BL-069](../backlog.md#modules-outputs-and-platform)).

**Saving: unknown, measure it.** I found no published per-model latency. The [paper's abstract](https://arxiv.org/abs/2309.05782) only gives 30+ fps for the pipeline on phones, and the model card PDF was not readable with my tools. Turning it off removes one 955 KB CPU model, run in WASM on the calling thread (inferred). The product should load it only when a preset needs expressions.

### Input Size And Input Path

- **The 640-wide copy saves little inference time.** The model inputs are fixed, and the graph crops the face to 256 × 256 (source). It only shrinks the upload (inferred). Going below 640 risks landmark precision, since the cropped face may already be under 256 pixels.
- **The canvas is reset every frame.** [Lines 306 and 307](../../apps/desktop/src/camera-effects-check/pipeline-page.ts#L306) assign `width` and `height` on each frame. The [HTML spec](https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-set-bitmap-dimensions) says this acts even when ["redundantly set to the value they already have"](https://html.spec.whatwg.org/multipage/canvas.html#attr-canvas-width): context state resets and the bitmap resizes. The cost is unknown; the fix is one `if`.
- **Candidates, cheapest first (all inferred, measure):** pass `video` straight to `detectForVideo`, then keep the canvas without the reset. [`getImageSourceSize`](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/web/graph_runner/graph_runner.ts#L67-L82) accepts video, `VideoFrame`, `ImageBitmap` and canvas. Mirror mode would then flip landmarks in JS.
- **GPU readbacks in the pipeline:** landmark tensors each frame ([`tensor.cc`](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/framework/formats/tensor.cc#L667)), the segmentation mask each frame ([`mask.ts`](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/tasks/web/vision/core/mask.ts#L320)), and the alpha sample every 2 s. Each of these blocks the caller.

### Thresholds, ROI, Tracking Every Other Frame

- **Thresholds will not buy speed here.** The three confidence settings [default to 0.5](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker). They only change when the detector re-runs, and it rarely does.
- **Manual ROI is not available and not needed.** `FaceLandmarker` is built with [`roiAllowed` false](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts) and [throws if given a region](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/tasks/web/vision/core/vision_task_runner.ts#L170-L173). The graph already crops to the tracked face.
- **Track every second frame.** This halves tracking's main-thread time on average, with no new dependency. `AnchorSmoother` already takes timestamps, so variable rates are fine. Worked example of drift, not a measurement: a 400-pixel-wide face has an 80-pixel effect radius; at 500 px/s, 33 ms of staleness is about 16 pixels, or 20% of that radius. The maintainer has to judge it on camera, since "no visible drift" is the one criterion that passed. [BL-071](../backlog.md#modules-outputs-and-platform) already expects this for 60 fps.
- **Double smoothing:** MediaPipe's One Euro filter runs before `AnchorSmoother`'s. Each adds lag (inferred). If drift grows, try removing the check's own filter before adding prediction.

### Worker Placement

| Question | Answer | Evidence |
| --- | --- | --- |
| Does it work with the GPU delegate? | Probably. Google's [worker sample](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/face-landmarker.worker.ts) offers GPU or CPU, passes an `ImageBitmap`, and [uses the module loader](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/base-worker.ts). A collaborator said of module workers, ["This works now"](https://github.com/google-ai-edge/mediapipe/issues/5527). [v1.2.0 notes](https://github.com/google-ai-edge/mediapipe/releases/tag/v1.2.0) add worker platform detection. Not tested on this PC. | Source, documented |
| Does it free the main thread? | Yes: the blocking call moves to the worker. The canvas's capture timer and rendering then run unblocked. | Inferred |
| Does it reduce GPU contention? | No, I expect not. Every context still goes through the [same GPU process scheduler](https://github.com/chromium/chromium/blob/156.0.8078.49/gpu/ipc/service/gpu_channel.cc), and the run's `direct_rendering_display_compositor` is off. | Inferred |
| Will it speed up the mask readback? | Not on its own. A community member notes [the bottleneck is the GPU-to-CPU transfer](https://github.com/google-ai-edge/mediapipe/issues/4630#issuecomment-1678968533). | Anecdotal |

**Keeping results aligned.** Two designs:

- **Pair frames.** Hold each `VideoFrame` until its landmarks return, then draw. Latency stays about the same as today, and there is no added drift. This needs the frame source from [section B](#frame-source).
- **Use the latest landmarks.** The frame draws immediately with results one or two frames old. Latency is lower, with drift as in the worked example above.

Pair frames first, because it keeps the one passing criterion. This is the same design that would decouple segmentation.

**CPU delegate as a test.** `delegate: "CPU"` avoids the GPU queue, so tracking time might stop rising with game load (inferred). A contributor notes [CPU inference can suit some cases better](https://github.com/google-ai-edge/mediapipe/issues/4630#issuecomment-1679680586). Google's Pixel 6 figures for the selfie model show [CPU and GPU close](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter), which says little about this PC. It blocks the main thread until moved to a worker, and it costs CPU while gaming.

### Alternatives

No new evidence changes the earlier rejections of native sidecars, TensorFlow.js and proprietary SDKs in the [face tracking matrix](2026-10-29-camera-effects-module-research.md#face-tracking).

| Option | Status | Fit |
| --- | --- | --- |
| Upgrade to `tasks-vision` 1.2.2 | [Latest, November 3](https://github.com/google-ai-edge/mediapipe/releases/tag/v1.2.2). Removes non-SIMD builds. No performance claims for faces. `delegate` is still `"CPU" \| "GPU"` | Harmless; no gain expected |
| MediaPipe WebGPU delegate | Not exposed. WASM strings and a [`MEDIAPIPE_USE_WEBGPU` path](https://github.com/google-ai-edge/mediapipe/blob/v1.2.0/mediapipe/framework/formats/tensor.cc) exist, but `vision.d.ts` offers no option | Watch |
| LiteRT.js (`@litertjs/core` 2.6.0, Apache-2.0) | [Runs one model on WebGPU, WebNN or WASM](https://ai.google.dev/edge/litert/web). Would need our own detector logic, face crop and decoding, against repo policy. Could allow non-blocking readback (inferred) | Spike only if MediaPipe's blocking is proven to be the limit and a worker does not fix it |
| ONNX Runtime Web | [Has a WebGPU backend](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html). I found no first-party face mesh model, so it needs conversion and our own pipeline | Not credible now |

## B. Rest Of The Pipeline

### Segmenter

Segmentation costs 13.5 to 16.8 ms on the main thread. [Lines 254 to 265](../../apps/desktop/src/camera-effects-check/pipeline-page.ts#L254) do a blocking readback, two JS loops over 65,536 pixels (the mask is 256 × 256), `putImageData`, then a re-upload through a canvas. The maintainer's rating of this mask was "rough: blocky edges", which fits its small size. How the time splits is unmeasured.

| Option | Change | Evidence | Risk |
| --- | --- | --- | --- |
| Segment every second frame | Reuse the last mask | Halves main-thread segmentation (arithmetic). Edge lag is unknown | Low; judge on camera |
| GPU path via `ImageBitmap` | In the [callback form of `segmentForVideo`](https://github.com/google-ai-edge/mediapipe/issues/4630#issuecomment-1692535782), draw `getAsWebGLTexture()` to the task's canvas, call `transferToImageBitmap`, and upload to Pixi. A contributor [recommends this route](https://github.com/google-ai-edge/mediapipe/issues/4630#issuecomment-1679680586). Pixi's [`ImageSource` accepts `ImageBitmap`](https://github.com/pixijs/pixijs/blob/v8.22.0/src/rendering/renderers/shared/texture/sources/ImageSource.ts) | Documented in tracker, measured elsewhere only as "best performance" | Medium: about 30 lines of shader setup. Removes the readback |
| Shared GL context | Give the task Pixi's canvas, wrap the texture in Pixi's `ExternalSource`, and call [`resetState()`](https://github.com/pixijs/pixijs/blob/v8.22.0/src/rendering/renderers/shared/system/AbstractRenderer.ts) after MediaPipe runs. `ExternalSource` and the `context` option exist in the installed 8.22.0 | Not verified for this pair. A user [hit `INVALID_OPERATION`](https://github.com/google-ai-edge/mediapipe/issues/4630#issuecomment-1681221156) when mixing with MediaPipe's context | High: two owners of GL state. No copy at all, if it works |
| Landscape model (144 × 256) | Swap the model file | [Documented as possibly more efficient](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter), but Google's Pixel 6 figures are 33.55 and 35.15 ms on GPU: little difference | Low, small gain |

**A decision for the maintainer:** the research record made MediaPipe's matte the default for everyone. It is now the costliest stage measured, and it was rated clearly worse than Broadcast's. Before tuning it deeply, decide whether it stays the default. The record's third route, [OBS's NVIDIA filter on the browser source](2026-10-29-camera-effects-module-research.md#input-nvidia-broadcast-and-transparency), remains untested.

### Mesh, Upload, Passes, Packing

- **The mesh update is not the problem on the main thread.** All non-ML JS is 1.3 to 3.2 ms per frame (measured here). Skipping it when big eyes is off would be tidy, not a fix.
- **GPU cost of the passes is unmeasured.** Each frame has up to: the matte filter, the mesh draw, three full-frame filter passes (two bulges and glitch), the output draw and the grey matte filter. These are queued, not waited for, so their cost shows up later as other stages waiting (inferred). Bulge could be limited to the eye regions, but do not spend effort until a GPU timing shows it matters.
- **The packed frame is 1.5 times the area,** and half of the lower row is unused, because the matte is half width ([receiver shader](../../apps/desktop/src/camera-effects-check/receiver-page.ts#L56)). Encode time rose from about 7.6 to about 11.7 ms per frame (measured here, with the blending caveat above). The existing **1536 × 864** receiver cap is a cheap test. The bitrate cap [stays at 6 Mbps](../../packages/core/src/videos/mirror.ts#L111) even for the larger frame.

### Frame Source

`requestVideoFrameCallback` runs [through the page's animation controller](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/video_rvfc/video_frame_callback_requester_impl.cc#L95), so it depends on rendering (source). That fits the check's finding that it stays silent until the window has been shown once (inferred). It [may miss frames](https://wicg.github.io/video-rvfc/#dom-videoframecallbackmetadata-presentedframes), which is what `skippedFrames` counts.

`MediaStreamTrackProcessor` runs independently of rendering (inferred from its [underlying source](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/breakout_box/media_stream_track_processor.cc)), which would solve the hidden start. Things to know:

- **Exposure differs from the spec.** In Chromium 156 it is [`Exposed=Window` only](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/breakout_box/media_stream_track_processor.idl). The [spec](https://w3c.github.io/mediacapture-transform/) has consensus for workers and none for Window. A Chromium change here is a risk to watch.
- **The stream can move to a worker.** The readable is [created with per-chunk transfer allowed](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/breakout_box/media_stream_track_processor.cc), so frames can reach a worker (not tested here).
- **Pixi takes `VideoFrame` directly,** through [`ImageSource`](https://github.com/pixijs/pixijs/blob/v8.22.0/src/rendering/renderers/shared/texture/sources/ImageSource.ts).

The simpler alternative for the product's hidden window is a show-once step. Use the processor only together with the worker design.

## C. Transport And The Receiver Gap

### Canvas Capture

`captureStream(30)` starts a [timer that sets a flag every 33.3 ms](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/mediacapturefromelement/timed_canvas_draw_listener.cc#L40-L43). A paint is captured [only if the flag is set](https://w3c.github.io/mediacapture-fromelement/#dom-htmlcanvaselement-capturestream), and [capturing clears it](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/mediacapturefromelement/on_request_canvas_draw_listener.cc#L17-L21) (source, documented).

**Why this could lose frames (inferred):** the timer and the paints run at the same nominal rate with no phase lock. If a paint lands just before a tick, it is skipped, and the flag holds one bit, so two ticks in a row do not save the next one. The timer also runs on the main thread, so blocking delays it. This is a real mechanism, but its size is unknown. I found no Chromium bug that measures it under GPU load.

| Mode | Behaviour | Fit |
| --- | --- | --- |
| `captureStream(30)` (today) | Timer flag, as above | Baseline |
| `captureStream()` | [`AutoCanvasDrawListener`](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/mediacapturefromelement/canvas_capture_media_stream_track.cc#L51-L60): [every paint](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/mediacapturefromelement/auto_canvas_draw_listener.cc), no timer | **Test first.** One line. The pipeline paints once per camera frame |
| `captureStream(0)` + `requestFrame()` | [Capture on request](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/mediacapturefromelement/canvas_capture_media_stream_track.cc#L69-L71) | Same effect. A [Chromium bug](https://issues.chromium.org/issues/40671698) reports extra intermediate frames (current status not confirmed); it should not matter with one paint per frame |
| `MediaStreamTrackGenerator` | [Window-exposed](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/breakout_box/media_stream_track_generator.idl) in 156; write a `VideoFrame` per frame. `VideoTrackGenerator` is [only a test flag](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/platform/runtime_enabled_features.json5) | Only if capture is proven the problem and the modes above do not fix it. Whether it reaches the hardware encoder cheaply is unknown |

**Capture is not free even when it fires.** On Windows, an opaque WebGL canvas takes the [one-copy path, on by default](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/core/html/canvas/html_canvas_element.cc#L160), converting to NV12 and then [copying to CPU-mappable memory asynchronously](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/platform/graphics/web_graphics_context_3d_video_frame_pool.cc#L222). Pixi's canvas is opaque here because [`backgroundAlpha` is 1](https://github.com/pixijs/pixijs/blob/v8.22.0/src/rendering/renderers/gl/context/GlContextSystem.ts). This copy happens once per captured frame, per track, so a second receiver does not double it (inferred). It runs in the GPU process, so a large frame and a game could both delay it (inferred, and it fits the 2160p row). Runtime use of this path was not verified; a trace would show `one_copy_canvas_capture`.

### Two Receivers, Two Encodes

- **The cost is unmeasured.** The record notes that no single-receiver row exists, so this is unknown. Measure it before designing anything.
- **Sharing one encode has no stable path.** [`createEncodedSource`](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/peerconnection/rtc_rtp_sender.idl) and the [`RTCEncodedVideoFrame` init constructor](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/peerconnection/rtc_encoded_video_frame.idl) are [`experimental` in Chromium 156's flag list](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/platform/runtime_enabled_features.json5) (**unstable**). `RTCRtpScriptTransform` is stable but only rewrites a sender's own frames. WebCodecs over a data channel would work in principle, but we would own reassembly, keyframes and pacing (inferred), against repo policy.
- **Recommendation:** do not share an encode. Encode only for connected receivers. The desktop overlay [is already optional](2026-10-29-camera-effects-module-research.md#outputs-and-layouts), so a normal stream with OBS alone is one encode.

### Encoder Settings And Hidden Drops

`qualityLimitationReason: none` does not rule out dropped frames. It [reports limits on resolution and frame rate](https://w3c.github.io/webrtc-stats/#dom-rtcoutboundrtpstreamstats-qualitylimitationreason), while libwebrtc has separate drop reasons (source):

| Drop point | Mechanism | How to test |
| --- | --- | --- |
| Frame dropper | [Enabled unless the rate controller is trusted](https://webrtc.googlesource.com/src/+/ce13eaa8e5750b09c46b088a35d74bdadbac25dc/video/video_stream_encoder.cc#1991), which [defaults to false for hardware encoders](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#L2603) unless the encoder says otherwise. I could not read Windows's value | Raise the bitrate cap from 6 to 20 Mbps. Loopback costs nothing. The glitch effect and packed frames are demanding to encode at 6 Mbps (inferred) |
| Encoder queue | [A hardware encoder holds at most 15 frames](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/platform/peerconnection/rtc_video_encoder.cc#L1241) | Only reached if the encoder falls far behind; unlikely at 7 to 15 ms (inferred) |
| Frame-rate cap | [`maxFramerate` limits the source](https://webrtc.googlesource.com/src/+/ce13eaa8e5750b09c46b088a35d74bdadbac25dc/video/video_stream_encoder.cc#955). [`FramerateController`](https://webrtc.googlesource.com/src/+/ce13eaa8e5750b09c46b088a35d74bdadbac25dc/common_video/framerate_controller.cc#41) drops frames that arrive early. May explain 27 to 29 fps at idle (inferred) | Set `maxFramerate` to 60 in the check only: the constant is [shared with Videos](../../packages/core/src/videos/mirror.ts#L95) |

`maintain-framerate` [is set](../../apps/desktop/src/camera-effects-check/pipeline-page.ts#L445) and the field [exists in Chromium 156](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/peerconnection/rtc_rtp_send_parameters.idl). It steers adaptation, so I would not expect it to affect the drop points above (inferred). There is no evidence that another codec would help: VP8 was software and [worse in the baseline](../verification/camera-effects-feasibility.md#2026-10-29-windows-fake-camera-baseline-not-the-gate).

### Delay And The Jitter Buffer

[`jitterBufferTarget`](https://w3c.github.io/webrtc-pc/#dom-rtcrtpreceiver-jitterbuffertarget) is [stable in Chromium 156](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/platform/runtime_enabled_features.json5); `playoutDelayHint` also remains in the [IDL](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/peerconnection/rtc_rtp_receiver.idl), but it is not the standard field. Neither would change frame rate. Whether they help delay is unknown until the stats below show the jitter buffer's share. Part of the 270 ms is simply frame age: at 11 fps a sampled frame is on average about 45 ms old, against 17 ms at 30 fps (arithmetic). So fixing frame rate reduces delay too.

### Which Stats Locate The Drop

All are [`webrtc-stats`](https://w3c.github.io/webrtc-stats/) fields unless noted, recorded as counters and differenced per sample.

| Stage | Field | What a gap means |
| --- | --- | --- |
| Camera | [`track.stats`](https://w3c.github.io/mediacapture-extensions/#the-mediastreamtrackvideostats-interface): `deliveredFrames`, `discardedFrames`, `totalFrames` ([in Chromium 156](https://github.com/chromium/chromium/blob/156.0.8078.49/third_party/blink/renderer/modules/mediastream/media_stream_track_video_stats.idl)) | The source's real rate; settles the Broadcast question |
| Pipeline | Processed frames, per-stage JS times, an event-loop delay probe | Main-thread saturation |
| GPU queue | [WebGL2 fence](https://registry.khronos.org/webgl/specs/latest/2.0/) placed after the frame and polled without blocking | GPU contention, directly |
| Canvas capture | `media-source` [`frames`, `framesPerSecond`](https://w3c.github.io/webrtc-stats/#dom-rtcvideosourcestats) against processed frames | **Capture stage loses frames** |
| Encoder | `outbound-rtp` `framesEncoded` against `media-source` `frames`; also `targetBitrate`, `hugeFramesSent`, `totalEncodeTime` (differenced) | **Dropper or queue loses frames** |
| Pacer | `framesSent`, `totalPacketSendDelay`, `qualityLimitationDurations` | Send path |
| Network | `framesReceived`, `packetsLost`, `nackCount`, `pliCount` | Should stay clean on loopback |
| Decode | `framesDecoded`, `totalDecodeTime`, `totalAssemblyTime`, `keyFramesDecoded` | Decoder falling behind |
| Jitter buffer | `jitterBufferDelay` / `jitterBufferEmittedCount`, `jitterBufferTargetDelay`, `totalProcessingDelay` | Share of the delay |
| Presentation | `framesDropped`, `totalInterFrameDelay`, `totalSquaredInterFrameDelay`, `freezeCount`, `totalFreezesDuration`; [rVFC](https://wicg.github.io/video-rvfc/#dom-videoframecallbackmetadata-presentedframes) `presentedFrames` gaps, `processingDuration`, `captureTime`, `receiveTime` | Page or OBS missing frames |

For one final confirmation, Electron's [`contentTracing`](https://github.com/electron/electron/blob/main/docs/api/content-tracing.md) records Chromium's trace events, including the `one_copy_canvas_capture` and `EncoderPaused` events in the code above.

### OBS Under Game Load

| Finding | Evidence |
| --- | --- |
| The browser source's page renders at the canvas rate unless **Use custom frame rate** is on: [`windowless_frame_rate`](https://github.com/obsproject/obs-browser/blob/d4db73e7e5d5b51d853177c8cddc796715a8ac84/obs-browser-source.cpp#L232), [setting documented](https://obsproject.com/kb/browser-source). Dev OBS runs at 30 fps | Source, measured here |
| A 30 Hz page samples unsynchronised video, which could explain some loss. But the pattern points elsewhere: OBS holds 0.96 at idle and about 1.0 at 10 fps, and drops to 0.71 to 0.78 only in loaded rows at 16 to 21 fps decoded. That suggests the page falls behind under GPU load, at 12 to 16 fps, more than a sampling effect. Custom frame rate tests this directly | Measured here; cause inferred |
| Hardware acceleration and shared textures are on: `BrowserHWAccel=true`, [`shared_texture_enabled`](https://github.com/obsproject/obs-browser/blob/d4db73e7e5d5b51d853177c8cddc796715a8ac84/obs-browser-source.cpp#L215) | Measured here, source |
| Dev OBS has no GPU priority: its log says `D3D11 GPU priority setup failed (not admin?)`. HAGS is enabled and Game Mode "Probably On". [OBS's code](https://github.com/obsproject/obs-studio/blob/33.0.1/libobs-d3d11/d3d11-subsystem.cpp#L436-L458) asks for high priority under HAGS and realtime otherwise | Measured here, source |
| [OBS's guide](https://obsproject.com/kb/encoding-performance-troubleshooting), dated 2021, says running as administrator reserves GPU capacity, advises limiting the game's frame rate, and says Game Mode favours the game | Documented |
| That priority call is on OBS's own process (`GetCurrentProcess()`). Browser sources run in CEF's separate processes, so admin may not help this source at all, and it would never help Electron | Inferred |
| A similar report exists: [browser sources stutter when OBS loses focus](https://github.com/obsproject/obs-studio/issues/12982). One user saw 1 to 2 fps with hardware acceleration on, and turning it off helped them. An OBS member suggested launching with `--disable-renderer-backgrounding`. The reporter later blamed their own code and NVENC. The flag is [not set by default at 33.0.1](https://github.com/obsproject/obs-browser/blob/d4db73e7e5d5b51d853177c8cddc796715a8ac84/browser-app.cpp) | Anecdotal, source |
| [HAGS moves scheduling to the GPU](https://devblogs.microsoft.com/directx/hardware-accelerated-gpu-scheduling/), while Windows still decides priority. I found no evidence for its effect here either way. Toggling needs a reboot, so it is left out of the short run | Documented |

### Electron Controls

| Control | Status | Note |
| --- | --- | --- |
| [`backgroundThrottling: false`](https://github.com/electron/electron/blob/main/docs/api/structures/web-preferences.md) | Supported, already set | [Keeps the renderer from being hidden and throttled](https://github.com/electron/electron/blob/v45.2.0/shell/browser/api/electron_api_web_contents.cc) |
| Hidden window | `hide()` [marks the page occluded](https://github.com/electron/electron/blob/v45.2.0/shell/browser/api/electron_api_browser_window.cc) | The check found it keeps running once shown; a [show-once step](#frame-source) or the track processor is needed for the start |
| [`--disable-renderer-backgrounding`](https://github.com/electron/electron/blob/main/docs/api/command-line-switches.md) | Supported | Global; cheap to add for the check |
| `powerPreference: "high-performance"` | Already set | |
| [`--disable-frame-rate-limit`](https://github.com/chromium/chromium/blob/156.0.8078.49/components/viz/common/switches.cc) | **Unsupported Chromium switch**, not in Electron's list | Removes compositor pacing; unknown effect; last resort |
| [`--disable-backgrounding-occluded-windows`](https://github.com/chromium/chromium/blob/156.0.8078.49/content/public/common/content_switches.cc) | **Unsupported, named `ForTesting` in Chromium** | The game covers the window, but the check keeps running while covered, so I see no case for it |
| `--disable-features=CalculateNativeWinOcclusion` | **Unsupported feature flag**. [OBS sets it for CEF](https://github.com/obsproject/obs-browser/blob/d4db73e7e5d5b51d853177c8cddc796715a8ac84/browser-app.cpp) | Same reasoning |
| GPU priority | **No control found** in the Electron docs I read. Chromium raises the GPU process's [CPU priority class](https://github.com/chromium/chromium/blob/156.0.8078.49/content/gpu/gpu_main.cc#L284) only. A native call would likely need admin, as OBS's log suggests | Do not pursue: the app should not require admin |

### Non-WebRTC Routes

These matter only for the delay decision and for non-OBS consumers ([BL-072](../backlog.md#modules-outputs-and-platform)). Latency and licence details are in the [transport matrix](2026-10-29-camera-effects-module-research.md#output-transport).

| Route | Removes | Adds | OBS needs | Status |
| --- | --- | --- | --- | --- |
| Electron [offscreen shared texture](https://github.com/electron/electron/blob/main/docs/tutorial/offscreen-rendering.md) + Spout2 | Encode, decode, jitter buffer, packed alpha | A native addon. [`useSharedTexture` is experimental](https://github.com/electron/electron/blob/main/docs/api/structures/web-preferences.md) | The third-party [Spout2 plugin](https://github.com/Off-World-Live/obs-spout2-plugin), which needs OBS 33+ | Best delay; own native code |
| Windows 11 [`MFCreateVirtualCamera`](https://learn.microsoft.com/en-us/windows/win32/api/mfvirtualcamera/nf-mfvirtualcamera-mfcreatevirtualcamera) (build 22000+) | Encode, decode | A COM media source, readback and no alpha, so OBS needs a key filter | Video Capture Device, no plugin (inferred) | Most native code; works beyond OBS |

Electron's [`sharedTexture` module](https://github.com/electron/electron/blob/main/docs/api/shared-texture.md) is also experimental. It imports external textures as `VideoFrame`, which is the inbound direction and does not help here.

**Effect on the decision.** About 130 ms exists before the pipeline, and the stamp-based output delay is about 90 to 110 ms at its best. So 150 ms needs either a much faster camera path or a route with nearly no added delay. The record already says delay alone should lead to a spike, not abandonment. It has not yet measured the same camera directly in OBS. If that is also near 130 ms, the useful gate is delay **added** by the module, and the existing plan's OBS audio offset covers the rest. This is a product decision.

## D. Recommendations

Ranked by expected gain against cost. Gains are unknown until measured; I give no percentages because neither the sources nor the data support one.

### Quick Wins Testable In The Existing Check

| # | Change | Why it should help | Evidence | Risk | Test |
| --- | --- | --- | --- | --- | --- |
| 1 | Add the [stats above](#which-stats-locate-the-drop), a time series per run, and fix GPU sampling | Everything else depends on it | Measured here | None | Rerun baseline |
| 2 | Run with one receiver | Removes one encode; matches a normal stream | Unmeasured | None; no code | Close the desktop receiver |
| 3 | `captureStream()` with no argument | Removes the timer flag | Source; size inferred | Low | Compare `media-source` fps |
| 4 | Turn blendshapes off; load only when a preset needs them | Removes a CPU model from the blocking call | Source; size unknown | None for the check | Tracking ms |
| 5 | Set tracking canvas size only on change, or pass `video` directly | Stops a per-frame context reset and maybe a copy | Documented; size unknown | Low | Tracking and frame ms |
| 6 | Track every second frame | Halves main-thread tracking on average | Arithmetic | Drift: judged on camera | Frame ms, encoded fps, maintainer's rating |
| 7 | Raise bitrate cap to 20 Mbps and `maxFramerate` to 60, in the check only | Tests the frame dropper and frame-rate cap | Source; size inferred | None on loopback | `framesEncoded` against `media-source` |
| 8 | Segment every second frame | Halves segmentation on average | Arithmetic | Edge lag | Frame ms, maintainer's rating |
| 9 | OBS: custom frame rate 60 on the browser source | Tests whether the page's 30 Hz rate is why OBS presents 12 to 16 fps under load | Source; effect inferred | Low; dev OBS setting | `presentedFrames` |
| 10 | Dev OBS: launch with `--disable-renderer-backgrounding`; clean scene collection | Tests the focus report; removes noise | Anecdotal | None for dev OBS | OBS row with game focused |
| 11 | Remove the receiver's frame sampling except briefly, and hide the pipeline window after first show | Removes check overhead the product will not have | Inferred | Delay readings pause | Compare fps |
| 12 | `delegate: "CPU"` for one row | Shows whether tracking can escape the GPU queue | Inferred | Blocks main thread; CPU cost | Tracking ms with the game |

### Architecture Changes

Only after the run points at them.

| # | Change | When | Evidence | Risk | Test |
| --- | --- | --- | --- | --- | --- |
| A | **Worker tracking with frame pairing** via `MediaStreamTrackProcessor` | Encoded fps recovers when the main thread is freed by quick wins, or fence lag stays low while frames are lost | Sample shows the API shape; benefit inferred | Medium: frame lifetimes, module WASM in the allowlist, Window exposure in Chromium | Same run; fps and drift |
| B | **GPU mask path via `ImageBitmap`** | MediaPipe remains the default matte | Tracker guidance; no numbers | Medium | Segmentation ms, matte quality |
| C | **Encode only for connected receivers**, and treat desktop overlay plus OBS as the costlier case in the UI | One receiver is clearly better | Product design | Low | Row 2 of the run |
| D | **Spout2 spike** (BL-072) | Added-delay target stays under what WebRTC can reach, or frame rate cannot be fixed on WebRTC | Earlier research | High: native addon, experimental API, OBS plugin | Delay and fps through Spout |
| E | **Lower the target under game load** (for example 24 fps), or accept lower effects while gaming | Fence lag shows real GPU contention with no room left | Product choice | User-visible | Maintainer's view on stream |

Not recommended now: shared encoding, GPU priority calls, LiteRT.js, ONNX Runtime Web, or a shared GL context with Pixi.

## Measurement Plan

### Before The Session

Add to the check: all [stats above](#which-stats-locate-the-drop) as a 2-second time series per run, bounded; toggles for capture mode, blendshapes, tracking and segmentation interval, tracking source, bitrate and frame-rate caps, and receiver sampling. Replace the GPU counter loop with one of: [`nvidia-smi --query-gpu … -l 1`](https://docs.nvidia.com/deploy/nvidia-smi/index.html) in a separate process (field names from `--help-query-gpu`), or a counter read once a minute with a longer timeout. Also fix `cameraFps` to use `track.stats`.

In dev OBS, use a clean scene collection with only the camera source. Production OBS stays closed, as the [runbook steps](../verification/camera-effects-feasibility.md#how-to-run-it-on-windows) require.

### The Run, About 15 Minutes

Each step is 70 s; use the last 30 s. Keep the best setting of each step for later steps unless it hurts.

| Step | Setup (1080p30) | Answers |
| --- | --- | --- |
| 1 | Webcam, effects on, two receivers: baseline | Reproduces 27 to 29 fps, with the new stats |
| 2 | One receiver (OBS only) | Cost of the second encode at idle |
| 3 | Two receivers, `captureStream()` | Timer loss |
| 4 | Blendshapes off, no canvas reset | Tracking ms saved |
| 5 | Track every second frame; maintainer moves head and rates drift | Main-thread relief against drift |
| 6 | Packed, MediaPipe, best so far | Heavy case baseline |
| 7 | Segment every second frame, bitrate 20 Mbps | Dropper, and segmentation relief |
| 8 | Start Control (allow a minute), effects, plain, two receivers | Game cost with best settings |
| 9 | Game, one receiver | Game cost of the second encode |
| 10 | Game, OBS custom frame rate 60 | Presentation loss |
| 11 | Game, packed, MediaPipe, best settings | Worst case |
| 12 | If time allows: Broadcast with tracking off, then on | Source rate; Broadcast's own cost |

At the end, take one 10-second `contentTracing` capture of the worst row. If two minutes remain, close the check and read the clock method through the camera directly in dev OBS, for the delay baseline. Otherwise schedule it separately.

### What The Results Mean

| Result | Points to |
| --- | --- |
| `media-source` fps well below processed, and `captureStream()` closes the gap | Timer loss; keep the one-line fix |
| `media-source` fps well below processed, with `captureStream()` no better, and event-loop delay high | Main-thread blocking; go to worker tracking (A) |
| `media-source` fps below processed, with event-loop delay low and fence lag high | GPU contention in capture; reduce passes and frame size, consider E or D |
| `media-source` near processed, `framesEncoded` lower, improves at 20 Mbps | Frame dropper; raise the cap for the product (does not affect Videos if kept separate) |
| Same, but no better at 20 Mbps, and better with one receiver | Encoder contention; encode only for connected receivers (C) |
| `framesEncoded` near processed, `framesDecoded` lower | Decoder or transport; read `totalDecodeTime`, and try a smaller packed size |
| Decoded near encoded, presented lower in OBS only; custom frame rate fixes it | Document the OBS setting in the product |
| Presented lower only when OBS is unfocused, and the switch fixes it | OBS backgrounding; document the launch option or report upstream |
| OBS stays near 15 fps with a good publisher, and neither setting helps | CEF under GPU load is the limit; try a lighter receiver page, then weigh the Spout2 spike (D), which skips CEF |
| `track.stats` shows Broadcast near 21 fps with tracking off | Broadcast's own limit; compare with Broadcast effects off, and revisit the "chain Broadcast" default |
| Fence lag rises with the game and encoded fps does not recover at one receiver | Real GPU contention; choose E, and try capping the game's frame rate as OBS advises |
| 30 fps reached, but added delay still too high | D for delay alone, as the record already says |
| Direct-to-OBS camera delay also about 130 ms | Restate the gate as added delay |

## What I Could Not Verify

- **Nothing ran.** All of this is from sources and the existing data. Every "should help" is unproven on this PC.
- **The stage that drops frames.** The existing stats cannot separate capture from encoder drops. The r value comes from 7 single readings with an obvious confound.
- **Blendshape cost.** No primary source gives a figure, and the model card PDFs could not be read with my tools.
- **Web readback path.** `tensor.cc` shows the read, and the WASM contains `glReadPixels`, `glFinish` and fence calls, but I could not trace the compiled path.
- **MediaPipe source versions.** Links are to tag `v1.2.0`; the graph and tensor files differ slightly from `master`, and line numbers were checked at the tag. The npm package has no separate source for the WASM.
- **libwebrtc pin.** Read from Chromium's `DEPS` as `ce13eaa8`. `FramerateController` matched `main`, and `video_stream_encoder.cc` was read at the pin. The path from `maxFramerate` to `FramerateController` was inferred.
- **Windows encoder's trusted-rate flag.** The Media Foundation encoder's source path was not found at the tag, so whether the frame dropper is actually on is unconfirmed. The stats will show it.
- **Chromium GPU priority.** I checked only `gpu_main.cc`, not all of Chromium.
- **Worker plus GPU delegate on this PC,** the shared GL context with Pixi, and `MediaStreamTrackProcessor` performance: none tested.
- **Electron docs and worker samples** were read at their `main` branch, not at a tag matching 45.2.0. Electron's web-contents source was read at `v45.2.0`.
- **Counter timing** was read twice on an idle PC, not during the run, so the timeout explanation for `gpu: null` is strong but inferred. The fake-camera baseline's counters worked at that time, on the same PC.
- **Forum posts** turned up in searching were not used as evidence, except the labelled reports in owners' trackers.
