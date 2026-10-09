# Design: Video Request Queue

## Context

`video-shoutout` (merged in #157) proved the pieces this change builds on:
- Streamer.bot `General`/`Custom` intake.
- Twitch embed validation.
- Module browser-source routes.
- Playback reports keyed by an activation id.
- A transparent fail-closed renderer.

It holds one in-memory clip per purpose, renders only on module browser sources, and has no management or operator surface. The operator's requirements (2026-10-08 thread) add:
- a persisted queue with explicit operator consumption
- multiple providers
- several submission paths
- desktop overlay output
- management and operator UI
- an optional autoplay flag

## Goals / Non-Goals

**Goals**
- One authoritative queue per purpose, persisted in SQLite, that survives restarts without replaying anything.
- Nothing plays without an explicit operator action or an allowed `autoplay` submission.
- The same validation boundary for every submission path.
- One primary player in the desktop app, mirrored to every output, so all outputs show the same frames and play controls act once.
- Pause, resume and seek for providers that expose control. Play and stop for providers that do not.

**Non-Goals (this slice)**
- Duration lookup through YouTube APIs or a background probe (BL-058).
- Refunds, per-viewer limits, history and moderation beyond approve and remove.

## Decisions

### D1. A new `videos` module replaces `video-shoutout`
A general module name fits Twitch, YouTube and direct files. `video-shoutout` was merged only hours earlier and has no management surface, so its keys are expected to be unused.
- A migration removes its module config and outputs.
- The Streamer.bot `VideoShoutout` marker remains accepted as a `videos` submission. Its `action: clear` maps to stop, and `no-clip` maps to a short "No clip to show right now" notice item.
- `docs/video-shoutout.md` becomes `docs/videos.md`.

*Alternative:* keep the id `video-shoutout`. Rejected because the name misdescribes the module.

### D2. Queue model
Items: `{ id, purpose, provider, source, title, requester, submittedVia, durationMs | null, startAtMs, status, autoplay, createdAt, position }`.
- `status` is one of `queued`, `held`, `playing`, `paused`, `played`, `failed` or `removed`.
- `held` means the item's known length is over the max length (`holdReason: "over-limit"`). `held` items show in the queue and play only through an explicit per-item **Play anyway**, which sets `limitOverridden`; an overridden item is never held or cut again.
- An item of unknown length is `queued`, not held, and plays like any other item. When the player first reports a duration for it and that duration is over the limit (and the item is not `limitOverridden`), the queue ends playback immediately, does not mark it `played` or `failed`, and returns it as `held`/`over-limit` at its original `position` (positions never change during playback, so this is where it waited). The run then continues as after a skip: the gap, run snapshot and `acceptingPlayback` gate apply. A duration reported for an item whose length was already known never cuts it.
- `unknown-length` remains a readable legacy `holdReason` value only; the service re-applies the limit at startup, which queues such rows again.
- The queue has an `acceptingPlayback` gate (paused/resumed) and a consumption mode:
  - **Play next** (default): plays the first playable item, then returns to idle.
  - **Play all now**: snapshots the ids of playable items queued at that moment and plays them in order. Items submitted later wait.
- A configurable gap (0–30 s, default 3 s) separates consecutive items in a run.
- **Autoplay:**
  - A submission with `autoplay: true` from an allowed source starts when nothing is playing and the queue is not paused. Otherwise it waits in order.
  - Allowed sources: REST with `videos:control`, management, operator, and Streamer.bot (opt-in setting, default on).
  - Channel point submissions never autoplay.
- **Persistence:**
  - Every mutation runs in a narrow transaction with a monotonically increasing queue revision. Revision guards protect operator, REST and Streamer.bot commands against stale state, following `scoped-automation`.
  - On restart, any `playing` or `paused` item returns to the queue head as `queued`. Nothing replays automatically.

### D3. Providers and validation
One provider registry in `@stream-jams/core/videos` (subpath export, kept off the management bundle as in #157):
- **Twitch clip:** `clips.twitch.tv/<slug>`, `twitch.tv/<login>/clip/<slug>`, or an existing embed URL. Normalized to `clips.twitch.tv/embed?clip=<slug>&parent=<host>`.
- **Twitch VOD:** `twitch.tv/videos/<id>`. Normalized to `player.twitch.tv/?video=v<id>&parent=<host>&autoplay=true`.
- **YouTube:** `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube-nocookie.com/embed/`. Normalized to `https://www.youtube-nocookie.com/embed/<id>?enablejsapi=1&playsinline=1&start=<s>`.
- **Direct file:** HTTPS URL whose host is on the operator allowlist, with a `.mp4` or `.webm` path. Played by a Stream Jams `<video>`.
- Submissions are links, not embed URLs. The server builds embed URLs, so `parent` always matches the serving host (`127.0.0.1` by default). Credentials, ports other than 443, fragments and unknown hosts are rejected.
- Durations: the submitter may supply `durationSeconds`. Streamer.bot clip payloads already do. Otherwise the duration is unknown until BL-058 or until the player reports it, so the item queues and is checked against the limit when that report arrives (D2).

### D4. Player control without third-party scripts in Stream Jams origins
- Overlay and management pages carry keys in their URLs, so no provider JavaScript loads in Stream Jams origins.
- Control happens only on the primary player inside the desktop host (D5).
- **YouTube:** the documented `postMessage` command protocol of `enablejsapi=1` iframes (`playVideo`, `pauseVideo`, `seekTo`, with `infoDelivery` for current time and duration), with the origin pinned to the YouTube host.
- **Direct files:** the Stream Jams `<video>` element.
- **Twitch** has no supported control API:
  - Proposed: the desktop host reaches the `<video>` element inside the Twitch frame through Electron's `webFrameMain` for pause, resume, seek and position.
  - Twitch markup changes can break this, so it is feature-detected per item. On failure the item falls back to play and stop, and the operator sees why.
  - Approved by the operator on 2026-10-08.

### D5. One primary player, mirrored
- **Player host:**
  - The desktop host runs a hidden, non-interactive player `BrowserWindow` per purpose that loads only the Videos player page and the validated provider frame.
  - It is sandboxed with `contextIsolation`, no Node in renderers, and navigation and `window.open` blocked outside the item's provider origin.
- **Capture:**
  - The player page captures its own window with `getDisplayMedia`.
  - The main process's `setDisplayMediaRequestHandler` grants only that window's video and the provider frame's audio (`audio: WebFrameMain`, `loopbackWithMute` where available), so the original sound never reaches the system default device.
  - The capture runs at the configured output resolution (default 1920×1080 at 30 fps).
- **Mirror delivery:**
  - The player page publishes one WebRTC stream per purpose.
  - Desktop overlay and module browser sources subscribe as receivers. Signaling (offer, answer, ICE) is relayed over the existing overlay WebSocket, authorized by each output's overlay key and scoped to `videos`. ICE uses host candidates on 127.0.0.1 only, with no STUN or TURN.
  - Receivers render a muted `<video>` for frames.
- **Audio:**
  - The browser source plays the mirrored audio when "OBS audio" is enabled; that is the default.
  - The desktop host fans the captured track out to each selected device from a separate hidden receiver window, with one `AudioContext` per device bound by `sinkId` and an optional per-device delay, honoring the existing module mute policy. `<audio>` elements with `setSinkId` stayed silent on remote WebRTC tracks on Windows (see the feasibility record).
  - Devices and OBS audio can be combined.
- **Control and state:**
  - The server is authoritative for queue and item state.
  - Commands go to the player host over the private desktop transport; the host reports position, duration and state back. Outputs never control the player.
- **Latency:**
  - Every output sees the same frames, delayed by the capture-and-encode delay. Target: under 300 ms, measured in the feasibility gate.
  - Audio and video travel in the same WebRTC stream, so the browser source stays lip-synced.
  - Device audio skips the WebRTC hop, so it can lead the picture slightly. The gate measures this, and a per-device delay setting compensates if needed.
- **Fallback without the desktop app:**
  - If the desktop host is not running (CLI start), module browser sources play the item in their own sandboxed player following a server clock `{ itemId, state, positionMs, atEpochMs }`, with seeks for drift above 750 ms.
  - Management shows "Mirroring unavailable: desktop app not running".
  - YouTube and direct-file fallback players report the media length once per item (`overlay.playback.duration`); the queue learns it without moving the shared clock, so the length limit applies as with the desktop player.
- **Feasibility gate (first tasks):**
  - On Windows, prove frame audio capture from a cross-origin YouTube and Twitch frame, OBS browser-source WebRTC playback from 127.0.0.1, and multi-device `setSinkId` fan-out.
  - Measure the delay and CPU/GPU cost.
  - If frame audio capture fails, fall back to window capture plus OBS-only audio and report back before continuing.

### D6. Submission paths share one intake service
`VideoRequestIntake.submit(input, source)` validates against D3, applies max-length and autoplay policy, and returns `{ accepted, itemId, status }` or a bounded rejection reason. The callers are:
- management and operator HTTP
- scoped automation REST (`POST /automation/v1/videos/{purpose}/requests`, plus control routes guarded by revision)
- the Streamer.bot custom-event adapter
- the channel point adapter: the operator maps reward ids from the existing Twitch reward catalog, and `userInput` is the link.

Rejections are logged with reason and field names only.

### D7. UI
- **Management "Videos" page** (Mantine, following the module page layout):
  - enablement
  - live and test browser-source URLs, with the desktop overlay toggle
  - max length, gap, OBS audio and device audio targets
  - allowed direct-file hosts
  - reward mappings and the Streamer.bot autoplay opt-in
  - setup docs
  - the full queue with the same actions as the operator UI
- **Operator UI panel:** a now-playing card (title, requester, progress, pause/resume, seek bar, skip, stop) and the queue list (play next, play all now, pause queue, per-item Play anyway, remove, reorder, clear with confirmation).

## Risks / Trade-offs

- **Mirroring costs one encode per active purpose** and adds the capture-and-encode delay to every output. It is acceptable for request videos, which are not latency-critical.
- **Electron frame audio capture is the riskiest dependency.** The feasibility gate proves it before the mirror is built on.
- **Twitch frame control (D4) depends on Twitch markup.** It is feature-detected with a play and stop fallback.
- **Independent fallback players are not frame-exact.** They are used only when the desktop app is not running.
- **The YouTube `postMessage` protocol** is the stable basis of the official iframe API, but it isn't separately documented. The renderer feature-detects `infoDelivery` and falls back to play and stop.
- **Twitch `parent` must match the serving host.** Changing the bind host requires regenerating embed URLs, and the server builds them at render time.
- **Unknown-length items are only checked once a player reports their duration.** The desktop primary player reports it with its start and progress reports. Without the desktop app, browser-source fallback players for YouTube (`infoDelivery.duration`) and direct files (`durationchange`) send one `overlay.playback.duration` report per item (`video:` instruction id, whole-millisecond `mediaDurationMs` from 1 ms to 24 hours, strictly validated by the gateway; ignored while the mirror is available), so an over-limit item can show briefly before it is stopped and held. Twitch fallback players expose no duration, so an over-limit unknown-length Twitch clip still plays to its end without the desktop app until BL-058 lands.

## Migration

- A SQLite migration adds `video_requests` and `video_queue_state` tables and removes `video-shoutout` module rows and outputs.
- BL-053 and BL-057 close when this change is archived.
