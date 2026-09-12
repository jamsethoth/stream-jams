# Routed Video Audio and Desktop Overlay Manual Acceptance Plan

## Purpose

This checklist records the completed validation that required real Windows hardware, OBS, or human observation. Authoring, legacy migration, persistence, preview controls, routing logic, alias deduplication, failure isolation, timing deadlines, codec decoding, and application lifecycle have automated coverage recorded in [routed-video-audio.md](routed-video-audio.md) and are not repeated here.

Do not run this plan during a live stream or a recording that matters.

Build under test:

- Executable: `apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe`
- Executable SHA-256: `a1f91faab1d1e1de7dabfedbeee153c63ff5531e89629a8954f4277c530b4491`
- `app.asar` SHA-256: `0931828f29f073a36aade03a6ddb859021c4914feef2dbccd18108498362f4f4`
- Audio-bearing fixture: `C:\Users\James\Downloads\9855bf4d-ada5-4b68-952d-89dd21030f36.webm`
- Fixture SHA-256: `86d8aee0264dc8b6feef672b4b2b4b8bec6d198bc97dc77bd8928dc110d8ac07`
- Temporary audio-only copy for the separate audio layer: `apps/desktop/out/manual-validation/9855bf4d-audio-only.wav`
- Audio-only copy SHA-256: `3829e8e1516085d7ccbdc8732754427aadc9e7542ec13d1fa5a2df2d7f9dbe30`

Keep overlay route keys and local device IDs out of screenshots, chat, issue text, and public evidence. Friendly device names are sufficient.

## Required equipment and preflight

- [ ] Confirm Stream Jams is not connected to a live production event source, or pause event intake.
- [x] Identify two distinct physical outputs as Device A and Device B. Use low but audible Windows volume.
- [x] Confirm the vertical display is connected and enabled.
- [ ] Confirm OBS is not streaming. Use only a disposable local recording.
- [ ] Record the Windows, OBS, GPU driver, display refresh-rate, and friendly device information in Results.
- [ ] Record the initial OBS Browser Source monitoring and Desktop Audio capture settings.

## 1 — Physical device routing

Use the alert containing the known WebM video with **Play embedded audio** enabled. Set Browser Source audio off and **Send audio** on.

- [x] Select Device A only and send the alert.
- [x] Select Device B only and send the alert.
- [x] Select Device A and Device B together and send the alert.
- [x] Upload the temporary audio-only WAV as a separate audio layer, enable both sources, and repeat the two-device case.

Pass when:

- The soundtrack is audible exactly once on each selected device and nowhere else.
- Two selected devices begin together without an obvious stagger.
- The video soundtrack and separate sound both play when enabled, with perceptibly independent volumes.
- No default, communications, or unselected device receives a fallback copy.

The first run used only the WebM soundtrack. A perceptible stagger was reported between the two physical outputs. The separate-source portion was not exercised because the video file could not be uploaded as an audio asset; the temporary WAV above removes that blocker. Measure the physical-output stagger in Section 5 before classifying it as application scheduling or endpoint/driver latency.

Status, September 11, 2026: **Passed.** The user completed Stage 1 after the audio-only WAV became available. The initial perceptible inter-device stagger remains an observation to quantify in Section 5; it does not erase the successful routing/source-independence result.

## 2 — Physical disconnect and safety controls

- [x] Start Device A playback and select **Mute alert audio** in the operational view.
- [x] Confirm physical sound stops immediately while the visual continues.
- [x] Unmute and confirm the interrupted occurrence does not replay.
- [x] Start a fresh alert and select **Skip current alert**.
- [x] Confirm its physical sound and visual stop before the next queued item starts.
- [x] Temporarily disconnect or disable Device B, then send a Device B-only alert.
- [x] Confirm nothing plays on Device A or the Windows default and that Stream Jams reports Device B unavailable.
- [x] Reconnect Device B and send a fresh alert. Confirm the interrupted occurrence does not replay.
- [x] Start another alert and fully Quit Stream Jams.
- [x] Confirm physical sound and every overlay stop within two seconds and no Stream Jams window remains.

Pass when physical mute, Skip, disconnect, reconnect, and Quit match the expected behavior without fallback or replay.

Status, September 11, 2026: **Passed.** The user completed Stage 2 with the expected mute, Skip, device-disconnect, reconnect, and Quit behavior. Detailed per-step observations were not separately recorded.

## 3 — OBS Browser Source and combined routing

- [x] Launch Stream Jams again if the previous section ended it.
- [x] Add the applicable private Stream Jams URL to a disposable OBS Browser Source. Do not record the URL in evidence.
- [x] Turn Browser Source audio on, turn direct device routes off, and keep OBS source monitoring off. Send the alert.
- [x] Confirm OBS receives one soundtrack and Stream Jams creates no direct physical-device copy.
- [x] Turn Browser Source audio off and Device A on. Send again.
- [x] Confirm the Browser Source receives no explicit soundtrack. Note separately if OBS Desktop Audio captures Device A.
- [x] Turn Browser Source audio and Device A on together. Disable OBS monitoring and any Desktop Audio capture of Device A, then send again.
- [x] Confirm OBS receives one Browser Source copy and Device A receives one direct copy.
- [x] Deliberately enable the relevant OBS monitoring or Desktop Audio capture to characterize any duplicate, then restore the original OBS configuration.

Pass when Stream Jams follows its selected destinations and every additional copy can be attributed to the recorded OBS monitoring/capture configuration.

Status, September 12, 2026: **Passed, with an accepted combined-path limitation.** Browser Source initially played the separate audio layer but omitted the enabled WebM soundtrack, while device routing played it correctly. The renderer already preserved `video-soundtrack` and used a zero-size `<video>` element; the remaining fault was the Alert Editor's **Send test** projection, which emitted the video visual without its normalized soundtrack instruction. A regression now asserts that both instructions are queued. After the rebuilt app and refreshed OBS source were tested, the user confirmed that the embedded audio played correctly. Further listening found variable latency rather than a stable offset: the SFX/device path consistently led the Browser Source, with additional Browser Source delay subjectively bounded at roughly 100–200 ms. The user accepted this as a low-impact limitation of the independent direct-device and OBS monitoring pipelines.

## 4 — Desktop overlay on the vertical display

- [x] In **Settings → Overlay surfaces**, select the vertical display for **Desktop overlay**.
- [x] Enable desktop output, enable the **alerts** layer, and save that surface.
- [x] Send the known WebM alert with one physical audio route selected.
- [x] Observe the complete clip on the vertical display.
- [x] Type and click in an ordinary application beneath the transparent overlay.
- [x] Inspect the Windows taskbar while the overlay is active.
- [x] Repeat with the management window hidden and with an ordinary window overlapping the selected display.
- [x] Temporarily disconnect the vertical display through Windows Display settings during playback, then reconnect it.

Pass when:

- Motion is acceptably smooth for the source clip.
- Content scales uniformly to fit and never stretches, clips, crosses display boundaries, or moves to another monitor.
- Underlying applications receive typing and clicking.
- The taskbar shows only the ordinary Stream Jams/control entry, not an overlay entry.
- Hiding management does not affect playback.
- Display loss stops that display's playback without replaying it or moving it elsewhere.

Automatic re-establishment after display identity loss remains BL-051 backlog work and is not required for this acceptance.

Status, September 11, 2026: **Passed.** The WebM played with correct proportions and acceptably smooth motion on the vertical display; the transparent overlay preserved desktop visibility and input, added no overlay taskbar entry, and continued with management hidden. Disconnecting the display through Windows Display settings stopped its visual and audio without replay, fallback to another monitor, overlap, or clipping after reconnection. Independently routed audio was not required for this display-loss case.

## 5 — Measured audio/visual synchronization

Automated tests establish common media clocks but cannot measure acoustic output, OBS capture latency, or perceived presentation. Measure every endpoint that will be declared supported.

Status, September 12, 2026: **Measurement procedure waived; capability accepted.** The user observed acceptable audio/visual synchronization in every individual Browser Source, physical-device, and desktop-overlay case. Further combined-path listening found that the SFX/device source consistently led the Browser Source by a variable amount, subjectively no more than roughly 100–200 additional ms. Recorded waveform/frame measurements would add release-grade numeric evidence and a future regression baseline, but remain waived as disproportionate for this local-first acceptance. The user explicitly accepted the combined-path variance as a known low-impact limitation.

### OBS Browser Source

- [x] Waived — record a Browser Source-only alert locally in OBS at 60 fps or higher.
- [x] Waived — identify the first visible marker frame and first audible waveform onset in a video editor.
- [x] Waived — repeat the comparison near five seconds and near ten seconds when the fixture duration permits.

### Physical Device A and Device B

- [x] Waived — record the vertical overlay and audible Device A output together with a phone or camera at 60 fps or higher.
- [x] Waived — repeat the recording for Device B.
- [x] Waived — record Device A and Device B playing together with both distinguishable.
- [x] Waived — calculate per-device visual onset, drift, and the Device A versus Device B onset difference.

Pass when absolute onset skew and observed drift are each no more than 150 ms for every supported endpoint. At 60 fps, 150 ms is nine frames; at 120 fps, it is eighteen frames.

Subjective calibration, September 12, 2026: an initial comparison against overlapping copies of the exact Flashbang WebM suggested approximately **30 ms**, but repeated listening showed the offset was variable. The SFX/device source consistently preceded the Browser Source, with the Browser Source subjectively adding no more than roughly **100–200 ms**. No recorded waveform/frame analysis was performed. Individual audio/visual sync was acceptable, while combined-path variance remains a capability decision against the 150 ms target.

## Results

Environment:

- Date/time: September 11, 2026
- Windows version:
- OBS version: 32.2.2
- GPU and driver:
- Vertical display and refresh rate:
- Device A friendly name:
- Device B friendly name:
- Initial OBS monitoring/capture configuration:

| Required check | Result | Actual observation or measurement | Evidence or Diagnostics reference |
| --- | --- | --- | --- |
| Device A only | Pass | Stage 1 passed; detailed device observation not separately recorded | |
| Device B only | Pass | Stage 1 passed; detailed device observation not separately recorded | |
| Two devices and two audio sources | Pass | Video soundtrack and separate WAV source routing passed; initial perceptible inter-device stagger remains for Section 5 measurement | |
| Physical mute and Skip | Pass | Stage 2 passed; detailed mute and Skip observations were not separately recorded | |
| Device disconnect and no fallback | Pass | Stage 2 passed; detailed disconnect and reconnect observations were not separately recorded | |
| Physical Quit silence | Pass | Stage 2 passed; detailed Quit observation was not separately recorded | |
| OBS Browser Source only | Pass | After fixing Send test projection and refreshing the OBS source, the enabled Flashbang WebM soundtrack played correctly | Focused 70-test editor-service regression plus manual OBS confirmation |
| Device only with OBS open | Pass | Explicit device routing played the WebM embedded soundtrack correctly | |
| Combined OBS and device routing | Pass with accepted limitation | Browser Source and device output both played, but the SFX/device path consistently led by a variable, subjectively bounded 100–200 ms | Independent OBS monitoring latency accepted; no waveform capture |
| Vertical desktop overlay | Pass | Correct aspect ratio, acceptable motion, input pass-through, no overlay taskbar entry, and hidden-management playback | Manual vertical-display validation |
| Display disconnect | Pass | Visual and audio stopped without fallback, replay, overlap, or clipping after reconnect | Manual Windows Display settings validation |
| OBS onset and drift | Waived; subjective pass individually | Browser Source audio/visual sync was acceptable; combined delivery lagged the SFX/device source variably | No waveform capture |
| Device A onset and drift | Waived; subjective pass | Audio/visual sync was acceptable | Explicit capability acceptance; no camera capture |
| Device B onset and drift | Waived; subjective pass | Audio/visual sync was acceptable | Explicit capability acceptance; no camera capture |
| Device A versus Device B onset difference | Waived; subjective pass | Individual device behavior was acceptable; no camera comparison was made | Explicit measurement waiver |

## Stop conditions

Stop the current section and preserve evidence if:

- Sound plays on an unselected or fallback device.
- A logical destination produces duplicate physical playback.
- Mute, Skip, or Quit leaves sound running.
- The overlay intercepts input, creates its own taskbar entry, changes display, clips, warps, or remains visibly choppy.
- Playback restarts after device/display reconnection without a new event.
- An endpoint exceeds the 150 ms target or accumulates drift.
- The queue remains blocked beyond the alert duration plus five seconds.
- Quit leaves sound, an overlay, a listener, or another Stream Jams process after two seconds.

Do not compensate by rebinding to a fallback, silently changing OBS capture, adding codecs/drivers, or weakening the timing target. Record the exact configuration and Diagnostics reference.

## Completion

- [ ] Restore global mute, queue state, OBS monitoring/capture, device volumes, and display settings to their initial values.
- [ ] Preserve any temporary alert, route, or OBS source needed to reproduce a failure; otherwise label or remove it.
- [x] Add the completed results to [routed-video-audio.md](routed-video-audio.md).
- [x] Reconcile completed OpenSpec task 3.2.
- [x] Reconcile OpenSpec tasks 1.2, 1.3, 5.2, and 5.3 after the remaining evidence passes or has an explicitly accepted capability decision.
