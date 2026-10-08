## ADDED Requirements

### Requirement: Videos Module Exposes Browser-Source And Desktop Outputs
The system SHALL register a built-in `videos` overlay module with live and test module browser-source outputs on the existing route-key model, and SHALL render it on the desktop overlay when the operator enables it.

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
Every accepted submission SHALL be stored in a persisted queue for its purpose, and SHALL NOT start playback unless an operator action starts it or the submission carries an allowed `autoplay` flag.

#### Scenario: Plain submission waits
- **WHEN** a valid request arrives without `autoplay`
- **THEN** it is appended to the queue and nothing starts playing

#### Scenario: Allowed autoplay submission
- **WHEN** a valid request with `autoplay: true` arrives from a source allowed to autoplay, nothing is playing, and the queue is not paused
- **THEN** it starts playing

#### Scenario: Channel point request asks for autoplay
- **WHEN** a channel point submission includes an autoplay request
- **THEN** it is queued without autoplay

#### Scenario: Restart
- **WHEN** the app restarts with items queued and one playing
- **THEN** all items remain in order, the playing item returns to the queue head as queued, and nothing plays until started

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
The system SHALL hold items whose duration exceeds the configured maximum length, or whose duration is unknown, and SHALL let the operator play a held item explicitly.

#### Scenario: Over-limit item
- **WHEN** an item longer than the maximum length is submitted
- **THEN** it is shown in the queue as held with its length and the limit, and play next and play all skip it

#### Scenario: Play anyway
- **WHEN** the operator chooses Play anyway on a held item
- **THEN** that item plays to its natural end without changing the limit

#### Scenario: Limit changes
- **WHEN** the operator raises the limit above a held item's length
- **THEN** the item becomes queued in its existing position

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

### Requirement: Outputs Follow One Playback Clock
The system SHALL keep one authoritative playback clock per purpose, and controllable players on every output SHALL converge to it.

#### Scenario: Pause and resume
- **WHEN** the operator pauses a YouTube or direct-file item and resumes it
- **THEN** every output pauses and resumes at the server position

#### Scenario: Seek
- **WHEN** the operator seeks to 1:20
- **THEN** every controllable output moves to 1:20 within one second

#### Scenario: Uncontrollable provider
- **WHEN** a Twitch item is playing
- **THEN** pause and seek are unavailable with a visible reason, and skip and stop work

#### Scenario: Single audio owner
- **WHEN** an item plays on the browser source and the desktop overlay
- **THEN** only the configured audio owner plays sound and the other output is muted

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

### Requirement: Management And Operator Surfaces
The system SHALL provide a Videos management page and Operator UI queue tools covering the controls in this specification.

#### Scenario: Configure limits
- **WHEN** the operator sets maximum length, gap, audio owner, allowed hosts and reward mappings on the Videos page
- **THEN** the settings persist and apply to later submissions and runs

#### Scenario: Operate during a stream
- **WHEN** the operator opens the Operator UI
- **THEN** a now-playing card shows title, requester, progress and available controls, and the queue list shows queued and held items with their actions, all keyboard operable
