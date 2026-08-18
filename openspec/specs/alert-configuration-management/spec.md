# alert-configuration-management

## Purpose

Define management UI behavior for configuring alert collections, rules, variants, media, layout, and local test alerts.

## Requirements

### Requirement: Alert Collections Are Fully Managed

The system SHALL allow authorized management users to create, edit, activate, and delete alert collections while preserving exactly one active collection after alert-set initialization.

#### Scenario: Collection is updated

- **WHEN** a management user edits an alert collection name without changing activation
- **THEN** the updated collection is persisted and shown in the alert editor

#### Scenario: Collection delete shows impact before acceptance

- **WHEN** a management user requests deletion of an alert collection
- **THEN** the system shows a confirmation with an impact summary before deletion is accepted
- **AND** the summary explains that deleting the collection removes collection membership links without deleting alert rules or variants

#### Scenario: Sole active collection is disabled without replacement

- **WHEN** a supported mutation attempts to disable the only active collection without selecting another collection
- **THEN** the mutation is rejected
- **AND** the existing active collection remains active

#### Scenario: Another collection is activated

- **WHEN** a management user activates an eligible inactive collection
- **THEN** the prior active collection is disabled and the selected collection is enabled atomically
- **AND** exactly one collection remains active

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

The system SHALL allow authorized management users to create, edit, enable, disable, and delete alert variants with text, media assets, layout, duration, weight, and priority.

#### Scenario: Variant with media assets is saved

- **WHEN** a management user selects visual and audio assets for an alert variant
- **THEN** the system persists the asset IDs and overlay playback can render the referenced media through overlay-safe asset URLs

#### Scenario: Asset pickers filter by playback role

- **WHEN** a management user chooses media for an alert variant
- **THEN** the visual picker offers only image, GIF, and video assets
- **AND** the audio picker offers only audio assets
- **AND** the UI presents imported asset metadata instead of requiring manual asset ID or overlay URL entry

#### Scenario: Numeric layout edits show a static preview

- **WHEN** a management user edits layout fields for an alert variant
- **THEN** the system exposes numeric `x`, `y`, `width`, `height`, and `zIndex` controls
- **AND** the UI shows a static preview of the configured placement and sizing
- **AND** the UI does not require an interactive drag-and-drop canvas in this change

#### Scenario: Variant delete shows impact before acceptance

- **WHEN** a management user requests deletion of an alert variant
- **THEN** the system shows a confirmation with an impact summary before deletion is accepted
- **AND** the summary explains that deleting the variant removes only that variant

### Requirement: Alert Test Workflow Uses Real Matching Path

The system SHALL provide a local rule-editor test alert workflow that sends realistic sample events through the same matching, resolution, and playback path used by provider events after sample-event construction.

#### Scenario: Test cheer alert is enqueued

- **WHEN** a management user runs a sample cheer event from a saved rule editor and the event matches an enabled rule
- **THEN** the system resolves matching variants and enqueues playback for connected overlays

#### Scenario: Test alert is distinguished from real provider alert

- **WHEN** a management user runs a test alert
- **THEN** the UI labels the event as local test data
- **AND** the system does not call Twitch or EventSub to create the test event
- **AND** the UI reports success, no-match, cooldown, or error state in the rule editor

### Requirement: TTS Controls Are Deferred

The alert editor SHALL NOT expose provider-specific TTS configuration until the Speaker.bot TTS capability is implemented.

#### Scenario: TTS provider is not available

- **WHEN** the Speaker.bot TTS capability has not landed
- **THEN** alert editing does not present a provider-specific TTS control that cannot be saved and played

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
