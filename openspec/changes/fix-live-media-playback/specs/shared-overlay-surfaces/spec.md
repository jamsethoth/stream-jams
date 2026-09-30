## MODIFIED Requirements

### Requirement: Desktop Recipient Failures Are Bounded
Desktop work SHALL be scoped by surface, module, occurrence and renderer generation, with validated acknowledgements and a duration plus 5-second transport watchdog. Service loss or expiry of the 10-second ownership lease SHALL clear visuals. Renderer recovery SHALL automatically recreate the target for subsequent work with bounded backoff, without a permanent manual-retry lockout, and SHALL NOT replay interrupted content.

#### Scenario: Old renderer acknowledges a new occurrence
- **WHEN** a completion message has the wrong occurrence or renderer generation
- **THEN** it cannot mutate current playback or advance another module queue

#### Scenario: Shared renderer crashes
- **WHEN** the desktop renderer disappears with multiple modules active
- **THEN** every affected desktop obligation fails without blocking healthy browser/device work
- **AND** management identifies the shared-host failure while the display stays transparent

#### Scenario: Desktop never acknowledges completion
- **WHEN** the occurrence deadline plus 5 seconds expires
- **THEN** the runtime clears or destroys the unresponsive visual recipient and releases its queue obligations

#### Scenario: Current service resumes its ownership lease
- **WHEN** the active service worker sends a valid lease after ownership expired without being replaced or entering shutdown
- **THEN** the desktop host restores display availability without requiring an app restart
- **AND** it preserves the saved display configuration and bounded recovery backoff, recreates the renderer only when new work requires it, and does not replay interrupted visuals
- **AND** leases from an old worker generation or during shutdown cannot restore ownership

