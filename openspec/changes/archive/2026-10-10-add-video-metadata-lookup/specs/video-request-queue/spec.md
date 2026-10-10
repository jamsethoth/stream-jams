## ADDED Requirements

### Requirement: Queued Requests Are Described From Their Provider
After a request is queued through any submission path or replayed, the system SHALL look up its title and channel (and, for Twitch, its length) in the background without delaying the submitter's response, and SHALL store them on the queued request beside the submitted title. YouTube details SHALL come from the public oEmbed endpoint without credentials; Twitch clip and video details SHALL come from the Twitch API with the connected Twitch account; direct files SHALL NOT be looked up. Each request SHALL get at most one lookup, bounded by a timeout, with no retries. Lookups SHALL run only in the local service, SHALL contact only `https://www.youtube.com/oembed` and `https://api.twitch.tv/helix`, and SHALL be built from the validated source rather than the submitted link.

#### Scenario: YouTube request
- **WHEN** a YouTube link is queued without a title
- **THEN** the request is accepted immediately, and its provider title and channel are filled in from oEmbed once they arrive, with its length still unknown

#### Scenario: Submitted title wins
- **WHEN** a request is queued with a title and the provider reports a different one
- **THEN** the submitted title remains the request's title and the only title shown on stream, and the provider title is stored beside it

#### Scenario: Twitch without a connected account
- **WHEN** a Twitch clip or video is queued and no Twitch account is connected
- **THEN** no Twitch request is made, the request stays as queued, and a bounded diagnostic is logged

#### Scenario: Lookup fails
- **WHEN** the provider answers with an error, a malformed or oversized body, a redirect, or does not answer within the timeout
- **THEN** the request stays as queued with its details unknown, nothing is retried, and the log records only the item, provider and reason, never the link, the provider's answer or any token

#### Scenario: Replay
- **WHEN** a Recent video with provider details is replayed
- **THEN** the new request carries the same details without a new lookup

## MODIFIED Requirements

### Requirement: Maximum Length Holds Items For Manual Override
The system SHALL hold items whose known duration exceeds the configured maximum length, SHALL queue items of unknown duration normally, and SHALL let the operator play a held item explicitly. When a player or the provider lookup reports a duration over the limit for an item queued with an unknown duration that the operator has not released with Play anyway, the system SHALL hold it as over the limit, stopping it first if it is playing. A duration reported for an item whose length was already known SHALL NOT replace it.

#### Scenario: Over-limit item
- **WHEN** an item longer than the maximum length is submitted
- **THEN** it is shown in the queue as held with its length and the limit, and play next and play all skip it

#### Scenario: Item exactly at the limit
- **WHEN** an item whose length equals the maximum length is submitted
- **THEN** it is queued, not held

#### Scenario: Unknown-length item
- **WHEN** an item without a known length is submitted
- **THEN** it is queued with its length shown as unknown, and play next, play all and autoplay can play it

#### Scenario: Player reports an unknown-length item over the limit
- **WHEN** the player reports a duration over the maximum length for a playing or paused item that was queued with an unknown length and not released with Play anyway
- **THEN** playback of that item ends immediately, the item is neither played nor failed but returns to the queue held as over the limit at its original position, and the run continues as if the item had been skipped, respecting the gap, the run snapshot and a paused queue

#### Scenario: Provider reports a waiting item over the limit
- **WHEN** the Twitch lookup reports a length over the maximum length for a waiting item queued with an unknown length
- **THEN** the item is held as over the limit at its position, play next and play all skip it, and Play anyway still releases it

#### Scenario: Provider reports the current item over the limit
- **WHEN** the Twitch lookup reports a length over the maximum length for the loading, playing or paused item, which was queued with an unknown length and not released with Play anyway
- **THEN** the system stops and holds it exactly as when the player reports that length

#### Scenario: Play anyway
- **WHEN** the operator chooses Play anyway on a held item
- **THEN** that item plays to its natural end without changing the limit, and a duration it reports never stops it

#### Scenario: Legacy unknown-length holds
- **WHEN** the service starts with items an older version held for an unknown length
- **THEN** those items become queued in their existing positions

#### Scenario: Limit changes
- **WHEN** the operator raises the limit above a held item's length
- **THEN** the item becomes queued in its existing position

### Requirement: Management And Operator Surfaces
The system SHALL provide a Videos management page and Operator UI queue tools covering the controls in this specification. Queue rows SHALL show the request's title (the submitted title, else the provider title, else the link) with its channel and length, and SHALL omit details that are unknown.

#### Scenario: Configure limits
- **WHEN** the operator sets maximum length, gap, audio destinations, allowed hosts and reward mappings on the Videos page
- **THEN** the settings persist and apply to later submissions and runs

#### Scenario: Operate during a stream
- **WHEN** the operator opens the Operator UI
- **THEN** a now-playing card shows title, channel when known, requester, progress and available controls, and the queue list shows queued and held items with their actions, all keyboard operable

#### Scenario: Queue rows show provider details
- **WHEN** a waiting request has a provider title, channel or length
- **THEN** its row on the Videos page and in the Operator UI shows the title as the main line and the channel and length together beneath it (for example "Channel · 3:21"), with "Length unknown" when the length is unknown and no placeholder for an unknown channel

#### Scenario: Replay a recent video from the Operator UI
- **WHEN** a video in the queue being viewed has played (including skipped or stopped) or failed
- **THEN** the Operator UI lists it under Recent, newest first and limited to the 10 newest finished videos of that purpose, with title, channel when known, requester, link host, how it was requested, outcome and finish time, in the same list layout as the Alerts and Screen Effects Recent list, and removed or cleared videos are not listed
- **AND** choosing Replay, guarded by the observed queue revision, adds the same source to the end of that queue as a new operator-submitted request that waits for Play next or Play all now and never starts on its own, with the current length limit applied

#### Scenario: Replay refused
- **WHEN** the operator replays a recent video while the Videos module is off, after its direct-file host was removed from the allowlist, against a stale queue revision, or after it has left Recent
- **THEN** nothing is queued and the Operator UI shows the reason
