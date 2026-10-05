## ADDED Requirements

### Requirement: Obsolete Alert-Set Profile Metadata Is Not Portable State

Portable configuration SHALL preserve per-alert target-profile enablement and review state in alert documents while omitting obsolete alert-set-level profile fields from newly exported set metadata. Compatible legacy rows containing those redundant fields SHALL NOT overwrite alert documents during restore.

#### Scenario: Current backup is exported

- **WHEN** a management user exports configuration after the set-profile migration
- **THEN** alert-set metadata contains only set identity and starter review fields
- **AND** each alert document retains its Landscape and Vertical enablement, review, and layout values

#### Scenario: Compatible legacy configuration is restored

- **WHEN** restore receives otherwise compatible alert-set metadata containing legacy Landscape and Vertical enabled and review fields together with saved alert documents
- **THEN** restore ignores the obsolete set fields
- **AND** it restores each alert document's target-profile state unchanged
