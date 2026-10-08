## ADDED Requirements

### Requirement: Editable canvas and group templates
The system SHALL provide Counter badge, Goal bar, Latest supporter and Combined goals panel starters and allow users to save canvas/group templates. Instantiation SHALL produce independent editable copies with new IDs. Insertable groups SHALL flatten to ordinary elements, without nested-group semantics or links to future template edits.

#### Scenario: Edit a template copy
- **WHEN** a user moves/removes elements in an instantiated template and later changes the source template
- **THEN** the copy remains independently configured and the live layout is not changed by template updates

### Requirement: Explicit compatible slot mapping
Templates SHALL contain typed binding slots and registered asset references, excluding live values, grants, credentials, receipts and runtime identities. Instantiation SHALL require mapping to compatible existing values/goals or explicitly creating custom data and SHALL atomically rewrite all references. Provider slots SHALL require configured provider sources. Unresolved slots/assets SHALL be actionable in management and hidden live.

#### Scenario: Reuse an existing campaign
- **WHEN** a goal template slot is mapped to an existing compatible campaign
- **THEN** the new elements display that campaign without creating another accumulator or resetting it

#### Scenario: Incompatible currency or missing asset
- **WHEN** a slot receives an incompatible monetary goal or its asset is missing
- **THEN** incompatible mapping is rejected or the missing asset is flagged and hidden, with no silent replacement
