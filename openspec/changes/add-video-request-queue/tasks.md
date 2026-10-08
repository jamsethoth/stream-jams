## 1. Dependency Gate

- [ ] 1.1 Fetch `origin/main`, confirm the branch starts from it, and confirm `video-shoutout` (#157) is merged.
- [ ] 1.2 Confirm the desktop overlay can render a module layer containing a sandboxed provider iframe and a `<video>` element, and record any renderer CSP changes needed.
- [ ] 1.3 Confirm normalized `channel_point_redemption` events with `userInput` reach the event pipeline from Streamer.bot and direct Twitch sources.
- [ ] 1.4 Confirm the YouTube `enablejsapi=1` `postMessage` commands and `infoDelivery` messages in a browser test page, and record the message shapes used.

## 2. Core Contracts

- [ ] 2.1 Add `videos` types and schemas: item, queue state, playback clock, composition projection and commands.
- [ ] 2.2 Add the provider registry with link parsing and embed construction for Twitch clips and VODs, YouTube and allowlisted direct files, exported from `@stream-jams/core/videos`.
- [ ] 2.3 Register the `videos` module with module and desktop outputs. Retire `video-shoutout` from the registry.
- [ ] 2.4 Add unit tests for provider parsing: positive, negative, and edge (ports, credentials, fragments, Shorts, `t=` offsets).

## 3. Persistence And Queue Service

- [ ] 3.1 Add a SQLite migration for `video_requests` and `video_queue_state`, and remove `video-shoutout` rows and outputs.
- [ ] 3.2 Add a typed repository with narrow transactions and revision increments.
- [ ] 3.3 Implement the queue service: submit, play next, play all now (snapshot), pause and resume the queue, skip, stop, remove, reorder, clear, Play anyway, the gap timer, and limit re-evaluation.
- [ ] 3.4 Implement the playback clock: pause and resume items, seek, playback report handling, and the load timeout leading to failed.
- [ ] 3.5 Implement restart recovery so playing and paused items return to the queue head without replay.
- [ ] 3.6 Add service and repository tests, including stale-revision conflicts and restart recovery.

## 4. Intake Paths

- [ ] 4.1 Add a shared intake service with autoplay policy and bounded rejection diagnostics.
- [ ] 4.2 Add a Streamer.bot custom-event adapter for the `VideoRequest` marker, with the legacy `VideoShoutout` mapping.
- [ ] 4.3 Add a channel point adapter for mapped rewards using the existing reward catalog.
- [ ] 4.4 Add scoped automation `videos:read`, `videos:submit` and `videos:control` scopes and `/automation/v1/videos/...` routes with revision guards.
- [ ] 4.5 Add management and operator HTTP routes.
- [ ] 4.6 Add route tests using `inject()`, covering scope isolation, loopback, origin rejection and redaction.

## 5. Overlay And Desktop Rendering

- [ ] 5.1 Add a Videos renderer for idle, loading, playing, paused, notice and failure states, with YouTube `postMessage` control, a direct-file `<video>`, and Twitch play and stop.
- [ ] 5.2 Add drift correction against the server clock, plus audio-owner muting.
- [ ] 5.3 Add a desktop overlay layer for Videos, with device audio routes for direct files when the desktop owns audio.
- [ ] 5.4 Add Storybook stories for each state and provider, with tiny local assets.

## 6. Management And Operator UI

- [ ] 6.1 Add the Videos management page: enablement, outputs, desktop toggle, limits, gap, audio owner, allowed hosts, reward mapping, Streamer.bot autoplay opt-in, and the queue.
- [ ] 6.2 Add the Operator panel: now-playing card and queue list with all controls, keyboard operable, with confirmation for clear.
- [ ] 6.3 Add Storybook stories and component tests for both surfaces.

## 7. Docs, Backlog And Verification

- [ ] 7.1 Replace `docs/video-shoutout.md` with `docs/videos.md`, covering links, Streamer.bot, REST, rewards and OBS audio.
- [ ] 7.2 Update `docs/backlog.md` to close BL-053 and BL-057 on archive, and keep BL-058, BL-059 and BL-060.
- [ ] 7.3 Add Playwright coverage: submit, held over-limit item, Play anyway, play all snapshot, pause and seek, and unsafe link rejection, with providers stubbed.
- [ ] 7.4 Run lint, typecheck, unit, build (including bundle budgets), Storybook and Playwright gates. Verify the rebuilt live workflow.
