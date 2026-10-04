# music-widget-overlay

## Purpose

Define the saved Music widget, validated appearance, branding assets, live output behavior, and management experience.

## Requirements

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
The module SHALL provide saved controls for background/title/details/border/progress/placeholder colors, opacity, width/height, content insets, artwork size, spacing, corners, border, shadow and separate title/detail font settings alongside an optional Advanced CSS editor. It SHALL reuse existing uploaded font assets and authorization/usage/backup handling. Values SHALL satisfy the bounds in the design and theme reset SHALL be explicit. Resetting a theme SHALL preserve the saved custom stylesheet and branding image until separately cleared.

#### Scenario: User customizes and resets a theme
- **WHEN** a user saves custom colors, spacing and an uploaded font, reopens the module and then explicitly resets the theme
- **THEN** saved overrides survive reopening and only the explicit reset restores preset appearance
- **AND** the management application's global theme is unaffected

#### Scenario: Unsafe native style or unavailable font
- **WHEN** native appearance input contains an external font URL, invalid dimensions, insets leaving no content area or a missing font asset
- **THEN** it is rejected through the typed save/asset boundary with a correction message
- **AND** no external font is loaded by live output

### Requirement: Advanced CSS Is Saved Previewable And Reversible
The module SHALL provide an optional CSS editor with a saved enabled toggle, a versioned documented styling surface, inline validation diagnostics and an external Disable custom CSS action. Valid CSS SHALL apply after native styling and support component layout, visibility, responsive rules and animations within the widget. Unsaved CSS SHALL affect only preview until saved. Disabling CSS SHALL preserve its text, and invalid edits SHALL leave the last valid preview and saved live configuration intact.

#### Scenario: User rearranges branded widget components
- **WHEN** the user writes valid CSS to move album artwork, place progress above the title and hide album details
- **THEN** the production preview shows the custom layout and Save makes that layout durable across restart and output renderers
- **AND** no provider-specific renderer or replacement HTML is required

#### Scenario: CSS overrides a native control
- **WHEN** saved CSS overrides a property also exposed by a native control
- **THEN** enabled CSS wins for that property, preview shows the effective result and disabling CSS restores the native control's value

#### Scenario: Invalid edit and recovery
- **WHEN** the user enters invalid CSS or disables a valid stylesheet that makes the widget unreadable
- **THEN** invalid input reports its location without replacing the last valid result, and the disable control remains accessible outside the custom-styled subtree

### Requirement: Custom CSS Is Confined And Validated
The system SHALL isolate Music styles from management and sibling modules using the managed frame and Shadow DOM design, validate parsed CSS before preview/save/restore, and enforce a 32 KiB source limit, 512-rule limit, 4,096-declaration limit and nesting depth of eight. It SHALL reject resource-loading/executable constructs, invalid syntax, unsupported at-rules and selectors targeting the host or managed wrappers, including escaped/indirect forms. Only documented inner parts and validated media/supports/container/keyframe rules SHALL be supported. Custom CSS SHALL NOT bypass output clipping, visibility, reduced-motion or desktop pointer behavior.

#### Scenario: Resource loading through encoded or indirect CSS
- **WHEN** CSS contains an escaped import, URL/image-set reference, remote font, or custom-property indirection that can introduce a resource request
- **THEN** validation rejects it with a correction message before applying it and preview performs no resulting outbound request

#### Scenario: Attempt to escape widget scope
- **WHEN** CSS tries to style the host, position content outside the managed frame or affect another module
- **THEN** disallowed selectors are rejected and managed frame containment prevents visual or input interference outside Music

#### Scenario: Hidden or stale widget has custom animation
- **WHEN** Music becomes hidden, empty, stale or disabled while custom animation is active
- **THEN** the entire widget including branding remains transparent and CSS cannot restore visibility
- **AND** reduced-motion mode suppresses custom animation without requiring users to edit the stylesheet

#### Scenario: Restored stylesheet is invalid
- **WHEN** backup preflight finds CSS that fails the supported validation policy
- **THEN** restore is blocked with a correction message before replacing configuration

### Requirement: Branding Image Renders Beneath Music Components
The widget SHALL support an uploaded PNG, JPEG or WebP branding image selected through the asset library and stored by asset ID, independent of provider album artwork. It SHALL preserve image transparency and render the base fill, branding image and foreground components in that order. Each Landscape/Vertical profile and full/compact view SHALL support its own image, contain/cover/fill fit, horizontal/vertical percentage position and opacity. Defaults SHALL be no image, contain, centered and 100 percent image opacity. Image opacity SHALL be independent of base-fill and foreground opacity.

#### Scenario: Transparent brand graphic with readable foreground
- **WHEN** a user selects a transparent branding image, removes the native panel fill and previews a track
- **THEN** the graphic appears behind the title, artists, artwork and progress with transparent areas preserved and foreground readability unaffected by image opacity

#### Scenario: Graphic fit and content placement
- **WHEN** the user changes fit, image position, widget dimensions or content insets
- **THEN** preview and saved output apply the same placement and show the difference between contain, cropped cover and stretched fill
- **AND** Use image aspect ratio derives a valid height from width without silently resizing on image selection

#### Scenario: Full and compact views use different branding
- **WHEN** idle behavior changes the widget from full to compact
- **THEN** it uses the selected profile's compact image/settings while preserving the track and saved full-view branding

#### Scenario: Track or provider changes
- **WHEN** a new track or source supplies different album artwork
- **THEN** the saved branding graphic remains configured independently and the provider cannot overwrite it

#### Scenario: Remove image or hide widget
- **WHEN** the user removes the branding image or the widget becomes hidden/empty
- **THEN** removal preserves other appearance/CSS settings, while hiding/empty playback hides all branding with the rest of the widget

### Requirement: Branding Assets Share The Existing Asset Lifecycle
Branding images and selected fonts SHALL use existing validation, versioned authorized delivery, usage tracking, replacement/retirement protection and backup/restore. All profile/view references SHALL count as Music usages. Invalid media references SHALL be rejected on save and backup preflight. Missing runtime branding images SHALL fall back to the native background with safe foreground and management diagnostics, without a broken-image icon or live error text.

#### Scenario: Referenced image replacement or retirement
- **WHEN** an operator attempts to replace or retire an image referenced by a saved full or compact Music view
- **THEN** asset usage identifies the Music reference and existing compatibility/retirement safeguards apply
- **AND** successful compatible replacement refreshes versioned delivery in preview and live renderers

#### Scenario: Branded configuration round trips
- **WHEN** a Music backup is restored successfully
- **THEN** it preserves CSS text/enablement/style version, image/font assets, profile/view selections and presentation settings
- **AND** provider credentials remain excluded and fresh pairing is still required

#### Scenario: Selected background fails to load
- **WHEN** an otherwise healthy widget cannot load its saved branding image
- **THEN** safe foreground renders over the native fallback background and management reports a recovery action
- **AND** this fallback cannot override the module's transparent auth/stale/empty states

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

### Requirement: Music Editing Follows Shared Module Patterns
The system SHALL place Browser sources above the production-renderer preview, followed by separate collapsible Configuration and Custom CSS panels. Graphical RGB/opacity controls and validated RGBA hex input SHALL edit the same saved appearance draft. An explicit preview Edit layout mode SHALL support bounded independent movement and resizing of artwork, title, details, progress and time, with equivalent numeric geometry controls and reset to automatic layout. Old configuration SHALL default to automatic layout. Guides SHALL remain management-only; authored layout SHALL use the same production renderer in all outputs and remain a draft until Save.

#### Scenario: Module controls are disclosed independently
- **WHEN** Music appearance opens or a user expands one panel
- **THEN** Browser sources precede Preview, Configuration and Custom CSS; the other panels retain independent disclosure state, and Disable custom CSS remains accessible outside the CSS panel

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
