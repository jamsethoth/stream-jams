## ADDED Requirements

### Requirement: Data rule backup
Versioned backups SHALL include data rules with their enablement and order, custom event types, Streamer.bot global mappings, reset-on-stream-online settings and the Operator pause flag. Backups SHALL exclude the consumer checkpoint and source status. A restored data consumer SHALL start at the journal head.

#### Scenario: Rules round trip
- **WHEN** a profile with ordered rules is exported and restored
- **THEN** the rules and their order are preserved, and no past journal event is applied

#### Scenario: Rule references a missing value
- **WHEN** a backup contains a rule whose destination value is missing
- **THEN** restore fails and the existing profile is unchanged
