## ADDED Requirements

### Requirement: Focused Editor Can Create Simple Shape Layers
The focused alert editor SHALL offer Shape as a layer type and SHALL create a rectangular solid-fill visual layer using validated defaults and service-owned identity.

#### Scenario: Shape layer is added
- **WHEN** a user chooses Shape from the Add layer control
- **THEN** a visible shape with default name, fill, geometry, order, visibility, and preset animation is added and selected
- **AND** the new layer participates in the current alert's dirty state, undo, and redo history

#### Scenario: Shape cannot be created
- **WHEN** layer creation fails
- **THEN** no partial layer or profile layout is retained
- **AND** the editor shows a human-readable cause, next step, and reference ID when available

### Requirement: Shape Layers Use Standard Layer Authoring
Authorized management users SHALL be able to rename, show or hide, position, resize, reorder, animate, duplicate, and delete a shape layer and SHALL be able to set one validated solid fill.

#### Scenario: Shape fill is changed
- **WHEN** a user selects a valid color and saves the alert
- **THEN** the normalized fill persists on the shared shape layer
- **AND** landscape and vertical profiles retain their independent shape geometry

#### Scenario: Shape is copied
- **WHEN** design copy, profile copy, alert duplication, or variation duplication includes a shape layer
- **THEN** the shape fill and layer settings are preserved
- **AND** copied profile geometry follows the existing copy and review-state rules

#### Scenario: Unsupported fill is submitted
- **WHEN** a shape contains a gradient, arbitrary CSS, external SVG, or invalid color
- **THEN** boundary validation rejects the value
- **AND** the previous saved shape remains unchanged

### Requirement: Shape Layers Render Consistently
Shape layers SHALL render from the same validated fill, profile geometry, order, visibility, and preset animation in editor canvas, local preview, Send test, and live browser-source output.

#### Scenario: Shape is behind text
- **WHEN** a visible shape has lower layer order than a text layer
- **THEN** editor and production output render the shape behind the text

#### Scenario: Shape is hidden
- **WHEN** a shape layer is saved with visibility disabled
- **THEN** local preview, Send test, and live output omit the shape
- **AND** the editor layer list retains it for later editing

### Requirement: Saved Shape Layers Remain Portable
Shape layers SHALL round-trip through editor persistence, schema migration, configuration backup, and configuration restore without requiring a media asset or external resource.

#### Scenario: Backup containing a shape is restored
- **WHEN** a valid configuration backup containing shape layers is restored
- **THEN** each shape retains its fill and standard layer settings
- **AND** restored output requires no asset relinking for the shape
