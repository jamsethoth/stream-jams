## ADDED Requirements

### Requirement: Configured Event Types Are Primary In Grouped Alert Surfaces
Alert Sets and focused-editor navigation SHALL initially display event groups containing at least one configured alert and SHALL provide an explicit unchecked Show unused event types control that reveals the complete canonical catalog without changing stored alert data, selection, or drafts.

#### Scenario: Configured and unused events are loaded
- **WHEN** a set contains alerts for only some canonical event types
- **THEN** the default grouped view shows each event with a stored default or variation
- **AND** disabled-only and invalid configured groups remain visible with their warnings
- **AND** unused canonical event groups remain hidden until Show unused event types is enabled

#### Scenario: Search has no matches
- **WHEN** search or filters match no configured alert after event visibility is determined from the unfiltered inventory
- **THEN** the surface explains that no alerts match
- **AND** it offers the existing filter-clearing action instead of treating configured groups as unused

#### Scenario: Unused events are revealed
- **WHEN** Show unused event types is enabled
- **THEN** every canonical event group appears in catalog order
- **AND** turning it off does not discard editor drafts or change the selected alert

#### Scenario: Alert set is completely empty
- **WHEN** a valid alert set contains no stored alerts
- **THEN** the surface presents a concise create-alert action
- **AND** it retains access to Show unused event types and the complete catalog

#### Scenario: Alert is created in an unused event
- **WHEN** creation succeeds for a formerly unused event type
- **THEN** that event becomes visible in the default grouped view
- **AND** the Add alert flow remains able to choose every supported canonical event type regardless of current visibility
