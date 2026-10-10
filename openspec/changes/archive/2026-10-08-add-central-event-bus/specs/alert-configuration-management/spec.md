## ADDED Requirements

### Requirement: Alerts Can Trigger On External Events
Alert rules SHALL be able to select an exact configured external event identity in addition to canonical event types. External-event alerts SHALL apply the existing alert moderation policy to viewer-controlled text.

#### Scenario: Custom Streamer.bot event plays an alert
- **WHEN** an enabled alert selects Streamer.bot source `General` type `Custom` with a configured identity and that event arrives
- **THEN** the Alerts consumer admits the alert and renders its allowlisted variables

#### Scenario: Unsubscribed external identity
- **WHEN** a user saves an alert for an external identity that no active source subscribes to
- **THEN** management shows the missing setup and links to provider configuration without expanding subscriptions

#### Scenario: Payload text is moderated
- **WHEN** an external event summary contains blocked viewer text
- **THEN** the existing moderation outcome applies before playback

### Requirement: External Event Alerts Offer Only Allowlisted Variables
External-event alerts SHALL offer only `{summary}` (the existing sanitized, 256-character external summary), `{userName}` (a bounded, sanitized string from the payload's `user.name` or `userName`, empty when absent) and `{eventType}`. Raw external payload fields SHALL NOT be offered or rendered.

#### Scenario: Payload has extra fields
- **WHEN** an external event payload includes fields such as `url` or `file`
- **THEN** the variable picker does not offer them and playback does not render them
