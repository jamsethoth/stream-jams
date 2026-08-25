# alert-configuration-management

## Purpose

Define management UI behavior for configuring alert collections, rules, variants, media, layout, and local test alerts.
## Requirements
### Requirement: Alert Rules Are Fully Managed

The system SHALL allow authorized management users to create, edit, enable, disable, and delete alert rules with event type, collection membership, conditions, cooldown, and priority.

#### Scenario: Rule with condition is saved

- **WHEN** a management user creates a cheer rule with a minimum amount condition
- **THEN** the system persists the rule and applies that condition during alert matching

#### Scenario: Minimal normalized condition fields are available

- **WHEN** a management user configures rule conditions
- **THEN** the first release exposes normalized `amount`, `tier`, and `rewardId` condition fields
- **AND** broader provider or actor fields are not required in this change

#### Scenario: Rule delete shows impact before acceptance

- **WHEN** a management user requests deletion of an alert rule
- **THEN** the system shows a confirmation with an impact summary before deletion is accepted
- **AND** the summary explains that deleting the rule also deletes its conditions and variants

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

### Requirement: Variation Priority Is Authored As Ordered Groups

The alert editor SHALL present conditional variations in ordered priority groups and SHALL map group order to deterministic saved integer priority while allowing multiple variations to share one priority.

#### Scenario: Priority group is moved

- **WHEN** a user moves a priority group earlier or later and saves
- **THEN** the group's variations receive normalized priorities preserving the displayed group order
- **AND** unchanged sibling groups retain their relative order

#### Scenario: Variation joins an existing priority group

- **WHEN** a user moves a variation into another priority group
- **THEN** it receives the same saved priority as that group's variations
- **AND** its relative chance becomes meaningful within that group when conditions match

#### Scenario: Default alert is displayed

- **WHEN** an event's default alert is shown with its variations
- **THEN** the default remains the fallback rather than a draggable conditional priority group

#### Scenario: Existing default-priority tie remains unchanged

- **WHEN** a saved conditional variation has the same effective priority as the default and the user has not changed group order or membership
- **THEN** the sample explanation includes the default and matching tied variations using current live relative-chance semantics
- **AND** their saved priorities remain unchanged until an explicit group edit normalizes every conditional sibling above the default

### Requirement: Variation Weight Is Presented As Relative Chance

The alert editor SHALL label weight as relative chance and SHALL calculate sample-specific percentages only among enabled matching variations in the highest eligible priority group.

#### Scenario: Multiple top-priority variations match

- **WHEN** two or more enabled variations in the highest eligible group match the selected sample
- **THEN** the editor shows each candidate's percentage from its positive weight and the group's total weight
- **AND** it explains that live selection remains random

#### Scenario: One top-priority variation matches

- **WHEN** exactly one variation in the highest eligible group matches
- **THEN** the editor identifies it as the effective selection with 100 percent relative chance

#### Scenario: No conditional variation matches

- **WHEN** the selected sample matches no enabled conditional variation
- **THEN** the editor reports that the event default is the fallback
- **AND** it does not show a misleading percentage for ineligible variations

### Requirement: Conditions Use Event-Specific Typed Controls

The alert editor SHALL derive condition fields, approved operators, value controls, bounds, and summaries from the selected normalized event type and SHALL persist the existing provider-independent condition contract.

#### Scenario: Numeric event field is configured

- **WHEN** a user selects a numeric field such as raid viewers or cheer amount
- **THEN** the editor offers applicable equals, minimum, maximum, or range operators
- **AND** it renders bounded numeric controls appropriate to the selected operator

#### Scenario: Enumerated event field is configured

- **WHEN** a user selects a field such as subscription tier, status, stream type, or ingest provider
- **THEN** the editor offers approved values through a labelled selection control
- **AND** it does not require raw provider payload entry

#### Scenario: Range is invalid

- **WHEN** a range minimum exceeds its maximum or a required value is missing
- **THEN** save is blocked with a field-specific correction message
- **AND** the last saved conditions remain active

#### Scenario: Unsupported saved condition is preserved read-only

- **WHEN** an existing condition is outside the approved catalog and the user leaves it unchanged
- **THEN** the editor presents it read-only and the server round-trips it unchanged or allows it to be removed
- **AND** the server rejects adding, modifying, or duplicating an unsupported condition without changing the saved alert

### Requirement: Sample Evaluation Explains Variation Selection

The editor SHALL evaluate rule and variation conditions against the selected built-in or session sample without enqueueing playback and SHALL explain eligibility, highest-priority group, relative chance, and fallback. Preview and Send test SHALL continue targeting the selected alert document rather than running sibling selection.

#### Scenario: Sample payload changes

- **WHEN** a user selects or edits a valid sample payload
- **THEN** the explanation updates from the current draft conditions, priority groups, enabled state, and weights
- **AND** it uses the same condition semantics as live resolution

#### Scenario: Sample payload is invalid

- **WHEN** the session sample does not validate as the selected normalized event type
- **THEN** selection explanation and preview are blocked
- **AND** the editor shows the sample validation error without changing saved alert behavior

#### Scenario: Explanation does not retarget playback

- **WHEN** the sample explanation updates while a default or variation is selected
- **THEN** no playback is enqueued by the explanation
- **AND** Preview renders and Send test sends the selected alert document rather than a sibling chosen by the explanation

### Requirement: Shared Rule Impact Remains Explicit

The editor SHALL distinguish rule-wide conditions, cooldown, and rule priority from variation-only conditions, priority group, and relative chance.

#### Scenario: Rule-wide setting is edited from a variation

- **WHEN** a user changes a rule-wide condition, cooldown, or rule priority while editing one variation
- **THEN** the editor names that the change affects the default and all sibling variations
- **AND** existing dirty-state and live-impact confirmation rules apply before save

#### Scenario: Variation-only setting is edited

- **WHEN** a user changes the selected variation's conditions, priority group, or relative chance
- **THEN** sibling variation settings remain unchanged
- **AND** the updated selection behavior is reflected in the sample explanation

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

#### Scenario: Defaults and variations keep stable editor identities

- **WHEN** alert inventory and focused-editor documents are projected from a stored rule
- **THEN** the event default uses the rule ID as its editor route key
- **AND** each conditional variation uses its variant ID and links to the parent rule ID
- **AND** saving one variation preserves every sibling variation and its independent profile layouts

#### Scenario: Matched variation uses its own saved design

- **WHEN** live or test matching selects a conditional variation
- **THEN** playback loads the editor document keyed by that variation ID
- **AND** it does not substitute the event default's saved design

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

### Requirement: Focused Alert Editor Preserves Context And Workspace
The focused alert editor SHALL remain a distinct management route while retaining loaded set and alert context and using the available desktop or tablet viewport.

#### Scenario: Focused editor opens
- **WHEN** a user opens an alert from a selected set
- **THEN** the editor shows a compact breadcrumb containing Alerts, the loaded set name, and the current alert name
- **AND** Back returns to the loaded set rather than trusting stale optional route state

#### Scenario: Wide editor viewport is available
- **WHEN** the editor is rendered on a wide desktop
- **THEN** the focused route is not constrained by the normal 1280px management-content cap
- **AND** alert tree, canvas, and inspector use independently scrollable workspace regions

#### Scenario: Intermediate editor viewport is available
- **WHEN** the editor is between 701 and 980 CSS pixels wide
- **THEN** the canvas and alert tree remain usable
- **AND** the inspector moves to its own full-width workspace row instead of creating an uncontrolled page-length column

#### Scenario: Narrow editor viewport is used
- **WHEN** the editor is 700 CSS pixels wide or narrower
- **THEN** authoring controls are hidden behind the existing clear larger-screen message

### Requirement: Alert Template Variables Match Normalized Event Data
The alert editor SHALL present only variables relevant to the selected normalized event type and SHALL render those variables consistently in preview, test, and live playback.

#### Scenario: Event actor name is inserted
- **WHEN** a user inserts `User name`
- **THEN** the editor writes `{userName}`
- **AND** live playback resolves it from the normalized event actor display name
- **AND** legacy saved `{actor.displayName}` templates continue to render without appearing as a second user-facing actor-name choice

#### Scenario: Event-specific variables are offered
- **WHEN** the editor loads an alert event type
- **THEN** its variable picker contains only the approved aliases that describe useful data for that event
- **AND** gift alerts distinguish recipient and gifter names
- **AND** broadcaster/system events do not show `User name`
- **AND** generic amounts, internal IDs, raw timestamps, arbitrary metadata, choices, and outcomes are not offered

#### Scenario: Template context is consistent
- **WHEN** an approved variable is rendered in local preview, server test send, or live playback
- **THEN** every path resolves it through the same normalized template-context mapping
- **AND** a nullable value renders as empty text

#### Scenario: Saved template uses a compatibility key
- **WHEN** a saved template contains a previously supported key that is no longer offered for insertion
- **THEN** preview, test, and live playback continue to resolve that key
- **AND** the compatibility key does not appear in the variable picker

### Requirement: Alert Text Layers Support Validated Typography
The system SHALL allow authorized management users to configure a text layer's local font preset, font size, font weight, line height, horizontal alignment, vertical alignment, text color, and optional text shadow through bounded provider-independent fields.

#### Scenario: Text typography is saved
- **WHEN** a user changes valid typography values and saves the alert
- **THEN** the values persist on the selected text layer
- **AND** they remain shared while landscape and vertical profiles retain independent geometry

#### Scenario: Unsupported font is submitted
- **WHEN** an alert document contains an unknown font preset or external font value
- **THEN** boundary validation rejects the document
- **AND** no external font resource is requested

#### Scenario: Typography value is outside bounds
- **WHEN** a size, weight, line height, color, or shadow value is invalid or outside its approved bounds
- **THEN** save is blocked with a field-specific correction message

### Requirement: Alert Text Layers Support Simple Box Styling
The system SHALL allow a text layer to configure a bounded background color, padding, corner radius, and optional box shadow within its existing layer geometry.

#### Scenario: Text background is configured
- **WHEN** a user applies valid text-box styling
- **THEN** the canvas treats the saved geometry as the outer styled box
- **AND** padding and text alignment render inside that box

#### Scenario: Box styling is cleared
- **WHEN** a user removes background and shadow styling and returns padding and radius to zero
- **THEN** the layer renders without a visible box treatment
- **AND** its text template and geometry are preserved

### Requirement: Styled Alerts Render Consistently Across Workflows
The system SHALL derive editor canvas, local preview, Send test, and live browser-source presentation from the same validated style contract.

#### Scenario: Styled alert is previewed and sent
- **WHEN** a saved or draft styled alert is rendered in local preview and the saved alert is sent through the test path
- **THEN** typography, colors, alignment, padding, radius, and shadows match the selected profile design
- **AND** live resolution does not introduce raw CSS or provider-specific presentation data

#### Scenario: Production styling cannot be rendered
- **WHEN** a styled layer cannot be safely rendered in production
- **THEN** the overlay fails closed and transparent
- **AND** the operator receives actionable diagnostics without viewer-visible error content

### Requirement: Existing Alert Appearance Is Preserved
Existing text layers SHALL receive explicit compatibility defaults that preserve the pre-change fixed text appearance when stored documents are migrated or parsed.

#### Scenario: Existing alert document is loaded
- **WHEN** a stored text layer has no style fields
- **THEN** parsing supplies the compatibility typography and box defaults
- **AND** the alert remains visually equivalent before the user changes its style

#### Scenario: Existing alert is saved after upgrade
- **WHEN** a user saves an upgraded existing alert
- **THEN** its explicit style fields are persisted in the current schema
- **AND** backup and restore round-trip those fields without loss

### Requirement: Style Controls Remain Focused And Accessible
The focused editor SHALL expose style controls only for a selected text layer using labelled native inputs and SHALL preserve keyboard authoring, dirty-state, undo, redo, and validation behavior.

#### Scenario: Non-text layer is selected
- **WHEN** a selected layer does not support text or box styling
- **THEN** text-style controls are not shown
- **AND** the layer's existing applicable controls remain available

#### Scenario: Style edit is undone
- **WHEN** a user changes a style value and invokes Undo
- **THEN** the prior validated style is restored in both the form and canvas
- **AND** Redo can reapply the change

#### Scenario: Major layer section is collapsed
- **WHEN** a user toggles a major selected-layer editor section
- **THEN** its controls hide or reappear through a keyboard-accessible native disclosure
- **AND** collapsing the section does not change draft alert data

#### Scenario: Multiple enabled profiles require review
- **WHEN** an alert already has multiple enabled profiles marked `Needs review`
- **THEN** the user can mark and save each profile as reviewed incrementally
- **AND** the system still rejects newly enabling any profile that remains `Needs review`

#### Scenario: Selected profile requires review
- **WHEN** the selected target profile is marked `Needs review`
- **THEN** its warning bar above the canvas exposes a keyboard-accessible `Mark reviewed` action
- **AND** activating the action updates only the selected profile's draft review state
- **AND** the editor remains unsaved until the user invokes the existing `Save` action
- **AND** the warning and inline action are hidden after the profile is marked reviewed

### Requirement: Grouped Expanded Event Creation
The alert-management UI SHALL allow users to create alerts for every event in the expanded canonical catalog and SHALL group related choices under Subscriptions, Hype Train, Polls, Predictions, and Stream.

#### Scenario: User creates an expanded event alert
- **WHEN** a user opens the new-alert workflow
- **THEN** the expanded event types are presented in their approved groups with human-readable labels
- **AND** selecting one creates an alert for that exact canonical type

#### Scenario: Existing and starter sets are loaded
- **WHEN** the expanded event catalog is deployed
- **THEN** existing alert sets remain unchanged
- **AND** starter-set creation does not automatically add the expanded event alerts

### Requirement: Expanded Event Samples
Every expanded event type SHALL provide built-in normal and edge-case sample payloads that validate against its normalized event schema and can use the existing preview and send-test workflows.

#### Scenario: User previews an expanded event
- **WHEN** a user opens an expanded event alert and selects a built-in sample
- **THEN** the sample exposes normalized fields appropriate to that event type
- **AND** local preview and send-test construct the same canonical event shape used by live intake after sample construction

#### Scenario: Gift samples explain event frequency
- **WHEN** a user reviews gift-subscription or community-gift samples
- **THEN** the UI distinguishes per-recipient gift events from aggregate community-gift events

### Requirement: Expanded Normalized Conditions
The alert condition editor SHALL expose useful scalar normalized fields for the expanded event type and SHALL NOT expose arbitrary raw provider metadata.

#### Scenario: Event-specific conditions are edited
- **WHEN** a user edits conditions for a gift, Hype Train, poll, prediction, or stream alert
- **THEN** the editor offers applicable normalized tier, count, level, progress, total, status, or stream-type fields
- **AND** unavailable fields for that event type are not offered

#### Scenario: Ingest-provider restriction remains available
- **WHEN** a user edits any expanded Twitch-origin alert
- **THEN** the existing optional direct-Twitch or Streamer.bot ingestion-provider restriction remains available
