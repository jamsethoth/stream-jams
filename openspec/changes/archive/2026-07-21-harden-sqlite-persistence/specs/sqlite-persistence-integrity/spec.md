## ADDED Requirements

### Requirement: SQLite Transactions Isolate Unrelated Operations
The system SHALL keep unrelated repository operations outside another workflow's uncommitted SQLite transaction and SHALL NOT hold the synchronous SQLite connection transaction across an asynchronous suspension point.

#### Scenario: Alert mutation rolls back while diagnostics append
- **WHEN** an atomic alert mutation fails while an unrelated diagnostic append executes
- **THEN** every alert mutation write rolls back
- **AND** the unrelated diagnostic row remains committed

#### Scenario: Multi-repository alert mutation succeeds
- **WHEN** a supported alert-set workflow changes a rule, management metadata, and editor documents
- **THEN** all relational changes commit as one synchronous transaction
- **AND** no external I/O occurs inside that transaction

### Requirement: Active Alert Reads Use Bounded SQL Statements
The system SHALL select enabled rules for the active collection and requested event type without a number of SQL statements that grows with configured rule or variant count.

#### Scenario: Unrelated rules exist
- **WHEN** event matching requests active rules for one event type from a profile containing 100 rules of multiple event types
- **THEN** unrelated rule children are not hydrated
- **AND** repository statement count remains fixed as rule count grows

#### Scenario: Playback resolves editor documents and assets
- **WHEN** matching rules contain multiple variants and referenced assets
- **THEN** variant selection occurs before editor-document loading
- **AND** selected documents and distinct assets are loaded in bounded bulk queries

### Requirement: Variant Asset References Are Relationally Enforced
The database SHALL allow nullable variant media references but SHALL reject any non-null visual or audio asset ID that does not exist in `asset_metadata`.

#### Scenario: Referenced asset is deleted
- **WHEN** deletion targets an asset referenced by an alert variant
- **THEN** SQLite rejects the deletion
- **AND** the alert variant remains unchanged

#### Scenario: Unreferenced asset is deleted
- **WHEN** deletion targets an asset that no variant references
- **THEN** the asset and its owned library metadata are deleted

#### Scenario: Existing profile has dangling references
- **WHEN** the asset-FK migration detects a variant referencing a missing asset
- **THEN** migration aborts before replacing `alert_variants`
- **AND** the original table and data remain intact

### Requirement: Hot Query Ordering Is Deterministic And Indexed
The database SHALL use indexes that cover active-collection traversal and deterministic variant, diagnostic, and overlay-output ordering without retaining redundant prefix indexes.

#### Scenario: Representative query plans are checked
- **WHEN** migration tests run `EXPLAIN QUERY PLAN` against representative data
- **THEN** target queries avoid full junction scans and temporary ordering B-trees
- **AND** diagnostic cutoff queries still use the timestamp prefix of their composite indexes

### Requirement: Migration Ledger Is An Exact Known Prefix
The database SHALL reject a schema-migration ledger that is not an exact prefix of the application's ordered migration list before normal repository queries run.

#### Scenario: Database contains a future migration
- **WHEN** the ledger contains an ID unknown to the running application
- **THEN** database startup fails with an actionable future-schema error

#### Scenario: Database ledger contains a gap or reordering
- **WHEN** an applied migration is missing from the middle of the known order or IDs appear out of order
- **THEN** database startup fails without applying another migration

#### Scenario: Database contains a valid prefix
- **WHEN** the ledger is an exact prefix of known migrations
- **THEN** pending migrations apply transactionally in order
