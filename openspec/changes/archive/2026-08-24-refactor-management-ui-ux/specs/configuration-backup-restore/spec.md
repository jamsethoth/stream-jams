## ADDED Requirements

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
