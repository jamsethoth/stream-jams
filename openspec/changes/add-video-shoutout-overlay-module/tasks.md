## 1. Dependency Gate

- [x] 1.1 Fetch latest remote state and verify the implementation branch starts from current `origin/main`.
- [x] 1.2 Confirm `overlay-output-management` is present and module-specific URLs use `/overlay/modules/:moduleId/:purpose/:overlayKey`.
- [x] 1.3 Confirm the current overlay gateway/composition path can deliver module-specific state for a non-alert module.
- [x] 1.4 Confirm the available Streamer.bot intake/runtime boundary and choose the smallest adapter that does not add action execution APIs.
- [x] 1.5 Document the Streamer.bot manual event source/type default or config point before wiring intake.

## 2. Module Contract And Server State

- [x] 2.1 Add `video-shoutout` payload and state types/schemas for required clip fields, optional avatar/profile URL, no-clip/error state, and duration normalization.
- [x] 2.2 Register the built-in `video-shoutout` overlay module with module-specific output support and no unified output support for this slice.
- [x] 2.3 Add a module service that validates payloads, rejects unsafe embed URLs, omits unsafe optional avatar/profile URLs, and stores one active in-memory state.
- [x] 2.4 Implement replacement semantics so a new valid manual payload replaces the active clip without queue/history persistence.
- [x] 2.5 Add timeout, clear, completion, and failure handling that returns the module to transparent idle.

## 3. Streamer.bot Manual Intake

- [x] 3.1 Route the selected Streamer.bot/manual event payload into the `video-shoutout` module service.
- [x] 3.2 Add safe handling for invalid payloads and explicit no-clip/error triggers without rendering raw payload data.
- [x] 3.3 Verify the intake path does not call Twitch APIs, own Twitch OAuth, parse chat commands, evaluate eligibility, or expose Streamer.bot action execution.
- [x] 3.4 Add diagnostics/logging that redacts route keys, secrets, raw payload internals, and unsafe URLs.

## 4. Overlay Rendering

- [x] 4.1 Add the `video-shoutout` overlay renderer/state component for idle, loading, playing, no-clip/error, and return-to-idle behavior.
- [x] 4.2 Render the validated Twitch embed URL and safe shoutout context without management chrome or debug details.
- [x] 4.3 Ensure invalid embed/player failures report failure and clear the active state through the existing overlay reporting path where possible.
- [x] 4.4 Add Storybook coverage for idle, loading, playing, no-clip/error, and replacement states.

## 5. Verification

- [x] 5.1 Add unit tests for payload schema validation, Twitch embed URL allowlisting, duration normalization, and single-active-state replacement.
- [x] 5.2 Add server tests for module output listing, route-key authorization, Streamer.bot/manual intake routing, and no Twitch API calls.
- [x] 5.3 Add React tests for each overlay state and safe rendering of optional profile media.
- [x] 5.4 Add Playwright coverage for loading the `/overlay/modules/video-shoutout/:purpose/:overlayKey` browser-source route and rendering a manual clip payload.
- [x] 5.5 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Storybook gates, and applicable Playwright tests.
