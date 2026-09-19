## ADDED Requirements

### Requirement: Apply Per-Source Audio Fades
The system SHALL carry independent fade-in and fade-out durations through preview, browser, and explicit-device playback for every local Alert audio source.

#### Scenario: Fades overlap on short media
- **WHEN** requested fade durations exceed the effective source playback length
- **THEN** playback SHALL proportionally clamp the envelope
- **AND** gain SHALL remain between zero and the configured source volume

#### Scenario: Client joins playback late
- **WHEN** a browser or device audio client begins after an occurrence has started
- **THEN** it SHALL derive gain from the occurrence's absolute elapsed time
- **AND** it SHALL NOT restart the fade envelope from zero

#### Scenario: Muting a fading source
- **WHEN** local preview or output is muted
- **THEN** mute SHALL apply as a final multiplier without changing stored fade settings

#### Scenario: Playback is cancelled
- **WHEN** playback stops, skips, is replaced, or shuts down
- **THEN** envelope timers SHALL be cancelled through the existing media cleanup path
