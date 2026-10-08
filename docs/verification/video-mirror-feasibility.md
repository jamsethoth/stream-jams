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
   5. Repeat with a YouTube link, a Twitch clip and a Twitch VOD. For Twitch, try both player hosts and the pause, play and jump buttons. For YouTube, try its buttons.
   6. Tick what you saw and heard, then press **Copy results** and paste them in the thread.
5. Run it once more with `--video-mirror-check --video-mirror-check-gpu` to compare CPU with hardware acceleration, which the normal app turns off.

## What The Results Mean

| Field | Gate question |
| --- | --- |
| `capture.ok`, `capture.audio` | Frame capture with the player window's own audio works (`audioMode: frame`). If it fails, the fallback is window capture plus OBS desktop audio (task 1.2a). |
| `capture.audio.settings` | Must show `echoCancellation`, `noiseSuppression` and `autoGainControl` false and two channels. |
| `receivers.*` with `userAgent: obs` | The OBS browser source connected, with frame rate, delay (`delayMedianMs`) and audio level (`audioPeak`). |
| `receivers.*.pair` | Which ICE candidates connected (`host:lan`, `host:loopback` or `host:mdns`). Shows whether loopback-only ICE is enough. |
| `fan-out` | Each ticked device accepted `setSinkId` and started. |
| `twitch-*` | Whether the Twitch frame's `<video>` was found and paused, played and moved (task 1.2b). |
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

### Windows with OBS

Pending: the results Jams pastes from the run above.
