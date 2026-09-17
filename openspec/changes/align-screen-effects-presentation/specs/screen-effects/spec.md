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

### Requirement: Local Draft Effect Preview
The editor SHALL preview the selected unsaved variant in its central canvas, without a separate dialog, locally with its layout, preset animation, duration and configured audio volumes. Preview SHALL provide Play, Stop and Mute controls without admitting a live occurrence or using configured output routes.

#### Scenario: Preview with sound and mute
- **WHEN** an operator presses the toolbar Preview or the canvas Play preview control
- **THEN** its visual, enabled video soundtrack and separate sound play locally at their configured volumes
- **AND** Mute preview suppresses both audio sources without modifying the draft

#### Scenario: Stop and cleanup
- **WHEN** the duration elapses, the operator stops playback, or the selected variant changes or the editor unmounts
- **THEN** media playback and preview timers stop and closed-preview media URLs are released

#### Scenario: Unavailable media
- **WHEN** media loading or playback fails
- **THEN** the editor provides actionable recovery guidance without changing saved data or delivering live output

### Requirement: Unified Screen Effect Variant Weighting
The system SHALL treat every enabled Screen Effect variant as a member of one weighted selection pool and SHALL NOT expose a default-versus-weighted kind in current management contracts or authoring controls.

#### Scenario: Automatic selection
- **WHEN** an enabled Screen Effect with multiple enabled variants is admitted
- **THEN** each enabled variant's chance equals its positive integer weight divided by the sum of enabled weights
- **AND** disabled variants are excluded

#### Scenario: Authoring probabilities
- **WHEN** an operator views or changes variant weights and enabled states
- **THEN** every variant row shows its weight and calculated expected percentage
- **AND** Save is unavailable with guidance when no variant is enabled

#### Scenario: Local weight simulation
- **WHEN** an operator chooses Simulate 1,000 selections
- **THEN** the editor uses the same weighted selector as live admission and shows expected percentage, observed count and observed percentage for every variant
- **AND** the counts total 1,000 while disabled variants remain visible with zero selections
- **AND** no draft is saved, occurrence is admitted, trigger is fired or output route is used

#### Scenario: Existing stored variants
- **WHEN** the repository reads stored Screen Effect variants whose legacy kind is `default` or `weighted`
- **THEN** it returns the unified current variant model without losing identity, media, routing, enabled state or weight
- **AND** newly saved rows retain the migration 022 storage shape with neutral legacy kind `weighted`
