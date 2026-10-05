## ADDED Requirements

### Requirement: Routed Video Soundtracks Use Normalized Envelopes
The system SHALL carry explicit soundtrack fade durations and effective source playback duration in normalized video-audio instructions.

#### Scenario: Browser route plays video audio
- **WHEN** a video soundtrack is enabled on a browser-routed Alert or Screen Effect
- **THEN** its element volume SHALL follow the shared absolute-time envelope until the occurrence cutoff or media end

#### Scenario: Device route plays video audio
- **WHEN** a video soundtrack is routed to an explicit device
- **THEN** device playback SHALL use the same normalized envelope and effective duration as browser playback

#### Scenario: Video audio is disabled
- **WHEN** embedded video audio is disabled
- **THEN** soundtrack fade settings SHALL NOT create an audio playback instruction
