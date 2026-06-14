## ADDED Requirements

### Requirement: Speaker.bot Provider Is Registered
The system SHALL register Speaker.bot as a supported TTS provider for the local MVP.

#### Scenario: Provider list includes Speaker.bot
- **WHEN** an authorized management user requests TTS providers
- **THEN** the response includes Speaker.bot with its supported playback mode and configurable options

### Requirement: Speaker.bot Test Is Server-Side
The system SHALL test Speaker.bot through server-side provider calls and SHALL NOT expose provider control details to the browser bundle.

#### Scenario: Speaker.bot test succeeds
- **WHEN** a management user runs a Speaker.bot TTS test with valid local settings
- **THEN** the server triggers Speaker.bot and returns a success result without exposing secret or sensitive connection details

#### Scenario: Speaker.bot test fails clearly
- **WHEN** Speaker.bot is unavailable or returns an error
- **THEN** the management UI shows a clear failure message and diagnostics record a redacted provider error

### Requirement: Speaker.bot Uses Remote Trigger Playback
The system SHALL represent Speaker.bot TTS playback as a server-side remote trigger rather than browser speech synthesis.

#### Scenario: Alert triggers Speaker.bot
- **WHEN** an alert variant with Speaker.bot TTS config is resolved for playback
- **THEN** the server triggers Speaker.bot with rendered alert text through the TTS provider abstraction
