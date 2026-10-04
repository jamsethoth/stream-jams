## ADDED Requirements
### Requirement: Scoped pairing and grants
The server SHALL require loopback native-client requests, strict inputs and dedicated scoped credentials for versioned automation. Pairing SHALL require explicit management approval and one-use verifier proof. Grants SHALL be revocable and excluded from exports. Legacy timer credentials SHALL NOT gain privileges.
#### Scenario: Pair and revoke
- **WHEN** a pending proof-bound request is approved and correctly exchanged
- **THEN** only the approved capabilities are granted, exchange replay fails, and revocation immediately denies subsequent commands
#### Scenario: Unauthorized request
- **WHEN** a browser Origin, remote peer, invalid Host, wrong proof, expired request, invalid credential or insufficient scope is used
- **THEN** the request is rejected without side effects or sensitive logging
### Requirement: Authoritative timer controls
The server SHALL implement guarded activate, reset, stop, increment/decrement and bulk toggle. Reset SHALL use latest saved duration silently while preserving active run identity, state and presentation. Inactive reset/stop/adjust SHALL do nothing. Replacements SHALL conflict.
#### Scenario: Reset paused run
- **WHEN** the saved duration changes then a matching paused run is reset
- **THEN** remaining time and captured duration use the latest saved duration, it remains paused, and no cue/assets/output change occurs
#### Scenario: Complete paused adjustment
- **WHEN** subtraction consumes a paused run's remaining time
- **THEN** it completes with its normal end cue exactly once
#### Scenario: Bulk mixed state
- **WHEN** bulk toggle targets running and individually paused timers
- **THEN** all become paused, and a later bulk toggle resumes all paused timers without starting inactive definitions
### Requirement: Guarded playback operations
The server SHALL support module pause toggle, occurrence-bound skip and revision/count-bound clear. Pause SHALL leave current playback running; clear SHALL preserve current. Conflicts SHALL NOT be automatically retried.
#### Scenario: Queue changes during hold
- **WHEN** pending items change after the observed revision
- **THEN** clear fails with conflict and retains the new queue
### Requirement: Independent module mute
Alerts and Effects SHALL have independent persisted mute policy. All SHALL affect the authorized supported target set, mixed to muted and all muted to unmuted. Timer cues SHALL remain independent. Browser and desktop current/future audio SHALL honor policy while visuals and queues continue. Legacy global mute compatibility SHALL NOT be preserved.
#### Scenario: All unmute
- **WHEN** both modules are muted, including individually muted ones, and All is toggled
- **THEN** both unmute without changing timer cues, visuals or queue progression
### Requirement: Documented coherent contract
The API SHALL expose version, capabilities, limits, runtime identity, ordered revision, server time, run/occurrence identity and effective state/blocking reasons. Commands SHALL be guarded against prior runtime/replaced targets and clients SHALL NOT retry uncertain commands.
#### Scenario: Stale runtime
- **WHEN** a command carries a prior runtime identity
- **THEN** it fails without mutation and the client can refresh the documented snapshot
