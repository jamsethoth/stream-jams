# Unified Chat Module Design

Status: design agreed with the maintainer on 2026-11-02 through a structured design review. This is investigation output. An OpenSpec change is still needed before implementation. Backlog row: BL-079.

## Goal

Add a Chat overlay module that merges live chat from Twitch and YouTube into one card list. It renders on module/profile browser sources and on the private desktop overlay. It must honor platform moderation fast enough that a removed message does not stay on stream.

## Decisions Summary

| Area | Decision |
| --- | --- |
| Purpose | Overlay display only. No management chat reader, reply, delete or highlight actions in v1. |
| Platforms | Twitch first, YouTube second. TikTok and Kick are out of v1. |
| Twitch route | Direct through the existing Twitch EventSub WebSocket client, adding `user:read:chat`. Twitch chat arriving through Streamer.bot is ignored. |
| YouTube route | Through Streamer.bot only. Stream Jams subscribes to the needed events automatically. |
| Unofficial connectors | None in v1, not even opt-in. |
| Pipeline | A dedicated chat pipeline, separate from the central event bus. In-memory ring buffer only; nothing is persisted or backed up. |
| Message model | Typed parts rendered as React elements. Never HTML. |
| Moderation | Platform removals are honored within about one second where the platform reports them. YouTube single-message deletes are a documented exception. |
| Filtering | Editable bot list, hidden `!commands`, and a new `chat` moderation target that hides a whole message on a blocked term. |
| Emotes | Native Twitch and YouTube, plus 7TV, BTTV and FFZ fetched directly. Images are served through a server proxy with an allowlist and a disk cache. |
| Look | One built-in preset, "Cards", in a card-list layout. Typed per-profile appearance plus scoped custom CSS. |
| Outputs | `landscape` and `vertical` module profiles, and a layer on the private desktop overlay. |
| Templates | No user HTML/JS templates in v1. |
| Prerequisite | Overlay pages must get a Content Security Policy (BL-077) before custom CSS ships. |

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
- Shared Chat: show only messages whose source is the broadcaster's own channel. Partner-channel messages are deferred (BL-090), because delete delivery for them is unverified.

### YouTube (through Streamer.bot)

- Extend `apps/server/src/modules/streamerbot/streamerbot-event-normalizer.ts`. It currently rejects every non-Twitch source. Keep the hand-written client; BL-100 tracks evaluating `@streamerbot/client`.
- When the chat module is enabled, subscribe automatically to YouTube `Message`, `SuperChat`, `SuperSticker`, `MessageDeleted`, `UserBanned` and `UserTimedout`.
  - https://docs.streamer.bot/api/websocket/events
- Streamer.bot reads YouTube through the official Data API: the push/streaming API since v1.0.0 (https://streamer.bot/changelogs/v1.0.0). It inherits that API's limits.
- If Streamer.bot disconnects, the overlay keeps showing Twitch chat with no on-stream error. The management UI shows "YouTube chat unavailable: Streamer.bot disconnected", using existing provider status.

### Excluded platforms

- **Kick:** the maintainer does not stream there. Neither route reports single-message deletes. The official API is webhooks-only, which a `127.0.0.1` app cannot receive without a tunnel. Kick declined a message-deleted webhook (https://github.com/KickEngineering/KickDevDocs/issues/310). Tracked as BL-095.
- **TikTok:** there is no official live chat API. Unofficial connectors break TikTok's terms (§3.4, https://www.tiktok.com/legal/page/us/terms-of-service/en). They need the Euler Stream signing service or a real browser session. `tiktok-live-connector` is AGPL-3.0-only from 2.4.4. The only path to reconsider is TikFinity pushing into Streamer.bot (BL-094).
- **Unofficial connectors in general:** rejected as NP-007, with evidence below.

## Pipeline

- Chat does not use the central event bus. The bus serves rare, alert-worthy events with dedupe, history and alert matching. Later work may promote selected chat-derived signals, such as a first-time chatter or a keyword, onto the bus.
- One route per platform means no cross-route deduplication. Within a route, drop repeats by the platform's native message ID, using a small bounded recent-ID set to cover reconnects.
- The ring buffer holds about the last 200 messages in memory, so a reconnecting overlay can refill. Never write chat to SQLite or include it in backups or exports.
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
- Part types: `text`, `emote { name, url, zeroWidth }`, `mention`, `cheermote`.
- Removal messages:
  - `remove { messageId }`
  - `removeUser { platform, userId }`
  - `clear { platform }`
- No avatars in v1. Twitch EventSub does not include them, and mixed rows look inconsistent (BL-081).

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
  - BL-093 tracks the opt-in InnerTube supplement that could close this gap.

### Local filtering

- A bot list, matched case-insensitively per platform. Defaults: Nightbot, StreamElements, Streamlabs, Moobot, Fossabot, Sery_Bot and the account Streamer.bot uses as its bot. Users can edit it.
- `!commands` are hidden unless the profile opts in.
- A new `chat` target in `packages/core/src/moderation/moderation-service.ts`, alongside `rendered` and `tts`, with its own maximum length, blocked terms and URL setting.
  - It runs on text parts.
  - A blocked term **hides the whole message**. It does not substitute `[moderated]`, because that still identifies the author and invites people to probe the filter.

### Third-party emotes

- 7TV emotes flagged NSFW render as their plain-text name.
- FFZ modifier emotes (`ffzW`, `ffzX`, `ffzHyper` and so on) are dropped, and the base emote renders without the effect. Some effects flash. Effects are tracked as BL-089.
- 7TV zero-width emotes render as a simple stack over the previous emote.

## Emotes And Images

- Fetch the channel and global emote sets directly from the public, no-auth endpoints. Do not use `@mkody/twitch-emoticons`: its `parse()` returns HTML strings, and it would pull in Twurple and axios for about a third of its function. Add a `shortcut:` comment naming it as the fallback if these APIs start breaking.
  - 7TV: `https://7tv.io/v3/users/twitch/{id}` and `/v3/emote-sets/global`.
  - BTTV: `https://api.betterttv.net/3/cached/users/twitch/{id}` and `/3/cached/emotes/global`.
  - FFZ: `https://api.frankerfacez.com/v1/room/id/{id}` and `/v1/set/global`.
- The server turns emote words in text parts into `emote` parts, for both platforms. The Twitch channel's 7TV/BTTV/FFZ sets also apply to YouTube viewers' text.
- Refresh the lists at startup and every 10–15 minutes. If a service fails, keep the last good list; with no list, show the words as plain text. A third-party emote failure must never hide or delay chat. 7TV live updates are BL-088.
- **Image proxy:**
  - The server fetches emote, badge and cheermote images only from an allowlist of hosts: Twitch CDN, 7TV, BTTV, FFZ and YouTube image hosts.
  - It caches them on disk with a size cap and evicts least-recently-used entries first.
  - It serves them to the overlay under the overlay's existing key, the way `apps/server/src/http/routes/music-artwork.ts` does.
  - A failed image falls back to the emote's text name.
  - The allowlist prevents server-side request forgery.
  - Rationale: the overlay never contacts outside hosts, repeated emotes come from local disk, and it stays compatible with the overlay CSP from BL-077. Correction recorded during the review: overlay pages have no CSP today, so the proxy is not yet *required*. See "Security Findings".

## Look And Feel

### Preset and layout

- One built-in preset, **Cards**: each message on a rounded card. The preset only fills in settings; users can change any of them.
- One layout mode in v1, the card list. Ticker and latest-message popup layouts are BL-080. Bubble and avatar-column layouts are BL-081.
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
  - Fonts: the 4 existing presets plus any uploaded font asset (`openspec/specs/alert-advanced-typography/spec.md`). There are no remote font loads; Google Fonts import is BL-096.
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
- Message attributes: `data-platform`, `data-role`, `data-highlight`, `data-emote-only`, `data-paid-tier`.
- The root carries `data-module="chat"`.
- Saved settings are exposed as `--chat-*` CSS variables. Their defaults reference `--sj-*` names, ready for the style library (BL-099).
- Naming follows Streamer.bot (`data-platform`, `data-slot`) and All-Chat (`--chat-*`), so community CSS ports easily.
- Hiding a part in settings removes the element. Custom CSS cannot bring it back.
- Internal class names are not part of the contract.

### Custom CSS (per profile)

- An optional Custom CSS field per profile. It applies to the management preview, the browser outputs and the desktop layer, and it is saved with the profile and included in backups.
- It is built on shared code (validation, scoping to the module root, injection, preview) that other modules will reuse (BL-098).
- Limits:
  - 256 KB per profile.
  - `@import` rejected.
  - `data:` images allowed, which enable textures, frames and icons.
  - External loads are blocked by the overlay CSP once BL-077 lands.
- **Depends on BL-077.** Overlay pages have no CSP today. Without one, custom CSS could load remote resources, and attribute-selector exfiltration would work. If BL-077 is late, chat ships with custom CSS disabled.
- What CSS can and cannot change:
  - It can change colors, surfaces, typography from loaded fonts, spacing and arrangement within the module, hiding parts, pseudo-element decoration, clip-path and mask shapes, transforms, filters on the module's own pixels, and keyframe animation.
  - It cannot change content, timing or queueing, add real elements, load external resources (with a CSP), see the OBS scene behind the page (no `backdrop-filter`), resize the advertised canvas (oversized content is clipped), or run code.
  - Backdrop blur does not work in OBS browser sources: https://obsproject.com/forum/threads/css-backdrop-filter-in-browser-source.125871/

### User HTML/JS templates (not in v1)

- No templates in v1.
- Later rows, in order:
  - **BL-084:** HTML/CSS-only templates. Sanitized structure with named slots that Stream Jams fills as text. Safe to share.
  - **BL-085:** JS templates for the user's own use only.
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
- **Status:**
  - Twitch connected, or needs reconnect for `user:read:chat`.
  - Streamer.bot/YouTube availability.
- **Outputs:** the `landscape` and `vertical` profile URLs, with their saved sizes.
- **Workspace:**
  - Landscape and Vertical tabs.
  - The appearance editor, with common settings visible and text style, colors, spacing and custom CSS in collapsed sections.
  - A live preview beside the editor.
- **Secondary sections:** filters (bot list, commands, a link to the `chat` moderation target), the YouTube delay, and 7TV/BTTV/FFZ service status.

The preview uses a built-in sample set covering every case:

- emotes, a zero-width stack and an emote-only message;
- a Super Chat, a cheer, a first-timer, a reply and a mention;
- a very long message;
- a moderator, a VIP, and both platforms.

"Send test messages" pushes the same set to the real outputs as manual test sends. A live-chat preview is BL-092.

## Security Findings From This Review

These existed before this work and are filed independently of chat:

- **BL-077: overlay pages send no Content Security Policy.**
  - `sendHtml` (`apps/server/src/http/routes/web-shell.ts:73`) sets only `referrer-policy`.
  - `sendManagementHtml` adds the management CSP and `X-Frame-Options`.
  - Overlay routes use `sendHtml` (`apps/server/src/http/routes/overlays.ts:53-56`).
  - The fix is a CSP of roughly this shape: `default-src 'none'`; scripts and styles from self; images, fonts and media from self plus `data:`; `connect-src` to self only; no frames. Check every module under it.
  - It must land before chat's custom CSS.
- **BL-078: management session creation accepts `Origin: null` and shares the rate-limit bucket.**
  - `applyOriginPolicy` (`apps/server/src/http/middleware/management-security.ts:128`) lets a missing or `null` Origin through for `POST /auth/management/sessions`.
  - An opaque-origin page cannot read the new session, but it can create sessions blindly and exhaust the shared per-IP rate limit, which locks the management UI out of signing in.

## Verify During Implementation

- Streamer.bot YouTube `UserBanned`/`UserTimedout` WebSocket payload fields, on both 1.0.7 and 1.1.0-alpha. The 1.1.0 changelog says YouTube payloads changed. ChatRD uses `data.targetUser.id` (https://github.com/vortisrd/chatrd).
- Whether YouTube messages held for review stay out of the Streamer.bot feed until approved. This gates option C's runbook recommendation.
- The YouTube Super Chat tier colors and thresholds (https://support.google.com/youtube/answer/7288782).
- Twitch badge endpoint response fields and the emote CDN URL template.
- The vertical defaults (780 × 640, 32 px, 5 messages), on a real phone viewing a vertical stream.
- Overlay CSP compatibility for every existing module (BL-077).

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
