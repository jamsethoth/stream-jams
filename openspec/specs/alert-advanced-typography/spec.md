# alert-advanced-typography Specification

## Purpose

Provide reusable font assets, expressive text styling, and editable mesh deformation shared by alert authors and live outputs.

## Requirements

### Requirement: Reusable uploaded fonts
The system SHALL accept validated TTF, OTF, WOFF, and WOFF2 fonts up to 10 MiB as reusable local font assets. Management upload and live delivery SHALL retain their separate authorization. Font usages SHALL participate in deletion, replacement, availability and backup behavior.

#### Scenario: Reuse across alerts
- **WHEN** a font is uploaded and selected by two text layers in separate alerts
- **THEN** both layers save a reference to the same persisted asset and render using its bytes after restart

#### Scenario: Invalid or used font
- **WHEN** an invalid font is uploaded or an in-use font is deleted
- **THEN** the upload is rejected or deletion is blocked with actionable management feedback

### Requirement: Backward-compatible typography
The system SHALL support italic, underline, letter spacing, and independently configurable outline RGBA color and width. Missing additions SHALL preserve legacy text appearance.

#### Scenario: Styling survives save
- **WHEN** an author saves outline color, opacity and thickness with italic, underline and spacing
- **THEN** reopening and playback retain the same settings

#### Scenario: Legacy document
- **WHEN** an existing text layer contains none of the new fields
- **THEN** it remains valid and renders with its previous typography

### Requirement: Editable bounded warp grids
Text layers SHALL persist a normalized grid with 3 to 7 rows and columns. The editor SHALL support dragging, keyboard adjustment, numeric positions, shape-preserving horizontal/vertical insertion, interior removal, reset, and undo/redo. Guides SHALL only appear while editing.

#### Scenario: Add detail without reshaping
- **WHEN** an author inserts a split inside an already deformed grid
- **THEN** new handles appear and the rendered shape is preserved within floating-point tolerance

#### Scenario: Edit and undo
- **WHEN** an author drags a new handle then undoes that drag
- **THEN** the previous coordinates return without changing the layer position

#### Scenario: Invalid grid
- **WHEN** malformed, excessive, duplicate, or nonfinite grid data reaches a boundary
- **THEN** validation rejects it instead of rendering unbounded geometry

### Requirement: Consistent prepared output
Editor and live outputs SHALL share font loading and warped text rendering. Font loading and render failures SHALL fail closed on live output and report diagnostics through the established failure path. Dynamic template strings SHALL retain the saved warp, and resources SHALL be released when replaced or removed.

#### Scenario: Dynamic alert text
- **WHEN** two different usernames are rendered from the same saved text layer
- **THEN** each uses the same normalized envelope, typography and line-layout rules

#### Scenario: Font load failure
- **WHEN** an uploaded font cannot be loaded
- **THEN** live output remains transparent and management receives actionable failure evidence
