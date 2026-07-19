## ADDED Requirements

### Requirement: Focused Alert Editor Preserves Context And Workspace
The focused alert editor SHALL remain a distinct management route while retaining loaded set and alert context and using the available desktop or tablet viewport.

#### Scenario: Focused editor opens
- **WHEN** a user opens an alert from a selected set
- **THEN** the editor shows a compact breadcrumb containing Alerts, the loaded set name, and the current alert name
- **AND** Back returns to the loaded set rather than trusting stale optional route state

#### Scenario: Wide editor viewport is available
- **WHEN** the editor is rendered on a wide desktop
- **THEN** the focused route is not constrained by the normal 1280px management-content cap
- **AND** alert tree, canvas, and inspector use independently scrollable workspace regions

#### Scenario: Intermediate editor viewport is available
- **WHEN** the editor is between 701 and 980 CSS pixels wide
- **THEN** the canvas and alert tree remain usable
- **AND** the inspector moves to its own full-width workspace row instead of creating an uncontrolled page-length column

#### Scenario: Narrow editor viewport is used
- **WHEN** the editor is 700 CSS pixels wide or narrower
- **THEN** authoring controls are hidden behind the existing clear larger-screen message
