## ADDED Requirements

### Requirement: Output Configuration Uses Readable Module Names
Output configuration SHALL display known module names and readable normalized unknown names while retaining original module identifiers.

#### Scenario: Known or unknown module is displayed
- **WHEN** output ownership names `screen-effects` or an unknown delimited module identifier
- **THEN** the UI shows `Screen Effects` or a readable normalized label and leaves the stored identifier unchanged
