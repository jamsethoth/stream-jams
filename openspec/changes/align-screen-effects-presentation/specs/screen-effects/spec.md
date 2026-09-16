## ADDED Requirements

### Requirement: Screen Effects Uses Familiar Bounded Management Layouts
The system SHALL present Screen Effects using the Alerts module's compact inventory and focused editor conventions while preserving Screen Effects data and explicit live actions.

#### Scenario: Editing at laptop dimensions
- **WHEN** an operator opens an effect at a 1366 by 768 viewport
- **THEN** Save remains visible, the canvas fits available space, and every setting is reachable through scrolling inspector panels without page overflow

#### Scenario: Switching inspector sections
- **WHEN** an operator changes between Variant, Effect and Triggers by pointer or keyboard
- **THEN** the selected panel is accessible and unsaved edits are retained without persistence or live output

#### Scenario: Smaller viewport
- **WHEN** the editor viewport cannot fit three columns
- **THEN** the workspace stacks with scrolling access to all panels and the header remains reachable

#### Scenario: Module configuration
- **WHEN** an operator opens Screen Effects configuration
- **THEN** a collapsed Browser sources section with a configuration summary precedes the compact effects inventory and exposes existing URL actions when expanded
