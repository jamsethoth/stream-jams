## ADDED Requirements

### Requirement: Focused Alert Editor Preserves Context And Workspace
The focused alert editor SHALL remain a distinct management route while retaining loaded set and alert context and using the available desktop or tablet viewport.

#### Scenario: Focused editor opens
- **WHEN** a user opens an alert from a selected set
- **THEN** the editor shows a compact breadcrumb containing Alerts, the loaded set name, and the current alert name
- **AND** Back returns to the loaded set rather than trusting stale optional route state

#### Scenario: Wide editor viewport is available
- **WHEN** the editor is rendered on a wide desktop
- **THEN** the focused route is not constrained by the normal 1280px management-content cap
- **AND** alert tree, canvas, and inspector use independently scrollable workspace regions

#### Scenario: Intermediate editor viewport is available
- **WHEN** the editor is between 701 and 980 CSS pixels wide
- **THEN** the canvas and alert tree remain usable
- **AND** the inspector moves to its own full-width workspace row instead of creating an uncontrolled page-length column

#### Scenario: Narrow editor viewport is used
- **WHEN** the editor is 700 CSS pixels wide or narrower
- **THEN** authoring controls are hidden behind the existing clear larger-screen message

### Requirement: Alert Template Variables Match Normalized Event Data
The alert editor SHALL present only variables relevant to the selected normalized event type and SHALL render those variables consistently in preview, test, and live playback.

#### Scenario: Event actor name is inserted
- **WHEN** a user inserts `User name`
- **THEN** the editor writes `{userName}`
- **AND** live playback resolves it from the normalized event actor display name
- **AND** legacy saved `{actor.displayName}` templates continue to render without appearing as a second user-facing actor-name choice

#### Scenario: Event-specific variables are offered
- **WHEN** the editor loads an alert event type
- **THEN** its variable picker contains only the approved aliases that describe useful data for that event
- **AND** gift alerts distinguish recipient and gifter names
- **AND** broadcaster/system events do not show `User name`
- **AND** generic amounts, internal IDs, raw timestamps, arbitrary metadata, choices, and outcomes are not offered

#### Scenario: Template context is consistent
- **WHEN** an approved variable is rendered in local preview, server test send, or live playback
- **THEN** every path resolves it through the same normalized template-context mapping
- **AND** a nullable value renders as empty text

#### Scenario: Saved template uses a compatibility key
- **WHEN** a saved template contains a previously supported key that is no longer offered for insertion
- **THEN** preview, test, and live playback continue to resolve that key
- **AND** the compatibility key does not appear in the variable picker
