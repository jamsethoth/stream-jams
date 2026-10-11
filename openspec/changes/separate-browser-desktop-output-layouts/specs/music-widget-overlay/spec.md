## MODIFIED Requirements

### Requirement: Widget Presentation Preserves Existing Display Options
The widget SHALL support title, ordered artist display, optional album, artwork or placeholder, progress, full/compact initial views, dark/light themes, background opacity from 0 through 100 percent, and the standalone widget's eight desktop fallback alignment choices. The default view SHALL be full, theme dark, opacity 84 percent, and alignment bottom-left. Overflowing text SHALL remain readable through scrolling with reduced-motion behavior. Landscape and Vertical settings SHALL use existing target-profile and layout conventions.

#### Scenario: Presentation is saved and reopened
- **WHEN** a user saves compact view, light theme, opacity and top-right alignment and restarts
- **THEN** all renderers apply saved content appearance to the selected profile, desktop applies its saved alignment/placement, and browser content remains at its fixed local anchor

#### Scenario: Long or incomplete metadata
- **WHEN** a track contains long text or lacks album/artwork
- **THEN** the widget preserves its layout, presents readable text and uses fallbacks without provider-specific renderer logic

### Requirement: Music Participates In Authorized Shared Outputs
Music SHALL render through ordinary landscape/vertical module browser routes and explicitly selected desktop surfaces. It SHALL honor surface visibility, stacking and profile bounds, preserve desktop click-through/focus behavior, and keep output authorization separate from management. It SHALL emit no audio and SHALL operate independently of transient alert/effect queues and their pause/mute/skip/replay/DND controls.

#### Scenario: Module and desktop outputs are enabled
- **WHEN** Music is enabled and included in chosen surfaces
- **THEN** they render the same current music state within independent recipient geometry without duplicating provider connections, resetting the shared appearance epoch or mixing stale provider generations

#### Scenario: Output key is revoked or used for management
- **WHEN** a revoked/wrong-purpose key requests music or a valid overlay key requests provider setup
- **THEN** authorization rejects the request

#### Scenario: Operator skips an alert
- **WHEN** an alert is skipped while the Music widget is visible
- **THEN** the external player and Music snapshot are unaffected; disabling Music or hiding its surface layer controls its visual output

#### Scenario: Full and compact view share stable browser bounds
- **WHEN** the widget changes full/compact state, metadata, artwork or idle visibility
- **THEN** the browser canvas keeps its configured maximum envelope and local anchor
- **AND** empty/disabled output still advertises the same saved canvas geometry

### Requirement: Independent Music desktop placement
The Music editor SHALL provide a full-overlay desktop placement preview with graphical drag movement, exact numeric coordinates and keyboard movement. Full and compact desktop views SHALL save independent positions, support optional grid and canvas edge/center snapping, and remain independent of browser-source placement. Desktop positions SHALL apply only to the private desktop recipient and remain inside the logical canvas after widget-size changes.

#### Scenario: Desktop dragging remains an unsaved draft
- **WHEN** the user drags Music in the desktop preview or edits its coordinates
- **THEN** the preview and coordinates agree, pointer movement respects enabled snapping, keyboard/numeric edits remain exact, cancellation restores the starting position, and live output changes only after Save

#### Scenario: Saved placement reaches only desktop output
- **WHEN** Music desktop placement is saved and reloaded
- **THEN** the selected desktop view retains its bounded position while browser outputs keep their fixed local anchor and the other desktop view keeps its saved placement

#### Scenario: Existing configurations retain alignment
- **WHEN** a configuration without desktop placement loads or desktop placement is reset
- **THEN** desktop output uses the existing profile alignment, and large requested offsets are clamped to the current widget and canvas dimensions

#### Scenario: Desktop setup and CSS conflicts remain explicit
- **WHEN** desktop output is disabled, hidden, unavailable or its status refresh fails, or custom CSS overrides native geometry
- **THEN** management shows actionable setup/status information and shared Overlay settings, marks retained status stale after failure, disables native positioning while custom CSS is active, and does not automatically enable output

#### Scenario: Desktop scaling preserves browser appearance
- **WHEN** the user drags the desktop widget corner or enters a scale percentage and saves
- **THEN** all widget contents scale proportionally only on desktop output, full and compact retain independent scale, the scaled footprint stays bounded, legacy configurations default to 100 percent, and Escape cancels a scale drag

#### Scenario: CSS cannot resize the outer browser canvas
- **WHEN** enabled validated CSS overrides internal component geometry
- **THEN** the preserved scoped CSS contract applies only inside the authoritative canvas wrapper and excess overflow is clipped
- **AND** existing desktop positioning conflict guards remain explicit

### Requirement: Music Editing Follows Shared Module Patterns
The system SHALL place Browser sources above the production-renderer preview, followed by always-visible Configuration and separate Appearance (collapsed by default) and Custom CSS panels. A module status and confirmed Enable/Disable Music module button SHALL appear directly below Browser sources. Enablement SHALL use the existing immediate module API independently of appearance drafts. Configuration contains initial view, theme, idle behavior/delay and background opacity; scene alignment is labeled as desktop fallback placement. Appearance shows a selected Widget, Artwork, Title, Details or Progress inspector; preview component selection opens the matching inspector. Swatch and hex share a row with opacity below, while advanced spacing, text options and custom shadow use disclosures. Shadow offers Off, Subtle and Strong presets. Graphical RGB/opacity controls and validated RGBA hex input SHALL edit the same saved appearance draft. An explicit preview Edit layout mode SHALL support bounded independent movement and resizing of artwork, title, details, progress and time, with equivalent numeric geometry controls and reset to automatic layout. Old configuration SHALL default to automatic layout. Guides SHALL remain management-only; authored layout SHALL use the same production renderer in all outputs and remain a draft until Save.

#### Scenario: Module controls are disclosed independently
- **WHEN** Music appearance opens or a user expands one panel
- **THEN** Browser sources precede Preview, Configuration, Appearance and Custom CSS; the other panels retain independent disclosure state, and Disable custom CSS remains accessible outside the CSS panel

#### Scenario: Browser source rows match other modules
- **WHEN** the user expands Music browser sources
- **THEN** Landscape and Vertical live sources appear together in responsive rows with readiness, dimensions, OBS setup guidance, masked URLs, temporary Reveal/Hide, Copy and confirmed Regenerate actions; test sources are absent and source selection remains independent of the appearance-editing profile

#### Scenario: Colour selection and hex stay synchronized
- **WHEN** a user changes RGB, opacity or a valid RGBA hex value
- **THEN** the other controls and preview reflect the same draft colour; invalid hex retains the last valid colour and displays a validation error

#### Scenario: Preview movement matches numeric geometry
- **WHEN** a user enables Edit layout and moves or resizes a Music component
- **THEN** numeric geometry reflects the bounded widget-local rectangle, keyboard and numeric edits use the same contract, cancellation restores the prior gesture state, and live output changes only after Save

#### Scenario: Authored layout survives configuration boundaries
- **WHEN** configuration saves, reloads, restores from backup, resizes its widget or projects to a narrower output profile
- **THEN** authored component rectangles are retained or bounded to the resulting widget; older configuration and Reset use automatic layout, and live output contains no editor guides

#### Scenario: Custom CSS overrides are explicit during visual editing
- **WHEN** custom CSS is enabled
- **THEN** the editor explains that CSS can override native geometry and prevents misleading drag handles; disabling CSS preserves its source and permits native layout editing
