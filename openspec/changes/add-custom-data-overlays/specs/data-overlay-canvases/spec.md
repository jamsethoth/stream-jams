## ADDED Requirements

### Requirement: Freeform canvas authoring
The disabled-by-default Data Overlays module SHALL support multiple saved, independently enabled canvases, each with a target profile, output assignments and ordered elements. Elements SHALL be text, registered local images, solid rectangles or ellipses, or horizontal or vertical progress bars. Management SHALL support adding, removing, duplicating, positioning, resizing, ordering, hiding and styling elements, and binding them to compatible values or goals.

#### Scenario: Several goals on one canvas
- **WHEN** the user places follower, sub and challenge displays on one canvas
- **THEN** each element binds to its own value or goal and can be moved or styled without changing data

#### Scenario: Incompatible binding
- **WHEN** the user binds a progress bar to a text value
- **THEN** the binding is rejected with an actionable message

### Requirement: Keyboard-accessible editing
Every pointer manipulation in the canvas editor SHALL have a keyboard and numeric-field alternative with the same constraints.

#### Scenario: Move with the keyboard
- **WHEN** a keyboard user selects an element and moves it with arrow keys
- **THEN** its geometry and preview update, focus stays on the element, and snapping and bounds match dragging

### Requirement: Canvas bounds
The system SHALL enforce at most 1000 values, 250 goals, 50 canvases and 100 elements per canvas, and SHALL expose these limits to the management UI from one shared definition.

#### Scenario: Element limit reached
- **WHEN** the user adds a 101st element to a canvas
- **THEN** the add is rejected and the editor explains the limit

### Requirement: Shared formatting
Core-owned formatting SHALL produce the same text in the editor, preview, browser source and desktop overlay. It SHALL support thousands separators, prefix, suffix, wrap or ellipsis overflow, and goal fields chosen from a picker. Text SHALL render as plain text, never as markup.

#### Scenario: Markup in a text value
- **WHEN** a text value contains `<b>hi</b>`
- **THEN** every output shows the literal characters and no markup is interpreted

#### Scenario: Same goal as text and bar
- **WHEN** a goal is bound to a text element showing "remaining" and to a progress bar
- **THEN** both use the same committed projection on every output

### Requirement: Isolated preview
Layout drafts SHALL apply only on explicit save. Preview SHALL use a separate sample store that can simulate zero, decrease, completion, over-target, long text and a missing source, without changing live values.

#### Scenario: Simulate completion
- **WHEN** the user simulates goal completion while editing
- **THEN** only the preview changes and the live value and outputs are unchanged

### Requirement: Coherent output projections
Module-specific browser sources, unified browser sources and the private desktop surface SHALL render the same projection for a canvas. Projections SHALL carry the runtime ID and an increasing data revision, and clients SHALL discard older frames. Snapshot delivery SHALL leave no gap between the initial snapshot and the subscription.

#### Scenario: Browser source and desktop agree
- **WHEN** an operator changes a value while a canvas is on a browser source and the desktop overlay
- **THEN** both show the same new content

#### Scenario: Reconnect after an update
- **WHEN** a browser source reconnects after missing an update
- **THEN** it receives a fresh snapshot with the current content and drops any older frame that arrives late

### Requirement: Output scope
Overlay keys SHALL reveal only the values and goals referenced by canvases on that output and SHALL NOT grant management or Operator authority.

#### Scenario: Unreferenced value
- **WHEN** a browser source subscribes with its overlay key
- **THEN** its projection contains no value that its canvases do not reference

### Requirement: Data updates preserve other media
Data overlay updates SHALL NOT remount or restart other modules' active media on shared surfaces.

#### Scenario: Update during an alert video
- **WHEN** a value changes while an alert video plays on the unified browser source
- **THEN** the video continues from its current position

### Requirement: Fail-closed bindings
Elements with unresolved, deleted or type-invalid bindings SHALL hide on live outputs, and Management SHALL show the problem. Live outputs SHALL NOT render diagnostic text.

#### Scenario: Missing image asset
- **WHEN** an image element's asset is removed from the library
- **THEN** the element is hidden live and Management flags the missing asset

### Requirement: Stale value policy
Each bound element SHALL use either retain-last or hide-immediately when its value's source is stale. The default SHALL be retain-last, which hides the element only after 10 minutes stale or when the source has ended. Values without a source SHALL never be stale.

#### Scenario: Brief source outage
- **WHEN** a provider-backed value goes stale for two minutes and then recovers
- **THEN** a retain-last element keeps showing the last value throughout

#### Scenario: Long source outage
- **WHEN** a provider-backed value stays stale for more than 10 minutes
- **THEN** a retain-last element hides until the source recovers

### Requirement: Display suppression keeps data
Module disablement, canvas disablement and global output pause SHALL suppress display without changing values. Canvases SHALL stack in their configured order inside the module's single layer row on each shared surface.

#### Scenario: Disable while values change
- **WHEN** the module is disabled, an operator adds one to a counter, and the module is re-enabled
- **THEN** no data overlay shows while disabled, and the re-enabled canvas shows the new count
