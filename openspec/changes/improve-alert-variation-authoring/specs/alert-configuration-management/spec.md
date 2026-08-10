## ADDED Requirements

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
