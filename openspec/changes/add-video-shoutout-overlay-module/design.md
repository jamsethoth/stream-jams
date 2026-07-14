# Design: Add Video Shoutout Overlay Module

## Context

Stream Jams already serves module overlay URLs at `/overlay/modules/:moduleId/:purpose/:overlayKey`, verifies route keys through overlay auth, and lists module outputs through `overlay-output-management`. The current default registry contains only `alerts`, and overlay rendering is built around normalized playback instructions for local assets.

This change adds a second built-in module, `video-shoutout`, for manual Twitch clip shoutouts selected by Streamer.bot. Streamer.bot remains the automation owner: it fetches or selects clips, owns Twitch auth, parses chat commands, and decides eligibility. Stream Jams only validates a selected clip payload, tracks the current display state, and renders it to the existing browser-source overlay route.

## Goals / Non-Goals

**Goals:**

- Register a built-in `video-shoutout` module with existing module-specific live/test overlay outputs.
- Accept a manual clip payload containing `login`, `displayName`, `clipId`, `embedUrl`, `title`, `duration`, and optional avatar/profile URL from the Streamer.bot intake boundary.
- Render idle, loading, playing, no-clip/error, and return-to-idle states on a transparent browser-source surface.
- Validate untrusted payloads and URLs before they reach the overlay.
- Keep the implementation small: one active in-memory shoutout state, no durable queue.

**Non-Goals:**

- No Twitch API calls, Twitch OAuth ownership, clip search, or clip eligibility logic in Stream Jams.
- No chat command parsing or Streamer.bot action execution.
- No video auto shoutouts.
- No full queue, history, moderation, approval, or replay workflow.
- No parallel overlay URL, overlay token, or browser-source auth model.

## Decisions

1. Use module-specific outputs only for the first version.

   `video-shoutout` should support `module` output and appear as live/test URLs such as `/overlay/modules/video-shoutout/live/:overlayKey`. Unified output participation is deferred because a shoutout clip is usually an independent OBS browser source, and adding unified layout rules would widen the scope.

2. Reuse existing overlay output and route-key services.

   URL creation, regeneration, revocation, WebSocket paths, and key redaction should flow through the existing overlay output/key model. The module adds a registry entry and runtime snapshot/control behavior, not a second browser-source route family.

3. Prefer the existing Streamer.bot passive intake boundary over a new local public control endpoint.

   Streamer.bot payloads should arrive as validated Streamer.bot/manual events routed to the module service. This keeps Stream Jams passive from Streamer.bot's perspective and avoids adding unauthenticated HTTP control URLs. If implementation finds no runtime bridge exists yet, add the smallest adapter around the existing `StreamerBotClient` event callback; do not add `DoAction`, chat send, command mutation, or global mutation APIs.

4. Keep state in memory and single-item.

   The module state is `idle`, `loading`, `playing`, or `error`. A new valid manual payload replaces any active clip. Completion, iframe/video error, explicit clear, or duration timeout returns the state to idle. No queue/history table is introduced.

5. Treat `duration` as clip seconds at the input boundary.

   The control schema normalizes `duration` to milliseconds for timers and caps it to the existing overlay playback safety limit. A missing, zero, negative, or excessive duration rejects the payload or produces the bounded no-clip/error state.

6. Render the provided Twitch embed instead of fetching media.

   Stream Jams validates `embedUrl` as an HTTPS Twitch clip/player embed URL and renders it in the browser overlay. It does not call Twitch APIs, download the clip, proxy media, or rewrite clip ownership. Optional avatar/profile URLs are rendered only when HTTPS and schema-valid.

7. Keep live error output safe.

   Idle is transparent. No-clip/error state may show a simple operator-approved message, title, or display name, but must not expose route keys, auth data, raw payload JSON, stack traces, local paths, or Streamer.bot internals.

## Risks / Trade-offs

- Twitch embeds may require exact `parent` parameters for the local app host. Mitigation: accept a ready `embedUrl` from Streamer.bot and validate only safe Twitch embed shapes; document/test the local parent behavior during implementation.
- OBS browser source autoplay behavior can vary. Mitigation: provide loading and timeout-to-idle behavior, and test with Playwright using deterministic iframe/player stand-ins.
- No queue means rapid manual triggers replace each other. Mitigation: this is explicit first-version behavior; add queue/history only when a separate workflow is requested.
- Relying on Streamer.bot intake means Stream Jams does not know why a clip was chosen. Mitigation: keep eligibility and chat-command reasoning in Streamer.bot by design.

## Migration Plan

No data migration is expected. Adding the module registry entry should make `overlay-output-management` list create-required live/test outputs for `video-shoutout`; existing overlay keys and alert behavior remain unchanged.

## Open Questions

- What Streamer.bot source/type name should be the documented default for the manual video shoutout event? Suggested default: source `StreamJams`, type `VideoShoutout`.
