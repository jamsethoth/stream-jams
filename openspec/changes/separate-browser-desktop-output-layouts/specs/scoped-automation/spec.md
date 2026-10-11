## MODIFIED Requirements

### Requirement: Documented coherent contract
The API SHALL expose version, capabilities, limits, runtime identity, ordered revision, server time, run/occurrence identity and effective state/blocking reasons. Commands SHALL be guarded against prior runtime/replaced targets and clients SHALL NOT retry uncertain commands.
#### Scenario: Stale runtime
- **WHEN** a command carries a prior runtime identity
- **THEN** it fails without mutation and the client can refresh the documented snapshot

#### Scenario: Timer snapshots preserve ongoing playback
- **WHEN** a timer changes while the private desktop composition has active Alert, Effect or timer-cue playback
- **THEN** the composition update preserves those media elements and their playback progress until normal completion or explicit stop, while disabled or removed modules remain suppressed
