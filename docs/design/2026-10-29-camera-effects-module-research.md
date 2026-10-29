# Camera Effects Module Research

Dated research record, October 29, 2026. It evaluates technology options for a camera module ([BL-068](../backlog.md#modules-outputs-and-platform)) and proposes a feasibility gate. Nothing here is implemented or approved; versions and maintenance dates were read from npm and GitHub on this date.

## Goal

A module that takes one camera input and produces one processed camera output:

- With no effects it is a pass-through.
- The input can be a physical camera or another virtual camera, notably the NVIDIA Broadcast camera, to keep its background removal.
- Effects apply live: filters, colour treatments and local warps of parts of the face, such as eyes, mouth or nose.
- Face tracking keeps face-anchored effects in place while the streamer moves.
- Saved presets and on-the-fly effects, triggered from the management UI, Operator, automation API and stream events.
- Established open-source libraries over hand-written tracking and filters.

## Where This Fits In Stream Jams

Existing pieces a camera module would reuse:

| Existing piece | Reuse |
| --- | --- |
| Videos desktop mirror: one hidden Electron renderer, loopback-only WebRTC to every OBS browser source and the desktop overlay, automatic reconnects, per-receiver size and frame-rate caps ([videos](../videos.md#desktop-mirror), [feasibility record](../verification/video-mirror-feasibility.md)) | The output path for the first version. A processed camera canvas is another published stream. Measured on Windows: 30 fps, about 75 to 150 ms delay. |
| `--video-mirror-check` diagnostic mode and `timestamp-barcode.ts` | Template for a `--camera-effects-check` feasibility mode and for measuring glass-to-OBS latency. |
| Central event bus and automation API ([consumers](../engineering/event-bus-consumers.md), [automation](../automation-api.md)) | Trigger effects from redemptions, Streamer.bot and Stream Deck without new transport. |
| Global safety controls and Operator panel | A pass-through panic control that clears all effects. |
| `packages/core` schemas, SQLite repositories, backup | Effect, preset and settings contracts. |

Constraints that shape the choice:

- **GPU acceleration.** Tracking and effects need WebGL2 on the GPU. Settings can turn GPU acceleration off app-wide (the workaround for the Windows 25H2 GPU-process exit issue in the [runbook](../mvp-runbook.md)), and Chromium applies that to every window. The module must refuse to start, with a clear diagnostic, rather than run on software rendering.
- **NP-001.** Alerts forbid arbitrary code. The same reasoning points to a schema-validated effect catalogue rather than user-written shaders. A shader editor would need its own product decision.
- **Single point of failure.** If the camera runs through Stream Jams, a Stream Jams crash blanks the camera on stream. Every output option below needs a fallback story.
- **Licence.** Stream Jams is AGPL-3.0-or-later. Apache-2.0, MIT, BSD and Zlib libraries are compatible. Proprietary SDKs (NVIDIA Maxine) need a licence review before they ship.

## Recommendation

1. **Pipeline:** a hidden Electron renderer, the same shape as the Videos mirror. `getUserMedia` on the selected camera, MediaPipe Face Landmarker on the GPU, effects drawn with PixiJS v8 and `pixi-filters`, output as a canvas stream.
2. **Output, first version:** loopback WebRTC to an OBS browser source and the desktop overlay preview, reusing the mirror publisher. Carry transparency by packing the alpha matte beside the colour image and recombining it in the receiving page.
3. **Output, later and evidence-led:** Spout2 (lowest latency, keeps alpha, OBS only) or a Windows virtual camera (works in Discord, Zoom and any camera app). Each needs a native addon, so add one only if the measured WebRTC delay or the need for non-OBS consumers justifies it.
4. **Effects model:** a typed effect catalogue with validated parameters and face anchors, ordered stacks as presets, and timed runtime overrides as dynamic effects. No arbitrary shaders.
5. **First step:** a feasibility gate (see [Proposed Feasibility Gate](#proposed-feasibility-gate)) before an OpenSpec proposal, like the Videos mirror.

The rest of this record is the evidence for those choices.

## Option Matrices

### Where The Pipeline Runs

| Option | Pros | Cons | Fit |
| --- | --- | --- | --- |
| **A. Hidden Electron renderer (recommended)** | Reuses mirror publisher, diagnostics and GPU setting. Web libraries only, no native build. One camera open, many outputs. Management preview is the same pipeline. | Depends on GPU acceleration being on. Adds WebRTC encode delay. Hidden windows need background throttling off. | Strong |
| B. OBS browser source does everything | Cheapest prototype. No desktop app needed. | OBS must be launched with `--enable-media-stream`, which has broken across OBS releases. Each source opens the camera. Not available to the desktop overlay or other apps. Hard to diagnose. | Prototype only |
| C. Native sidecar (Python or C++ with MediaPipe, OpenCV or OpenSeeFace) | Direct GPU and camera access. Native virtual camera or Spout output is natural. | New runtime to package and supervise. Effects rebuilt outside the web stack. Larger installer. | Weak |
| D. Leave it to OBS plugins (shader filter, face tracker, NVIDIA filters), driven over OBS WebSocket | Least Stream Jams code. Zero-copy inside OBS. | OBS WebSocket is deferred. Plugins are separate GPL installs with separate update cycles. Effects are limited to what plugins expose. No face-anchored warps without stitching plugins together. | Worth knowing; does not meet the goal |

### Output Transport

| Option | Latency | Alpha | Consumers | Native code | Licence and status | Pros | Cons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Loopback WebRTC to browser source (recommended first)** | About 75 to 150 ms measured for Videos | Not in VP8; use a packed alpha matte | OBS browser sources, desktop overlay, management preview | None | In repo | Already built and measured; reconnects; per-output size caps | Encode cost per output; delay needs an OBS audio sync offset; browser-source CEF must stay healthy |
| Spout2 via Electron offscreen shared texture | About one frame | Yes | OBS (with the third-party Spout2 plugin), Resolume, TouchDesigner | Native addon to import the shared D3D11 texture and send it | Spout2 BSD-2-Clause, active (pushed 2026-10-23). Electron `useSharedTexture` is experimental. The only Electron Spout bridge found (`reitowo/electron-spout`) is unlicensed and inactive since 2024. | Zero-copy GPU path; keeps alpha | Experimental Electron API; OBS needs an extra plugin; we would own the addon |
| Virtual camera, DirectShow (Softcam) | About one frame plus readback | No (most consumers ignore it) | Any DirectShow camera app: OBS, Discord, Zoom, Chromium | Addon that sends frames to `softcam.dll` | MIT, active (pushed 2026-10-28) | Works everywhere a webcam works | Registration needs administrator rights (installer step); GPU-to-CPU readback each frame; not visible to Media Foundation-only apps |
| Virtual camera, Windows 11 `MFCreateVirtualCamera` | About one frame plus readback | No | All Media Foundation and most DirectShow apps | COM media source DLL hosted by the Windows Frame Server, plus shared-memory frame handoff | Microsoft API (Windows 11 build 22000+); `smourier/VCamSample` MIT sample, active | Modern, appears as "… Windows Virtual Camera" in every app | Most native code of any option; DLL registration needs administrator rights; frame server runs as a separate service process |
| Virtual camera, akvirtualcamera | About one frame plus readback | No | Any camera app | Separate install | GPL-3.0, last pushed 2026-05-15 | Ready-made driver | Separate install and GPL licence to review for bundling |
| NDI | A few frames | Yes | OBS with DistroAV plugin, many tools | Native SDK | Proprietary SDK, free to use | Network-capable | Proprietary; conflicts with the local-only default |

### Face Tracking

| Option | Output | Runs in | Licence | Status (2026-10-29) | Pros | Cons |
| --- | --- | --- | --- | --- | --- | --- |
| **MediaPipe Face Landmarker (`@mediapipe/tasks-vision`) (recommended)** | 478 3D landmarks, 52 blendshape scores, head transform matrix, multiple faces | Browser/Electron, WebGL GPU delegate or WASM CPU | Apache-2.0 | 1.2.0, published 2026-10-28; Google repo active | Dense mesh suits local warps; blendshapes allow expression triggers (mouth open, blink); same package has the selfie and hair/skin segmenters | Google has reorganised the docs; pin the model file and version |
| TensorFlow.js `face-landmarks-detection` | Wraps MediaPipe FaceMesh | Browser | Apache-2.0 | Last published 2024-10 | Familiar API | Stale; adds TF.js runtime for what MediaPipe does directly |
| Human (`@vladmandic/human`) | Face mesh, iris, emotion, body, hands | Browser/Node | MIT | 3.3.6, last published 2025-08; single maintainer | Broad feature set | Slowing maintenance; heavier than needed |
| Jeeliz FaceFilter | Head position and rotation only | Browser | Apache-2.0 | Last pushed 2025-11; not on npm | Very light | No dense landmarks, so no local face warps |
| face-api.js | 68 landmarks | Browser | MIT | Last published 2022 | — | Unmaintained |
| NVIDIA Maxine AR SDK | 68 or 126 landmarks, 3D face mesh, expressions | Native C++, RTX GPU with Tensor Cores | Proprietary NVIDIA licence and model licence | NVIDIA-hosted (NGC) | High quality; same vendor as Broadcast | Native addon; RTX-only; proprietary licence to review against AGPL; separate runtime install |
| OpenSeeFace | 66 landmarks, expressions | Python and ONNX on CPU | BSD-2-Clause | Active (pushed 2026-09-18) | VTuber-proven, tolerant of low light | Python sidecar; sparser landmarks |
| dlib | 68 landmarks | Native C++ | BSL-1.0 | Active | Mature | CPU-only, older model, native build |

Jitter: MediaPipe landmarks wobble frame to frame. Smooth them with the One Euro filter (`1eurofilter`, BSD-3-Clause, active) rather than a hand-written filter.

### Effect Rendering

| Option | Licence | Status | Pros | Cons |
| --- | --- | --- | --- | --- |
| **PixiJS v8 + `pixi-filters` (recommended)** | MIT | `pixi.js` 8.22.0 (2026-10-27); `pixi-filters` 6.1.5 (2025-11) | Ready catalogue that covers most requested filters: bulge-pinch and twist (face warps centred on a landmark), shockwave, zoom and radial blur, pixelate, glitch, RGB split, CRT, old film, ASCII, colour map and HSL, bloom, outline. `Mesh` with custom geometry handles face-mesh warps such as big eyes or face slimming. | 2D only; 3D accessories need another library |
| three.js (+ `postprocessing`) | MIT, Zlib | three 0.186.1 (2026-09); postprocessing 6.39.5 (2026-09) | 3D masks, hats and glasses placed with the Face Landmarker transform matrix; strong mesh tooling | Fewer ready 2D filters; larger API surface |
| Raw WebGL2 with own shaders | — | — | No dependency; full control | Hand-rolling standard filters, against the stated preference |
| WebGPU | — | Shipping in Chromium | Future performance headroom | Not needed for 1080p30 2D effects; PixiJS v8 can target it later |
| OpenCV.js | Apache-2.0 | Active | Classical vision tools | CPU and WASM, too slow per frame for live effects |

Commercial face-filter SDKs (Banuba, DeepAR, Snap Camera Kit) were not evaluated; they are not open source.

## Input, NVIDIA Broadcast And Transparency

- The NVIDIA Broadcast camera is a normal camera device, so `getUserMedia` can open it. Broadcast then owns the physical camera; Stream Jams uses Broadcast's virtual camera.
- Broadcast's background removal outputs alpha that OBS honours. Consumers that ignore camera alpha see a black background ([Resolume report](https://resolume.com/forum/viewtopic.php?p=81834); a [Unity report](https://discussions.unity.com/t/webcamtexture-not-reading-alpha-channel/856568) shows the same for another consumer). Chromium's camera capture is expected to drop alpha as well. **Unverified: the feasibility gate must test it.**
- If alpha is lost, there are three routes:
  1. In Broadcast, use background replacement with a solid key-colour image, then chroma key in Stream Jams before effects run. Keeps NVIDIA's segmentation quality.
  2. Use MediaPipe's selfie segmenter inside Stream Jams. No RTX needed; lower edge quality than NVIDIA.
  3. Leave background removal to OBS's NVIDIA Background Removal filter applied to the Stream Jams output (OBS 28+). Needs checking that the filter applies to a browser source.
- **Order matters.** Key first, then warp, so the warp moves the person and the matte together and no key colour bleeds into warped edges.
- **Transparency over WebRTC.** VP8 has no alpha. Send the matte as a second image beside the colour image in the same frame and recombine in the receiving page's shader, so the OBS browser source renders transparent. Spout2 carries alpha natively.

## Effects, Presets And Dynamic Effects

A proposed model, kept within the NP-001 spirit:

- **Effect type** comes from a fixed catalogue in `packages/core`, each with a schema: for example `bulge`, `pinch`, `twist`, `pixelate`, `glitch`, `rgbSplit`, `colorMap`, `chromaKey`, `bigEyes`, `faceSlim`, `sprite` (an image pinned to a landmark).
- **Anchor**: whole frame, or a named face region from a fixed table mapping regions to MediaPipe landmark indices (left eye, right eye, mouth, nose, face oval, forehead). Radius and strength scale with face size so effects stay proportional as the streamer leans in.
- **Preset**: a named, ordered stack of effects with parameters. Stored in SQLite and included in backup.
- **Dynamic effect**: a runtime command to apply a preset or one effect, with optional intensity and duration, from the management UI, Operator, the automation API or an event bus rule (for example a channel-point redemption that adds big eyes for 30 seconds). Live slider changes in the editor are the "on the fly" path, with an option to save as a preset.
- **Expression triggers** (later): blendshape thresholds, such as "mouth open above 0.6", fire an effect.
- **Tracking loss**: face-anchored effects hold the smoothed last pose briefly, then fade out. Frame-wide effects continue.
- **Safety**: one control returns to pass-through instantly; the pipeline never blocks the raw frame on tracking.

## Risks And Open Questions

| Risk or question | Why it matters | How to settle it |
| --- | --- | --- |
| Total delay through WebRTC | Above about 150 ms, lip sync needs an OBS audio offset and live reactions feel late | Measure in the gate with the timestamp barcode; Spout2 or a virtual camera is the fallback |
| Camera alpha from NVIDIA Broadcast in Chromium | Decides between chroma key, MediaPipe segmentation or OBS-side removal | Test in the gate |
| GPU load with a game, NVIDIA Broadcast and OBS encoding at once | Dropped frames on stream | Measure GPU and frame timing in the gate with a game running |
| GPU acceleration turned off in Settings | Tracking and effects would fall back to software | Refuse to start the module and say why; record whether the GPU-process exit issue recurs |
| Stream Jams crash blanks the camera | Visible on stream | OBS scene keeps the raw camera as a hidden fallback; the browser source shows the last frame and reconnects |
| Multiple faces in frame | Effects could jump to a guest | Track the largest or most central face; make it configurable later |
| Should the output also work outside OBS (Discord, Zoom)? | Only a virtual camera achieves it | Product decision; deferred to a follow-up |
| Should the module allow custom shaders? | NP-001 conflict, support burden | Product decision; recommendation is no |

## Proposed Feasibility Gate

A `--camera-effects-check` diagnostic mode, built like `--video-mirror-check`: own temporary profile, no settings changed, served on `127.0.0.1` behind a per-run token.

1. List cameras; open the physical camera and, separately, the NVIDIA Broadcast camera at 1080p30.
2. Report whether alpha survives from Broadcast with background removal on.
3. Run Face Landmarker on the GPU delegate with blendshapes on; report inference time per frame and dropped frames.
4. Apply three effects: bulge on both eyes, a full-frame `glitch` filter and a face-mesh `bigEyes` warp.
5. Publish to an OBS browser source and the desktop overlay through the mirror publisher, with and without the packed alpha matte.
6. Report glass-to-OBS latency with a timestamp barcode on screen, frame rate at each receiver, and CPU and GPU use, once idle and once with a game running.

Pass criteria to propose: 30 fps sustained at each receiver, tracking under 15 ms per frame on the maintainer's GPU, glass-to-OBS delay under 150 ms, and no visible effect drift during normal head movement. If delay fails while everything else passes, the next step is a Spout2 or virtual camera spike, not abandoning the pipeline.

## Sources

- MediaPipe [Face Landmarker guide](https://ai.google.dev/mediapipe/solutions/vision/face_landmarker) and [web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js); npm `@mediapipe/tasks-vision` 1.2.0.
- NVIDIA [Maxine AR SDK on GitHub](https://github.com/NVIDIA/MAXINE-AR-SDK), [AR SDK user guide](https://docs.nvidia.com/maxine/ar/latest/nvidia-ar-sdk-user-guide.pdf), [NGC Face Landmark Tracking](https://catalog.ngc.nvidia.com/orgs/nvidia/maxine/collections/nvarlandmarkdetection/-).
- NVIDIA [Broadcast release notes](https://www.nvidia.com/en-gb/geforce/broadcasting/broadcast-app/release-notes/); [OBS 28 NVIDIA filters](https://www.videomaker.com/news/obs-28-0-adds-nvidia-broadcast-features/).
- Electron [offscreen rendering](https://electronjs.org/docs/latest/tutorial/offscreen-rendering) and [shared texture](https://electronjs.org/docs/latest/api/structures/offscreen-shared-texture).
- Microsoft [`MFCreateVirtualCamera`](https://learn.microsoft.com/en-us/windows/win32/api/mfvirtualcamera/nf-mfvirtualcamera-mfcreatevirtualcamera); [VCamSample](https://github.com/smourier/VCamSample); [Softcam](https://github.com/tshino/softcam); [akvirtualcamera](https://github.com/webcamoid/akvirtualcamera); [Spout2](https://github.com/leadedge/Spout2).
- OBS browser source camera access: [forum thread](https://obsproject.com/forum/threads/cant-get-mediastream-permissions-in-browser-source.143858/latest).
- WebRTC lacks alpha: [webrtcHacks transparent background](https://github.com/webrtchacks/transparent-virtual-background).
- Libraries: [PixiJS](https://github.com/pixijs/pixijs), [pixi-filters](https://github.com/pixijs/filters), [three.js](https://github.com/mrdoob/three.js), [Human](https://github.com/vladmandic/human), [Jeeliz FaceFilter](https://github.com/jeeliz/jeelizFaceFilter), [OpenSeeFace](https://github.com/emilianavt/OpenSeeFace), [dlib](https://github.com/davisking/dlib), [obs-shaderfilter](https://github.com/exeldro/obs-shaderfilter), [obs-face-tracker](https://github.com/norihiro/obs-face-tracker), [obs-backgroundremoval](https://github.com/royshil/obs-backgroundremoval).
