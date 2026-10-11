## MODIFIED Requirements

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

## ADDED Requirements

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
