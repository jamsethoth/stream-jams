## MODIFIED Requirements

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
