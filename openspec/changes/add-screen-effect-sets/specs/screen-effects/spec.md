## ADDED Requirements

### Requirement: Screen Effect Sets Select One Live Collection
The system SHALL persist named Screen Effect sets with one active set. Each effect SHALL belong to exactly one set. Only enabled effects in the active set SHALL respond to newly admitted trusted events. Set activation SHALL require explicit confirmation and SHALL preserve previously admitted occurrence snapshots.

#### Scenario: Existing data is upgraded
- **WHEN** a database without Screen Effect sets is upgraded
- **THEN** existing effects belong to an active Default set with their IDs, media, bindings and enabled states preserved

#### Scenario: Inactive set is prepared
- **WHEN** an operator creates, duplicates or edits an inactive set
- **THEN** its effects remain ineligible for automatic live triggers until the operator activates that set

#### Scenario: A set is activated
- **WHEN** an operator confirms activation of another set
- **THEN** that set becomes the sole active set atomically and subsequent events match only its enabled effects

#### Scenario: Protected deletion and unique names
- **WHEN** an operator attempts to delete the active set or use a case-insensitive duplicate set name
- **THEN** the operation is rejected without changing existing data

### Requirement: Screen Effect Hierarchy Exposes Variants
The module page and focused editor SHALL present a collapsible set/effect/variant hierarchy, preserve explicit save and dirty-navigation behavior, and allow opening a specific variant directly.

#### Scenario: A variant is opened from inventory
- **WHEN** an operator expands a set and effect and selects a variant
- **THEN** the focused editor opens that effect with the chosen variant selected and preserves that selection on reload

#### Scenario: Unsaved edits are protected
- **WHEN** an operator selects another effect while the current effect has unsaved edits
- **THEN** the existing Save and leave, Discard and Cancel guard applies
