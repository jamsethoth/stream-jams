## ADDED Requirements

### Requirement: Alert Sets Are Fully Managed

The system SHALL allow authorized management users to create, rename, duplicate, save, activate, validate, and delete alert sets while enforcing exactly one active set and retaining at least one set.

#### Scenario: Inactive valid set is activated

- **WHEN** a management user activates an inactive set with no blockers
- **THEN** that set becomes the only active set
- **AND** the previous active set remains saved but inactive

#### Scenario: Activation blockers prevent runtime change

- **WHEN** validation finds blockers in the selected set
- **THEN** activation is unavailable
- **AND** the validation summary links each blocker to its target profile, event type, and alert correction context

#### Scenario: Saving active-set changes reports live impact

- **WHEN** a user saves changes that affect enabled live outputs in the active set
- **THEN** the system names affected target profiles and event types before applying the save

#### Scenario: Active or only set cannot be deleted directly

- **WHEN** a user requests deletion of the active set or the only remaining set
- **THEN** deletion is blocked
- **AND** the system offers the applicable activate-another-set or reset-default recovery path

#### Scenario: Alert sets use a compact expandable hierarchy

- **WHEN** a management user opens the Alerts module
- **THEN** alert sets appear as full-width expandable rows with activation, rename, duplicate, and delete actions inline
- **AND** module-level Browser sources are outside the Alert sets region
- **AND** expanding the selected set reveals its alerts with Edit, Preview, Test, and Enable/Disable actions inline
- **AND** no separate selected-set overview panel is required

#### Scenario: Validation rolls up without duplicating details

- **WHEN** an alert or set has validation blockers, warnings, or review-required state
- **THEN** the affected alert row shows the applicable severity and count
- **AND** the alert-set row shows rolled-up counts while its alerts are collapsed
- **AND** opening an affected alert shows the full messages and correction steps in the focused editor

### Requirement: Alert Sets Use Provider Event And Variation Hierarchy

The system SHALL organize each alert set by provider catalog context, system-defined event type, event default, and conditional variations while using stable IDs for routing and references. Provider catalog context SHALL support authoring and sample payload selection without becoming an implicit runtime eligibility condition.

#### Scenario: Variation is created from event default

- **WHEN** a user creates a variation under an event type
- **THEN** it starts from the event default design and can diverge independently
- **AND** its name needs to be unique only within that parent event type

#### Scenario: Duplicate starts disabled for review

- **WHEN** a user duplicates an alert or variation
- **THEN** the duplicate is saved disabled and marked `Needs review`

### Requirement: Alerts Support Landscape And Vertical Target Profiles

The system SHALL provide fixed landscape and vertical target profiles with independent layout, per-profile enablement, validation, safe-area guides, and output status.

#### Scenario: One valid enabled profile permits save

- **WHEN** an alert has at least one valid enabled target profile
- **THEN** the alert can be saved even if another profile is disabled or needs review

#### Scenario: Disabled vertical profile remains editable

- **WHEN** a generated vertical profile is disabled and marked `Needs review`
- **THEN** the user can edit and preview it
- **AND** it does not render live until explicitly enabled and reviewed

### Requirement: Alert Editor Is A Focused Canvas Route

The system SHALL provide a distinct focused editor route with selected-set alert tree search, target-profile switching, free-position canvas, toolbar, layer list, and right inspector.

#### Scenario: User edits geometry through canvas or inspector

- **WHEN** a user positions or resizes a visual layer
- **THEN** canvas manipulation and exact `x`, `y`, `width`, and `height` controls update the same target-profile geometry
- **AND** grid, edge, center, safe-area, zoom, and reset controls remain available

#### Scenario: Unsaved alert switch is guarded

- **WHEN** a user switches set, alert, variation, target profile, or route with unsaved editor changes
- **THEN** the system offers `Save and leave`, `Discard`, and `Cancel`
- **AND** no change is silently lost

#### Scenario: MVP layer scope is enforced

- **WHEN** a user adds a layer
- **THEN** the editor offers Text, Image, Video/GIF, Audio, TTS, and Shape only when simple shape support is implemented
- **AND** custom HTML/CSS/JS, groups, masks, multi-select, and timeline/keyframe editing are not required

## MODIFIED Requirements

### Requirement: Alert Variants Are Fully Managed

The system SHALL allow authorized management users to create, edit, enable, disable, duplicate, reset, and delete alert defaults and variations with layers, global asset references, per-profile layout, duration, conditions, weight, and priority.

#### Scenario: Alert is created from the selected set

- **WHEN** a management user chooses `Add alert` in an expanded alert set and selects a supported canonical event type
- **THEN** the system creates a disabled alert from the built-in starter template for that event type
- **AND** both target profiles and the alert are marked for review
- **AND** the focused editor opens for the new alert without changing which alert set is active
- **AND** creation failure remains visible with a human-readable cause, next step, and reference ID when available

#### Scenario: Variant with media assets is saved

- **WHEN** a management user selects visual and audio assets for an alert variation
- **THEN** the system persists global asset IDs and overlay playback renders them through overlay-safe asset URLs

#### Scenario: Asset pickers filter by layer role

- **WHEN** a management user chooses media for a visual or audio layer
- **THEN** the picker offers only compatible asset types
- **AND** it presents preview and imported metadata instead of requiring manual asset IDs or URLs

#### Scenario: Canvas and numeric edits share one layout

- **WHEN** a management user changes layer geometry on the canvas or in the inspector
- **THEN** both controls update the same `x`, `y`, `width`, `height`, and ordering values for the selected target profile

#### Scenario: Variation delete shows impact before acceptance

- **WHEN** a management user requests deletion of an alert variation
- **THEN** the system shows a confirmation with an impact summary before deletion is accepted
- **AND** the summary explains that only the selected variation and its profile layouts are removed

### Requirement: Alert Test Workflow Uses Real Matching Path

The system SHALL provide separate editor Preview and Send test workflows: Preview renders the selected saved-or-draft alert locally from sample data, while Send test sends normalized test playback through the same downstream playback and overlay path used after real event matching.

#### Scenario: Preview works without provider or overlay connection

- **WHEN** a management user previews an alert with a built-in or session-edited sample payload
- **THEN** the canvas renders the selected alert and target profile without calling a provider or requiring an overlay client
- **AND** audio and TTS remain muted unless explicitly enabled for preview

#### Scenario: Test alert reaches connected selected output

- **WHEN** a management user sends a test for a connected target profile
- **THEN** the system enqueues normalized test playback for the selected alert and output
- **AND** configured audio and TTS are included by default unless the user explicitly disables them for the editor session
- **AND** logs and history distinguish the item as test data

#### Scenario: Completed test playback leaves the overlay

- **WHEN** a rendered test instruction reaches its configured duration or reports playback failure
- **THEN** the overlay reports the terminal playback state to the server
- **AND** the terminal instruction is removed from the rendered overlay without waiting for a server response

#### Scenario: Saved alert is tested from alert-set inventory

- **WHEN** a management user chooses Test from an alert row
- **THEN** the UI uses the saved alert document and its first built-in sample payload
- **AND** one available target profile sends immediately while multiple available profiles require an explicit target choice
- **AND** success names the target profile and reference ID
- **AND** failure remains visible with a human-readable cause, next step, and reference ID

#### Scenario: Test send is blocked without connected output

- **WHEN** no browser-source client is connected for the selected target profile
- **THEN** Send test does not enqueue playback
- **AND** the UI explains how to connect or choose an available output

## REMOVED Requirements

### Requirement: Alert Collections Are Fully Managed

**Reason**: Alert sets replace collections as the saved and activatable unit required by the approved management workflow.

**Migration**: Existing collection/rule/variant data must be mapped into deterministic alert sets before the old collection management surface is removed.

### Requirement: TTS Controls Are Deferred

**Reason**: The approved editor includes a provider-neutral TTS layer and provider-owned safety settings once a compatible TTS capability is available.

**Migration**: Hide TTS layer creation until a registered compatible provider exists; do not expose provider-specific settings inside alert documents.
