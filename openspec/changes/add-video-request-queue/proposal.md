# Proposal: Add Video Request Queue

## Why

The video shoutout module (`add-video-shoutout-overlay-module`) plays one Streamer.bot-selected Twitch clip on a browser source and has no management page, operator controls, queue, or other providers. The operator wants a general video request feature: Twitch, YouTube, and direct video links from allowed sites, submitted by viewers (channel point rewards), bots (Streamer.bot WebSocket events) and REST automation, held in a persistent queue the operator controls, with a configurable maximum length and the ability to override it per item. Project rules now require every module to support the desktop overlay and a dedicated browser source, a management UI, operator tools, and queues that survive restarts.

## What Changes

- Add a built-in `videos` overlay module ("Videos") that replaces the browser-source-only `video-shoutout` module. Existing Streamer.bot `VideoShoutout` broadcasts keep working and become queue submissions.
- Add a persisted (SQLite) video request queue per purpose (`live`, `test`):
  - Items are always queued. Nothing plays unless the operator starts it, or the submission sets an explicit `autoplay` flag from a source allowed to autoplay.
  - Queue controls: play next, play everything queued at that moment, pause or resume the current video, seek, skip current, stop, remove, reorder, and clear.
  - A configurable gap between videos (default 3 seconds).
  - A configurable maximum length. Items over it, or of unknown length, stay visible as held items that the operator can play anyway.
- Add a provider allowlist:
  - Twitch clips and VODs.
  - YouTube videos and Shorts.
  - Direct video files from hosts the operator lists.
  - Embedded players render only validated provider URLs. Direct files play in a Stream Jams `<video>` element.
- Add submission paths that share one validation boundary:
  - Management UI and Operator UI.
  - Scoped automation REST (`videos:read`, `videos:submit`, `videos:control`).
  - Streamer.bot custom WebSocket events.
  - Native channel point redemptions, where the operator maps a reward whose user input is the video link.
- Play every item in **one primary player hosted by the Stream Jams desktop app**:
  - The player is captured with its audio and mirrored to the desktop overlay and to module browser sources over local WebRTC through the 127.0.0.1 server.
  - Its audio fans out to one or more operator-selected devices.
  - Every output shows the same frames, so pause, resume, seek, ads and buffering stay in sync.
  - Without the desktop app, browser sources fall back to their own player following a server clock.
  - A Windows feasibility gate runs before the mirror is built on.
- Add a Videos management page (enablement, browser-source URLs, limits, allowed hosts, reward mapping, queue) and Operator UI queue tools (now-playing card with pause, seek, skip and stop, plus queue list actions).

## Capabilities

### New Capabilities

- `video-request-queue`: persisted, operator-controlled video requests from allowlisted providers, with multi-path submission, synchronized browser-source and desktop playback, and management and operator surfaces.

### Modified Capabilities

- `video-shoutout-overlay` (from `add-video-shoutout-overlay-module`) is retired. Its Streamer.bot payload is accepted as a `videos` submission, and the `video-shoutout` module, routes and keys are removed.
- `scoped-automation` gains the `videos:*` scopes and routes.

## Out Of Scope (follow-up slices in the backlog)

- Duration lookup for YouTube: an operator API key, Google device sign-in, and a muted desktop metadata probe (BL-058).
- Auditing existing modules against the output-parity and persistent-queue rules (BL-060).
- Refunding channel points for rejected submissions, per-viewer limits and cooldowns, and played-item history.

## Impact

- Code:
  - `packages/core`: contracts, provider URL validation and module definition.
  - `apps/server`: queue service, SQLite repository and migration, intake adapters, automation routes, overlay runtime and desktop recipient.
  - `apps/web`: renderer, Videos management page, Operator panel, Storybook.
  - `apps/desktop`: primary player host, frame and audio capture, WebRTC publisher, device audio fan-out, and the desktop overlay layer.
- Security:
  - Provider players load in sandboxed iframes with `referrerPolicy="origin"`.
  - No third-party script runs in Stream Jams origins; player control uses `postMessage`.
  - Submissions, keys and URLs with credentials are never logged raw.
- No new runtime dependencies are expected. WebRTC, capture and `setSinkId` are Chromium and Electron platform APIs. Signaling uses the existing local WebSocket server.
