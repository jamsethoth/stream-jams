# Unified Chat Module Design

Status: design agreed with the maintainer on 2026-11-02 through a structured design review, then audited against the earlier chat proposal in PR #190 (see "Differences From PR #190"). This is investigation output. An OpenSpec change is still needed before implementation. Backlog row: BL-080. This design supersedes PR #190.

## Goal

Add a Chat overlay module that merges live chat from Twitch and YouTube into one card list. It renders on module/profile browser sources and on the private desktop overlay. It must honor platform moderation fast enough that a removed message does not stay on stream.

## Decisions Summary

| Area | Decision |
| --- | --- |
| Purpose | Overlay display only. No management chat reader, and no reply, platform delete or highlight actions in v1. |
| Operator | A moderation panel: Hide/Unhide the messages currently on stream, Clear display, and per-platform on/off. No module on/off and no history view. |
| Platforms | Twitch first, YouTube second, each with an on/off switch. TikTok and Kick are out of v1. |
| Twitch route | Direct through the existing Twitch EventSub WebSocket client, adding `user:read:chat`. Twitch chat from Streamer.bot is never subscribed for chat display. Shared Chat partner messages are shown, honoring only the host room's removals. |
| YouTube route | Through Streamer.bot only, subscribed while the module and the YouTube switch are on. |
| Unofficial connectors | None in v1, not even opt-in. |
| Pipeline | A dedicated chat pipeline, separate from the central event bus. In-memory ring buffer only; nothing is written to SQLite, backups or logs. |
| Message model | Typed parts rendered as React elements. Never HTML. |
| Moderation | Platform removals are honored within about one second where the platform reports them. YouTube single-message deletes are a documented exception. |
| Filtering | Editable bot list, hidden `!commands`, and a new `chat` moderation target that hides a whole message on a blocked term. |
| Emotes | Native Twitch and YouTube, plus 7TV, BTTV and FFZ fetched directly. Images are served through the generalized Music artwork fetcher, with an allowlist and an in-memory cache. |
| Tests | "Send test messages" follows the Alerts manual-provenance pattern. Streamer.bot `isTest` messages are treated the same way. |
| Look | One built-in preset, "Cards", in a card-list layout. Typed per-profile appearance plus scoped custom CSS. |
| Outputs | `landscape` and `vertical` module profiles, and a layer on the private desktop overlay. |
| Templates | No user HTML/JS templates in v1. |
| Prerequisite | Overlay pages must get a Content Security Policy (BL-078) before custom CSS ships. |

## Sources And Routing

### Twitch (direct)

- Reuse `apps/server/src/modules/twitch/twitch-eventsub-client.ts`. Do not add Twurple for chat.
- Subscribe to `channel.chat.message`, `channel.chat.message_delete`, `channel.chat.clear_user_messages` and `channel.chat.clear` (all v1). The condition is `broadcaster_user_id` plus `user_id`. Each needs `user:read:chat`. WebSocket transport requires a user access token.
  - https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/
  - https://dev.twitch.tv/docs/eventsub/eventsub-reference/
  - https://dev.twitch.tv/docs/eventsub/manage-subscriptions/
- Existing accounts lack the scope. Add it to the scope-to-capability mapping in `apps/server/src/modules/providers/provider-management-adapters.ts`, so the provider screen shows "Reconnect Twitch to enable chat". Alerts keep working until the user reconnects.
- Use the fragments as delivered (`text`, `emote`, `cheermote`, `mention`). Use the `gif` fragment URL unmodified, as Twitch requires.
- Badge images come from Get Global Chat Badges and Get Channel Chat Badges; cache both. Cheermote images come from Get Cheermotes.
- If the EventSub connection drops, Twitch chat pauses. The existing reconnect handles recovery, and management and Operator show the state. Automatic switch-over to Streamer.bot's Twitch chat is BL-088.
- **Shared Chat:** show partner-channel messages (setting "Show Shared Chat partner messages", on by default). This matches what the broadcaster's own Twitch chat shows.
  - Each channel's copy of a shared message has its own `message_id`. The original is kept as `source_message_id` (https://dev.twitch.tv/docs/chat/irc). Store `message_id`, `source_message_id`, `source_broadcaster_user_id` and the chatter ID for every message.
  - Removals in the host's room work directly. `message_delete` matches the stored `message_id` (the host's copy), `clear_user_messages` matches the chatter, and `clear` wipes everything.
  - Removals made by a partner channel's moderators are **not** mirrored. Twitch: "those messages will not be deleted in other collaborators' channels" (https://blog.twitch.tv/en/2024/09/24/bring-your-communities-together-with-shared-chat/). They reach the host only through `channel.moderate` v2 `shared_chat_*` actions, which need about eight extra `moderator:read:*` scopes. Mirroring is BL-091.
  - Presentation follows the Twitch convention as copied by Chatterino (https://chatterino.com/changelog, 2.5.2–2.5.5):
    - the partner channel's profile picture appears as the first badge;
    - the chatter's badges come from their own channel (`source_badges`);
    - a `data-source-channel` hook is added;
    - there is no text label.
    - Partner profile pictures come from Get Users for the few participating broadcasters, are cached, and go through the image proxy. A generic shared-chat icon is the fallback.
- Dedupe keys on `twitch:<message_id>` whatever the route. Twitch assigns one message ID, and Streamer.bot's `messageId` is believed to be the same value since it moved Twitch chat to EventSub. That makes a later route choice or switch-over safe.

### YouTube (through Streamer.bot)

- Extend `apps/server/src/modules/streamerbot/streamerbot-event-normalizer.ts`. It currently rejects every non-Twitch source. Keep the hand-written client; BL-101 tracks evaluating `@streamerbot/client`.
- While the chat module and the YouTube switch are both on, subscribe to the YouTube events Streamer.bot offers (`GetEvents`): `Message`, `SuperChat`, `SuperSticker`, `MessageDeleted`, `UserBanned` and `UserTimedout`. Turning either off removes only those subscriptions.
  - https://docs.streamer.bot/api/websocket/events
- Any existing custom Streamer.bot subscription to a chat event, such as an alert rule on `Twitch / ChatMessage`, keeps reaching the event bus unchanged. Chat display never consumes or alters it.
- Streamer.bot reads YouTube through the official Data API: the push/streaming API since v1.0.0 (https://streamer.bot/changelogs/v1.0.0). It inherits that API's limits.
- If Streamer.bot disconnects, the overlay keeps showing Twitch chat with no on-stream error. The management UI shows "YouTube chat unavailable: Streamer.bot disconnected", using existing provider status.

### Excluded platforms

- **Kick:** the maintainer does not stream there. Neither route reports single-message deletes. The official API is webhooks-only, which a `127.0.0.1` app cannot receive without a tunnel. Kick declined a message-deleted webhook (https://github.com/KickEngineering/KickDevDocs/issues/310). Tracked as BL-096.
- **TikTok:** there is no official live chat API. Unofficial connectors break TikTok's terms (§3.4, https://www.tiktok.com/legal/page/us/terms-of-service/en). They need the Euler Stream signing service or a real browser session. `tiktok-live-connector` is AGPL-3.0-only from 2.4.4.
  - The only path to reconsider is TikFinity pushing into Streamer.bot (BL-095). PR #190 designed it:
    - a documented TikFinity action calls `CPH.WebsocketBroadcastJson` with `{ source: "StreamJams", type: "ChatMessage", platform: "tiktok", userId, userName, login, avatarUrl, message }`;
    - the marker is read before the bus, like `VideoRequest`, and validated.
  - TikTok has no removal events at all, which conflicts with the removal requirement. Revisit only with a display delay plus Operator Hide.
- **Unofficial connectors in general:** rejected as NP-007, with evidence below.

## Pipeline

- Chat does not use the central event bus. The bus serves rare, alert-worthy events with dedupe, history and alert matching. Later work may promote selected chat-derived signals, such as a first-time chatter or a keyword, onto the bus.
- One route per platform means no cross-route deduplication. Within a route, drop repeats by the platform's native message ID, using a small bounded recent-ID set to cover reconnects.
- The ring buffer holds about the last 200 messages in memory on the server, so a reloaded OBS source refills immediately. An app restart starts empty. Never write chat to SQLite or include it in backups or exports.
  - This is deliberate. Chat is not a queue, so the 2026-10-08 rule that module queues survive restarts does not apply.
  - No comparable tool keeps chat across restarts: jChat, KapChat, ChatRD and StreamElements CustomChat keep it in the page only, and Streamer.bot has no chat-history request (https://docs.streamer.bot/api/websocket/requests).
  - `node:sqlite` `DatabaseSync` runs synchronously on the server's main thread with the default rollback journal (`apps/server/src/modules/db/database.ts:174`), so per-message writes would stall overlay delivery during bursts.
  - Saving across restarts is BL-102, if empty chat after a restart proves to be a real problem.
- Operator hides apply to messages in the ring buffer and are not saved.
- **Logs:** never record message text, author names or image URLs. Diagnostics carry platform, event type and a reference ID.
- **Validation bounds at intake:**
  - display name at most 64 characters, with control characters removed;
  - text at most 500 characters;
  - at most 6 badges;
  - colors only as `#RRGGBB`, otherwise none.
  - A malformed event is dropped with a diagnostic that does not echo the payload.
- Every queue and buffer is bounded and drops the oldest entry first (repo rule: no unbounded buffering).
- An approved YouTube held-for-review message can arrive late with its original timestamp, so never drop a message for being old.

## Normalized Message

The server produces finished messages. The overlay never parses provider payloads or calls third-party services.

- Fields, modeled on Social Stream Ninja's event reference (https://socialstream.ninja/docs/event-reference):
  - `platform`, native `messageId`, `userId`, `login`, `displayName`, `color`;
  - `role` (broadcaster, moderator, VIP, subscriber or member, viewer);
  - `badges[]` with proxied image URLs;
  - `parts[]`;
  - `reply` (the parent author's display name only);
  - `firstTime`;
  - `mentionsBroadcaster`;
  - `paid` (`{ kind: "cheer", bits }` or `{ kind: "superChat" | "superSticker", amountDisplay, tier }`);
  - `emoteOnly`;
  - `receivedAt`.
- Shared Chat fields: `sourceMessageId` and `sourceChannel` (ID, name and proxied profile picture), set only for partner-channel messages.
- Part types: `text`, `emote { name, url, zeroWidth }`, `mention`, `cheermote`.
- Fallbacks:
  - If a YouTube event lacks `parts`, build the parts from the message text plus emote positions.
  - Unknown part types and Streamer.bot `Twemoji` parts become text.
  - Twitch `gif` fragments use their URL unmodified.
- Removal messages:
  - `remove { messageId }`
  - `removeUser { platform, userId }`
  - `clear { platform }`
- No viewer avatars in v1. Twitch EventSub does not include them, and mixed rows look inconsistent (BL-082). The one exception is the Shared Chat partner channel's picture used as a badge.

## Moderation And Safety

### Platform removals (hard requirement, with one exception)

- **Twitch:** remove the message on delete. Remove all of a user's messages on a ban or timeout (`clear_user_messages`). Remove everything on clear. Target: within about one second.
- **YouTube:**
  - **A.** Remove all of a user's messages on Streamer.bot `UserBanned` or `UserTimedout`, using the banned user's channel ID.
  - **B.** Hold YouTube messages before display. The default is 3 seconds; it is configurable down to 0. Social Stream Ninja uses the same pattern (`delayyoutube`, about 2–3 s).
  - **C.** The runbook recommends YouTube's "hold potentially inappropriate messages for review" setting (https://support.google.com/youtube/answer/9826490), but only after a live test confirms held messages never reach the Streamer.bot feed.
- **Documented exception:** Stream Jams cannot remove a single deleted YouTube message.
  - Google removed `messageDeletedEvent` and `messageRetractedEvent` from the API because "these events are not being returned by the API" (revision history, 2026-06-23: https://developers.google.com/youtube/v3/revision_history).
  - `tombstone` "is not sent upon deletion" (https://developers.google.com/youtube/v3/live/docs/liveChatMessages).
  - Streamer.bot's YouTube "Message Deleted" trigger "will never work until YouTube adds the data to the API" (https://streamer.bot/changelogs/v0.2.4).
  - BL-094 tracks the opt-in InnerTube supplement that could close this gap.

### Local filtering

- A bot list, matched case-insensitively per platform. Defaults: Nightbot, StreamElements, Streamlabs, Moobot, Fossabot, Sery_Bot and the account Streamer.bot uses as its bot. Users can edit it.
- `!commands` are hidden unless the profile opts in.
- A new `chat` target in `packages/core/src/moderation/moderation-service.ts`, alongside `rendered` and `tts`, with its own maximum length, blocked terms and URL setting.
  - It runs on text parts.
  - A blocked term **hides the whole message**. It does not substitute `[moderated]`, because that still identifies the author and invites people to probe the filter.

### Third-party emotes

- 7TV emotes flagged NSFW render as their plain-text name.
- FFZ modifier emotes (`ffzW`, `ffzX`, `ffzHyper` and so on) are dropped, and the base emote renders without the effect. Some effects flash. Effects are tracked as BL-090.
- 7TV zero-width emotes render as a simple stack over the previous emote.

## Emotes And Images

- Fetch the channel and global emote sets directly from the public, no-auth endpoints. Do not use `@mkody/twitch-emoticons`: its `parse()` returns HTML strings, and it would pull in Twurple and axios for about a third of its function. Add a `shortcut:` comment naming it as the fallback if these APIs start breaking.
  - 7TV: `https://7tv.io/v3/users/twitch/{id}` and `/v3/emote-sets/global`.
  - BTTV: `https://api.betterttv.net/3/cached/users/twitch/{id}` and `/3/cached/emotes/global`.
  - FFZ: `https://api.frankerfacez.com/v1/room/id/{id}` and `/v1/set/global`.
- The server turns emote words in text parts into `emote` parts, for both platforms. The Twitch channel's 7TV/BTTV/FFZ sets also apply to YouTube viewers' text.
- Refresh the lists at startup and every 10–15 minutes. If a service fails, keep the last good list; with no list, show the words as plain text. A third-party emote failure must never hide or delay chat. 7TV live updates are BL-089.
- **Image proxy:**
  - Generalize the hardened Music artwork fetcher (`apps/server/src/modules/music/music-artwork-service.ts`: DNS pinned to one public address, public-address check, bounded body, `sharp` validation) into a shared module, leaving Music's behavior unchanged. Chat adds its own policy.
  - Allowlisted hosts, subdomains included at a dot boundary:
    - Twitch: `jtvnw.net`
    - 7TV: `7tv.app`
    - BTTV: `betterttv.net`
    - FFZ: `frankerfacez.com`
    - YouTube: `ggpht.com`, `googleusercontent.com`, `ytimg.com`
  - Images:
    - GIF, PNG, JPEG and WebP, animated GIF and WebP included;
    - at most 1 MiB, 512 × 512 pixels and 200 frames;
    - SVG is never accepted.
  - Cache and fetching:
    - an in-memory LRU of 512 entries or 32 MiB;
    - at most 8 fetches in flight;
    - a failed or refused image is remembered for 10 minutes;
    - emotes show as text until their image is ready, then the output updates.
  - Serving:
    - opaque references served under the overlay key, the way `apps/server/src/http/routes/music-artwork.ts` does;
    - the desktop overlay gets them through the existing private media protocol.
  - Rationale: the overlay never contacts outside hosts, and it stays compatible with the overlay CSP from BL-078. Correction recorded during the review: browser-source overlay pages have no CSP today (the desktop overlay does), so the proxy is not yet *required*. See "Security Findings".

## Look And Feel

### Preset and layout

- One built-in preset, **Cards**: each message on a rounded card. The preset only fills in settings; users can change any of them.
- One layout mode in v1, the card list. Ticker and latest-message popup layouts are BL-081. Bubble and avatar-column layouts are BL-082.
- Research showed that one card preset plus settings reproduces most named themes from other tools:
  - Streamlabs Boxed;
  - Streamer.bot `soft`, `subtle` and `outlined`;
  - All-Chat High Contrast, Neo Brutalist and Modern Dark;
  - a "panel" look (zero gap and radius);
  - a "clean" look (zero card opacity plus a text outline).
  - Sources: https://github.com/streamlabs/desktop/blob/master/app/components-react/widgets/ChatBox.tsx, https://docs.streamer.bot/guide/extra-features/chat, https://github.com/caesarakalaeii/all-chat/tree/main/docs/overlay-themes

### Per-profile appearance (`landscape`, `vertical`)

Reuse the Timer appearance building blocks in `packages/core/src/timers/schemas.ts` and the shared card shadow wherever possible.

- **Names and message text, separately:** font, size, weight and color.
  - Fonts: the 4 existing presets plus any uploaded font asset (`openspec/specs/alert-advanced-typography/spec.md`). There are no remote font loads; Google Fonts import is BL-097.
- **Card:** background color, opacity 0–100%, corner radius, border width and color, the shared card shadow, padding and gap.
- **Text outline/shadow:** off, small, medium or large. Build it from layered `text-shadow`, because a heavy `-webkit-text-stroke` thins glyphs.
- **Name placement:** inline (default for landscape) or above (default for vertical).
- **Platform icon:** off, always, or only when more than one platform is connected (default).
- **Show or hide:** badges and the reply line ("↪ @user").
- **Name color mode:**
  - Platform (default): the Twitch color. YouTube viewers get a color from a fixed palette, picked by user ID.
  - Role: broadcaster, moderator, VIP, subscriber or member, viewer.
  - Custom: one color.
  - Same as message text.
  - In Platform mode, colors are lightened or darkened to reach 4.5:1 contrast against the card color. When card opacity is low, they are checked against the outline instead.
- **Highlights:** a typed list of rules (`{ type, enabled, color }`) rendered through one function, so new treatments can be added later without wider changes.
  - Types: first-time chatter, mention of the broadcaster, cheer (plus a bits pill), Super Chat and Super Sticker (plus an amount header in YouTube's tier color), broadcaster, moderator, VIP.
  - Treatment: an accent left border plus a slight card tint.
  - Nothing pulses or flashes (WCAG 2.3.1: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).
- **Big emotes:** a message made only of emotes (up to 3) renders them at a separate, larger size. Per-profile toggle.
- **Motion:**
  - Entering: none, fade or slide. Default slide, 200 ms.
  - Expiring after hide-after: fade, default 800 ms, configurable.
  - Pushed out by newer messages (over the count or past the edge): fade, default 200 ms, configurable.
  - Removed by moderation or a filter: always instant, with no animation.
  - Reduce motion: a per-profile switch, because OBS cannot see viewers' OS settings. It turns entering and leaving into plain fades.
  - Direction: newest at the bottom (default) or at the top.
- **Limits:**
  - Visible messages: default 8 for landscape and 5 for vertical, configurable.
  - Hide-after: default off.
  - Messages wrap to at most 4 lines (configurable), then end with "…".
  - A message that would cross the canvas edge is removed before it does, instead of being half-cut.
- **Canvas:** default landscape 420 × 640 at 24 px and vertical 780 × 640 at 32 px, all configurable.
  - The vertical width keeps chat within roughly the left 78% of a 1080-wide canvas, clear of platform buttons on the right.
  - Warn below 18 px (Xbox Accessibility Guideline 101: https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/101).
  - The canvas size comes from saved settings and never changes as messages arrive (`openspec/specs/output-specific-module-rendering/spec.md`).

### Markup contract (supported CSS surface)

- Stable `data-slot` values:
  - `root`, `message`, `card`, `header`, `platform`, `badges`, `badge`, `name`, `reply`, `highlight-label`, `body`;
  - one per part type: `text`, `emote`, `mention`, `cheermote`.
- Message attributes: `data-platform`, `data-role`, `data-highlight`, `data-emote-only`, `data-paid-tier`, `data-source-channel` (Shared Chat partner messages only).
- The root carries `data-module="chat"`.
- Saved settings are exposed as `--chat-*` CSS variables. Their defaults reference `--sj-*` names, ready for the style library (BL-100).
- Naming follows Streamer.bot (`data-platform`, `data-slot`) and All-Chat (`--chat-*`), so community CSS ports easily.
- Hiding a part in settings removes the element. Custom CSS cannot bring it back.
- Internal class names are not part of the contract.

### Custom CSS (per profile)

- An optional Custom CSS field per profile. It applies to the management preview, the browser outputs and the desktop layer, and it is saved with the profile and included in backups.
- It is built on shared code (validation, scoping to the module root, injection, preview) that other modules will reuse (BL-099).
- Limits:
  - 256 KB per profile.
  - `@import` rejected.
  - `data:` images allowed, which enable textures, frames and icons.
  - External loads are blocked by the overlay CSP once BL-078 lands.
- **Depends on BL-078.** Overlay pages have no CSP today. Without one, custom CSS could load remote resources, and attribute-selector exfiltration would work. If BL-078 is late, chat ships with custom CSS disabled.
- What CSS can and cannot change:
  - It can change colors, surfaces, typography from loaded fonts, spacing and arrangement within the module, hiding parts, pseudo-element decoration, clip-path and mask shapes, transforms, filters on the module's own pixels, and keyframe animation.
  - It cannot change content, timing or queueing, add real elements, load external resources (with a CSP), see the OBS scene behind the page (no `backdrop-filter`), resize the advertised canvas (oversized content is clipped), or run code.
  - Backdrop blur does not work in OBS browser sources: https://obsproject.com/forum/threads/css-backdrop-filter-in-browser-source.125871/

### User HTML/JS templates (not in v1)

- No templates in v1.
- Later rows, in order:
  - **BL-085:** HTML/CSS-only templates. Sanitized structure with named slots that Stream Jams fills as text. Safe to share.
  - **BL-086:** JS templates for the user's own use only.
- Installing third-party JS templates is not planned (NP-008).
- Findings from the 2026-11-02 investigation:
  - **Container:** the right one is an opaque-origin `<iframe sandbox="allow-scripts">`.
    - Load it with `src` from a keyless route. `srcdoc` leaks the overlay key through `document.baseURI`.
    - Give it a strict CSP: `connect-src 'none'`, no workers, no WebAssembly, no nested frames.
    - Talk to it over a single transferred `MessagePort` carrying zod-validated, typed messages.
    - Run a heartbeat watchdog.
    - Sources: https://html.spec.whatwg.org/multipage/browsers.html#sandboxing and https://w3c.github.io/webappsec-csp/
  - **OBS limits:**
    - OBS runs browser sources with Chromium's OS sandbox off (`no_sandbox = true`, https://github.com/obsproject/obs-browser/blob/master/obs-browser-plugin.cpp), on a CEF that lags Chromium. OBS 33 moved from 127 to 150.
    - It injects `window.obsstudio` into every frame.
    - Sandbox and CSP cannot block audio, WebRTC or DNS-prefetch leaks.
  - **A real exploit chain:** a Twitch chat message hit an overlay that inserted raw HTML and was chained with a V8 bug to run code on the streamer's PC (https://blog.scrt.ch/2026/09/22/how-one-twitch-chat-message-became-code-execution-on-a-streamers-pc/).
  - **Verdict:** templates the user writes are safe enough with the design above. Downloaded JS templates are not safe in OBS.

## Management Page

Follow `ModulePageLayout`, like the Timers page:

- **Feedback.**
- **Platforms:** an on/off switch for Twitch and for YouTube, each with its availability.
  - Twitch: connected, or needs reconnect for `user:read:chat`.
  - YouTube: Streamer.bot connected and offering the YouTube events.
- **Outputs:** the `landscape` and `vertical` profile URLs, with their saved sizes.
- **Workspace:**
  - Landscape and Vertical tabs.
  - The appearance editor, with common settings visible and text style, colors, spacing and custom CSS in collapsed sections.
  - A live preview beside the editor.
- **Secondary sections:** filters (bot list, commands, "Show Shared Chat partner messages", a link to the `chat` moderation target), the YouTube delay, and 7TV/BTTV/FFZ service status.

The preview uses a built-in sample set covering every case:

- emotes, a zero-width stack and an emote-only message;
- a Super Chat, a cheer, a first-timer, a reply and a mention;
- a very long message;
- a moderator, a VIP, and both platforms.

A live-chat preview is BL-093.

## Test Messages

Follow the Alerts test pattern (`apps/server/src/modules/alerts/alert-editor-service.ts`, `sendTest`):

- "Send test messages" in management and Operator pushes the sample set to the real outputs as manual-provenance messages.
- It is blocked with an actionable error while the module is disabled.
- Test messages pass through the same filters and moderation, and can be hidden or cleared like any other.
- Streamer.bot test-button chat messages (`isTest`) are treated the same way. No server code handles `isTest` today.

## Operator Panel

The 2026-10-08 module rules (`docs/design/2026-10-08-custom-data-overlays-review.md`) require Operator tools for every module. The panel is for moderation and platform control, not a chat reader like Streamer.bot Chat:

- the messages currently on stream (the overlay's visible set), each with **Hide**;
- a short, bounded Hidden list with **Unhide**, emptied by Clear display;
- **Clear display**, with a confirmation;
- an **on/off switch for each connected platform** (Twitch, YouTube), with connection state;
- "Send test messages".

There is no module on/off, which matches every other Operator panel today (`apps/web/src/operator/OperatorApp.tsx`), and there is no scrolling history, search or user detail. Hide and Unhide affect Stream Jams only, never the platform.

## Security Findings From This Review

These existed before this work and are filed independently of chat:

- **BL-078: overlay pages send no Content Security Policy.**
  - `sendHtml` (`apps/server/src/http/routes/web-shell.ts:73`) sets only `referrer-policy`.
  - `sendManagementHtml` adds the management CSP and `X-Frame-Options`.
  - Overlay routes use `sendHtml` (`apps/server/src/http/routes/overlays.ts:53-56`).
  - The fix is a CSP of roughly this shape: `default-src 'none'`; scripts and styles from self; images, fonts and media from self plus `data:`; `connect-src` to self only; no frames. Check every module under it.
  - It must land before chat's custom CSS.
- **BL-079: management session creation accepts `Origin: null` and shares the rate-limit bucket.**
  - `applyOriginPolicy` (`apps/server/src/http/middleware/management-security.ts:128`) lets a missing or `null` Origin through for `POST /auth/management/sessions`.
  - An opaque-origin page cannot read the new session, but it can create sessions blindly and exhaust the shared per-IP rate limit, which locks the management UI out of signing in.

## Verify During Implementation

- First, capture real Streamer.bot YouTube payloads (`Message`, `SuperChat`, `SuperSticker`, `UserBanned`, `UserTimedout`) into `apps/server/src/modules/streamerbot/fixtures/` with names and IDs replaced, before finishing the normalizers. The documented examples come from a schema faker.
- Streamer.bot YouTube `UserBanned`/`UserTimedout` WebSocket payload fields, on both 1.0.7 and 1.1.0-alpha. The 1.1.0 changelog says YouTube payloads changed. ChatRD uses `data.targetUser.id` (https://github.com/vortisrd/chatrd).
- Shared Chat on EventSub: confirm in a live two-channel session that partner messages arrive with `source_*` fields, and that host-room deletes carry the host copy's `message_id`.
- Whether YouTube messages held for review stay out of the Streamer.bot feed until approved. This gates option C's runbook recommendation.
- The YouTube Super Chat tier colors and thresholds (https://support.google.com/youtube/answer/7288782).
- Twitch badge endpoint response fields and the emote CDN URL template.
- The vertical defaults (780 × 640, 32 px, 5 messages), on a real phone viewing a vertical stream.
- Overlay CSP compatibility for every existing module (BL-078).

## Differences From PR #190

PR #190 (`add-chat-display-module`, opened 2026-10-12, draft) proposed an earlier Chat module. This design supersedes it. Every difference was reviewed with the maintainer on 2026-11-02.

**Intentional differences (this design wins):**

| Area | PR #190 | This design | Why |
| --- | --- | --- | --- |
| Twitch route | Streamer.bot | Direct EventSub | Twitch chat must not depend on Streamer.bot running, and it reuses the existing login. Cost: 7TV, BTTV and FFZ are fetched directly. Streamer.bot `parts` appear to include them (ChatRD renders them from `part.imageUrl` only), which is recorded for BL-088. |
| Kick | In v1 via Streamer.bot | Out (BL-096) | Not used by the maintainer; no delete events. |
| TikTok | In v1 via a TikFinity marker | Out (BL-095, keeps #190's marker design) | No removal events at all. |
| History | Newest 50 in SQLite, per-message transactions | Server memory only (about 200) | Chat is not a queue; comparable tools keep none; synchronous SQLite writes on the main thread. Backlog BL-102. |
| Avatars | On, via Twitch Get Users | None, except Shared Chat partner channel pictures | Consistency across platforms (BL-082). |
| Blocked term | Replaced with `[moderated]` | Whole message hidden | `[moderated]` still identifies the author and invites probing. |
| Filters | Bot list empty, commands shown by default | Bot list prefilled, commands hidden | Maintainer decision. |
| YouTube safety | Bans only | Bans, a 3 s hold, and hold-for-review guidance | Single YouTube deletes are never delivered. |
| Shared Chat | Shown, with partner-mod removals from Streamer.bot `SharedChat*` | Shown, with host-room removals only; partner picture badge plus `source_badges` | Matches the broadcaster's own Twitch chat. Mirroring partner moderation needs `channel.moderate` v2 (BL-091). |
| Look | Box per message; no custom CSS, highlights or paid styling; cheers as text | Cards preset, highlights, Super Chats, cheermotes, big emotes, custom CSS | Look-and-feel review. |
| Operator | Recent list with Hide/Unhide, Clear, module enable | Visible set with Hide/Unhide, Clear, platform switches; no module enable | No Operator panel has module enable today. |

**Adopted from PR #190:**
- the Operator panel;
- per-platform switches backed by `GetEvents`;
- protection for existing custom subscriptions;
- no chat content in logs;
- intake bounds;
- part fallbacks;
- capturing payloads before writing normalizers;
- the generalized Music artwork fetcher with its image limits, cache and private media protocol;
- the TikFinity marker design (for BL-095).

**Corrected in PR #190:**
- It planned to implement YouTube `MessageDeleted` once a payload was captured. Streamer.bot says that event will never fire (https://streamer.bot/changelogs/v0.2.4).
- It assumed overlay pages had `img-src 'self'`. Browser-source overlays have no CSP (BL-078).
- It used the retired unified browser route.

## Documentation Note

`docs/product-plan.md` contradicts itself. Lines 42 and 126 describe unified overlay URLs, while line 67 and the server (`classifyRetiredRoute`) treat them as retired. Chat uses module/profile URLs and the desktop overlay only. The product-plan wording is not changed here.

## Research Sources

- **Unofficial connector reliability (rejected, NP-007):**
  - YouTube InnerTube:
    - The endpoint has been stable since 2022, with renderer drift every few months.
    - One read-path fix took 102 days upstream (https://github.com/LuanRT/YouTube.js/issues/1098).
    - It can fail silently, returning HTTP 200 with no actions (https://github.com/caesarakalaeii/all-chat/pull/575).
    - It breaks YouTube's ToS (https://www.youtube.com/static?template=terms) and API policies (https://developers.google.com/youtube/terms/developer-policies).
  - TikTok: total outage on 2026-09-09; the Node library took 7–11 days to recover (https://github.com/zerodytrash/TikTok-Live-Connector/issues/329). TikTok now requires browser-grade sessions (https://github.com/caesarakalaeii/all-chat/blob/main/docs/adr/0052-retiring-euler-stream-for-tiktok-signing.md).
  - Kick: unannounced app-key rotations in 2025-07 and on 2026-10-13, plus a move to Centrifugo (https://github.com/caesarakalaeii/all-chat/blob/main/docs/adr/0077-kick-listener-follows-kicks-realtime-provider.md). Official WebSockets have no ETA (https://github.com/KickEngineering/KickDevDocs/issues/20).
- **Comparable products:**
  - ChatRD, Streamer.bot plus overlay: https://github.com/vortisrd/chatrd
  - Social Stream Ninja, extension scraping plus a cloud relay: https://github.com/steveseguin/social_stream
  - All-Chat, AGPL, native connectors and 16 CSS themes: https://github.com/caesarakalaeii/all-chat
  - Restream Chat API, cloud-only with no TikTok: https://developers.restream.io/chat/getting-started
- **Customization and readability:**
  - StreamElements CustomChat fields: https://github.com/StreamElements/widgets/tree/master/CustomChat
  - jChat: https://github.com/giambaJ/jChat
  - KapChat: https://nightdev.com/hosted/obschat/
  - ChatIS: https://chatis.is2511.com/
  - Default+ 2: https://github.com/Redo7/defaultplus2/wiki/full-widget-settings-guide
