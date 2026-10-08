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
