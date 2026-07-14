# Proposal: Add Video Shoutout Overlay Module

## Why

Streamers already use Streamer.bot to decide when a manual shoutout should happen and which Twitch clip to show, but Stream Jams has no dedicated browser-source surface for rendering that selected clip. A small `video-shoutout` overlay module lets Stream Jams own presentation and overlay control while leaving clip lookup, Twitch auth, chat commands, and eligibility rules in Streamer.bot.

## What Changes

- Add a built-in `video-shoutout` overlay module with module-specific live/test browser-source outputs using the existing overlay output and route-key model.
- Add a management/control boundary that accepts manually triggered Twitch clip payloads from Streamer.bot: `login`, `displayName`, `clipId`, `embedUrl`, `title`, `duration`, and optional avatar/profile URL.
- Render transparent idle, loading, playing, no-clip/error, and automatic return-to-idle states for the video shoutout overlay.
- Validate incoming manual shoutout payloads before display and keep unsafe or incomplete payloads from rendering live overlay chrome.
- Keep video auto shoutouts, Twitch clip fetching, Twitch OAuth, chat command parsing, shoutout eligibility, full queue/history, and moderation workflows out of scope.

## Capabilities

### New Capabilities

- `video-shoutout-overlay`: Stream Jams renders and controls a manual `video-shoutout` browser-source overlay from validated clip payloads provided by Streamer.bot.

### Modified Capabilities

None. The existing `overlay-output-management` capability already covers module-specific route-key URLs, and this change must use that model instead of adding a parallel overlay URL or auth scheme.

## Impact

- Affected code: overlay module registry, module config/defaults, module-specific overlay runtime, Streamer.bot/manual-control intake route or event bridge, overlay WebSocket delivery, React overlay renderer, management API/types where needed, Storybook, unit/component tests, and Playwright overlay coverage.
- Dependencies: implementation must confirm `overlay-output-management` is present in `origin/main` and must reuse `/overlay/modules/video-shoutout/:purpose/:overlayKey` plus the existing overlay WebSocket/key validation paths.
- No new external dependencies are expected for the proposal; Twitch embeds should use browser/native iframe or player behavior unless implementation proves the existing stack cannot handle it.
