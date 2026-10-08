## ADDED Requirements

### Requirement: Bounded freeform canvas authoring
The disabled-by-default Data Overlays module SHALL support multiple saved independently enabled canvases with existing target profiles, explicit output assignments and ordered elements. V1 elements SHALL be text, registered local images, solid rectangles/ellipses and horizontal/vertical progress bars. Management SHALL support add/remove/duplicate, position, resize, layer order, visibility, styling and compatible value/goal binding through typed pickers. Nested compositions, executable code and remote assets SHALL be excluded. Keyboard and numeric alternatives SHALL accompany pointer manipulation.

#### Scenario: Multiple independent goals
- **WHEN** the user creates follower, sub and campaign displays on one canvas
- **THEN** each binds independently and can be moved/styled without changing its underlying data

#### Scenario: Accessible editing
- **WHEN** a keyboard user selects and repositions an element through labeled controls
- **THEN** geometry and preview update with stable focus and the same constraints as dragging

### Requirement: Shared safe formatting
Core-owned formatting SHALL resolve selected value/goal fields consistently across editor, test and live output. Controls SHALL support numeric precision, units, prefix/suffix, fixed-currency formatting and text overflow behavior. Viewer-provided text SHALL render as moderated plain text where applicable, never executable markup. Progress fill SHALL use a compatible goal projection.

#### Scenario: Same value in two forms
- **WHEN** a campaign amount is bound to text and its goal to a progress bar
- **THEN** both use the same committed data and compatible units with consistent formatting in preview/browser/desktop

### Requirement: Isolated preview and simulation
Draft layouts SHALL apply only on explicit save/apply. Preview SHALL use a separate sample store and simulate updates, decreases, completion, over-target, long text and missing sources without changing live data, receipts, rules or output grants.

#### Scenario: Test donation
- **WHEN** the user simulates a donation while editing
- **THEN** only sample progress changes and the live campaign total/receipt count remain unchanged

### Requirement: Coherent scoped live projections
Module-specific, unified browser and existing private desktop surfaces SHALL render identical safe projections for selected canvases. Output snapshots SHALL identify runtime and committed increasing data revision; delivery SHALL avoid a gap between initial snapshot and subscription. Clients SHALL discard stale revisions/runtime responses, clean up listeners and reconnect with bounded buffering/backoff. Overlay authorization SHALL reveal only referenced display fields and SHALL NOT grant management or input authority. Data updates SHALL preserve unrelated modules' active media.

#### Scenario: Two output recipients and reconnect
- **WHEN** two recipients connect and one reconnects after an update
- **THEN** both converge on current committed state without counting events themselves or restarting other modules' media

### Requirement: Enablement and live failure policy
Canvas/module display disablement and shared global output safety policy SHALL suppress presentation without resetting values or disabling independently enabled rules. Unauthorized/unresolved/type-invalid elements SHALL fail closed and transparent with actionable management diagnostics. Multiple canvases SHALL compose in stable configured order without adding audio or playback queues.

#### Scenario: Disable presentation during counting
- **WHEN** the operator disables Data Overlays and subsequent events update its values
- **THEN** no data overlay is shown, events still update enabled rules, and re-enabling displays the latest values
