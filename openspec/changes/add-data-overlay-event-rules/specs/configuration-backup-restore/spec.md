## ADDED Requirements

### Requirement: Data rule backup
Versioned backups SHALL include data rules with their enablement and order, custom event types and their schemas, Streamer.bot global mappings, reset-on-stream-online settings and the Operator pause flag. Backups SHALL exclude the applied-event log and source status.

#### Scenario: Rules round trip
- **WHEN** a profile with ordered rules and a custom event type is exported and restored
- **THEN** the rules, their order and the event type are preserved, and the applied-event log starts empty

#### Scenario: Rule references a missing value
- **WHEN** a backup contains a rule whose destination value is missing
- **THEN** restore fails and the existing profile is unchanged
