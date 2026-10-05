## ADDED Requirements

### Requirement: Screen Effect Saved Tests Name Their Destinations

The Screen Effects editor SHALL label protected variant delivery as `Test saved…`, SHALL summarize the saved input and selected destinations using human-readable names, and SHALL preserve its explicit live-output confirmation.

#### Scenario: User reviews a saved effect test

- **WHEN** a user chooses Test saved for an effect variant
- **THEN** the interface identifies that the saved variant will be used
- **AND** lists selected browser, desktop, and device destinations exposed by the existing contract without route keys or secret URLs
- **AND** unavailable destinations remain visible with their existing correction path

#### Scenario: User confirms saved effect test

- **WHEN** the saved effect can reach a live output
- **THEN** no occurrence is queued until the user completes the existing explicit confirmation
- **AND** cancellation queues nothing
