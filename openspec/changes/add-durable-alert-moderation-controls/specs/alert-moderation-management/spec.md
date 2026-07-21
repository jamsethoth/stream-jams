## ADDED Requirements

### Requirement: Alert Moderation Policy Is Durable
The system SHALL persist one validated global rendered-text policy and one validated global TTS-text policy containing maximum length, normalized blocked terms, and URL-stripping state.

#### Scenario: Moderation policy is saved
- **WHEN** an authorized user saves a valid complete policy
- **THEN** the policy is durably written before becoming active
- **AND** subsequent alert resolution uses the new policy

#### Scenario: Policy persistence fails
- **WHEN** the validated policy cannot be persisted
- **THEN** the previous durable and active policy remains unchanged
- **AND** the user receives an actionable error with a reference ID when available

#### Scenario: Application restarts
- **WHEN** Stream Jams starts after a moderation policy has been saved
- **THEN** the saved policy is loaded before alert resolution or TTS execution begins

#### Scenario: Existing installation has no policy
- **WHEN** an existing installation is upgraded without stored moderation settings
- **THEN** canonical rendered-text and TTS defaults are persisted
- **AND** current default moderation behavior is preserved

### Requirement: Moderation Policy Is Configured Within Alerts
The management application SHALL provide an `Alert safety` route within the Alerts module with separate rendered-text and TTS policy sections, explicit Save and Revert actions, validation, and dirty-navigation protection.

#### Scenario: User opens Alert safety
- **WHEN** an authorized user opens `/manage/modules/alerts/safety`
- **THEN** the page shows the last saved maximum length, blocked terms, and URL-stripping state for both targets
- **AND** provider-owned TTS voice, rate, and volume controls remain on the active TTS provider

#### Scenario: Blocked terms are edited
- **WHEN** a user enters blocked terms containing whitespace, case duplicates, or blank entries
- **THEN** the form previews the normalized unique terms
- **AND** only the validated normalized list is saved

#### Scenario: User leaves with unsaved policy
- **WHEN** a user navigates away after changing moderation policy
- **THEN** the application offers Save and leave, Discard, and Cancel
- **AND** no change is silently lost or activated

### Requirement: One Policy Is Enforced Across Alert Text Paths
The system SHALL apply the same active rendered-text policy and TTS policy to local moderation preview, alert Preview, Send test, live playback resolution, browser speech, and provider TTS execution as applicable.

#### Scenario: Viewer-controlled text contains a blocked term and URL
- **WHEN** alert text is resolved under a policy that replaces the term and strips URLs
- **THEN** rendered and TTS instructions contain only their independently moderated output
- **AND** no downstream overlay or TTS provider receives the removed content

#### Scenario: Moderated text exceeds its limit
- **WHEN** sanitized rendered or TTS text exceeds that target's maximum length
- **THEN** it is truncated to the configured bound before leaving the core resolution boundary
- **AND** the moderation result reports a safe truncation action

#### Scenario: User previews moderation policy
- **WHEN** a user enters session-only example text on Alert safety
- **THEN** the UI shows the sanitized result and action types or counts from the same moderation rules
- **AND** the example text is not saved or written to logs

### Requirement: Moderation Outcomes Preserve Privacy
Moderation diagnostics, management errors, and action summaries SHALL NOT include original viewer text, credentials, route keys, or raw provider payloads.

#### Scenario: Moderation changes viewer text
- **WHEN** blocked terms, URLs, or excess length are removed
- **THEN** operational evidence records only action type, count or bound, target, and safe correlation metadata
- **AND** it does not record the original or removed text

#### Scenario: Unauthorized policy request is made
- **WHEN** a request without a valid management session reads, previews, or updates moderation policy
- **THEN** it is rejected before policy data is returned or changed

### Requirement: Moderation Policy Is Included In Safe Backup And Restore
Configuration backup and restore SHALL include the validated moderation policy and SHALL exclude all viewer text and moderation preview input.

#### Scenario: Configuration backup is exported
- **WHEN** a user exports a valid configuration backup
- **THEN** the archive contains the rendered-text and TTS policies
- **AND** it contains no moderation samples, original viewer text, credentials, or operational logs

#### Scenario: Valid moderation policy is restored
- **WHEN** a backup containing a valid moderation policy is restored successfully
- **THEN** the restored policy becomes durable and active after the restore transaction completes
- **AND** all alert text paths use it without restarting the application

#### Scenario: Backup contains invalid moderation policy
- **WHEN** restore preflight finds an invalid moderation policy
- **THEN** restore is blocked before any configuration is replaced
- **AND** the current durable and active policy remains unchanged
