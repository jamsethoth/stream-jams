## ADDED Requirements

### Requirement: Advanced Settings Use Progressive Disclosure
The management UI SHALL keep common appearance and desktop behavior accessible while grouping advanced server, storage, audio-output, and overlay-surface workflows in keyboard-operable native disclosures with meaningful visible summaries.

#### Scenario: Settings opens
- **WHEN** the user opens Settings without a deep link or active error
- **THEN** advanced disclosures are initially collapsed and their controlled form state survives collapse and reopen

#### Scenario: Settings contains attention
- **WHEN** a grouped workflow has an error or required attention
- **THEN** that state remains discoverable and the affected controls can be reached without losing edits

### Requirement: Home Separates Setup And Alert Configuration
Home SHALL report setup completion separately from a read-only summary of enabled alert configuration requiring attention.

#### Scenario: Setup is complete but an enabled alert needs attention
- **WHEN** all setup steps are complete and an enabled alert configuration needs review
- **THEN** Home retains the setup-complete result and shows a separate Alert configuration section with the alert name and editor link

#### Scenario: Configuration cannot be established
- **WHEN** there is no active set, no enabled alert, a saved document is unavailable, or readiness is ambiguous
- **THEN** Home describes the exact empty, unavailable, or review-needed state without claiming playback or delivery readiness
