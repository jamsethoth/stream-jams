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

### Requirement: Configuration Export Is Complete Versioned And Secret-Free

The system SHALL export a `.streamjams-backup` archive containing a versioned manifest, user configuration, assets, checksums, app/schema versions, and non-secret provider metadata without credentials, tokens, route keys, or other secrets.

#### Scenario: Full backup is exported

- **WHEN** a management user exports configuration
- **THEN** the archive contains the manifest, configuration records, referenced and unreferenced user assets, checksums, and compatibility versions
- **AND** it excludes provider credentials, authorization tokens, overlay route keys, and local secret-store values

### Requirement: Restore Is Validated Before Mutation

The system SHALL inspect archive structure, versions, checksums, schemas, assets, and required capacity before enabling restore.

#### Scenario: Invalid archive cannot be restored

- **WHEN** validation finds a malformed manifest, unsupported schema, checksum mismatch, invalid record, or missing required asset
- **THEN** restore remains disabled
- **AND** the system reports each blocker with its cause and corrective next step

#### Scenario: Valid archive shows impact summary

- **WHEN** archive validation succeeds
- **THEN** the system shows what configuration, providers, alert sets, assets, and preferences will be added or replaced before confirmation

### Requirement: Restore Protects Current Data And Runtime

The system SHALL block restore during live intake or playback, create a safety backup before replacement, apply data transactionally, and regenerate overlay route keys by default.

#### Scenario: Live activity blocks restore

- **WHEN** event intake or alert playback is active
- **THEN** restore cannot start
- **AND** the system explains how to stop the active runtime safely

#### Scenario: Safety backup fails

- **WHEN** the pre-restore safety backup cannot be completed
- **THEN** restore stops without replacing current data
- **AND** the failure includes a next step and reference ID when available

#### Scenario: Restore succeeds with regenerated route keys

- **WHEN** a validated restore completes with the default security option
- **THEN** configuration and assets are replaced atomically, new overlay route keys are generated, and the user is told to update browser-source URLs and reconnect providers whose secrets were excluded

### Requirement: Desktop Close Preference Round Trips
Portable configuration SHALL include the non-secret desktop close-to-tray preference, default an omitted preference to true, and preserve the destination's original value during failed-restore rollback. Restoring the preference SHALL NOT itself close a window or terminate a service.

#### Scenario: Older configuration omits desktop preferences
- **WHEN** otherwise compatible configuration without a desktop section is parsed
- **THEN** close-to-tray defaults to true without invalidating other configuration

#### Scenario: Desktop preference is restored
- **WHEN** a compatible backup with close-to-tray disabled is restored successfully
- **THEN** the persisted preference is disabled and the running desktop host adopts it for the next window-close decision

#### Scenario: Restore fails after preference replacement
- **WHEN** configuration replacement fails after changing desktop preferences
- **THEN** rollback restores the original preference and the running host receives the restored value

### Requirement: Audio Route Definitions Are Portable But Device Bindings Are Local
Portable backups SHALL include stable audio-route IDs, names and alert assignments while explicitly excluding device IDs and device-label bindings as local-only data. Restore SHALL require rebinding and validate every saved route reference. Operational rollback SHALL preserve the exact prior bindings.

#### Scenario: Routed alerts are exported
- **WHEN** a configuration backup is exported
- **THEN** it contains route IDs/names and alert output assignments with local device binding fields cleared
- **AND** schema-drift checks explicitly account for the local-only fields

#### Scenario: Valid routed configuration is restored
- **WHEN** a compatible backup is restored
- **THEN** route identities and assignments survive unchanged, device bindings are cleared, and management names the routes requiring setup
- **AND** no route falls back to the default audio device

#### Scenario: Archive contains an orphaned route reference
- **WHEN** preflight finds an alert assignment whose route is absent
- **THEN** restore is blocked before mutation with a correction message

#### Scenario: Restore fails after route replacement
- **WHEN** replacement fails after capturing the destination state
- **THEN** rollback restores prior route definitions, device bindings, and alert assignments together

#### Scenario: Local device audio is active during restore
- **WHEN** a restore is requested while device playback is active even without browser clients
- **THEN** the existing live-runtime restore blocker prevents replacement

#### Scenario: Older archive schema is unsupported
- **WHEN** an archive uses a schema version not supported by the current restore implementation
- **THEN** existing compatibility preflight rejects it explicitly rather than silently inventing route data or loosening validation
