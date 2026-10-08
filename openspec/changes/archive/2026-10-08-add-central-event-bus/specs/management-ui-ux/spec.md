## MODIFIED Requirements

### Requirement: Provider Setup Separates Registration Validation And Activation

The system SHALL group providers by capability, use one wizard per setup flow, validate before registration, and allow multiple registrations. Event sources SHALL allow at most one active registration per provider kind, so different event-source kinds can be active together. Other capabilities SHALL allow at most one active provider.

#### Scenario: Invalid provider is not registered

- **WHEN** provider validation fails during setup
- **THEN** the wizard remains open and the provider is not registered
- **AND** the error includes a human-readable summary, next step, retry action, and reference ID when available

#### Scenario: Additional provider is registered inactive

- **WHEN** setup succeeds while another provider of that capability is active
- **THEN** the new provider is registered inactive
- **AND** activation remains a separate explicit action

#### Scenario: Event-source list separates usage from live health

- **WHEN** a user reviews registered event sources
- **THEN** each row shows whether the source is `In use` or `Not in use`, and more than one row can be `In use`
- **AND** each source in use shows its own transient live status as `Starting`, `Healthy`, `Reconnecting`, or `Error`
- **AND** an inactive source shows `Not running`
- **AND** saved validation details remain in the selected-provider detail instead of appearing as a redundant setup column

#### Scenario: Event-source runtime failure exposes actionable evidence

- **WHEN** an event source reports `Error` as its live status
- **THEN** selecting that source shows the current runtime cause, next step, occurrence time, and reference ID in the provider detail panel
- **AND** the detail provides an `Open diagnostics` link filtered to that reference ID
- **AND** the provider table remains compact instead of duplicating the full error message inline

#### Scenario: Event-source live status refreshes without page reload

- **WHEN** a user keeps the Event sources page open
- **THEN** the system refreshes registered-provider live status every five seconds without requiring a page reload
- **AND** the selected provider remains selected as status changes
- **AND** a refresh failure preserves the last known provider state and shows an actionable refresh error

#### Scenario: Activation reports alert impact

- **WHEN** a user requests activation of a provider whose kind is not used by all relevant active alerts
- **THEN** the system reports matched and unmatched impact before activation
- **AND** blockers prevent activation while warnings require confirmation

#### Scenario: Activation warns about overlapping Twitch sources

- **WHEN** a user activates direct Twitch while a Streamer.bot registration with Twitch forwarding is active, or the reverse
- **THEN** the confirmation explains that the same Twitch events arrive from both sources and duplicates are merged
- **AND** it links to the Streamer.bot setting that turns Twitch forwarding off
