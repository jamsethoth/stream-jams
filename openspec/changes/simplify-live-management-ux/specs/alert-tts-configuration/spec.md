## ADDED Requirements

### Requirement: Browser Speech Numeric Controls Explain Units
Browser Speech volume and rate controls SHALL expose their unchanged normalized values with explicit units and associated explanatory guidance.

#### Scenario: Speech safety values are edited
- **WHEN** the user edits volume, minimum rate, or maximum rate
- **THEN** labels read `Volume (0–1)`, `Minimum rate (×)`, and `Maximum rate (×)` with associated explanations for zero, one, half, and double speed
- **AND** saving submits the same numeric typed payload and validation boundaries
