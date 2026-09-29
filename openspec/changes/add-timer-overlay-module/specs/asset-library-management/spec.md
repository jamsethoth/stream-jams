## ADDED Requirements

### Requirement: Timer Assets Participate In Global Usage Management
The asset library SHALL treat a timer icon, start cue, and end cue as stable module-qualified usages. It SHALL expose each usage in filtering and impact summaries, navigate to the owning timer definition, and enforce compatible replacement and guarded deletion behavior.

#### Scenario: User inspects a timer icon usage
- **WHEN** an image or GIF asset is referenced by a timer definition
- **THEN** the asset library shows a Timers-module usage naming that definition
- **AND** activating the usage opens the owning timer editor

#### Scenario: Timer cue deletion is attempted
- **WHEN** an audio asset is used as a timer start or end cue and deletion is requested
- **THEN** deletion is blocked or requires explicit reassignment through the approved destructive-confirmation pattern
- **AND** the impact distinguishes start-cue and end-cue references

#### Scenario: Timer asset is replaced incompatibly
- **WHEN** replacement would change an icon to a non-image/GIF or a cue to non-audio media
- **THEN** the system reports the timer usage incompatibility and does not leave a dangling or invalid reference
