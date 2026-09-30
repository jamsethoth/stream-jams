## ADDED Requirements

### Requirement: Playback Failure Causes Survive Recipient Boundaries
Desktop visual and selected-device audio failures SHALL retain bounded original stage and exception evidence through IPC to operator logs, including resolved audio results containing failed route IDs. Playback SHALL use only configured destinations and SHALL NOT introduce fallback devices or browser audio.

#### Scenario: Desktop video preparation fails
- **WHEN** a private overlay video fails during an active occurrence
- **THEN** the original failure envelope reaches host diagnostics and the occurrence fails transparent
- **AND** the failure alone does not mark the renderer connection unavailable

#### Scenario: Selected device fails
- **WHEN** source creation, device binding, metadata, seek, decode, play or device disappearance fails
- **THEN** the affected configured routes and original failure stage are reported
- **AND** healthy configured recipients continue without rerouting the failed audio

#### Scenario: Unavailable selected route
- **WHEN** a Screen Effect's selected route cannot be prepared or its result contains failed route IDs
- **THEN** the failure is logged even if the playback promise resolves normally

### Requirement: Prepared Outputs Start Content Together From The Beginning
Participating browser-source, desktop-overlay and configured audio outputs SHALL prepare their media before the coordinator chooses a shared near-future start. Media SHALL start from the beginning at normal speed. Small differences in actual startup SHALL NOT cause catch-up seeks, rate changes or suppressed clips. Preparation SHALL NOT consume the configured playback interval.

#### Scenario: One output loads slowly
- **WHEN** a short clip takes more than 150 ms to become ready on one output
- **THEN** ready outputs remain silent and hidden until all participating preparations settle
- **AND** the coordinator schedules the same future start on healthy prepared outputs, retaining their actual media elements
- **AND** each plays from zero at normal speed for its configured interval

#### Scenario: Preparation fails or is cancelled
- **WHEN** a recipient fails, disconnects, stalls beyond the preparation deadline, or the occurrence is stopped
- **THEN** its preparation obligation and media resources are released
- **AND** cancelled callbacks cannot start or affect a replacement occurrence
- **AND** a failed recipient does not prevent healthy configured recipients or subsequent occurrences from playing

### Requirement: Failed Output Targets Recover Automatically
Owned desktop renderers SHALL recover from repeated crashes or connection stalls without requiring manual retry. Recovery SHALL use bounded delays and honor shutdown and output configuration. Browser sources SHALL reconnect with bounded delays. Recovery SHALL restore the target for subsequent content without replaying interrupted transient occurrences.

#### Scenario: Repeated renderer failure
- **WHEN** an owned output renderer fails more than once
- **THEN** the interrupted occurrence may fail
- **AND** subsequent playback waits for bounded automatic recovery and uses the recovered output
- **AND** no unselected audio destination is added

#### Scenario: Output reconnects after an interrupted clip
- **WHEN** a target reconnects after its active clip was interrupted
- **THEN** subsequent clips can play
- **AND** reconnect does not seek into or replay the interrupted clip
