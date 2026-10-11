## MODIFIED Requirements

### Requirement: Each Shared Surface Owns Ordered Module Layers
Each desktop surface SHALL persist its own ordered list of registered module IDs and visual visibility flags. The top row SHALL render above lower rows in an isolated module stacking context. Duplicate or unknown IDs and invalid complete reorder requests SHALL be rejected atomically.

#### Scenario: Modules have conflicting internal z-index values
- **WHEN** two modules render simultaneously and a lower module uses a larger internal z-index
- **THEN** it cannot cover a module above it in the surface order

#### Scenario: Desktop order changes
- **WHEN** the user moves a desktop module up using keyboard-accessible controls and saves
- **THEN** the desktop order changes without restarting active playback
- **AND** module-specific browser outputs keep their independent geometry and behavior

#### Scenario: New module is registered
- **WHEN** an existing profile first discovers another module
- **THEN** it appends one hidden row at the bottom of the desktop surface
- **AND** prior module order and visibility are preserved

#### Scenario: Public unified surface is retired
- **WHEN** an existing profile is upgraded
- **THEN** public unified-browser surface rows are removed and cannot be recreated by defaults, registry discovery or management updates
- **AND** desktop row identity, module order, visibility, opacity, local display binding and automatic-follow consent remain intact

#### Scenario: Desktop module capability is independent
- **WHEN** the registry no longer advertises a public unified browser output
- **THEN** desktop membership derives from an explicit private/shared-rendering capability and retains all previously eligible modules
- **AND** internal multi-module composition remains available only through its trusted private boundary
