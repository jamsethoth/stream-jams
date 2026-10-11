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

## ADDED Requirements

### Requirement: Video test preview is isolated from ordinary output
Subject to written-design confirmation of the preview destination, the system SHALL retain isolated live/test queues, purpose-scoped primary players and existing automation/intake contracts while replacing the public test browser source with a management-authenticated test preview. Ordinary browser and desktop visual output SHALL remain bound to live purpose. A test preview SHALL never retag an item, control the live queue, expose a copyable output URL or widen an overlay key.

#### Scenario: Live and test items play concurrently
- **WHEN** an ordinary output and the management test preview are connected while both queues play
- **THEN** each receives only its own purpose/item state and mirror session
- **AND** controls and reports cannot cross the purpose boundary

#### Scenario: Preview uses the available primary player
- **WHEN** the desktop host already owns test playback
- **THEN** opening the management preview subscribes to that mirror without creating another primary player or restarting the item
- **AND** preview-local audio starts muted while independently selected device audio retains its existing policy

#### Scenario: Desktop host is unavailable
- **WHEN** a visible authenticated test preview observes a playing test item without a desktop primary
- **THEN** it uses the existing fallback provider renderer and authoritative playback clock
- **AND** duration reports retain current item/identity validation and ordinary playback remains unaffected

#### Scenario: Preview disconnects and reconnects
- **WHEN** the preview closes or its management session expires
- **THEN** its receiver, peer, subscriptions and media leases are released without issuing a queue command
- **AND** a newly authenticated preview joins current state with a new receiver generation and rejects stale signals/reports

#### Scenario: Public key attempts management preview
- **WHEN** an overlay key or cross-origin client attempts the preview transport
- **THEN** management authentication/origin checks reject it before signaling or media access
