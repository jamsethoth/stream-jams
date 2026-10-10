# Video Mirror Feasibility (OpenSpec `add-video-request-queue` 1.2)

Dated record for the Videos desktop mirror gate: one hidden player in the desktop app, captured with its own audio, sent over loopback WebRTC to OBS browser sources and the desktop overlay, with audio fanned out to chosen devices.

The check is built into the desktop app as a diagnostic mode. It runs instead of the normal app, uses its own temporary profile, changes no Stream Jams settings, and serves its pages on `127.0.0.1` behind a per-run token.

## How To Run It On Windows

1. Download the `windows-desktop-package` artifact from the latest CI run on PR #158 and unzip it.
2. Close Stream Jams if it is running.
3. In PowerShell, from the unzipped folder, run `& ".\Stream Jams.exe" --video-mirror-check`.
4. In the check window:
   1. Choose **Test pattern** first, then **Load player** and **Start capture**.
   2. In OBS, add a Browser Source at 1280×720 with **Control audio via OBS** ticked, using the URL the window shows.
   3. Press **Open desktop overlay receiver**.
   4. Tick one or more audio devices and press **Play captured audio on ticked devices**.
   5. Pick a YouTube link and press **Load player** again. The source changes inside the same player, so OBS and the desktop receiver should switch to it without any other step. Repeat with a Twitch clip and a Twitch VOD, trying the pause, play and jump buttons for each. Changing the player host or audio capture opens a new player; the outputs reconnect by themselves.
   6. Tick what you saw and heard, then press **Copy results** and paste them in the thread.
5. Run it once more with `--video-mirror-check --video-mirror-check-gpu` to compare CPU with hardware acceleration, which the normal app turns off.

## What The Results Mean

| Field | Gate question |
| --- | --- |
| `capture.ok`, `capture.audio` | Frame capture with the player window's own audio works (`audioMode: frame`). If it fails, the fallback is window capture plus OBS desktop audio (task 1.2a). |
| `capture.audio.settings` | Must show `echoCancellation`, `noiseSuppression` and `autoGainControl` false and two channels. |
| `bySource.<source>.receivers.*` with `userAgent: obs` | The OBS browser source connected, with frame rate, delay (`delayMedianMs`) and audio level (`audioPeak`). |
| `bySource.<source>.receivers.*.pair` and `reconnects` | Which ICE candidates connected (`host:lan`, `host:loopback` or `host:mdns`). Shows whether loopback-only ICE is enough. |
| `bySource.<source>.fan-out` | Each ticked device accepted `setSinkId` and started. |
| `bySource.<source>.twitch-*` | Whether the Twitch frame's `<video>` was found and paused, played and moved (task 1.2b). |
| `youtubeMessages` | The YouTube `postMessage` shapes seen (task 1.4). |
| `metrics` | Average and peak CPU and memory across all app processes while the check ran. |

## Results

### 2026-10-08: Linux container baseline (not the gate)

Electron 44.5.1 under Xvfb, software rendering, test pattern source, desktop receiver window only. This shows the pipeline works end to end; it does not replace the Windows run.

- Frame capture from the hidden player window succeeded, including the window's own audio, in 11 ms.
- With default constraints the captured audio was mono with echo cancellation, noise suppression and gain control on. The check now asks for these off, and gets two channels with them off. The product player must request the same.
- Loopback WebRTC connected on host candidates at 30 fps with the `libvpx` encoder and no quality limitation.
- Median delay was 58 ms, with a maximum of 93 ms, read from the timestamp strip.
- The receiver measured nonzero audio. Autoplay with sound was refused in the receiver window, so it fell back to muted playback; OBS allows autoplay with sound.
- All app processes averaged 16% CPU, with a 22% peak and about 1 GB of peak working set.

### 2026-10-08: Windows 11 with OBS, first run

Windows 10.0.26200 x64, Electron 44.5.1 (Chrome 152), hardware acceleration off. Two OBS browser sources and the desktop receiver.

What it proved:
- Frame capture of the hidden player window works on Windows in 13 ms, with the window's own audio as a two-channel, 48 kHz track with echo cancellation, noise suppression and gain control off. The window-capture fallback (task 1.2a) is not needed.
- Loopback WebRTC connected to both OBS sources and the desktop receiver on host candidates, with no STUN or TURN, at 31 fps on `libvpx` with no quality limitation. OBS hides its address behind mDNS-style candidates (`host:hidden`), which still connected.
- All app processes averaged 2% CPU with a 10% peak; peak working set was about 1.9 GB.
- Fan-out to one chosen device accepted `setSinkId` and started.
- YouTube `postMessage` shapes match what the browser-source player reads: `infoDelivery` carries `playerState` and `currentTime`, and `initialDelivery` and `onReady` arrive first.

What it did not prove, and why:
- Only the test pattern reached OBS and the desktop receiver, with no sound. Loading YouTube replaced the player window, which ended the capture, and the receivers did not reconnect. The delay figures (about 45 s) are from the frozen last frame, not real latency.
- The receivers marked audio as blocked because the check set the stream twice, which interrupted the first `play()` call. That was a bug in the check, not an OBS autoplay limit.
- Twitch control (task 1.2b) and the YouTube buttons were not reached.

Changes for the second run: sources now swap inside one long-lived player page, so the capture survives a source change; receivers reconnect on their own if a connection fails; the stream is attached once; and results are grouped by source. The product player must work the same way: one host page for the whole session, with providers swapped inside it.

Linux smoke run after the change: the desktop receiver reconnected once after a new player window and resumed at 30 fps with a 75 ms median delay, unblocked audio and a 0.14 audio level.

### 2026-10-08: Windows 11 with OBS, second run

Same PC and settings, one OBS browser source and the desktop receiver.

- The test pattern and then a YouTube video reached OBS and the desktop receiver over the same capture, with no reconnects when the source changed.
- Delay from the player to each output, read from the timestamp strip: test pattern median 126 ms (maximum 453 ms), YouTube median 140 ms (maximum 300 ms). This is inside the 100–300 ms estimate.
- Sound played in OBS and the desktop receiver with nothing blocked, and Jams confirmed picture and sound stayed in sync in OBS.
- OBS connected through a peer-reflexive candidate on its side (`prflx:hidden`), still on the same PC with no STUN or TURN. Loopback-only ICE is enough.
- All app processes averaged 5% CPU with a 9% peak, without hardware acceleration.
- Fan-out to a chosen device started again.

Problem found: the sound kept playing after it was started. The check had no way to stop a source, and its tone was only turned down, not stopped, when the source changed. The check now has **Stop playback**, which clears the player and the device outputs, and closing the check window ends every window and sound. The product must do the same: Stop and Skip end the player's sound, and closing the app ends playback.

Still to check: Twitch clip and VOD with pause, play and jump (task 1.2b), and the YouTube buttons.

### 2026-10-08: Windows 11 with OBS, third run

Same PC and settings, one OBS browser source and the desktop receiver.

- **Twitch clip control from the main process works (task 1.2b).** `webFrameMain.executeJavaScript` found the clip frame's `<video>` element. Pause stopped at 2.1 s, play resumed, and a jump moved from 2.9 s to 6.8 s of a 7.2 s clip. Finding the `<video>` element (`video: true`) is the feature-detection signal; when it is missing, Twitch falls back to play and stop only. A Twitch VOD was not tried; it uses the same player page and is covered by the desktop tests in task 5.8.
- **YouTube control by `postMessage` works (task 1.4).** Pause, play and seek were confirmed by hand. The message shapes match the earlier runs: `initialDelivery` and `onReady` first, then `infoDelivery` with `playerState` and `currentTime`.
- Delay medians across both outputs: test pattern 82–85 ms, Twitch clip 144–155 ms, YouTube 127–151 ms. Maximums stayed under 400 ms.
- Sound played in OBS and the desktop receiver, in sync, with no blocked audio. Stop playback silenced everything, including the device output.
- The desktop receiver reconnected once on its own and carried on.
- All app processes averaged 5% CPU with a 14% peak, without hardware acceleration. Peak working set was about 2 GB.
- Fan-out was tried with one device at a time; a second device at once was not tried. Each element's `setSinkId` is independent, so the product fans out one element per device.

**Audio was not right.** Jams reported the sound was broken in this run, and the device check was left unticked. The likely cause: the capture left the hidden player's own sound playing on the default device, so the same sound also came from the desktop receiver, the device fan-out and any OBS monitoring, each at a different delay. The check now asks for `suppressLocalAudioPlayback` (confirmed honored in a Linux run), mutes the desktop receiver so its sound only goes to the chosen devices, and offers muting the player window as a second test. The gate stays open until a run confirms clean sound.

**Direction, pending the audio fix:** the desktop mirror is feasible on Windows. Build it as one long-lived hidden player page per purpose, with providers swapped inside it, frame capture with voice processing off, loopback-only WebRTC to each output, and automatic receiver reconnects.

### 2026-10-08: Windows 11 with OBS, fourth run

With the player's own sound suppressed, OBS played the sound once and nothing played elsewhere, as intended. Pressing the device button played nothing on the ticked device and added a second copy in OBS.

Cause: the device `<audio>` elements lived inside the captured player page. Frame capture records every sound the page makes, so the device copy was captured back into the mirror (the second copy in OBS), and suppressing the page's local playback also silenced the device copy. In the earlier runs, before suppression, the same loop fed the device copy back into the capture, which explains the doubling.

Change: device output now runs in its own hidden window that receives the mirror like any other output and sends its sound only to the ticked devices. **The product must keep device output out of the captured player page.** A Linux run confirmed the new window connects and accepts its device.

### 2026-10-08: Windows 11 with OBS, fifth run

- **No more doubling.** OBS played the sound once, in sync, and Stop silenced everything. Twitch and YouTube controls worked again.
- **Device output still silent.** The device window received the sound (audio level 0.25–0.33) and each `<audio>` element accepted its device, but nothing was heard on the ticked devices, including with two devices at once.

Change: each device now gets its own `AudioContext` created with that device's `sinkId`, fed from the received track, with the stream kept on a muted `<video>` element so Chromium keeps decoding remote audio. A Linux run confirmed the context starts on its device.

### 2026-10-08: Windows 11 with OBS, sixth run (gate passed)

Twitch clip, with one OBS browser source, the desktop receiver and two ticked devices.

- Jams heard the sound once on each of two devices and once in OBS, with no doubling, in sync, and Stop silenced everything.
- Both device contexts reported `running` on their own device.
- Delay medians: OBS 115 ms, desktop receiver 134 ms, device window 105 ms.
- Jams noted the sound was slightly out of sync between outputs, but close enough to be tolerable. Each output takes its own path with its own delay, so the product gives each device an adjustable delay (task 5.5), and OBS sources can use OBS's own Sync Offset.
- All app processes averaged 5% CPU with an 11% peak, without hardware acceleration.

**Decision: the desktop mirror is feasible on Windows and the gate passes.** The product must follow what these runs proved:
1. One long-lived hidden player page per purpose, with providers swapped inside it, so the capture never restarts.
2. Frame capture with `suppressLocalAudioPlayback: true`, and echo cancellation, noise suppression and gain control off, in stereo.
3. No sound-making element inside the captured player page other than the provider.
4. Loopback-only WebRTC to each output, with receivers that reconnect on their own.
5. The desktop overlay receiver shows the picture muted.
6. Device output runs in its own hidden receiver, with one `AudioContext` per device created with that device's `sinkId`, and the stream kept on a muted media element.
7. Stop, Skip and app exit end the player's sound.

### 2026-10-10: Mirror CPU reductions (Linux container)

Owner report: playing a video in the Videos module cost noticeable CPU on Windows, while alerts and effects did not. Every receiver had its own peer connection carrying the full 1080p capture, so each output cost a full software video encode (hardware acceleration is off app-wide), and the device output received and decoded video it never shows.

Change: receivers say what they need in `hello` (`media`, `maxWidth`, `maxHeight`). The device output asks for audio, the desktop overlay for video, browser sources for video or both (when they play OBS audio), each with its frame size in device pixels. The publisher adds only the requested tracks and sets each video sender to `scaleResolutionDownBy` for that box (never up), `maxFramerate` 30, `maxBitrate` 6 Mbps scaled by encoded area (minimum 0.6 Mbps), and `degradationPreference: "maintain-framerate"`. The capture stays one 1080p, 30 fps capture.

Method: a local Electron script (not committed) using the production player host, player window and device window, with `app.disableHardwareAcceleration()` as in the product, under `xvfb-run` at 1920 x 1080 on a 4-core container. Three receivers: the device output (one fixture device), a desktop-overlay-like window and a browser-source-like window, both showing the default box (1382 x 778). After the item started and the receivers connected (+2 s), `app.getAppMetrics()` `cpu.percentCPUUsage` was summed over all processes once a second for 10 s; figures are means, in percent of one core, three runs each unless noted. Clips: the repo fixture `neutral-with-audio.webm` (320 x 180, looped to 30 s) and a 1080p30 VP8 `testsrc2` motion clip with a tone. The receiver windows are included; without the browser-source-like window (which runs in OBS in practice) the app totals are about 1.5 to 4.5 points lower.

| Clip | No receivers | Before | After | Player page before → after | Device window before → after |
| --- | --- | --- | --- | --- | --- |
| Fixture (looped) | 4.7 | 18.2 | 12.2 | 7.0 → 3.9 | 1.5 → 0.5 |
| 1080p motion | 20.3 | 85.6 | 60.4 | 52.9 → 29.5 | 4.3 → 0.5 |

- With the motion clip, the mirror's own cost (total minus no receivers) fell from about 65 to 40 points of one core, 38% less; the totals fell 29% (fixture 33%).
- Smoothness improved: before, both video receivers got 20 to 24 fps of VP8 at 1918 px wide (the encoder could not keep up three times); after, 30 fps at 1380 px wide. The device window had no video track.
- Alternatives measured with the motion clip (two runs each): `balanced` 61.2 with 15 to 30 fps; `maintain-resolution` 60.8 with 12 to 20 fps; no bitrate cap 64.0 with 26 to 29 fps; `contentHint = "motion"` 26.4 but Chromium's CPU adaptation dropped the picture to 344 px wide, which changes what viewers see, so it is not used. `maintain-framerate` with the scaled cap kept full frame rate at the box size for the least CPU among the options that keep the picture.
- Not shareable: WebRTC encodes per peer connection, so two receivers asking for the same size still cost two encodes. Sharing one encode would need an SFU-style forwarder or a non-WebRTC transport, which is out of scope.
- What remains: the source decode in the player (software VP9 or AV1 for YouTube, H.264 for Twitch), the 1080p capture and compositing in the GPU process (software, about 14 points at idle playback with the motion clip), and one encode per video receiver. Ideas: let the operator cap the capture at 720p, re-enable hardware acceleration for the player window only if the shutdown issue allows, or prefer H.264 through OpenH264 if it measures cheaper than VP8.

