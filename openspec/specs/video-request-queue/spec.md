# video-request-queue Specification

## Purpose
The Videos module plays viewer, operator and automation video requests from allowlisted providers through a persisted, operator-controlled queue. While the desktop app runs, one primary player is mirrored to the desktop overlay, browser sources and selected audio devices; without it, browser sources play the queue themselves.

## Requirements

### Requirement: Videos Module Exposes Browser-Source And Desktop Outputs
The system SHALL register a built-in `videos` overlay module with one ordinary live module browser-source output on the existing route-key model, and SHALL render it on the desktop overlay when the operator enables it.

#### Scenario: Browser source loads with a valid key
- **WHEN** a browser source loads `/overlay/modules/videos/live/:overlayKey` with a valid live key
- **THEN** the overlay shell renders transparently and receives `videos` compositions

#### Scenario: Desktop overlay shows videos
- **WHEN** the desktop overlay is running with the Videos layer enabled and an item plays
- **THEN** the desktop overlay renders the same item at the server playback position

#### Scenario: Wrong key
- **WHEN** a missing, revoked or wrong-scope key is used
- **THEN** the existing overlay authorization rejects it and grants no management access

### Requirement: Requests Are Always Queued And Persisted
Every accepted video submission SHALL enter one ordinary persisted queue through the validated bus-consumer intake. Manual tests SHALL differ by provenance only, not destination. Acceptance SHALL not imply immediate playback: ordinary operator actions, allowed autoplay and length/queue rules SHALL still govern it. There SHALL be no separate test queue, test player or output-purpose selector.

#### Scenario: Manual video request
- **WHEN** an authorized operator submits a video as a manual event
- **THEN** it is journaled once and admitted through the Videos consumer into the same queue as subscribed requests
- **AND** it waits unless ordinary autoplay or an explicit play action permits playback

#### Scenario: Subscribed request
- **WHEN** a provider event already on the bus matches a video request
- **THEN** the Videos consumer admits it without republishing the event or enqueuing it twice

#### Scenario: Channel point autoplay request
- **WHEN** a channel point submission asks for autoplay
- **THEN** existing channel-point policy keeps it queued without autoplay

#### Scenario: Restart
- **WHEN** the application restarts with queued or active ordinary items
- **THEN** queue order is preserved, active playback returns to the queue head and nothing starts until the existing explicit playback action

#### Scenario: Plain submission waits
- **WHEN** a valid request arrives without `autoplay`
- **THEN** it is appended to the queue and nothing starts playing

#### Scenario: Allowed autoplay submission
- **WHEN** a valid request with `autoplay: true` arrives from a source allowed to autoplay, nothing is playing, the queue is not paused, and the item has no unresolved length or migration review hold
- **THEN** it starts playing

### Requirement: Operator Controls Queue Consumption
The system SHALL provide play next, play all now, pause and resume the queue, skip, stop, remove, reorder and clear. Each control SHALL be guarded by the observed queue revision.

#### Scenario: Play next
- **WHEN** the operator chooses play next while idle
- **THEN** the first playable item plays and the queue returns to idle when it ends

#### Scenario: Play all now
- **WHEN** the operator chooses play all now with three playable items queued and a fourth arrives during playback
- **THEN** the three items play in order separated by the configured gap, and the fourth remains queued

#### Scenario: Pause queue during a run
- **WHEN** the operator pauses the queue during a play-all run
- **THEN** the current item finishes and no further item starts until the queue is resumed

#### Scenario: Stale command
- **WHEN** a control carries a queue revision older than the current one
- **THEN** it fails with a conflict and changes nothing

### Requirement: Maximum Length Holds Items For Manual Override
The system SHALL hold items whose known duration exceeds the configured maximum length, SHALL queue items of unknown duration normally unless an independent migrated review hold applies, and SHALL let the operator play a held item explicitly. When a player or the provider lookup reports a duration over the limit for an item queued with an unknown duration that the operator has not released with Play anyway, the system SHALL hold it as over the limit, stopping it first if it is playing. A duration reported for an item whose length was already known SHALL NOT replace it.

#### Scenario: Over-limit item
- **WHEN** an item longer than the maximum length is submitted
- **THEN** it is shown in the queue as held with its length and the limit, and play next and play all skip it

#### Scenario: Item exactly at the limit
- **WHEN** an item whose length equals the maximum length is submitted
- **THEN** it has no length hold, while any independent migrated review hold remains

#### Scenario: Unknown-length item
- **WHEN** an ordinary item without a known length is submitted without a migrated review hold
- **THEN** it is queued with its length shown as unknown, and play next, play all and autoplay can play it

#### Scenario: Player reports an unknown-length item over the limit
- **WHEN** the player reports a duration over the maximum length for a playing or paused item that was queued with an unknown length and not released with Play anyway
- **THEN** playback of that item ends immediately, the item is neither played nor failed but returns to the queue held as over the limit at its original position, and the run continues as if the item had been skipped, respecting the gap, the run snapshot and a paused queue

#### Scenario: Provider reports a waiting item over the limit
- **WHEN** the Twitch lookup reports a length over the maximum length for a waiting item queued with an unknown length
- **THEN** the item is held as over the limit at its position, play next and play all skip it, and Play anyway releases only the length hold after any migrated review hold has been explicitly released

#### Scenario: Provider reports the current item over the limit
- **WHEN** the Twitch lookup reports a length over the maximum length for the loading, playing or paused item, which was queued with an unknown length and not released with Play anyway
- **THEN** the system stops and holds it exactly as when the player reports that length

#### Scenario: Play anyway
- **WHEN** the operator chooses Play anyway on an item held only for excessive length
- **THEN** that item plays to its natural end without changing the limit, and a duration it reports never stops it
- **AND** a migrated review hold is released only by an explicit item Play action; review release does not itself override an independent length hold

#### Scenario: Legacy unknown-length holds
- **WHEN** the service starts with items an older version held for an unknown length
- **THEN** those obsolete unknown-length holds clear in their existing positions without releasing any independent migrated review hold

#### Scenario: Limit changes
- **WHEN** the operator raises the limit above a held item's length
- **THEN** the length hold clears in its existing position, while any independent migrated review hold remains

### Requirement: Only Allowlisted Providers Are Accepted
The system SHALL accept only Twitch clips and VODs, YouTube videos and Shorts, and HTTPS direct `.mp4` or `.webm` files from operator-listed hosts. The system SHALL build embed URLs itself and SHALL reject credentials, non-default ports, unknown hosts and malformed ids.

#### Scenario: YouTube link
- **WHEN** `https://youtu.be/<id>?t=30` is submitted
- **THEN** the item stores provider `youtube`, the id, and a 30 s start offset, and renders `https://www.youtube-nocookie.com/embed/<id>` with `enablejsapi=1`

#### Scenario: Unlisted direct host
- **WHEN** an HTTPS `.mp4` link is submitted from a host not on the allowlist
- **THEN** it is rejected with reason `unsupported-source` and nothing is queued

#### Scenario: Unsafe link
- **WHEN** a link carries credentials, a non-default port or an unknown host
- **THEN** it is rejected and the raw link is not logged

### Requirement: Submission Paths Share One Validation Boundary
Management, operator, scoped automation REST, Streamer.bot custom events and mapped channel point redemptions SHALL submit through one intake that applies the same validation, limit and autoplay policy.

#### Scenario: REST submission
- **WHEN** a paired client with `videos:submit` posts a valid link to `/automation/v1/videos/live/requests`
- **THEN** the response returns the item id and status

#### Scenario: Missing scope
- **WHEN** a client without `videos:submit` posts a link
- **THEN** the request is rejected without side effects

#### Scenario: Streamer.bot event
- **WHEN** Streamer.bot broadcasts a custom event with the `StreamJams`/`VideoRequest` marker or the legacy `VideoShoutout` marker
- **THEN** the payload is submitted through the same intake

#### Scenario: Mapped reward
- **WHEN** a channel point redemption arrives for a mapped reward and its user input is a supported link
- **THEN** an item is queued with the redeemer as requester
- **AND** an unsupported or empty input is rejected with a bounded diagnostic and nothing is queued

### Requirement: One Primary Player Is Mirrored To Every Output
When the desktop app is running, the system SHALL play each item in one primary player hosted by the desktop app, and SHALL mirror its frames and audio to the desktop overlay and module browser sources over local WebRTC, so every output shows the same content.

#### Scenario: Pause and seek reach every output
- **WHEN** the operator pauses an item, seeks to 1:20 and resumes
- **THEN** the primary player pauses, seeks and resumes once
- **AND** every mirrored output shows the same frames without separate seeks

#### Scenario: Ad or buffering
- **WHEN** the primary player shows an ad or buffers
- **THEN** every mirrored output shows the same ad or buffering state at the same time

#### Scenario: Mirror stays local
- **WHEN** a browser source subscribes to the mirror
- **THEN** signaling is authorized by its overlay key and scoped to `videos`, ICE uses only loopback host candidates, and no STUN or TURN server is contacted

#### Scenario: Desktop app not running
- **WHEN** only the local service is running
- **THEN** browser sources play the item in their own player following the server clock
- **AND** management shows that mirroring is unavailable

#### Scenario: Fallback player reports the length
- **WHEN** a browser-source fallback player for YouTube or a direct file learns the length of the current item while the desktop app is not running
- **THEN** it reports that length once for the item, the system validates it as a whole number of milliseconds from 1 ms to 24 hours for a video item, and the length limit applies to it as to a length reported by the desktop player
- **AND** while the desktop player is available, lengths reported by browser sources are ignored

#### Scenario: Provider without pause or seek
- **WHEN** an item's player cannot be paused or sought
- **THEN** pause and seek are unavailable with a visible reason, and skip and stop work

### Requirement: Captured Audio Fans Out To Selected Destinations
The system SHALL send each item's audio only to the destinations the operator selected, either OBS browser-source audio or one or more output devices, and SHALL keep the provider's original audio off the system default device.

#### Scenario: Two devices and OBS
- **WHEN** OBS audio and two output devices are selected
- **THEN** the browser source plays the mirrored audio and each device receives the same audio

#### Scenario: Per-device delay
- **WHEN** the operator sets a delay between 0 and 500 ms on a selected device
- **THEN** that device plays the mirrored audio later by that delay and other destinations are unchanged

#### Scenario: Module muted
- **WHEN** the Videos module is muted through the existing mute policy
- **THEN** no destination plays audio and visuals continue

### Requirement: Rendering Fails Closed And Leaks Nothing
Overlay outputs SHALL render only validated items, SHALL load no third-party scripts in Stream Jams origins, and SHALL NOT expose route keys to providers.

#### Scenario: Invalid composition
- **WHEN** a composition carries an item that fails provider validation
- **THEN** nothing renders and a playback failure is reported once

#### Scenario: Provider frame
- **WHEN** a provider iframe renders
- **THEN** it uses `referrerPolicy="origin"` and a sandbox with only `allow-scripts allow-same-origin`, and player commands are posted only to the provider origin

#### Scenario: Load failure
- **WHEN** a player does not load within the load timeout
- **THEN** the item is marked failed, the next item in an active run starts after the gap, and the operator UI shows the failure

### Requirement: Operators Place The Video On The Canvas
The system SHALL separate Videos content geometry from desktop placement. Operators SHALL configure a stable video-and-caption content box and independently position/scale it on the 1920 x 1080 desktop scene with a live preview, shared editor snapping, exact numeric and keyboard edits. The browser SHALL use a top-left local content canvas with no desktop position/scale. The existing largest-fitting 16:9 frame and fixed two-line title/requester reserve SHALL be preserved, including no-clip notices. Content dimensions SHALL retain the current minimum of 240 x 180 and maximum scene dimensions; desktop placement SHALL validate the scaled footprint within its scene. Invalid geometry SHALL be rejected before save and fail transparent if received at runtime.

#### Scenario: Move the video to a corner
- **WHEN** the operator drags or types a new desktop position and saves
- **THEN** desktop output moves without a reload, provider reload or seek
- **AND** browser geometry and advertised dimensions do not change

#### Scenario: Resize desktop presentation
- **WHEN** the operator changes desktop-only scale
- **THEN** the desktop picture and caption scale together and the browser content stays unchanged

#### Scenario: Change content size
- **WHEN** the operator saves content dimensions
- **THEN** browser canvas dimensions update atomically with content geometry and management shows the required OBS width/height
- **AND** the current primary player and mirrored item retain their identity and playback position

#### Scenario: Earlier settings
- **WHEN** legacy saved Videos placement is migrated
- **THEN** its width/height seed content dimensions, its x/y seed desktop position and desktop scale starts at one
- **AND** settings that predate placement use the existing default box while unrelated settings remain unchanged

#### Scenario: Invalid placement
- **WHEN** off-scene scaled placement or invalid content dimensions are submitted or received
- **THEN** the server refuses the save, management shows a correction and runtime output fails transparent with the existing failure-report contract

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
- **THEN** the Operator UI lists it under Recent, newest first and limited to the 10 newest finished videos in the sole ordinary queue, with title, channel when known, requester, link host, how it was requested, outcome and finish time, in the same list layout as the Alerts and Screen Effects Recent list, and removed or cleared videos are not listed
- **AND** choosing Replay, guarded by the observed queue revision, adds the same source to the end of that queue as a new operator-submitted request that waits for Play next or Play all now and never starts on its own, with the current length limit applied

#### Scenario: Replay refused
- **WHEN** the operator replays a recent video while the Videos module is off, after its direct-file host was removed from the allowlist, against a stale queue revision, or after it has left Recent
- **THEN** nothing is queued and the Operator UI shows the reason

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
### Requirement: Video queue consolidation preserves data without replay
Upgrade SHALL preserve live queue ordering and migrate legacy pending/active test items to held-for-review ordinary entries with autoplay false, preserving identities, metadata and source order. Historical test entries SHALL remain history with provenance, not a second queue. Migration SHALL clear obsolete test player/run state and invalidate stale revisions/receivers. Invalid capacity or identity conflicts SHALL block migration rather than discard items. Legacy test API routes/payloads SHALL fail with migration guidance; existing live API spellings SHALL address the sole ordinary queue.

#### Scenario: Upgrade has a pending test video
- **WHEN** old test items are migrated
- **THEN** they appear after existing ordinary items held for explicit review and do not autoplay or join an existing play-all run

#### Scenario: Old caller uses the test endpoint
- **WHEN** a client calls a retired test route or submits a legacy test-purpose payload
- **THEN** it receives an explicit migration error without sending content to ordinary output

#### Scenario: Manual and subscribed videos coexist
- **WHEN** both types of requests are admitted
- **THEN** the single queue's normal priority/order and playback controls govern both
- **AND** every connected ordinary recipient observes the same item and primary mirror session

#### Scenario: Admission is interrupted
- **WHEN** the process fails between video queue insertion and bus acknowledgement
- **THEN** persisted submission identity or an atomic admission/checkpoint prevents a second queue insertion on redelivery
- **AND** acceptance receipts distinguish journal admission from module rejection
