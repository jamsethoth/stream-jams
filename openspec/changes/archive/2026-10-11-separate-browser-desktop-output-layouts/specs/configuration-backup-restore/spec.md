## MODIFIED Requirements

### Requirement: Timer Configuration Is Portable But Live And Secret State Is Not
Portable configuration SHALL include saved timer definitions, stable timer IDs, compatible asset references, non-secret audio selections, and independent per-profile visual configuration and desktop-only placement/scale. It SHALL exclude active timer runs and raw or verified automation credential material. A restored profile SHALL require explicit generation of a new timer automation credential.

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

## ADDED Requirements

### Requirement: Legacy output configuration is normalized before restore
Supported legacy backup preflight SHALL apply the same pure Timer/Video layout upgrader as in-place migration and remove retired test/unified output metadata and unified-browser surface rows before domain validation or route-key regeneration. It SHALL disclose retired outputs, retain valid ordinary module/profile identities, and block invalid upgraded candidates before mutation. New exports SHALL omit retired outputs/surfaces. Portable restore SHALL regenerate fresh ordinary keys under the existing secret-exclusion policy; in-place database upgrade SHALL preserve existing ordinary keys. Private desktop composition eligibility SHALL not depend on retired output metadata.

#### Scenario: Old archive contains test and unified sources
- **WHEN** a supported pre-change archive is preflighted and restored
- **THEN** only remaining ordinary output metadata produces fresh route keys and no test/unified key or surface is recreated
- **AND** migrated geometry preserves desktop appearance, while portable monitor ID/label/follow consent stay cleared and desktop stays disabled/unbound

#### Scenario: Restart after repeated restore
- **WHEN** a migrated installation restarts or restores the same supported archive again
- **THEN** defaults and registry reconciliation do not recreate retired outputs and layout migration does not apply scaling twice

#### Scenario: Preflight or replacement fails
- **WHEN** geometry/reference validation fails or replacement cannot complete
- **THEN** invalid preflight performs no mutation and replacement rollback restores destination config, credentials and maintenance state without starting playback or timers
