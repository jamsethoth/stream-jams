## ADDED Requirements

### Requirement: Desktop Lifecycle Validation Is Isolated And Observable

Desktop lifecycle validation SHALL isolate healthy-renderer quit decisions from renderer-loss fault injection, synchronize requests with actual quit-guard readiness, and preserve primary and cleanup failures with bounded shutdown evidence.

#### Scenario: Healthy renderer cancels then discards
- **WHEN** an isolated packaged application has unsaved settings and its real quit guard is registered
- **THEN** Cancel keeps the service alive without beginning cleanup
- **AND** a subsequent Discard produces the expected shutdown phases, exit code zero, no captured live processes, and no owned listener within the existing deadline
- **AND** no renderer-loss event is injected into this healthy scenario

#### Scenario: Guard registration is delayed
- **WHEN** the settings edit has occurred but its quit-guard registration has not reached the main process
- **THEN** validation waits for the actual registration before requesting Quit
- **AND** it neither manufactures ready IPC nor relies on a fixed delay

#### Scenario: Renderer crashes
- **WHEN** the dedicated packaged renderer-loss scenario crashes management
- **THEN** native confirmation is required before shutdown
- **AND** the runtime diagnostic includes an error reference, crash reason, and numeric exit code

#### Scenario: Test and cleanup both fail
- **WHEN** desktop validation fails and its ordinary cleanup also fails
- **THEN** the primary error remains visible alongside the cleanup error
- **AND** available bounded shutdown phase evidence is retained under the uploaded test-results directory even when cleanup throws
- **AND** an unexpected native confirmation cannot count as a successful healthy-renderer quit test

#### Scenario: Neutral MP4 fixture metadata matches decoded duration
- **WHEN** desktop validation imports the neutral MP4 soundtrack fixture
- **THEN** its media-header durations use track timescale units and metadata reports the full 9941 ms duration
- **AND** fixture repair preserves encoded media samples and existing silent decoder assertions
