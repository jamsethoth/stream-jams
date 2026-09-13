# Alert Audio Routing Specification

## Purpose

Define alert-wide Browser Source and named local-device audio outputs, independent desktop delivery, bounded playback safety, and authoring and security boundaries.

## Requirements

### Requirement: Explicit Audio Shares Alert-Wide Outputs
Each alert default or variation SHALL own one output selection containing a Browser Source flag and zero or more named device-route IDs. Every visible explicit audio layer and every enabled video soundtrack SHALL inherit that selection and retain its layer volume. The system SHALL NOT expose per-layer routing overrides or a special combined-output enum.

#### Scenario: Multiple audio layers share outputs
- **WHEN** an alert with several visible audio layers selects Browser Source and two device routes
- **THEN** every visible audio layer is delivered to those destinations with its own volume
- **AND** hidden audio layers and disabled video soundtracks are not delivered

#### Scenario: Older document has no routing fields
- **WHEN** an old document is parsed or a new alert is created
- **THEN** explicit audio defaults to Browser Source enabled and no device routes

#### Scenario: All explicit audio destinations are cleared
- **WHEN** Browser Source is disabled and no device routes are selected
- **THEN** explicit audio layers and enabled video soundtracks remain saved but emit no media sound
- **AND** visual content and separately configured TTS are not disabled by that selection

#### Scenario: Variation or duplicate is created
- **WHEN** an alert is duplicated or a variation is created from the default
- **THEN** its output selection is copied and can subsequently diverge independently
- **AND** existing disabled/needs-review creation safeguards remain effective

#### Scenario: Visual theme is applied
- **WHEN** the operator applies a starter theme
- **THEN** output assignments are preserved with existing nonvisual behavior
- **AND** existing alert-disable, profile-review, dirty-state, and save rules still apply

#### Scenario: Embedded and separate sound are both enabled
- **WHEN** a video soundtrack and a separate sound layer are enabled in the same selected document
- **THEN** both follow that document's audio output selection with independent layer volumes
- **AND** adding the sound layer does not implicitly disable the soundtrack

### Requirement: Named Routes Bind Explicit Local Devices
Authorized management users SHALL create, rename, bind, inspect, explicitly test and delete reusable named routes. Bindings SHALL identify enumerated output devices rather than inferred labels or automatic default/communications aliases.

#### Scenario: Route is saved
- **WHEN** a valid unique name and enumerated explicit device ID are saved
- **THEN** a stable route ID and its binding persist across app restart

#### Scenario: Unknown route is assigned
- **WHEN** an alert save references a nonexistent route ID
- **THEN** validation rejects the save without changing the prior document

#### Scenario: Referenced route deletion is attempted
- **WHEN** deletion targets a route referenced by saved alerts
- **THEN** the server rejects it with an affected-alert list
- **AND** concurrent alert saves cannot create a dangling reference during deletion

#### Scenario: Duplicate device aliases are selected
- **WHEN** two selected named routes resolve to the same explicit device ID
- **THEN** each audio layer plays once on that device rather than doubling its sound

#### Scenario: Route is rebound during playback
- **WHEN** a user confirms rebinding a route while an alert is playing
- **THEN** the active occurrence keeps its original binding and future starts use the new binding

### Requirement: Device Playback Is Independent Of Visual Recipients
The runtime SHALL normalize device audio once per selected alert before visual-target expansion and SHALL allow eligible device-audio-only queue items. Device playback SHALL NOT require a connected or visually ready Browser Source profile.

#### Scenario: Landscape and vertical both receive an alert
- **WHEN** the same selected alert is expanded for multiple visual profiles
- **THEN** each layer plays once per selected device, not once per profile

#### Scenario: Two layers use the same asset
- **WHEN** two distinct visible audio layers reference one asset
- **THEN** both layers are preserved rather than deduplicated by asset ID

#### Scenario: No browser is connected
- **WHEN** an enabled eligible alert has valid audio and an available selected device but no connected Browser Source
- **THEN** its local audio can be queued and played without rendering or enabling an unreviewed visual profile

#### Scenario: Browser audio is disabled on a legacy route
- **WHEN** an alert disables Browser Source audio and is delivered through a legacy or profile-based overlay path
- **THEN** that path contains no explicit audio instruction for the alert

### Requirement: Desktop Audio Outlives The Management Window
Direct device playback SHALL run in a dedicated desktop-owned player with no dependence on management-window visibility. Before delivery, the packaged runtime MUST demonstrate explicit output selection, simultaneous two-device playback, restart behavior and background operation without microphone permission.

#### Scenario: Management is hidden to tray
- **WHEN** a routed alert starts while management is hidden or minimized
- **THEN** the selected available devices play it normally

#### Scenario: Capability gate fails
- **WHEN** the packaged runtime cannot enumerate or select required devices or play without a browser interaction prompt
- **THEN** routing implementation stops for a documented backend decision
- **AND** it does not silently use the system default, OBS, microphone permissions, or an unapproved native driver

#### Scenario: CLI-only runtime is used
- **WHEN** configuration is opened without the desktop playback host
- **THEN** device routes are preserved and shown as unavailable while existing Browser Source behavior remains usable

### Requirement: Local Audio Completion Is Bounded And Occurrence-Scoped
Queue coordination SHALL track local audio independently of browser acknowledgements, preserve distinct playback occurrence IDs, and bound loading/playback completion. A recipient failure SHALL NOT block healthy destinations or indefinitely hold the queue.

#### Scenario: Audio-only item completes
- **WHEN** a queue item has no browser recipients and its device work finishes
- **THEN** the item completes and the next eligible item can start

#### Scenario: One recipient fails
- **WHEN** a selected device or browser recipient fails
- **THEN** its pending work settles while healthy recipients continue
- **AND** management reports the affected destination and a corrective next step

#### Scenario: Completion is never reported
- **WHEN** the configured alert duration plus the 5-second transport grace expires
- **THEN** outstanding work is stopped or failed and released from queue completion tracking

#### Scenario: Stale completion arrives
- **WHEN** an acknowledgement belongs to a skipped/expired occurrence or an older renderer generation
- **THEN** it cannot complete or otherwise mutate a newer occurrence

### Requirement: Unavailable Devices Never Cause Automatic Rerouting
The system SHALL fail closed for unavailable, disconnected or rejected device sinks. It SHALL NOT automatically redirect their audio to another device or the Browser Source, and recovery SHALL apply only to future playback.

#### Scenario: Device is unplugged
- **WHEN** an active destination disappears
- **THEN** that destination stops and an actionable management warning is shown
- **AND** other healthy outputs continue without a fallback copy

#### Scenario: Device returns with a different ID
- **WHEN** a device label reappears with a different ID
- **THEN** the route requires explicit rebinding rather than guessing identity from its name

#### Scenario: Player crashes and recovers
- **WHEN** the hidden player crashes
- **THEN** outstanding work fails and no interrupted audio is replayed on recreation
- **AND** automatic recreation is bounded to one attempt before explicit retry is required

#### Scenario: Owning service is lost
- **WHEN** the server exits, its IPC link closes, or its 10-second ownership lease expires
- **THEN** the desktop host stops local audio rather than continuing unsupervised playback

### Requirement: Routing Does Not Change TTS Or Other Video Modules
The routing controls SHALL apply to explicit alert audio layers and deliberately enabled video soundtracks. Visual video elements SHALL remain internally muted in preview, test and live output; selected soundtracks SHALL use the routed media-audio path. Browser-speech and Speaker.bot routing SHALL remain unchanged. The separate video-shoutout module SHALL NOT be altered by this policy.

#### Scenario: Existing alert includes a video with sound
- **WHEN** the upgraded app loads that alert
- **THEN** a legacy layer without soundtrack fields migrates with embedded audio disabled
- **AND** management offers explicit soundtrack enablement using the same alert-wide audio destinations
- **AND** the video asset and layout are preserved without automatic audio extraction

#### Scenario: Browser Source explicit audio is disabled with TTS configured
- **WHEN** the alert includes browser speech or Speaker.bot TTS
- **THEN** routing does not move or suppress that TTS beyond its existing safety rules
- **AND** UI copy does not claim that disabling explicit audio guarantees a silent Browser Source

### Requirement: Route Controls Preserve Authoring And Security Boundaries
Route controls SHALL use validated management APIs with existing authentication, CSRF, origin restrictions and rate limiting. The editor SHALL keep output selections in its undo/redo, dirty-state, validation and explicit live-impact workflow. Device errors SHALL appear in management/Diagnostics, never as live overlay diagnostic content.

#### Scenario: Device selection is edited
- **WHEN** an operator changes alert output checkboxes
- **THEN** the change remains a draft until Save and supports Undo/Redo
- **AND** saving an active alert names affected audio destinations before applying live-impact changes

#### Scenario: Route test is explicitly requested
- **WHEN** an authorized operator activates Test for a bound available route
- **THEN** a bounded one-second test sound uses that route and authoritative global mute
- **AND** merely selecting a device emits no sound

#### Scenario: Browser request lacks required security proof
- **WHEN** a route mutation or test lacks valid management authorization or CSRF proof, or comes from an unapproved origin
- **THEN** it is rejected without changing routes or emitting sound

#### Scenario: Renderer requests an arbitrary media path
- **WHEN** an audio-renderer message contains an unapproved URL, filesystem path, sender, or command shape
- **THEN** it is rejected without reading the path or exposing credentials

#### Scenario: Private endpoint may be captured by OBS
- **WHEN** route setup guidance is shown
- **THEN** it explains that OBS Desktop Audio and monitoring can independently capture selected devices and that combined paths may differ in latency
