## ADDED Requirements

### Requirement: Existing Overlay Output Model Provides Video Shoutout URL
The system SHALL expose a built-in `video-shoutout` module through the existing module-specific overlay output and route-key model.

#### Scenario: Management lists video shoutout outputs
- **WHEN** an authorized management user lists overlay outputs after the `video-shoutout` module is registered
- **THEN** the response includes live and test module outputs for `video-shoutout`
- **AND** any copyable URL uses `/overlay/modules/video-shoutout/:purpose/:overlayKey`

#### Scenario: Overlay key authorizes video shoutout route
- **WHEN** an OBS browser source loads `/overlay/modules/video-shoutout/live/:overlayKey` with a valid live module route key
- **THEN** the system serves the browser-source overlay shell through the existing overlay route-key authorization path

#### Scenario: Invalid overlay key fails through existing auth
- **WHEN** a browser source loads a `video-shoutout` overlay URL with a missing, revoked, or wrong-scope route key
- **THEN** the request is rejected by the existing overlay authorization behavior
- **AND** no management API access is granted

### Requirement: Manual Streamer.bot Clip Payload Controls Playback
The system SHALL accept manual video shoutout payloads from the Streamer.bot/manual intake boundary and SHALL NOT fetch clips or decide shoutout eligibility.

#### Scenario: Valid manual clip payload starts shoutout
- **WHEN** Streamer.bot sends a manual clip payload with `login`, `displayName`, `clipId`, `embedUrl`, `title`, `duration`, and optional avatar/profile URL
- **THEN** the system validates the payload
- **AND** the `video-shoutout` overlay receives the selected clip for display

#### Scenario: Streamer.bot owns clip selection
- **WHEN** a manual clip payload is accepted
- **THEN** the system does not call Twitch clip APIs, perform Twitch OAuth, parse chat commands, or evaluate shoutout eligibility

#### Scenario: Invalid payload does not play
- **WHEN** Streamer.bot sends a payload missing required clip fields or containing invalid field types
- **THEN** the system rejects the payload for playback
- **AND** the live overlay does not render raw payload data

### Requirement: Clip URLs Are Validated Before Rendering
The system SHALL render only validated Twitch clip embed URLs and safe optional profile media URLs.

#### Scenario: Twitch embed URL is allowed
- **WHEN** a manual payload contains an HTTPS Twitch clip embed URL matching the accepted embed URL shapes
- **THEN** the overlay may render that URL in the video shoutout player

#### Scenario: Non-Twitch embed URL is rejected
- **WHEN** a manual payload contains a non-HTTPS URL or a URL outside the accepted Twitch embed hosts
- **THEN** the system rejects the payload for playback
- **AND** the overlay returns to idle or a bounded no-clip/error state

#### Scenario: Invalid optional avatar URL is omitted
- **WHEN** a manual payload includes an optional avatar/profile URL that is empty, non-HTTPS, or schema-invalid
- **THEN** the overlay omits the avatar/profile image
- **AND** the clip can still play if all required fields are valid

### Requirement: Overlay Renders Manual Shoutout States
The `video-shoutout` overlay SHALL render transparent idle, loading, playing, no-clip/error, and automatic return-to-idle states.

#### Scenario: Idle state is transparent
- **WHEN** no manual video shoutout is active
- **THEN** the browser-source overlay renders a transparent idle state with no visible chrome

#### Scenario: Loading state appears before playback
- **WHEN** a valid manual clip payload is dispatched to the overlay
- **THEN** the overlay can show a loading state while the Twitch embed/player is prepared

#### Scenario: Playing state shows selected clip
- **WHEN** the validated clip is ready to render
- **THEN** the overlay shows the selected clip with safe shoutout context such as display name, login, title, and optional avatar/profile image

#### Scenario: No-clip or playback error is bounded
- **WHEN** the manual trigger reports no clip or the clip player fails before completion
- **THEN** the overlay shows only the approved no-clip/error state
- **AND** it does not expose route keys, raw payload JSON, stack traces, local paths, or Streamer.bot internals

#### Scenario: Overlay returns to idle
- **WHEN** the clip ends, fails, is cleared, or reaches its validated duration timeout
- **THEN** the overlay returns automatically to transparent idle state

### Requirement: Manual Shoutouts Do Not Create Queue Or History Workflow
The system SHALL treat the video shoutout module as a single active manual display, not a queue, auto-trigger, history, or moderation workflow.

#### Scenario: New manual payload replaces active clip
- **WHEN** a valid manual clip payload arrives while another video shoutout is active
- **THEN** the new payload becomes the active video shoutout
- **AND** the system does not create a playback queue entry for the previous clip

#### Scenario: Normal stream events do not auto-trigger video shoutouts
- **WHEN** Stream Jams receives a follow, subscription, resubscription, cheer, raid, or channel point redemption event
- **THEN** the `video-shoutout` module does not automatically fetch or select a clip for that event

#### Scenario: No history or moderation surface is required
- **WHEN** a manual video shoutout completes
- **THEN** the system is not required to persist a clip history, review queue, moderation decision, or replay record for this module
