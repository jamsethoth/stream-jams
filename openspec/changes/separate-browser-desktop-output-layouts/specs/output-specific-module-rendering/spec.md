## ADDED Requirements

### Requirement: Browser content geometry is independent of desktop placement

The system SHALL render Music, Timers and Videos on deterministic stable content-sized transparent browser canvases and SHALL apply desktop position, alignment, z-order and scale only to desktop scene presentation. Alerts and Screen Effects SHALL retain full-scene dynamic positioning. Alerts, Music and Timers SHALL retain landscape and vertical output profiles.

#### Scenario: Desktop placement changes
- **WHEN** the operator moves or scales a desktop Music, Timer or Video placement without changing appearance
- **THEN** the browser output keeps identical dimensions and local content coordinates
- **AND** the desktop output reflects the saved placement

#### Scenario: Dynamic scene modules
- **WHEN** an Alert or Screen Effect is positioned anywhere in its scene
- **THEN** the browser and desktop recipients preserve the intended scene positioning

### Requirement: Ordinary content changes do not resize browser canvases

Browser canvas dimensions SHALL derive from saved configuration and include all supported content states, padding and visual effects. They SHALL NOT change with playback state, text, asset loading, active timer count or video selection. Hidden/empty outputs SHALL remain transparent on the same canvas. Saved visual geometry changes SHALL update advertised dimensions.

#### Scenario: Music changes view
- **WHEN** Music changes track, switches between full and compact, or hides while idle
- **THEN** it retains the same per-profile canvas envelope and local anchor

#### Scenario: Timer capacity and overflow
- **WHEN** active timers change from zero to the configured visible capacity and beyond
- **THEN** the canvas retains its configured slot and overflow-badge envelope without resizing existing cards

#### Scenario: Video content changes
- **WHEN** a Video changes aspect ratio or its title/requester caption becomes empty
- **THEN** its configured picture and caption envelope remains stable

### Requirement: Timer profile appearance is independently configurable

The system SHALL persist independent landscape and vertical Timer visual settings for card geometry, orientation, capacity, spacing, padding, corners, border, background, label/value typography and colors, icon size and state accents. It SHALL provide representative previews and typed bounded validation. Desktop position and scale SHALL be separate from visual settings. Per-definition runtime state SHALL remain unchanged.

#### Scenario: Edit vertical appearance
- **WHEN** the operator saves a different vertical Timer font, color or card layout
- **THEN** the vertical output uses the new settings and the landscape settings remain unchanged
- **AND** timer deadlines, identities and remaining time remain unchanged

#### Scenario: Invalid appearance
- **WHEN** appearance input is outside supported bounds or cannot produce positive canvas dimensions
- **THEN** the save is rejected with actionable management feedback and the prior saved configuration remains active

### Requirement: Existing visual configuration migrates without losing desktop placement

The system SHALL migrate existing Music, Timer and Video settings into separated content and placement ownership, preserve ordinary module credentials, and preserve existing desktop appearance and placement as closely as the prior validated geometry allows. Backup/restore SHALL retain new settings and independent profiles.

#### Scenario: Upgrade a configured Timer stack
- **WHEN** an existing stack with a saved scene region, orientation and capacity is migrated
- **THEN** equivalent content settings and desktop placement are created without resetting the timer runtime

#### Scenario: Restore migrated configuration
- **WHEN** the operator restores an exported migrated configuration
- **THEN** both profile appearances and desktop-only placement are restored using validated configuration boundaries

### Requirement: Canvas metadata is authoritative while empty and on reconnect

The server SHALL deliver versioned canvas kind, finite positive integer dimensions, local origin/insets and saved configuration revision with each composition independently of content visibility. Management dimensions and runtime projections SHALL use the same pure geometry calculation. Reconnect SHALL initialize from current config/state; saved config replacement SHALL atomically update content geometry and canvas metadata and reject delayed older revisions.

#### Scenario: Empty module reconnects
- **WHEN** a browser connects while Music is hidden, no Timers are active, Videos is idle or its module is disabled
- **THEN** it receives the configured canvas metadata without requiring a visible playback item
- **AND** a later item does not change those bounds

#### Scenario: Save races with an older refresh
- **WHEN** a saved geometry change completes before an older asynchronous composition response
- **THEN** the older response cannot replace the new canvas or content geometry
- **AND** active item identity, playback time and preparation ownership are not restarted

### Requirement: Content canvases have fixed local CSS pixel geometry

Content browser outputs SHALL render top-left at one CSS pixel per configured unit without the full-scene target-profile fit/center transform. Extra viewport area SHALL remain transparent; smaller viewports SHALL clip without changing projection geometry. Editor preview scaling SHALL remain local to management. Native Music shadow reserves SHALL follow the deterministic bounded padding policy in the design; custom CSS SHALL not control the outer canvas. Module limits SHALL bound sizes and invalid compound settings SHALL be rejected before save.

#### Scenario: OBS viewport differs from recommended dimensions
- **WHEN** a content browser source has an oversized or undersized viewport
- **THEN** its content coordinates and sizes stay fixed with transparent extra area or clipping respectively
- **AND** mismatch guidance appears only in management

#### Scenario: Music custom CSS changes internal layout
- **WHEN** saved validated Music CSS changes an allowed internal component
- **THEN** the outer canvas and local origin remain authoritative and overflow is clipped
- **AND** existing native-positioning conflict guards remain active

### Requirement: Timer upgrade preserves old desktop edge fitting

Timer migration SHALL materialize equivalent per-profile native style defaults, fractional card slots and old position-dependent overflow edge scale. The edge scale SHALL become desktop-only placement scale, not browser content geometry. Desktop SHALL continue using landscape appearance; preserved vertical placement metadata SHALL not enable portrait desktop rendering implicitly. Timer text SHALL retain single-line ellipsis, right-aligned countdown and stable ordering. The overflow badge SHALL reserve fixed bounded space independent of count magnitude.

#### Scenario: Legacy region touches the right or bottom edge
- **WHEN** a horizontal or vertical stack near a scene edge is migrated with or without active overflow
- **THEN** its desktop footprint and native appearance match the prior effective scale
- **AND** browser content uses the unscaled local layout with the declared reserved badge footprint

#### Scenario: Fractional card sizes are migrated
- **WHEN** a region dimension is not divisible by the configured capacity
- **THEN** fractional slot geometry is retained and only the final canvas envelope rounds outward
- **AND** per-card rounding cannot accumulate gaps or change the desktop footprint

### Requirement: Private desktop composition is not a public source capability

Desktop module eligibility SHALL use an explicit trusted registered capability instead of public unified-output availability. Public unified removal SHALL preserve private multi-module snapshots, layer order/visibility, opacity, display consent, occurrence identities and scoped media leases. Only desktop configuration rows SHALL remain eligible for shared-surface reconciliation.

#### Scenario: Upgrade desktop with all modules configured
- **WHEN** public unified support is removed from registered browser capabilities
- **THEN** existing desktop module rows remain in their prior order and visibility
- **AND** current playback, Music epoch, Timer runs, Video primary ownership and device audio are not reset
