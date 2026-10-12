# Proposal: Chat Display Module

## Why

On 2026-10-12 the maintainer asked for a module that shows live chat from every platform they stream to (Twitch and YouTube now, TikTok later), and asked whether Streamer.bot, which already combines these, can supply it. It can: Streamer.bot's WebSocket server emits each chat message as an event ([events list](https://docs.streamer.bot/api/websocket/events)), and Stream Jams already holds a Streamer.bot connection that subscribes to events (`apps/server/src/modules/streamerbot/streamerbot-runtime-service.ts`). The evaluation is in the project notes (`notes/chat-display-module-evaluation.md`); the maintainer approved writing this spec the same day.

Today chat is not shown anywhere. `docs/product-plan.md` already lists a chat widget as an expected future module.

## What Changes

- **Chat intake from Streamer.bot**: while the Chat module is enabled, the active Streamer.bot source subscribes to `Twitch.ChatMessage`, `YouTube.Message` and `Kick.ChatMessage` plus the removal events Streamer.bot offers for each platform. Chat goes to a new Chat service, not the central event bus, so it cannot push out alerts in the 10,000-row journal or replay into alert rules.
- **One message shape**: platform, message ID, author, author color, roles, badges, optional avatar, and the text as text and emote parts, built from Streamer.bot's `parts` arrays (which already include 7TV, BetterTTV and FrankerFaceZ emotes on Twitch).
- **Removals**: deleted messages, cleared chat, bans and timeouts remove the matching messages from every output.
- **Short history that survives restarts**: the last 50 shown messages are kept in SQLite so a reloaded browser source or a restarted app refills instead of starting blank.
- **Chat images served by Stream Jams**: overlays load images only from Stream Jams (`img-src 'self'`). Emotes, badges and avatars are fetched server side from a fixed allowlist of platform and emote CDN hosts, validated and cached, reusing the Music artwork fetch path (DNS pinning, public-address check, size and pixel limits), extended to allow animated GIF and WebP.
- **Filters**: hide listed accounts (bots), hide messages starting with `!` (on by default), hide Twitch Shared Chat guest messages (on by default), and apply the existing moderation blocked-term and link rules to message text (on by default).
- **Both outputs**: a Chat browser source (landscape and vertical) and the desktop overlay render the same snapshot, through the existing module output model.
- **Management**: a Chat layout editor like Timers (size, position, stack direction, maximum visible messages, message lifetime, avatar/badge toggles, font size, the shared shadow setting) on the consistent grid with rarely used settings collapsed, plus filters and platform toggles.
- **Operator**: a Chat panel with the recent messages, Hide on each message, Clear display, and module enable.
- **TikTok via TikFinity**: TikFinity can run a Streamer.bot action on each TikTok comment ([TikFinity Streamer.bot integration](https://tikfinity.zerody.one/streamerbot-integration)). A documented action re-broadcasts it as a `{ "source": "StreamJams", "type": "ChatMessage", "platform": "tiktok", ... }` marker, read before the bus like the `VideoRequest` marker.

## Out Of Scope

- Sending chat, replying or moderating (ban, timeout, delete on the platform) from Stream Jams.
- Chat history beyond the last 50 messages, search, or export.
- Reading chat directly from platform APIs without Streamer.bot (Twitch direct chat is BL-069 from the named-triggers change; YouTube Data API live chat is not planned).
- Per-platform message styles, custom CSS, highlight rules, and events (subs, raids) inside the chat panel.
- Chat text to speech.
- Kick message deletion and YouTube message deletion until Streamer.bot documents a payload (see design).
- TikTok emotes and gifts as images; TikTok comments show as text.

## Impact

- `apps/server/src/modules/streamerbot/streamerbot-runtime-service.ts` (subscriptions and routing chat before normalization); new `apps/server/src/modules/chat/`; shared remote image fetch extracted from `apps/server/src/modules/music/music-artwork-service.ts`.
- `packages/core`: chat message schema, normalizers per platform, filters, history rules.
- New migration for chat history and Chat module settings; chat history is runtime data and is not part of configuration backups.
- `apps/web`: Chat overlay renderer, Chat editor, Operator Chat panel; stories and Playwright coverage. Desktop overlay renders through the existing shared surface.
- New `chat-display` capability.
