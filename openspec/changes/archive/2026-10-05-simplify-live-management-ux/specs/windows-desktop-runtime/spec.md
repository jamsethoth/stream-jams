## ADDED Requirements

### Requirement: Close-To-Tray Choice Has An Explicit Inline Label
The desktop settings UI SHALL place the close-to-tray checkbox adjacent to its text in one explicit label row, with explanatory help below it.

#### Scenario: Desktop settings reflow
- **WHEN** desktop settings render at desktop or 390px width
- **THEN** the checkbox and `Close window to tray` text remain adjacent and share one accessible label
