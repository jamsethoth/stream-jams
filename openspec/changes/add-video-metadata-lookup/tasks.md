## 1. Contracts And Persistence

- [x] 1.1 Add `providerTitle` and `channelName` to `VideoRequestItem`, a `VideoMetadata` type and `videoChannelNameSchema`.
- [x] 1.2 Add migration `041-video-request-metadata` and repository read/write of the new columns; update migration-history fixtures.
- [x] 1.3 Test the migration on an existing queue row and the repository round trip.

## 2. Lookup

- [x] 2.1 Add `VideoMetadataLookup` (YouTube oEmbed, Twitch Helix clips and videos) with zod validation, text normalization, strict length parsing, fixed origins, no redirects, a body cap and a 5-second timeout.
- [x] 2.2 Add a read-only Twitch connected-access reader over the stored account and token.
- [x] 2.3 Unit-test parse success, malformed and oversized answers, HTTP errors, timeouts, cancellation, transport errors, Twitch id mismatch, no connected account, and length edge cases.

## 3. Queue

- [x] 3.1 Add `VideoQueueService.applyMetadata`, filling an unknown length through the existing hold rules for waiting items and `learnDuration` for the current item.
- [x] 3.2 Carry provider details into Replay.
- [x] 3.3 Test submitted-title precedence, Twitch length over the limit holding a waiting item, Play all skipping it, cutting the current item, a known length kept, late details ignored, and persistence.

## 4. Intake And Runtime

- [x] 4.1 Add the intake `onQueued` hook for submissions and Replay; test it fires once per accepted request and never for rejections.
- [x] 4.2 Add `VideoMetadataEnricher` with bounded diagnostics and dispose; test found, failed, skipped, late and cancelled lookups and that diagnostics carry no links or tokens.
- [x] 4.3 Wire the enricher in the runtime composition with an injectable `videoMetadataFetch`; default the acceptance fixture to an offline fetch; cover the wiring in the runtime smoke test.

## 5. Web

- [x] 5.1 Show title, "Channel · length" and request details on queue rows; channel on Now playing and Operator Recent; validate the new fields in the HTTP client.
- [x] 5.2 Add component tests and Storybook stories for rows with and without provider details and Operator Recent with a channel.
- [x] 5.3 Update Playwright queue assertions for the new row layout and add an acceptance test with stubbed YouTube and Twitch lookups.

## 6. Documentation And Verification

- [x] 6.1 Document the lookup in `docs/videos.md` and update BL-058.
- [x] 6.2 Run lint, typecheck, unit tests, build (bundle budgets), Storybook CI and the Videos Playwright specs.
