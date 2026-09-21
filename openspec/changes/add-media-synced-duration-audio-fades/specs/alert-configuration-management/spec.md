## ADDED Requirements

### Requirement: Alerts Support Media-Synchronized Duration
The system SHALL let an Alert use `media` or `custom` duration mode and SHALL default newly created Alerts to `media` while treating an absent persisted mode as `custom`.

#### Scenario: Longest visible timed layer wins
- **WHEN** a Media-mode Alert references multiple visible audio or video assets
- **THEN** its effective duration SHALL equal the longest positive stored duration up to 120000 milliseconds
- **AND** images, GIFs, hidden layers, and TTS SHALL NOT contribute

#### Scenario: Media duration is unavailable
- **WHEN** no eligible Alert asset has positive stored duration
- **THEN** the Alert SHALL use 5000 milliseconds
- **AND** the editor SHALL show a fallback warning without changing the selected mode

#### Scenario: Operator selects Custom
- **WHEN** an operator selects Custom duration
- **THEN** the editor SHALL enable the bounded duration field
- **AND** preview, save, test, and live playback SHALL use that custom value

### Requirement: Alert Editor Authors Local Audio Fades
The system SHALL expose independent Fade in and Fade out controls for Alert audio layers and enabled video soundtracks.

#### Scenario: Fade is enabled
- **WHEN** an operator enables a previously disabled fade
- **THEN** its editable duration SHALL default to 500 milliseconds
- **AND** the unsaved preview SHALL apply the requested envelope

#### Scenario: Legacy Alert is opened
- **WHEN** a stored Alert lacks duration-mode or fade fields
- **THEN** the editor SHALL present Custom duration and disabled fades while preserving its existing duration and volume

### Requirement: Alert Editor Uses Percentage Media Volume
The system SHALL present Alert audio-layer and enabled video-soundtrack volume as a percentage from 0% through 200% while persisting normalized gain from 0 through 2.

#### Scenario: Operator amplifies local media
- **WHEN** an operator sets an Alert media source to 200%
- **THEN** preview and saved playback SHALL use normalized gain 2
- **AND** the editor SHALL restore the value as 200%
