# management-ui-ux Specification

## Purpose
TBD - created by archiving change refactor-management-ui-ux. Update Purpose after archive.
## Requirements
### Requirement: Management Is A Configuration Surface

The system SHALL present management as an offline setup and configuration surface and SHALL keep live operator controls outside the MVP management experience.

#### Scenario: Management opens on setup Home

- **WHEN** a management user opens the application root
- **THEN** the system shows Home with setup readiness, the active alert-set summary, and actionable problems
- **AND** it does not show a live moderation queue or raw logs

#### Scenario: Operator console remains out of implementation scope

- **WHEN** the management UI refactor is complete
- **THEN** no runtime `/operator` console is required by this change
- **AND** operator-console Penpot artifacts remain design references only

### Requirement: Management Uses Stable Route-Based Navigation

The system SHALL provide route-based navigation for `Home`, `Event sources`, `TTS providers`, `Modules > Alerts`, `Assets`, `Diagnostics`, and `Settings` using stable identifiers for nested resources.

#### Scenario: Deep link restores management context

- **WHEN** a user opens a valid deep link to a provider, alert, asset usage, diagnostic reference, or settings action
- **THEN** the system opens the owning page and restores the identified context
- **AND** editable display names are not used as route identity

#### Scenario: Obsolete top-level pages are removed

- **WHEN** replacement workflows are available
- **THEN** `Dashboard`, `Twitch`, `Overlays`, and `Playback` no longer appear as top-level management navigation items

### Requirement: Home Readiness Is Derived And Actionable

The system SHALL derive Home readiness from validated external service connections, starter alert-set review, and browser-source output state, and SHALL link each incomplete action to its correction flow.

#### Scenario: Provider readiness requires validation

- **WHEN** a provider has saved settings but has not passed validation
- **THEN** Home shows that setup item as incomplete
- **AND** its action opens the relevant provider setup or detail flow

#### Scenario: Setup action opens exact correction location

- **WHEN** a user activates a Home next action
- **THEN** the system opens the relevant wizard, selected alert set, browser-source section, or diagnostic correction target

### Requirement: Provider Setup Separates Registration Validation And Activation

The system SHALL group providers by capability, use one wizard per setup flow, validate before registration, allow multiple registrations, and enforce at most one active provider per capability in MVP.

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
- **THEN** each row shows whether the source is `In use` or `Not in use`
- **AND** the source in use shows transient live status as `Starting`, `Healthy`, `Reconnecting`, or `Error`
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

### Requirement: Management Interactions Are Explicit Accessible And Traceable

The system SHALL use explicit domain saves, dirty-state guards, consistent confirmations, keyboard-operable controls, non-color status cues, System/Dark/Light themes, reduced-motion behavior, and actionable failures.

#### Scenario: Dirty domain state blocks navigation

- **WHEN** a user navigates away from unsaved provider, alert-set, alert-editor, asset, or restore state
- **THEN** the system offers `Save and leave`, `Discard`, and `Cancel` where saving is valid
- **AND** no unsaved change is silently lost

#### Scenario: Failure provides a recovery path

- **WHEN** a user-facing operation fails
- **THEN** the system shows a human-readable summary, known cause, next step, severity, useful timestamp, and reference ID when available
- **AND** it provides a correction deep link when the owning surface is known

#### Scenario: Expired management session is renewed

- **WHEN** an authenticated management request is rejected because its local session expired or no longer exists
- **THEN** the management client creates a replacement session and retries the request once
- **AND** the user does not need to reload the page to restore management polling or actions

#### Scenario: Canvas is unavailable on narrow mobile

- **WHEN** a user opens the focused alert editor below the supported canvas width
- **THEN** the system shows a clear larger-screen requirement
- **AND** management status and simple non-canvas edits remain readable on mobile
