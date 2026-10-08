## 1. Dependency Gate

- [x] 1.1 Fetch `origin/main`, confirm the branch starts from it, and confirm `video-shoutout` (#157) is merged.
- [x] 1.2 Windows feasibility gate. In a throwaway Electron spike, prove each of the following and record the results in `verification/video-mirror-feasibility.md`:
  - frame audio capture via `setDisplayMediaRequestHandler` from a cross-origin YouTube and Twitch frame
  - loopback-only WebRTC playback in an OBS browser source
  - multi-device `setSinkId` fan-out
  - measured delay and CPU/GPU cost
- [x] 1.2a Stop and report to the operator if frame audio capture fails, with the window-capture and OBS-audio fallback.
- [x] 1.2b Confirm Twitch `<video>` control via `webFrameMain` (approved 2026-10-08) and the feature-detection signal.
- [x] 1.3 Confirm normalized `channel_point_redemption` events with `userInput` reach the event pipeline from Streamer.bot and direct Twitch sources.
- [x] 1.4 Confirm the YouTube `enablejsapi=1` `postMessage` commands and `infoDelivery` messages in a browser test page, and record the message shapes used.

## 2. Core Contracts

- [x] 2.1 Add `videos` types and schemas: item, queue state, playback clock, composition projection and commands.
- [x] 2.2 Add the provider registry with link parsing and embed construction for Twitch clips and VODs, YouTube and allowlisted direct files, exported from `@stream-jams/core/videos`.
- [x] 2.3 Register the `videos` module with module and desktop outputs. Retire `video-shoutout` from the registry.
- [x] 2.4 Add unit tests for provider parsing: positive, negative, and edge (ports, credentials, fragments, Shorts, `t=` offsets).

## 3. Persistence And Queue Service

- [x] 3.1 Add a SQLite migration for `video_requests` and `video_queue_state`, and remove `video-shoutout` rows and outputs.
- [x] 3.2 Add a typed repository with narrow transactions and revision increments.
- [x] 3.3 Implement the queue service: submit, play next, play all now (snapshot), pause and resume the queue, skip, stop, remove, reorder, clear, Play anyway, the gap timer, and limit re-evaluation.
- [x] 3.4 Implement item playback state: pause and resume, seek, position and duration reports from the player host, load timeout leading to failed, and the server clock for the fallback path.
- [x] 3.5 Implement restart recovery so playing and paused items return to the queue head without replay.
- [x] 3.6 Add service and repository tests, including stale-revision conflicts and restart recovery.

## 4. Intake Paths

- [x] 4.1 Add a shared intake service with autoplay policy and bounded rejection diagnostics.
- [x] 4.2 Add a Streamer.bot custom-event adapter for the `VideoRequest` marker, with the legacy `VideoShoutout` mapping.
- [x] 4.3 Add a channel point adapter for mapped rewards using the existing reward catalog.
- [x] 4.4 Add scoped automation `videos:read`, `videos:submit` and `videos:control` scopes and `/automation/v1/videos/...` routes with revision guards.
- [x] 4.5 Add management and operator HTTP routes.
- [x] 4.6 Add route tests using `inject()`, covering scope isolation, loopback, origin rejection and redaction.

## 5. Primary Player, Mirror And Outputs

- [x] 5.1 Add the desktop player host: a hidden sandboxed window per purpose, a navigation lock, and a private transport for commands and state reports.
- [x] 5.2 Add the Videos player page with YouTube `postMessage` control, a direct-file `<video>` element and Twitch control (frame control or play and stop), all feature-detected.
- [x] 5.3 Add capture and a WebRTC publisher, plus signaling relay over the overlay WebSocket. Signaling is authorized by overlay key, scoped to `videos`, and uses loopback ICE only.
- [x] 5.4 Add mirror receivers for the desktop overlay layer and module browser sources, rendered transparent and fail-closed.
- [x] 5.5 Add audio fan-out: OBS audio on the browser source, plus per-device output through a separate receiver with one `AudioContext` `sinkId` per device (per the feasibility decision), honoring mute policy and an optional per-device delay.
- [x] 5.6 Add the fallback player for browser sources when the desktop app is absent, with server-clock drift correction.
- [x] 5.7 Add Storybook stories for receiver states (connecting, playing, paused, unavailable) and fallback provider players, using tiny local assets.
- [x] 5.8 Add Electron and Playwright coverage for the mirror path using a local test video; a desktop test config where needed.

## 6. Management And Operator UI

- [x] 6.1 Add the Videos management page: enablement, outputs, mirror status, limits, gap, OBS audio and device targets, allowed hosts, reward mapping, Streamer.bot autoplay opt-in, and the queue.
- [x] 6.2 Add the Operator panel: now-playing card and queue list with all controls, keyboard operable, with confirmation for clear.
- [x] 6.3 Add Storybook stories and component tests for both surfaces.

## 7. Docs, Backlog And Verification

- [x] 7.1 Replace `docs/video-shoutout.md` with `docs/videos.md`, covering links, Streamer.bot, REST, rewards and OBS audio.
- [ ] 7.2 Update `docs/backlog.md` to close BL-053 and BL-057 on archive, and keep BL-058 and BL-060.
- [x] 7.3 Add Playwright coverage: submit, held over-limit item, Play anyway, play all snapshot, pause and seek, and unsafe link rejection, with providers stubbed.
- [ ] 7.4 Run lint, typecheck, unit, build (including bundle budgets), Storybook and Playwright gates. Verify the rebuilt live workflow.
