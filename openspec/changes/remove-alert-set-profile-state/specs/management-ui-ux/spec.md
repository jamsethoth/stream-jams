## MODIFIED Requirements

### Requirement: Home Readiness Is Derived And Actionable

The system SHALL derive Home readiness from validated external service connections, starter alert-set review, and browser-source output state, and SHALL link each incomplete action to its correction flow. The active alert-set summary SHALL present profile usage derived from saved alerts and SHALL NOT present independently enabled set profiles.

#### Scenario: Provider readiness requires validation

- **WHEN** a provider has saved settings but has not passed validation
- **THEN** Home shows that setup item as incomplete
- **AND** its action opens the relevant provider setup or detail flow

#### Scenario: Setup action opens exact correction location

- **WHEN** a user activates a Home next action
- **THEN** the system opens the relevant wizard, selected alert set, browser-source section, or diagnostic correction target

#### Scenario: Active alert set uses saved profile configuration

- **WHEN** Home summarizes the active alert set
- **THEN** it names profiles in use based on enabled saved alerts and their enabled target profiles
- **AND** it does not expose a second set-level enabled or review state
