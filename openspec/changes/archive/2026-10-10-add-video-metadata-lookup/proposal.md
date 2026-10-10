# Proposal: Add Video Metadata Lookup

## Why

The operator asked why a queued video's title is not retrieved automatically, and wants the queue to show the channel name and title beside the length. Today a request shows only the title given with it, or else its raw link, and Twitch lengths are unknown until a player reports them, so an over-limit Twitch clip on a browser source without the desktop app plays to its end.

## What Changes

- After any intake path queues a request (management, Operator, scoped automation, Streamer.bot, channel points, and Operator Replay), the service looks up the video's details in the background. The submitter's response never waits on a provider.
  - **YouTube**: title and channel from the public oEmbed endpoint, without a key. oEmbed has no length.
  - **Twitch clips and VODs**: title, channel and length from the Helix API using the already connected Twitch account's user token. Without a connected account the lookup is skipped.
  - **Direct files**: never looked up.
- One attempt per request with a 5-second limit and no retries. Answers are validated at the boundary and only normalized text and lengths are kept.
- The looked-up title and channel are stored on the queue row (new SQLite migration) beside the submitted title, which always wins and remains the only title shown on stream.
- A Twitch length counts as a known length and goes through the same queue rules as a player-reported length: a waiting item over the limit is held as over-limit at its position, and the current item is cut and held.
- The Videos page queue, the Operator queue and Now playing show the title as the main line with "Channel · length" under it; Operator Recent leads its summary with the channel. Unknown values are omitted.
- `docs/videos.md` documents the lookup, and BL-058 notes that Twitch lengths now come from Twitch when connected.

## Capabilities

### Modified Capabilities

- `video-request-queue`: queued requests are described from their provider; provider lengths apply the length limit; management and Operator queue rows show the title, channel and length.

## Out Of Scope

- YouTube length lookup (an API key, Google sign-in or a desktop metadata probe) remains BL-058.
- Showing the provider title on the stream caption; the overlay keeps the submitted title only.
- Refreshing an expired Twitch token for a lookup; the connection's own validation owns refreshes.

## Impact

- Code:
  - `packages/core`: `providerTitle` and `channelName` on queue items, a `VideoMetadata` type and a channel-name schema.
  - `apps/server`: metadata lookup and enricher services, a read-only Twitch connected-access reader, the `041-video-request-metadata` migration, repository columns, `VideoQueueService.applyMetadata`, intake `onQueued` hook, runtime wiring with an injectable fetch.
  - `apps/web`: queue rows, Now playing and Operator Recent; Storybook stories.
- Security: outbound requests go only to `https://www.youtube.com/oembed` and `https://api.twitch.tv/helix/{clips,videos}`, are built from the validated source (never the submitted link), refuse redirects and oversized bodies, and run only in the server. Logs carry the item id, provider and a bounded reason, never links, provider payloads or tokens.
- No new dependencies. No overlay code changes.
