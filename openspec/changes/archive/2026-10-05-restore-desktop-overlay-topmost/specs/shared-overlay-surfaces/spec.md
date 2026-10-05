## ADDED Requirements

### Requirement: Desktop Ordering Recovers Without Activation
The ready visible desktop surface SHALL automatically restore its position above competing ordinary topmost windows, including while content is already playing or static. Recovery SHALL preserve the foreground application, mouse pass-through, non-focusability, selected display and playback progress. It SHALL NOT rely solely on focus events emitted by the overlay itself.

#### Scenario: Borderless game is focused before playback
- **WHEN** a borderless game is above the desktop surface and a valid desktop playback start is dispatched
- **THEN** the surface restores its order before dispatching start to the renderer
- **AND** the game retains foreground input

#### Scenario: Application overtakes an existing surface
- **WHEN** another ordinary topmost application covers a ready visible surface
- **THEN** automatic bounded recovery restores its order without requiring another playback event or operator action
- **AND** existing content continues without replay

#### Scenario: Surface cannot safely be shown
- **WHEN** the window is hidden, not loaded, interrupted by display loss, destroyed, or failed
- **THEN** ordering recovery does not show it
- **AND** background work is stopped when its native window lifecycle ends

### Requirement: Desktop Ordering Verification Has Independent Evidence
Verification SHALL exercise native competing windows and record actual order and foreground identity, rather than equating mocked method calls with native success. Real-game tests SHALL automate playback triggering and observation once the user makes the game available. Evidence SHALL distinguish automated native checks, composition captures and physical observations.

#### Scenario: Original failure is used as a negative control
- **WHEN** an owned competing window overtakes an overlay fixture without ordering recovery
- **THEN** the native observer detects the overlay is covered
- **AND** the equivalent candidate scenario must recover while retaining the competitor's foreground identity

#### Scenario: User is unavailable
- **WHEN** automated tests run without the user present
- **THEN** isolated fixture validation and preparation of the bounded game runner proceed
- **AND** physical game visibility and gameplay confirmations remain explicitly pending
