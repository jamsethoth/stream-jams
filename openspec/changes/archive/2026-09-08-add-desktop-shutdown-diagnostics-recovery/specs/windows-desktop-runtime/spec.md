## ADDED Requirements

### Requirement: Shutdown Diagnostics Preserve Runtime Policy
Opt-in instrumentation SHALL preserve persistent management/audio sessions, Save/Discard/Cancel decisions, close-to-tray behavior and the ten-second owned-worker timeout. It SHALL NOT add automatic native termination, restart, migration, a public control API or security overrides.

#### Scenario: Cancel then explicit Quit
- **WHEN** a user cancels a dirty-edit quit and later explicitly discards or saves
- **THEN** the first attempt leaves the service running and the accepted attempt follows existing cleanup
- **AND** the diagnostic record distinguishes the attempts

#### Scenario: Log destination is unavailable
- **WHEN** logging cannot write evidence
- **THEN** original graceful Quit still executes

#### Scenario: Normal restart
- **WHEN** the application restarts after diagnostics
- **THEN** persistent profiles remain compatible and old records never cause process actions or notices
