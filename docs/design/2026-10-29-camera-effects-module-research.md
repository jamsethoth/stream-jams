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

## Module Decisions

The maintainer settled these in a design review on October 29, 2026. They take precedence over the proposals later in this record where the two differ, and they are the input to the OpenSpec proposal written after the feasibility gate.

### Module And Process Split

- Camera Effects is a separate registered module, id `camera`, disabled by default. It does not extend Screen Effects.
- It runs only while the desktop app runs. There is no browser-source fallback that opens the camera itself.
- v1 has one camera input and one pipeline.
- The local service owns camera settings, presets, the active look and the active layout, persisted in SQLite and included in backup. A hidden Electron window does all camera and GPU work. Frames never pass through the local service.
- There is no setup wizard screen. As with other modules, the module definition's `wizard` metadata lists the one required field (the camera). The module page is the configuration form and offers the browser-source URLs to copy.

### Camera Input

- The camera opens only while the module is enabled, the desktop app runs and at least one viewer is connected (browser source, desktop overlay or management preview). It closes after about 10 seconds without viewers.
- The module stores the device ID and name. If the ID changes, it rebinds only to exactly one camera with the same name. Otherwise it asks the user to choose. It never falls back to another camera.
- Formats: any resolution the camera advertises from 720p to 2160p, at 30 fps. Processing runs at the camera's resolution; tracking and segmentation run on downscaled copies. A format that fails the feasibility gate on the user's PC is labelled as likely to drop frames, not hidden. 60 fps is deferred ([BL-071](../backlog.md#modules-outputs-and-platform)).
- Mirror image is a camera setting, off by default, applied before face tracking.
- An optional camera setting declares that the feed's background is already a solid key colour (the NVIDIA Broadcast route), with the colour.

### Outputs And Layouts

- Outputs are full-screen scene canvases for both the landscape (1920×1080) and vertical (1080×1920) profiles. The browser source is the main output. The private desktop overlay is optional, as for other modules, and receives the same stream.
- The hidden window streams the processed camera picture only. Each receiving page applies the layout. The stream is never larger than the largest placement in device pixels, and the receiver keeps that size so layout changes never reconnect.
- Layout presets are separate from effect presets. Each layout stores one placement per profile: position and size, crop, shape (rectangle, rounded rectangle or circle), border plus the shared card shadow setting, and a transition (cut, or move and scale over a set duration). A new layout gets an adjustable vertical default, centred and cropped to portrait.
- On camera loss or pipeline failure, outputs turn transparent, and the management page and Operator show the reason and a retry.
- The module is video only. The management page shows the measured delay as a suggested OBS audio sync offset for the microphone.

### Looks And Effects

- Effect presets are built in an effect builder. While the builder is open, the hidden window renders the draft to a management-only preview at most 1080p. The live output changes only on **Apply now**, on saving over the active preset, or while the explicit **Edit live** toggle is on.
- A preset may set a background mode: keep, remove (transparent), blur, or replace with a colour or an Assets image. Unset means the preset does not change the background. With a declared key colour, removal keys that colour, and "keep" also keys it so raw key colour never reaches the stream. Without one, remove, blur and replace use the MediaPipe segmenter, which loads only while a mode needs it.
- First effects: colour adjustment, pixelate, glitch, RGB split, CRT and blur across the frame; bulge, pinch and twist on a face region (eyes, mouth, nose or whole face).
- A base look (one preset, or none for pass-through) persists across restarts. Up to 5 temporary effects stack on top for a set duration. Re-triggering an active one restarts its timer. They apply immediately, with no queue, and are dropped on restart. The newest temporary effect that sets a background decides the background, falling back as effects expire.
- Replacement images register as asset references, so deleting an image a preset uses is blocked or warned about, as with Music.

### Controls And Safety

- The global safety stop clears temporary camera effects but keeps the base look and layout. The module's own **Bypass** shows the plain camera until turned off. Neither hides the camera.
- The Operator panel shows camera status and delay, the base look (changeable), active temporary effects with time remaining (each clearable), the current layout with layout buttons, pinned presets and Bypass.
- A new `camera` automation scope can set the base look, apply a temporary effect with a duration, clear temporary effects, apply a layout, set Bypass and read status, addressed by preset ID.
- Chat and channel-point triggers through the central event bus come in a later slice with cooldowns.

### Edge Cases

- With GPU acceleration off in Settings, the module shows a blocked state and the reason instead of running in software.
- The tracked face is configurable (largest by default, or nearest the centre).
- When tracking is lost, face-anchored effects hold their last smoothed position, then fade out. Both timings are configurable within limits (defaults about 0.5 seconds each). Frame-wide effects and the background continue.
- Diagnostics show camera frame rate, tracking time per frame and measured delay.

### Delivery Order

1. Build the `--camera-effects-check` feasibility gate. The maintainer runs it with OBS.
2. Write the OpenSpec proposal from the results.
3. Implement in six slices, each shippable on its own:
   1. Pass-through: camera selection, format and mirror; browser-source and optional desktop outputs for both profiles with one default placement; Bypass; status and delay.
   2. Background and frame filters: background modes and key colour, effect builder with draft preview, effect presets, base look.
   3. Face tracking: Face Landmarker, region warps and the edge-case rules.
   4. Layouts: layout presets with per-profile placements and transitions.
   5. Controls: temporary effects and stacking, Operator panel, `camera` automation scope.
   6. Event bus triggers with cooldowns.

Deferred follow-ups are in the [backlog](../backlog.md#modules-outputs-and-platform) as BL-069 to BL-076.

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

### Background Removal Inside The Pipeline

The alternative to chaining NVIDIA Broadcast in front of Stream Jams is a background-removal stage inside the module, before effects. Broadcast's virtual green screen is NVIDIA's Video Effects SDK "AI Green Screen" feature (`NVVFX_FX_GREEN_SCREEN`), and other apps can call it:

- **It cannot be bundled.** The SDK and models are proprietary. NVIDIA publishes per-GPU-generation end-user runtimes (RTX 20, 30, 40 and 50 series; listed at version 0.7.6 on the [Broadcast download center](https://www.nvidia.com/en-au/geforce/broadcasting/broadcast-sdk/resources/) on this date) that the user installs, and apps load them at run time. The 2021 Maxine SDK licence forbids use that would make the SDK subject to an open-source licence, and the NGC pages cite differing terms, so the licence inside the current package needs reading before any integration.
- **OBS is the precedent for an open-source app.** OBS (GPL-2.0) ships no NVIDIA files. `plugins/nv-filters/nvvfx-load.h` reads `NV_VIDEO_EFFECTS_PATH` (falling back to `%ProgramFiles%\NVIDIA Corporation\NVIDIA Video Effects`), loads `NVVideoEffects.dll`, `NVCVImage.dll` and `nvVFXGreenScreen.dll` with `LoadLibraryEx`, and disables the filter with "redistributable not found" when they are missing. Elgato Camera Hub and Streamlabs integrate it the same way.
- **It needs native code.** The API is C with CUDA images, so Stream Jams would need a native addon, its first. Run it in an Electron utility process so a driver or CUDA crash cannot take down the app.
- **It changes the frame path.** The browser pipeline cannot hand a GPU texture to CUDA. Either the native side owns camera capture and matting and sends colour plus matte to the renderer (a 1080p RGBA frame is about 8 MB, about 250 MB/s at 30 fps), or the renderer sends frames out and back. Both add copies the gate must measure.
- **It is RTX-only on Windows.** Every other user needs another matting option anyway.

| Option | Quality (expected; compare in the gate) | Runs on | Licence | Integration cost | Fit |
| --- | --- | --- | --- | --- | --- |
| Chain NVIDIA Broadcast in front (current plan) | Best | RTX | Separate NVIDIA app | None; user sets a key-colour background | Works today, needs Broadcast running |
| **NVIDIA Video Effects AI Green Screen, loaded if installed** | Best; same model family as Broadcast | RTX 20 series or newer, Windows | Proprietary runtime installed by the user; not bundled | High: native addon, utility process, CPU frame copies | Optional accelerator, not the default |
| **MediaPipe Image Segmenter (selfie or multiclass)** | Good; softer edges, hair weakest | Any GPU in the browser pipeline | Apache-2.0; already in `@mediapipe/tasks-vision` | Low: no new dependency | Default for everyone |
| Robust Video Matting via `onnxruntime-web` (WebGPU) | Very good, temporally stable hair | Mid to high-end GPU | GPL-3.0 code and weights (combinable with AGPL-3.0); last pushed 2024-04 | Medium: model hosting, WebGPU backend | Upgrade if MediaPipe falls short |
| MODNet via `onnxruntime-web` | Good | Any GPU | Apache-2.0; last pushed 2024-05 | Medium | Second open alternative |

`obs-backgroundremoval` (GPL-3.0) runs MediaPipe, RVM and similar ONNX models in real time inside OBS, which suggests the open options are fast enough, though that is native ONNX Runtime rather than the browser.

**Decision (maintainer, 2026-10-29):** build segmentation as a selectable stage, MediaPipe by default, keep chaining Broadcast as a no-code option, and treat the NVIDIA runtime as an optional accelerator only if the gate shows a quality gap that matters on stream.

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
| Multiple faces in frame | Effects could jump to a guest | Decided: configurable, largest face by default |
| Should the output also work outside OBS (Discord, Zoom)? | Only a virtual camera achieves it | Product decision; deferred to a follow-up |
| Should the module allow custom shaders? | NP-001 conflict, support burden | Product decision; recommendation is no |

## Proposed Feasibility Gate

A `--camera-effects-check` diagnostic mode, built like `--video-mirror-check`: own temporary profile, no settings changed, served on `127.0.0.1` behind a per-run token.

1. List cameras and their advertised formats; open the physical camera and, separately, the NVIDIA Broadcast camera at 1080p30, then at 1440p30 and 2160p30 where advertised. Report whether Chromium uses a hardware encoder and whether the half-resolution packed alpha matte fits at 4K.
2. Report whether alpha survives from Broadcast with background removal on, and compare MediaPipe selfie segmentation against Broadcast's matte on the same scene (hair, hands, chair edges).
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
- NVIDIA Video Effects: [SDK collection](https://catalog.ngc.nvidia.com/orgs/nvidia/maxine/collections/maxine_vfx_sdk/-), [system guide](https://docs.nvidia.com/deeplearning/maxine/vfx-sdk-system-guide/index.html), [2021 SDK licence](https://developer.download.nvidia.com/licenses/Maxine_SDK_License_1Apr2021_updated.pdf), [end-user runtimes](https://www.nvidia.com/en-au/geforce/broadcasting/broadcast-sdk/resources/), [OBS loader](https://github.com/obsproject/obs-studio/blob/master/plugins/nv-filters/nvvfx-load.h).
- Open matting models: [Robust Video Matting](https://github.com/PeterL1n/RobustVideoMatting), [MODNet](https://github.com/ZHKKKe/MODNet).
- WebRTC lacks alpha: [webrtcHacks transparent background](https://github.com/webrtchacks/transparent-virtual-background).
- Libraries: [PixiJS](https://github.com/pixijs/pixijs), [pixi-filters](https://github.com/pixijs/filters), [three.js](https://github.com/mrdoob/three.js), [Human](https://github.com/vladmandic/human), [Jeeliz FaceFilter](https://github.com/jeeliz/jeelizFaceFilter), [OpenSeeFace](https://github.com/emilianavt/OpenSeeFace), [dlib](https://github.com/davisking/dlib), [obs-shaderfilter](https://github.com/exeldro/obs-shaderfilter), [obs-face-tracker](https://github.com/norihiro/obs-face-tracker), [obs-backgroundremoval](https://github.com/royshil/obs-backgroundremoval).
