# Tasks

## 1. Intake and history

- [ ] 1.1 Capture real `Twitch.ChatMessage`, `YouTube.Message`, `Kick.ChatMessage` and removal payloads (including `YouTube.MessageDeleted`) from Streamer.bot into `apps/server/src/modules/streamerbot/fixtures/`, with names and IDs replaced.
- [ ] 1.2 Core chat message schema, per-platform normalizers from `parts` with fallbacks, and filters.
- [ ] 1.3 Chat subscriptions in the Streamer.bot runtime while Chat and a platform are enabled; route chat before normalization and keep it off the bus unless an external subscription names it.
- [ ] 1.4 Migration: Chat module settings and `chat_messages`; Chat service with newest-50 history, removals, Hide, Clear, duplicate handling; excluded from configuration backups.
- [ ] 1.5 Chat section with module enable, platform toggles and availability, filters.

## 2. Images

- [ ] 2.1 Move the Music artwork fetch, address check, pinned request and bounded body into a shared module; Music behavior unchanged.
- [ ] 2.2 Chat image policy, validation (animated GIF/WebP), LRU cache, failure memory and overlay routes.
- [ ] 2.3 Twitch avatar lookup with Helix Get Users, batched and cached.

## 3. Outputs

- [ ] 3.1 Chat snapshot and module output on landscape and vertical browser sources.
- [ ] 3.2 Desktop overlay rendering through the shared surface and private media protocol.

## 4. Editor and Operator

- [ ] 4.1 Chat layout editor with live preview, collapsed Appearance section and shared shadow.
- [ ] 4.2 Operator Chat panel with Hide, Unhide, Clear display and module enable.
- [ ] 4.3 Stories for each new state.

## 5. TikTok

- [ ] 5.1 Validate and accept the TikTok `ChatMessage` marker; copyable action body in the Chat section.

## 6. Verification

- [ ] 6.1 Unit tests: each normalizer against fixtures, markup stays text, filters, removals by message and by user, history trim and restore, bus untouched, image allowlist and private-address refusal, oversized and SVG images, TikTok marker validation.
- [ ] 6.2 Playwright: messages appear on the browser source, operator Hide and Clear, layout changes reach the preview and output.
- [ ] 6.3 Maintainer shows Twitch and YouTube chat on the browser source and desktop overlay on Windows, and TikTok through TikFinity.
