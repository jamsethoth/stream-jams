## ADDED Requirements

### Requirement: Persist Timed-Media Duration
The system SHALL extract and persist nullable duration metadata for accepted audio and video assets without parsing media during a live trigger.

#### Scenario: Import records normalized duration
- **WHEN** an accepted audio or video asset completes validation and transcoding
- **THEN** the system SHALL inspect its normalized bytes and persist a positive duration in milliseconds when available
- **AND** metadata failure SHALL preserve the accepted asset with null duration

#### Scenario: Images remain untimed
- **WHEN** an image or GIF is imported
- **THEN** the system SHALL persist null duration without invoking the timed-media probe

#### Scenario: Replacement changes automatic timing
- **WHEN** an operator replaces an in-use timed asset with the same asset ID
- **THEN** the replacement duration SHALL apply to the next admitted automatic-duration playback
- **AND** an occurrence already in progress SHALL keep its original duration snapshot

#### Scenario: Legacy metadata is repaired through management
- **WHEN** an operator requests details for a selected timed asset whose stored duration is null
- **THEN** the management path SHALL inspect bounded asset bytes and persist the result
- **AND** live trigger handling SHALL NOT read or parse the asset file
