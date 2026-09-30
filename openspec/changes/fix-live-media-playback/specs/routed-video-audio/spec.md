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

### Requirement: Expired Media Is Diagnosed Without Impossible Seeking
Timed preparation SHALL preserve the existing synchronization target, attempt limit and deadline. A finite non-looping source whose media interval has elapsed SHALL fail closed with an explicit expiry cause before a beyond-end seek. Seek failures SHALL include bounded timing evidence.

#### Scenario: Clip ends before the occurrence
- **WHEN** a late recipient's elapsed media offset is at or beyond its finite source duration
- **THEN** preparation reports expired media without seeking beyond its end or starting at zero

#### Scenario: Slow seeks cannot meet synchronization
- **WHEN** asynchronous seeks exhaust the existing attempts or deadline
- **THEN** preparation terminates with requested and actual offset evidence and removes listeners/timers
- **AND** cancelled work cannot start or affect a replacement occurrence
