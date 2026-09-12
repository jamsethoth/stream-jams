# Shared Overlay Surfaces Specification

## Purpose

Define reusable, secure visual surfaces that let registered Stream Jams modules render in ordered layers across Windows desktop and browser outputs without coupling visual visibility to audio or queue behavior.

## Requirements

### Requirement: Desktop Is A Shared Visual Recipient
The system SHALL provide one opt-in Windows desktop visual surface for registered modules, independent of management visibility, OBS browser connections and device-audio delivery. It SHALL consume normalized module compositions through validated private transport and SHALL NOT expose a copyable desktop browser-source URL.

#### Scenario: Alert plays with management hidden
- **WHEN** the desktop surface is enabled on an available selected display and an eligible reviewed Landscape alert begins while management is hidden
- **THEN** the desktop renders the alert without requiring an OBS browser client
- **AND** management remains hidden and device audio follows only its own output selection

#### Scenario: CLI startup has saved desktop configuration
- **WHEN** the local service starts without the Windows desktop host
- **THEN** saved surface settings remain intact and management reports desktop output unavailable
- **AND** browser sources and eligible audio recipients remain independent

#### Scenario: Module is globally disabled
- **WHEN** a registered module is disabled through its module configuration
- **THEN** its visuals are suppressed on every surface even if a surface row is visible

### Requirement: Desktop Window Never Intercepts Normal Input
The desktop surface SHALL be transparent, frameless, topmost, non-focusable, mouse-pass-through and absent from the normal taskbar window list. Starting, updating, hiding or restoring content SHALL NOT focus the window or change another application's display mode.

#### Scenario: Effect appears over a borderless game
- **WHEN** new content starts while the game has keyboard focus
- **THEN** keyboard and mouse input continue to reach the underlying application
- **AND** no opaque window background or management chrome appears

#### Scenario: Exclusive full-screen hides the overlay
- **WHEN** an exclusive-full-screen application covers the surface
- **THEN** Stream Jams does not inject into or change that application
- **AND** management guidance describes windowed/borderless support without promising exclusive-full-screen visibility

### Requirement: Desktop Display Selection Fails Closed
The system SHALL persist enablement, an explicitly selected enumerated display identity and opacity from 0 through 1. First use SHALL default disabled with no chosen display. Display identity SHALL NOT be guessed from a label, coordinate or primary-display fallback.

#### Scenario: Selected display disconnects
- **WHEN** the selected display disappears during playback
- **THEN** desktop visuals are hidden and affected desktop obligations are settled as unavailable
- **AND** no content moves to another display and healthy OBS/audio recipients continue

#### Scenario: Display geometry changes
- **WHEN** the same selected display changes resolution or scale factor
- **THEN** the window follows that display's bounds and uniformly fits the Landscape canvas without stretching
- **AND** the saved display identity is unchanged

#### Scenario: Imported monitor binding belongs to another machine
- **WHEN** a configuration backup is restored
- **THEN** its layer/opacity settings are retained but desktop output stays disabled until the operator explicitly chooses a current display

### Requirement: Each Shared Surface Owns Ordered Module Layers
Each desktop and unified browser surface SHALL persist its own ordered list of registered module IDs and visual visibility flags. The top row SHALL render above lower rows in an isolated module stacking context. Duplicate or unknown IDs and invalid complete reorder requests SHALL be rejected atomically.

#### Scenario: Modules have conflicting internal z-index values
- **WHEN** two modules render simultaneously and a lower module uses a larger internal z-index
- **THEN** it cannot cover a module above it in the surface order

#### Scenario: Desktop order changes
- **WHEN** the user moves a desktop module up using keyboard-accessible controls and saves
- **THEN** the desktop order changes without restarting active playback
- **AND** unified and module-specific browser outputs keep their prior ordering/behavior

#### Scenario: New module is registered
- **WHEN** an existing profile first discovers another module
- **THEN** it appends one hidden row at the bottom of every shared surface
- **AND** prior module order and visibility are preserved

#### Scenario: Existing unified output is upgraded
- **WHEN** layer configuration is created for a pre-existing unified output
- **THEN** it preserves that output's previously effective module membership and paint order

### Requirement: Surface Visibility Does Not Own Audio Or Queues
Surface visibility SHALL affect visual contribution only, not module queue state or independently selected media audio. Reordering SHALL retain occurrence identity and timing; re-showing active content SHALL use the current media offset rather than restarting it.

#### Scenario: Operator hides a visually active module
- **WHEN** the module row is hidden on one surface
- **THEN** that surface removes the module's visible instructions
- **AND** its audio, queue and other selected surfaces continue independently

#### Scenario: Active video is shown again
- **WHEN** a hidden layer is re-enabled before the occurrence ends
- **THEN** it displays only the remainder at the current occurrence offset or fails closed if it cannot resume safely
- **AND** neither its video nor soundtrack restarts from zero

### Requirement: Desktop Recipient Failures Are Bounded
Desktop work SHALL be scoped by surface, module, occurrence and renderer generation, with validated acknowledgements and a duration plus 5-second transport watchdog. Service loss or expiry of the 10-second ownership lease SHALL clear visuals. Renderer recovery SHALL allow at most one automatic recreation before explicit Retry and SHALL NOT replay interrupted content.

#### Scenario: Old renderer acknowledges a new occurrence
- **WHEN** a completion message has the wrong occurrence or renderer generation
- **THEN** it cannot mutate current playback or advance another module queue

#### Scenario: Shared renderer crashes
- **WHEN** the desktop renderer disappears with multiple modules active
- **THEN** every affected desktop obligation fails without blocking healthy browser/device work
- **AND** management identifies the shared-host failure while the display stays transparent

#### Scenario: Desktop never acknowledges completion
- **WHEN** the occurrence deadline plus 5 seconds expires
- **THEN** the runtime clears or destroys the unresponsive visual recipient and releases its queue obligations

### Requirement: Shared Surface Configuration Preserves Security And UX
Shared surface configuration SHALL use protected management Settings, existing auth/CSRF/origin/rate-limit controls, explicit saves and actionable capability errors. Desktop renderers SHALL be sandboxed and context-isolated with Node integration disabled, no management session, and no authority to read arbitrary paths or execute code.

#### Scenario: Overlay renderer asks for an arbitrary file
- **WHEN** an IPC message names an unauthorized asset, path, URL, command, sender or frame
- **THEN** the request is rejected before accessing the file or management state

#### Scenario: Settings change fails to save
- **WHEN** a display, opacity or layer-order update cannot be validated or persisted
- **THEN** prior persisted/runtime settings remain authoritative and an accessible actionable failure appears in management

#### Scenario: Production overlay cannot load media
- **WHEN** a media load fails
- **THEN** the affected visual fails transparent without debug text
- **AND** actionable diagnostics appear only in management, Operator or logs

### Requirement: Windows Feasibility Is Demonstrated Before Delivery
Implementation SHALL demonstrate packaged transparent video, normal input pass-through, focus preservation, monitor failure behavior, background playback and bounded Quit at 1080p and 1440p while retaining the existing hardware-acceleration shutdown workaround.

#### Scenario: Required video behavior fails the capability gate
- **WHEN** the packaged runtime cannot meet the declared playback/input/shutdown acceptance checks
- **THEN** the failed gate is documented and the slice remains incomplete pending a scoped backend decision
- **AND** the implementation does not silently remove the workaround, inject into games or add a native driver
