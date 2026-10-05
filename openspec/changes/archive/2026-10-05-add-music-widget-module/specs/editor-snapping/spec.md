## ADDED Requirements

### Requirement: Shared optional editor snapping
Music component layout and the Alerts canvas SHALL use the same pointer snapping behavior. Independent Snap to grid and Snap to alignment controls SHALL default to enabled. Grid snapping SHALL use a 10-pixel canvas grid. Alignment SHALL match horizontal and vertical edges and centers of visible peer components on the current profile and canvas edges/centers, with a five-screen-pixel tolerance adjusted for zoom. The moving component SHALL be excluded as a target. Resizing SHALL keep its leading position fixed. Snapping SHALL respect each editor's geometry bounds and minimum sizes.

#### Scenario: Grid and alignment are independent
- **WHEN** an author toggles grid or alignment snapping in either editor
- **THEN** subsequent pointer movement and resizing use only the enabled snapping modes; disabling both allows precise free movement
- **AND** grid visibility remains separate from snapping and toggling either preference does not dirty or save the document

#### Scenario: Visible components align during pointer gestures
- **WHEN** an author moves or resizes a component near another visible component's edge or horizontal/vertical center
- **THEN** the nearest eligible alignment wins over the grid and a matching guide is shown during that gesture
- **AND** hidden, audio, self and other-profile components are not alignment targets

#### Scenario: Zoom and geometry boundaries are respected
- **WHEN** the editor is zoomed or a snap candidate would leave its geometry bounds
- **THEN** alignment tolerance remains five screen pixels and only valid bounded candidates apply; resizing preserves the fixed leading edge and minimum dimensions

#### Scenario: Precision and output remain unchanged
- **WHEN** an author uses numeric controls or keyboard arrows, ends or cancels a gesture, or renders saved output
- **THEN** numeric and keyboard edits remain exact without snapping, active guides clear after the gesture and never appear in live output, and existing draft/save/cancellation behavior is retained
