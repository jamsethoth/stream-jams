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
