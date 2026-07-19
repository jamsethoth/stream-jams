## ADDED Requirements

### Requirement: Internal Management Navigation Preserves Dirty-State Protection
The management UI SHALL route same-origin internal management links through the existing dirty-navigation confirmation flow while preserving native external, modified-click, download, and new-window behavior.

#### Scenario: Correction link is followed with unsaved changes
- **WHEN** a user activates a `/manage` correction or usage link while domain changes are dirty
- **THEN** the system presents the same Save and leave, Discard, and Cancel choices used by primary navigation
- **AND** navigation occurs only after that flow allows it

### Requirement: Initial Load Failures Are Not Presented As Valid State
The management UI SHALL distinguish initial load failure from valid empty, default, or editable state.

#### Scenario: Settings fail to load
- **WHEN** the initial settings request fails
- **THEN** the page shows an actionable retry-only failure surface
- **AND** it does not expose editable fallback settings or mutation actions

#### Scenario: Inventory fails to load
- **WHEN** Alerts or Assets initial inventory loading fails
- **THEN** the page does not also show a valid empty-state message or creation action

### Requirement: User-Facing Errors Are Operator Safe
The management UI SHALL show a concise human-readable cause and next step without exposing raw schema issue arrays, stack traces, or internal exception serialization.

#### Scenario: Structured validation fails
- **WHEN** a management operation returns structured validation issues
- **THEN** the error surface summarizes the affected field or expected value in plain language
- **AND** raw structured detail remains available only through Diagnostics or logs

### Requirement: Primary Workflows Remain Reachable At Supported Widths
The management UI SHALL keep every primary destination, current status, and primary row action reachable without requiring horizontal scrolling at desktop, tablet, and readable mobile widths.

#### Scenario: Navigation is shown on a narrow mobile viewport
- **WHEN** the management UI is rendered at 390 CSS pixels wide
- **THEN** all primary destinations remain visibly discoverable through the navigation control

#### Scenario: Dense inventory is shown on a narrow viewport
- **WHEN** a provider, alert, asset, or readiness inventory no longer fits its desktop columns
- **THEN** identity, status, and primary action remain visible
- **AND** secondary comparison data may move to the selected detail surface

### Requirement: Composite Controls Implement Their Declared Keyboard Model
The management UI SHALL use native control semantics or implement the complete keyboard behavior required by declared tab and selection roles.

#### Scenario: Inspector tabs are keyboard operated
- **WHEN** focus is within a tab list
- **THEN** Arrow keys, Home, and End move the active tab using one roving tab stop
- **AND** each tab identifies its controlled tab panel

#### Scenario: Asset and canvas selections are keyboard operated
- **WHEN** a keyboard user activates an asset choice or canvas layer with Enter or Space
- **THEN** the corresponding item becomes selected and exposes that state programmatically

### Requirement: Shared Presentation Uses Locale-Aware Formatting
The management UI SHALL derive document language and direction at runtime and SHALL format dates, numbers, byte units, durations, and plurals through shared `Intl`-based helpers.

#### Scenario: Singular values are rendered
- **WHEN** a duration or usage count equals one
- **THEN** the UI renders a singular unit such as `1 hour`, `1 day`, or `1 use`

#### Scenario: Right-to-left or user-generated text is rendered
- **WHEN** the browser locale is right-to-left or overlay text determines its own direction
- **THEN** the document or text boundary exposes the corresponding direction without changing stored content

### Requirement: Status Summaries Exclude Zero-Value Problem Noise
The management UI SHALL omit zero-value blocker and warning facts and SHALL replace zero-only impact counts with a concise outcome.

#### Scenario: Active alert set has no validation issues
- **WHEN** the Home summary contains zero blockers and zero warnings
- **THEN** neither problem fact is rendered

#### Scenario: Provider activation affects no active alerts
- **WHEN** activation impact contains zero matching and zero unmatched alerts
- **THEN** the UI states that no active alerts are affected instead of rendering both zero counts

#### Scenario: Provider activation has a mixed impact
- **WHEN** either matching or unmatched alert count is zero
- **THEN** the zero-valued count is omitted while the nonzero impact remains visible

### Requirement: Alert Editor Action Failures Do Not Reflow The Workspace
The management UI SHALL present post-load alert-editor action failures without changing the authoring workspace dimensions and SHALL retain diagnostic evidence after transient feedback disappears.

#### Scenario: Alert editor action fails
- **WHEN** a save, preview, test, or editor command fails after the editor has loaded
- **THEN** the actionable error appears in a fixed bottom-right surface with a dismiss control
- **AND** it automatically disappears after eight seconds
- **AND** its reference ID can locate the sanitized failure in Diagnostics

#### Scenario: Alert editor fails to load
- **WHEN** the initial alert document or set cannot be loaded
- **THEN** the blocking failure remains inline and persistent with a route back to Alerts
