# Design: Video Metadata Lookup

## Context

The Videos queue (`add-video-request-queue`) stores the submitted title only and learns lengths from players. YouTube offers a keyless oEmbed endpoint with title and channel, and the Twitch Helix `clips` and `videos` endpoints return title, broadcaster and length for any app or user token. The app already stores the connected broadcaster's user token for EventSub and the reward catalog.

## Goals / Non-Goals

**Goals**
- Describe every queued request from its provider without delaying intake.
- Apply a provider length through the existing length-limit rules, not a second copy of them.
- Keep the stream caption, logs and browser bundles unchanged in what they can leak.

**Non-Goals**
- YouTube lengths (BL-058), retries, refreshing Twitch tokens, or looking up direct files.

## Decisions

### D1. Queue first, describe after
`VideoRequestIntake` calls an optional `onQueued(purpose, item)` after the queue accepted a submission or Replay. The runtime composition passes it to `VideoMetadataEnricher.enrich`, tracked as runtime work so shutdown drains it. The HTTP, Streamer.bot and channel-point responses are unchanged and immediate.

*Alternative:* await the lookup before answering. Rejected: a slow provider would hold Streamer.bot and REST callers for up to the timeout.

### D2. A framework-independent lookup service
`VideoMetadataLookup` takes an injectable `fetch` and a `getTwitchAccess()` reader and returns a result union (`found`, `skipped`, `failed` with a bounded reason). It:
- builds the YouTube request from the canonical watch link of the validated video id (no start offset or other submitted extras);
- builds Twitch requests from the clip slug or VOD id with `URLSearchParams`;
- uses fixed origins (`https://www.youtube.com`, `https://api.twitch.tv`), `redirect: "error"`, a 5-second `AbortSignal.timeout` combined with the enricher's dispose signal, and a 256 KiB body cap;
- validates answers with zod, requires the returned Twitch id to match the requested one, and normalizes text (control and bidi-override characters removed, whitespace collapsed, titles cut to 200 and channels to 100 UTF-16 units on code-point boundaries);
- parses Twitch clip lengths (fractional seconds) and VOD lengths (`1h2m3s`) strictly, treating zero, malformed or over-24-hour values as unknown.

Tests and acceptance runs inject `fetch` through `RuntimeAppCompositionOptions.videoMetadataFetch`; the shared runtime fixture defaults to an offline fetch so no test reaches the network.

### D3. Twitch access reuses the stored connection
`createTwitchConnectedAccessReader` reads the connected account from `TwitchAccountRepository` and its `access_token` secret, with the app client id. It never refreshes or validates (that would add calls to `id.twitch.tv`); a rejected token is reported as `http-status` 401 and the request stays as queued. No account or no token means `skipped`.

### D4. Store provider details beside the submitted title
New nullable columns `provider_title` and `channel_name` (`041-video-request-metadata`). `title` keeps the submitted title and still drives the stream caption and the overlay projection; the UI shows `title ?? providerTitle ?? link`. Replay copies the provider details, so a replayed request needs no new lookup.

*Alternative:* fill `title` when it is null. Rejected: provider titles would start appearing on stream captions without the operator choosing that, and the submitted-versus-looked-up distinction would be lost.

### D5. Provider lengths reuse the queue's length rules
`VideoQueueService.applyMetadata(purpose, itemId, metadata)`:
- ignores items that left the queue (returns false; logged at debug);
- for a waiting item, fills `durationMs` only when it is unknown and re-applies `holdReason` exactly as `reevaluateLimits` does, so an over-limit item becomes held at its position and drops out of any Play all run (the run skips non-queued items);
- for the current item, stores the details and passes an unknown length through `learnDuration`, which cuts and holds an over-limit item not released with Play anyway, or reschedules the end timer when it fits;
- never overrides a length given with the request or one already learned, matching `learnDuration`'s "a known length never cuts" rule.

Each change is one repository commit with a revision bump and a normal queue broadcast, like other queue changes. A client holding the older revision gets the usual conflict and refresh.

### D6. Logging
The enricher reports `info` for failed lookups and `debug` for skipped or late ones, with `itemId`, `purpose`, `provider`, `outcome`, `reason` and an HTTP status only. Transport errors are reduced to `network`/`timeout`/`aborted` because their messages may carry the request URL.

### D7. UI
Queue rows show the title as the main line, then "Channel · length" (length "Length unknown" when unknown), then "Requested by … · provider · via …". Now playing prefixes its summary with the channel; Operator Recent leads its summary with the channel. Titles are wrapped in `<bdi>`. Accessible names use the same title fallback, so names change only for requests without a submitted title once details arrive.

## Risks / Trade-offs

- **Revision bump after submit**: a command sent with the revision read just before the details arrive gets a conflict and refresh. This already happens for player-learned lengths and is bounded to one extra commit per request.
- **Twitch rate limits**: one Helix call per Twitch request; channel-point floods are bounded by the 500-item queue limit.
- **Expired token**: lookups fail with 401 until the hourly validation refreshes the token; the request is unaffected.

## Migration

`041-video-request-metadata` adds two nullable columns; existing rows read as unknown details. No backfill.
