# configuration-backup-restore

## Purpose

Define lossless portable configuration backup and restore, explicit archive compatibility, and safe handling of credential-linked runtime state.

## Requirements

### Requirement: Configuration Round Trips Preserve Ordered Alert State

The system SHALL export and restore every portable alert-variant field, including `variant_order`, without changing variant order or default-variant semantics.

#### Scenario: Variant IDs do not match saved order

- **WHEN** a version-2 backup contains variants whose lexical ID order differs from their saved `variant_order`
- **THEN** restore recreates the same ordered variants
- **AND** the same variant remains the default alert variant after restore

#### Scenario: Portable snapshot schema drifts

- **WHEN** a migrated portable table gains a column that is absent from the owned backup mapping and is not explicitly allowlisted as local-only or regenerated
- **THEN** the backup schema-drift check fails before release

### Requirement: Lossy Legacy Archives Are Rejected Explicitly

The system SHALL identify archive-version-1 backups affected by the missing variant-order field and SHALL NOT silently reconstruct their order from IDs or priority.

#### Scenario: Affected version-1 archive is validated

- **WHEN** restore preflight receives an archive-version-1 backup from the schema that introduced ordered variants
- **THEN** preflight returns a blocker explaining that the archive did not capture variant order
- **AND** the original archive remains unchanged

#### Scenario: New backup is exported

- **WHEN** a management user exports configuration after this change
- **THEN** the archive manifest declares archive version 2
- **AND** its configuration checksum covers the serialized `variant_order` values

### Requirement: Credential-Linked Runtime State Is Not Portable

The system SHALL exclude Twitch account and token state from portable configuration and SHALL require reconnect after a successful restore.

#### Scenario: Restore replaces a connected destination profile

- **WHEN** a valid configuration archive is restored over a destination with a connected Twitch account
- **THEN** the restored database has no connected Twitch account row
- **AND** prior token references are removed after database replacement
- **AND** management status requires Twitch reconnect

#### Scenario: Restore fails after capturing destination state

- **WHEN** configuration replacement fails before restore completion
- **THEN** the operational restore point restores the prior Twitch account row with the other database state
- **AND** prior token references remain available

#### Scenario: Old token cleanup fails after replacement

- **WHEN** database restore succeeds but removal of an old token reference fails
- **THEN** the database remains disconnected
- **AND** diagnostics report an actionable orphan-secret warning without exposing token material
