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
- Browser source and desktop overlay output that follow one server playback clock.
- Pause, resume and seek for providers that expose control. Play and stop for providers that do not.

**Non-Goals (this slice)**
- Duration lookup through YouTube APIs or a background probe (BL-058).
- Frame-exact mirroring between outputs and fan-out of embed audio to several devices (BL-059).
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
- `held` means the item is over the max length or of unknown length. `held` items show in the queue and play only through an explicit per-item **Play anyway**.
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
- Durations: the submitter may supply `durationSeconds`. Streamer.bot clip payloads already do. Otherwise the duration is unknown until BL-058, so the item is `held`.

### D4. Playback control without third-party scripts
- Overlay pages carry route keys in their URL, so no provider JavaScript loads in Stream Jams origins.
- YouTube: control uses the documented `postMessage` command protocol of `enablejsapi=1` iframes (`playVideo`, `pauseVideo`, `seekTo`, with `infoDelivery` for current time and duration) with the origin pinned to the YouTube host.
- Direct files: control uses the `<video>` element.
- Twitch: clip embeds expose no control API, so they support play and stop only. Twitch VOD control via the embed `postMessage` protocol is undocumented and is deferred. In this slice Twitch VODs are play and stop only.
- The operator UI disables pause and seek with a reason for items that don't support them.

### D5. Synchronized outputs (interim until BL-059)
- The server owns a playback clock per purpose: `{ itemId, state: playing|paused, positionMs, atEpochMs }`.
- Each output computes the target position. Controllable players correct drift above 750 ms with a seek and ignore smaller drift.
- One output owns audio per item. The default is the browser source. Operators can choose the desktop overlay, which uses existing device routes for direct files only. Every other output mutes its player.
- `overlay.playback.started` and `overlay.playback.failed` keep their current meaning. The first started report from the audio-owning output advances the item from loading to playing.

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
  - max length, gap and audio owner
  - allowed direct-file hosts
  - reward mappings and the Streamer.bot autoplay opt-in
  - setup docs
  - the full queue with the same actions as the operator UI
- **Operator UI panel:** a now-playing card (title, requester, progress, pause/resume, seek bar, skip, stop) and the queue list (play next, play all now, pause queue, per-item Play anyway, remove, reorder, clear with confirmation).

## Risks / Trade-offs

- **Independent players are not frame-exact.** Ads and buffering differ per output. This is acceptable until the BL-059 mirroring.
- **The YouTube `postMessage` protocol** is the stable basis of the official iframe API, but it isn't separately documented. The renderer feature-detects `infoDelivery` and falls back to play and stop.
- **Twitch `parent` must match the serving host.** Changing the bind host requires regenerating embed URLs, and the server builds them at render time.
- **Held unknown-length YouTube items** need a manual Play anyway until BL-058.

## Migration

- A SQLite migration adds `video_requests` and `video_queue_state` tables and removes `video-shoutout` module rows and outputs.
- BL-053 and BL-057 close when this change is archived.
