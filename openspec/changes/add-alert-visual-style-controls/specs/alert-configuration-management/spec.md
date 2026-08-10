## ADDED Requirements

### Requirement: Alert Text Layers Support Validated Typography
The system SHALL allow authorized management users to configure a text layer's local font preset, font size, font weight, line height, horizontal alignment, vertical alignment, text color, and optional text shadow through bounded provider-independent fields.

#### Scenario: Text typography is saved
- **WHEN** a user changes valid typography values and saves the alert
- **THEN** the values persist on the selected text layer
- **AND** they remain shared while landscape and vertical profiles retain independent geometry

#### Scenario: Unsupported font is submitted
- **WHEN** an alert document contains an unknown font preset or external font value
- **THEN** boundary validation rejects the document
- **AND** no external font resource is requested

#### Scenario: Typography value is outside bounds
- **WHEN** a size, weight, line height, color, or shadow value is invalid or outside its approved bounds
- **THEN** save is blocked with a field-specific correction message

### Requirement: Alert Text Layers Support Simple Box Styling
The system SHALL allow a text layer to configure a bounded background color, padding, corner radius, and optional box shadow within its existing layer geometry.

#### Scenario: Text background is configured
- **WHEN** a user applies valid text-box styling
- **THEN** the canvas treats the saved geometry as the outer styled box
- **AND** padding and text alignment render inside that box

#### Scenario: Box styling is cleared
- **WHEN** a user removes background and shadow styling and returns padding and radius to zero
- **THEN** the layer renders without a visible box treatment
- **AND** its text template and geometry are preserved

### Requirement: Styled Alerts Render Consistently Across Workflows
The system SHALL derive editor canvas, local preview, Send test, and live browser-source presentation from the same validated style contract.

#### Scenario: Styled alert is previewed and sent
- **WHEN** a saved or draft styled alert is rendered in local preview and the saved alert is sent through the test path
- **THEN** typography, colors, alignment, padding, radius, and shadows match the selected profile design
- **AND** live resolution does not introduce raw CSS or provider-specific presentation data

#### Scenario: Production styling cannot be rendered
- **WHEN** a styled layer cannot be safely rendered in production
- **THEN** the overlay fails closed and transparent
- **AND** the operator receives actionable diagnostics without viewer-visible error content

### Requirement: Existing Alert Appearance Is Preserved
Existing text layers SHALL receive explicit compatibility defaults that preserve the pre-change fixed text appearance when stored documents are migrated or parsed.

#### Scenario: Existing alert document is loaded
- **WHEN** a stored text layer has no style fields
- **THEN** parsing supplies the compatibility typography and box defaults
- **AND** the alert remains visually equivalent before the user changes its style

#### Scenario: Existing alert is saved after upgrade
- **WHEN** a user saves an upgraded existing alert
- **THEN** its explicit style fields are persisted in the current schema
- **AND** backup and restore round-trip those fields without loss

### Requirement: Style Controls Remain Focused And Accessible
The focused editor SHALL expose style controls only for a selected text layer using labelled native inputs and SHALL preserve keyboard authoring, dirty-state, undo, redo, and validation behavior.

#### Scenario: Non-text layer is selected
- **WHEN** a selected layer does not support text or box styling
- **THEN** text-style controls are not shown
- **AND** the layer's existing applicable controls remain available

#### Scenario: Style edit is undone
- **WHEN** a user changes a style value and invokes Undo
- **THEN** the prior validated style is restored in both the form and canvas
- **AND** Redo can reapply the change

#### Scenario: Major layer section is collapsed
- **WHEN** a user toggles a major selected-layer editor section
- **THEN** its controls hide or reappear through a keyboard-accessible native disclosure
- **AND** collapsing the section does not change draft alert data

#### Scenario: Multiple enabled profiles require review
- **WHEN** an alert already has multiple enabled profiles marked `Needs review`
- **THEN** the user can mark and save each profile as reviewed incrementally
- **AND** the system still rejects newly enabling any profile that remains `Needs review`

#### Scenario: Selected profile requires review
- **WHEN** the selected target profile is marked `Needs review`
- **THEN** its warning bar above the canvas exposes a keyboard-accessible `Mark reviewed` action
- **AND** activating the action updates only the selected profile's draft review state
- **AND** the editor remains unsaved until the user invokes the existing `Save` action
- **AND** the warning and inline action are hidden after the profile is marked reviewed
