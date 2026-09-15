## ADDED Requirements

### Requirement: Screen Effect Binary Output Controls Are Inline And Associated
Screen Effect output and embedded-media audio selections SHALL render each native checkbox inline with its associated label using scoped form styling without changing destination semantics or unrelated form controls.

#### Scenario: Output checkbox is operated through its label
- **WHEN** an operator clicks the text for OBS Browser Source or Desktop overlay
- **THEN** only the associated checkbox changes
- **AND** checked, unchecked, disabled, and keyboard focus states remain visible at desktop and 390 CSS pixels wide

#### Scenario: Embedded media audio is configured
- **WHEN** a Screen Effect variant exposes embedded-media audio toggles
- **THEN** each checkbox remains inline with its label, including when the label wraps
- **AND** other consumers of shared media-audio controls retain their existing layout and behavior
