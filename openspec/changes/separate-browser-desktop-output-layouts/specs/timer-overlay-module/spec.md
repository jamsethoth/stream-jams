## MODIFIED Requirements

### Requirement: Timers Render Through Registered Shared Outputs
The Timers module SHALL produce normalized visual snapshots for landscape and vertical ordinary module browser outputs and the opt-in desktop overlay. Module enablement and per-surface visibility SHALL suppress visual contribution without stopping timer state or independently selected cue audio.

#### Scenario: One timer appears on browser and desktop
- **WHEN** an active timer is enabled and visible on a connected browser surface and configured desktop surface
- **THEN** both render the same definition snapshot, state, and remaining time with independent browser-local and desktop-scene placement

#### Scenario: Timer layer is hidden on one surface
- **WHEN** the Timers layer is hidden on one shared surface
- **THEN** that surface renders no timer cards
- **AND** active timers, other surfaces, and selected cue outputs remain unchanged

#### Scenario: Management disables the Timers module
- **WHEN** an authorized user confirms Disable Timers module from the Timers inventory header
- **THEN** management shows the module as disabled and offers Enable Timers module
- **AND** timer definitions, active runs, cue routing, and unsaved overlay-layout edits remain unchanged

#### Scenario: Scene placement is changed
- **WHEN** a Timer desktop region is moved or scaled
- **THEN** only desktop geometry changes and browser card geometry/canvas dimensions remain fixed

### Requirement: Timer Stack Presentation Is Configurable And Deterministic

Each landscape/vertical target profile SHALL store independent bounded card geometry, appearance, vertical/horizontal orientation and a visible maximum from 1 through 12. Desktop placement/scale SHALL be separate from content geometry. Browser slots SHALL have fixed configured dimensions independent of active count and reserve the overflow badge outside the visible slot count. Default/migrated appearance SHALL match existing bounded size-derived typography/spacing; explicit visual edits SHALL use the per-profile saved appearance. Labels SHALL remain single-line dynamically ellipsized, countdowns right-aligned and contents vertically centered. A default clock icon SHALL appear when no user icon is configured. The badge SHALL appear below vertical stacks and to the right of horizontal stacks, with fixed space and bounded text for large counts. Desktop continues to use landscape appearance; profile editing does not alter timer runtime state.

#### Scenario: Running and paused timers share a region
- **WHEN** several timers are active
- **THEN** completed-hold timers appear first at zero, running timers follow by earliest projected finish, and paused timers follow by least frozen remaining time
- **AND** equal values use stable definition identity as a deterministic tie-break

#### Scenario: Horizontal capacity is configured
- **WHEN** a horizontal region has a visible maximum of four and at least four timers are active
- **THEN** up to four actual timer boxes divide the region into consistent equal slots
- **AND** a long label truncates without changing its box dimensions

#### Scenario: Active count exceeds the visible maximum
- **WHEN** six timers are active in a region configured to show four
- **THEN** the four highest-priority timers remain visible
- **AND** a small `+2 more` badge appears without consuming one of the four timer slots

#### Scenario: Management previews saved and example timers
- **WHEN** the management preview has fewer saved definitions than its configured visible maximum
- **THEN** saved definitions appear before synthetic examples with their saved labels and configured icons
- **AND** synthetic examples use the default clock icon, include numbered timer names and one visible deliberately long name, and include two additional items represented by the overflow badge

#### Scenario: Profile appearance is saved independently
- **WHEN** vertical typography, color, card size or spacing is saved
- **THEN** landscape appearance is unchanged and both survive reload/restore
- **AND** existing runs, stable sort order, deadlines, cue routing and generation guards are unchanged

#### Scenario: Legacy edge fitting is preserved
- **WHEN** an older region at a scene edge is upgraded
- **THEN** its fractional slots and native style defaults are retained and its previous effective edge scale becomes desktop-only scale
- **AND** browser content is laid out locally without inheriting that desktop scale
