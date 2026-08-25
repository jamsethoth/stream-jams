## ADDED Requirements

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
