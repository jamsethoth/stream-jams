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

### Requirement: Desktop Ordering Recovers Without Activation
The ready visible desktop surface SHALL automatically restore its position above competing ordinary topmost windows, including while content is already playing or static. Recovery SHALL preserve the foreground application, mouse pass-through, non-focusability, selected display and playback progress. It SHALL NOT rely solely on focus events emitted by the overlay itself.

#### Scenario: Borderless game is focused before playback
- **WHEN** a borderless game is above the desktop surface and a valid desktop playback start is dispatched
- **THEN** the surface restores its order before dispatching start to the renderer
- **AND** the game retains foreground input

#### Scenario: Application overtakes an existing surface
- **WHEN** another ordinary topmost application covers a ready visible surface
- **THEN** automatic bounded recovery restores its order without requiring another playback event or operator action
- **AND** existing content continues without replay

#### Scenario: Surface cannot safely be shown
- **WHEN** the window is hidden, not loaded, interrupted by display loss, destroyed, or failed
- **THEN** ordering recovery does not show it
- **AND** background work is stopped when its native window lifecycle ends

### Requirement: Desktop Ordering Verification Has Independent Evidence
Verification SHALL exercise native competing windows and record actual order and foreground identity, rather than equating mocked method calls with native success. Real-game tests SHALL automate playback triggering and observation once the user makes the game available. Evidence SHALL distinguish automated native checks, composition captures and physical observations.

#### Scenario: Original failure is used as a negative control
- **WHEN** an owned competing window overtakes an overlay fixture without ordering recovery
- **THEN** the native observer detects the overlay is covered
- **AND** the equivalent candidate scenario must recover while retaining the competitor's foreground identity

#### Scenario: User is unavailable
- **WHEN** automated tests run without the user present
- **THEN** isolated fixture validation and preparation of the bounded game runner proceed
- **AND** physical game visibility and gameplay confirmations remain explicitly pending

### Requirement: Desktop Display Selection Fails Closed
The system SHALL persist enablement, an explicitly selected enumerated display identity, its authoritative display label and opacity from 0 through 1. First use SHALL default disabled with no chosen display and automatic following disabled. The operator MAY separately opt in to following the exact saved display name. The browser SHALL NOT author the trusted label. A missing identity SHALL be replaced only when exactly one current display has a case-sensitive label equal to the saved label; coordinates, primary-display status, enumeration order, partial labels and fuzzy labels SHALL NOT be used.

#### Scenario: Opted-in display returns with a different ID
- **WHEN** a missing selected display opted in and exactly one current display has the exact saved label under a different ID
- **THEN** the replacement ID is persisted before the desktop surface is configured ready
- **AND** only future work uses the replacement

#### Scenario: Display name is absent or ambiguous
- **WHEN** no current display or more than one current display has the exact saved label
- **THEN** the desktop surface remains unavailable with actionable absent-or-ambiguous guidance
- **AND** no fallback display is selected

#### Scenario: Legacy binding lacks a trusted label
- **WHEN** an existing desktop configuration has an ID but no saved display label
- **THEN** it remains valid with automatic following disabled
- **AND** a current display must be selected and saved before consent can be enabled

#### Scenario: Display selection is cleared
- **WHEN** the operator clears the selected display
- **THEN** its ID and label are cleared and automatic following is disabled

#### Scenario: Overlay is disabled
- **WHEN** the operator disables a desktop surface with a valid saved binding
- **THEN** its display ID, label and automatic-follow preference are preserved

#### Scenario: Selected display disconnects
- **WHEN** the selected display disappears during playback
- **THEN** desktop visuals are hidden and affected desktop obligations are settled as unavailable
- **AND** no content moves to another display, no content is replayed, and healthy OBS/audio recipients continue

#### Scenario: Automatic persistence fails
- **WHEN** an exact unique replacement is found but cannot be persisted
- **THEN** the old binding remains authoritative and the replacement is not configured

#### Scenario: Manual save wins a race
- **WHEN** an operator saves another display while automatic enumeration is pending
- **THEN** stale reconciliation does not overwrite the manual selection

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
Desktop work SHALL be scoped by surface, module, occurrence and renderer generation, with validated acknowledgements and a duration plus 5-second transport watchdog. Service loss or expiry of the 10-second ownership lease SHALL clear visuals. Renderer recovery SHALL automatically recreate the target for subsequent work with bounded backoff, without a permanent manual-retry lockout, and SHALL NOT replay interrupted content.

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

#### Scenario: Current service resumes its ownership lease
- **WHEN** the active service worker sends a valid lease after ownership expired without being replaced or entering shutdown
- **THEN** the desktop host restores display availability without requiring an app restart
- **AND** it preserves the saved display configuration and bounded recovery backoff, recreates the renderer only when new work requires it, and does not replay interrupted visuals
- **AND** leases from an old worker generation or during shutdown cannot restore ownership

### Requirement: Desktop Failure Diagnostics Are Bounded And Actionable
The host SHALL retain a bounded diagnostic for the latest renderer exit, load or command timeout, display loss or lease expiry. Readiness rejection SHALL emit a deduplicated structured failure log and a later recovery log without asset paths, media bytes, route keys or media content.

#### Scenario: Renderer failure blocks desktop readiness
- **WHEN** a renderer failure leaves an otherwise configured desktop destination unavailable
- **THEN** the next readiness evaluation records the failure category, reason, exit code when available, occurrence time and consecutive failure count

#### Scenario: Failed desktop readiness is checked repeatedly
- **WHEN** the same unavailable desktop status is evaluated more than once before recovery
- **THEN** the runtime records one structured failure transition rather than flooding the log
- **AND** it records a recovery transition after the destination becomes ready again

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

### Requirement: Private Desktop Media Uses Scoped Streaming References

Desktop transient visuals and persistent module media SHALL use validated versioned references instead of whole-file IPC bytes. The owned host SHALL resolve those references through session-local private protocol handlers and the trusted loopback media service. Renderers SHALL receive no filesystem paths or management credentials. Handlers SHALL accept only GET/HEAD for issued recipient/generation handles, reject redirects and arbitrary destinations, preserve range response semantics, and stream response bodies without accumulating them.

#### Scenario: Large transparent desktop video prepares
- **WHEN** an eligible transparent video within import limits is sent to the desktop surface
- **THEN** validated IPC SHALL carry its reference rather than media bytes
- **AND** the private renderer SHALL prepare and display its original transparent media using the existing timing contract

#### Scenario: Timer icon is updated
- **WHEN** a persistent timer presentation moves to a new media revision
- **THEN** the new revision SHALL acquire ownership before old ownership is released
- **AND** an unavailable icon SHALL retain the existing safe missing-icon behavior

#### Scenario: Renderer invents a media URL
- **WHEN** a renderer requests an unknown handle, another recipient's handle, or a stale generation
- **THEN** its protocol handler SHALL reject the request without accessing arbitrary media or management state

#### Scenario: Renderer or service is lost
- **WHEN** renderer destruction, service loss, or ownership lease expiry occurs
- **THEN** the host SHALL cancel active media responses and revoke affected handles
- **AND** its existing transparent-failure, stop, and future-only recovery behavior SHALL remain authoritative

#### Scenario: Packaged contracts do not match
- **WHEN** host, server, or renderer uses an incompatible private media protocol version
- **THEN** desktop playback SHALL fail with an explicit capability diagnostic instead of accepting bulk legacy payloads or opening a broader access path
