## ADDED Requirements

### Requirement: Music Is A Native Disabled-By-Default Overlay Module
The system SHALL register `music` through the existing module configuration/runtime model, use strict TypeScript and schema-validated boundaries, and share one React renderer across preview, browser output and desktop output. Saved module config SHALL survive restart. Provider networking, normalization, authentication and persistence SHALL remain outside React and renderer bundles.

#### Scenario: Fresh profile
- **WHEN** a fresh profile lists available modules
- **THEN** Music is available but disabled, with valid defaults and a setup path
- **AND** no external player connection or audio starts automatically

#### Scenario: Invalid configuration
- **WHEN** configuration contains unknown fields, invalid enums or out-of-range display values
- **THEN** the save is rejected without altering the previous durable configuration

### Requirement: Widget Presentation Preserves Existing Display Options
The widget SHALL support title, ordered artist display, optional album, artwork or placeholder, progress, full/compact initial views, dark/light themes, background opacity from 0 through 100 percent, and the standalone widget's eight alignment choices. The default view SHALL be full, theme dark, opacity 84 percent, and alignment bottom-left. Overflowing text SHALL remain readable through scrolling with reduced-motion behavior. Landscape and Vertical settings SHALL use existing target-profile and layout conventions.

#### Scenario: Presentation is saved and reopened
- **WHEN** a user saves compact view, light theme, opacity and top-right alignment and restarts
- **THEN** all output renderers apply the saved values to the selected profile

#### Scenario: Long or incomplete metadata
- **WHEN** a track contains long text or lacks album/artwork
- **THEN** the widget preserves its layout, presents readable text and uses fallbacks without provider-specific renderer logic

### Requirement: Custom Appearance Uses Saved Validated Controls
The module SHALL provide saved controls for background/title/details/border/progress/placeholder colors, opacity, width, artwork size, spacing, corners, border, shadow and separate title/detail font settings. It SHALL reuse existing uploaded font assets and authorization/usage/backup handling. Values SHALL satisfy the bounds in the design and theme reset SHALL be explicit. This proposal SHALL replace the standalone custom CSS file with these native controls and SHALL disclose that arbitrary CSS files/selectors are not portable.

#### Scenario: User customizes and resets a theme
- **WHEN** a user saves custom colors, spacing and an uploaded font, reopens the module and then explicitly resets the theme
- **THEN** saved overrides survive reopening and only the explicit reset restores preset appearance
- **AND** the management application's global theme is unaffected

#### Scenario: Unsafe style or unavailable font
- **WHEN** appearance input contains arbitrary CSS, an external font URL, invalid dimensions or a missing font asset
- **THEN** it is rejected through the typed save/asset boundary with a correction message
- **AND** no arbitrary stylesheet or remote font is loaded by live output

### Requirement: Progress Uses Fresh Authoritative Observations
The widget SHALL interpolate only fresh playing observations with known position, freeze paused position, clamp to known duration, and apply authoritative seeks and track changes. Unknown position/duration SHALL remain explicit; unknown duration SHALL not show a fabricated percentage or zero total. Reconnected recipients SHALL initialize from the current server snapshot and clock reference.

#### Scenario: Pause seek and resume
- **WHEN** playing state is paused, seeks backward and resumes
- **THEN** display freezes, adopts the new authoritative position, and resumes interpolation without carrying the old position forward

#### Scenario: Unknown duration
- **WHEN** a source reports known position but unknown duration
- **THEN** elapsed time can display while total duration and percentage remain unavailable

### Requirement: Idle Appearance Is Independent Of Polling
The module SHALL support `none`, `hide` and `compact` idle modes, an integer delay from 1 through 600 seconds, and a default delay of 30 seconds with mode `none`. A new track or genuine recovery from disconnection SHALL restart the display interval. Routine successful polls, progress updates and pause/resume of the same track SHALL NOT restart that interval. Recipients SHALL derive visibility from the server's shared appearance epoch.

#### Scenario: Polling continues beyond idle delay
- **WHEN** the same track is observed every three seconds with hide mode and a 30-second delay
- **THEN** the widget hides after the display interval and successful polls do not keep it visible

#### Scenario: New track arrives after collapse
- **WHEN** a different track arrives while the widget is compact from idle mode
- **THEN** it returns to the configured initial view and starts a new idle interval

#### Scenario: Another output connects mid-track
- **WHEN** a new recipient joins after the current track's idle interval has expired
- **THEN** it receives the same idle presentation as existing recipients

### Requirement: Music Participates In Authorized Shared Outputs
Music SHALL render through existing purpose-scoped module and unified browser routes and explicitly selected desktop surfaces. It SHALL honor surface visibility, stacking and profile bounds, preserve desktop click-through/focus behavior, and keep output authorization separate from management. It SHALL emit no audio and SHALL operate independently of transient alert/effect queues and their pause/mute/skip/replay/DND controls.

#### Scenario: Module unified and desktop outputs are enabled
- **WHEN** Music is enabled and included in chosen surfaces
- **THEN** they render the same current music state within their layouts without duplicating provider connections

#### Scenario: Output key is revoked or used for management
- **WHEN** a revoked/wrong-purpose key requests music or a valid overlay key requests provider setup
- **THEN** authorization rejects the request

#### Scenario: Operator skips an alert
- **WHEN** an alert is skipped while the Music widget is visible
- **THEN** the external player and Music snapshot are unaffected; disabling Music or hiding its surface layer controls its visual output

### Requirement: Live Failures Are Transparent And Preview Is Isolated
Empty, disconnected, authentication-failed, stale, malformed or disabled Music output SHALL be transparent without setup text, debug details or secrets. Management SHALL expose actionable status and mark retained evidence stale. Mock preview and explicit test output SHALL use the production renderer and SHALL never publish fixture data to live recipients or change the selected provider.

#### Scenario: Source fails during live output
- **WHEN** Pear disconnects or requires authentication
- **THEN** live Music clears and management displays the cause and recovery action
- **AND** unrelated modules continue operating

#### Scenario: User previews appearance with mock metadata
- **WHEN** the user previews a mock track with unsaved appearance settings
- **THEN** only preview or the explicitly selected test output changes and live provider/settings remain intact

### Requirement: Music Management Uses Existing UX Conventions
Management SHALL expose Music source setup, pair/test/reconnect, selection, module enablement, saved appearance and output links through the existing shell and typed API clients. Setup SHALL show validation failures inline; status SHALL refresh at least every five seconds while visible; failed refresh SHALL retain clearly stale evidence. Controls SHALL have accessible names, keyboard support, loading/empty/error states and explicit unsaved-change behavior.

#### Scenario: Pairing fails in setup
- **WHEN** Pear denies pairing
- **THEN** the wizard remains open with retry guidance and an actionable error, without falsely registering a healthy provider

#### Scenario: Runtime refresh fails with unsaved appearance edits
- **WHEN** status polling fails while appearance edits are dirty
- **THEN** edits are preserved, stale status is labeled, and saving or discarding remains an explicit user action
