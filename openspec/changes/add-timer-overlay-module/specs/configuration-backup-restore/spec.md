## ADDED Requirements

### Requirement: Timer Configuration Is Portable But Live And Secret State Is Not
Portable configuration SHALL include saved timer definitions, stable timer IDs, compatible asset references, non-secret audio selections, and per-profile presentation configuration. It SHALL exclude active timer runs and raw or verified automation credential material. A restored profile SHALL require explicit generation of a new timer automation credential.

#### Scenario: Timer configuration is exported
- **WHEN** a management user exports a configuration containing saved timers
- **THEN** the archive includes definitions, presentation settings, route IDs, and required icon/cue assets
- **AND** it contains no running/paused/completed state, automation bearer, or bearer verifier

#### Scenario: Timer configuration is restored
- **WHEN** a compatible archive with valid timer definitions and referenced assets/routes is restored
- **THEN** the definitions and presentation settings retain their stable identities and every timer starts idle
- **AND** timer automation remains disabled until management generates a new credential

#### Scenario: Timer archive has an invalid reference
- **WHEN** preflight finds a missing timer asset, incompatible media type, or nonexistent named audio route
- **THEN** restore is blocked before mutation with an actionable correction

#### Scenario: Restore fails after capturing destination state
- **WHEN** configuration replacement fails before completion
- **THEN** operational rollback restores the prior timer definitions, presentation, and destination automation credential state
- **AND** no timer run starts or cue plays during rollback
