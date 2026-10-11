## ADDED Requirements

### Requirement: Event Sources Can Be Edited In Place
Management SHALL let the user rename any event source and change a Streamer.bot source's protocol, host, port, endpoint, password and unauthenticated-local setting. Changes SHALL pass the same validation as registration before anything is saved, and the stored secret SHALL be replaced only after validation passes. Module triggers SHALL NOT change.

#### Scenario: Correcting a Streamer.bot port
- **WHEN** the user edits an active Streamer.bot source's port and validation passes
- **THEN** the source is saved with the new port and reconnects
- **AND** every alert rule, effect, timer and Videos trigger keeps working without changes

#### Scenario: Edit fails validation
- **WHEN** the edited settings fail validation
- **THEN** the registration and its stored secret are unchanged and the user sees the validation error

### Requirement: Deleting A Source Suspends Only Stranded Triggers
Management SHALL show which triggers would lose their only delivering source before deleting. Deletion SHALL remove the registration and suspend those triggers with the reason "Source removed" in one transaction, then remove the stored secret. Triggers another registration can still deliver SHALL stay enabled.

#### Scenario: Deleting the only Streamer.bot source
- **WHEN** the user confirms deleting the only Streamer.bot source
- **THEN** Streamer.bot-only triggers are suspended and shown as "Source removed"
- **AND** triggers with `any` source keep running while another event source remains

#### Scenario: Deleting the source in use
- **WHEN** the user deletes the active source, or a source whose deletion would suspend triggers
- **THEN** the confirmation lists the affected triggers, the consequence and the recovery path, and requires typed confirmation

#### Scenario: Deleting one of two sources of a kind
- **WHEN** another registration of the same kind remains
- **THEN** no trigger is suspended

#### Scenario: Deleting the Twitch source
- **WHEN** the user deletes the Twitch event source
- **THEN** the Twitch account stays connected for the reward catalog and Videos lookups

### Requirement: Suspended Triggers Are Re-enabled Only By The User
Suspended triggers SHALL stay suspended until the user re-enables or edits them. When a source that can deliver a suspended trigger exists, management SHALL offer a one-click re-enable.

#### Scenario: Source of the same kind is added back
- **WHEN** the user registers a Streamer.bot source after the previous one was deleted
- **THEN** management lists the suspended Streamer.bot triggers with a re-enable action
- **AND** none of them fires until the user re-enables it

### Requirement: Replacing A Source Keeps Triggers Enabled
Management SHALL let the user replace a registered source with a new validated source of the same kind. Before confirming, it SHALL show what will keep matching and what will not. Confirming SHALL carry over Streamer.bot subscriptions and forwarding, activate the new source if the old one was active, and delete the old one in one step without suspending any trigger.

#### Scenario: Replacing Twitch with a different channel
- **WHEN** the replacement Twitch source belongs to a different channel
- **THEN** the impact lists the saved rewards that will not match
- **AND** after confirming, those rewards show "Reward unavailable" in their modules

### Requirement: Unavailable Twitch Rewards Are Flagged And Fixable Per Module
A saved Twitch reward SHALL be flagged "Reward unavailable" when its channel is not the connected one or its ID is not in the connected channel's reward catalog. Alert rules, Screen Effects, timer rules and Videos channel-point mappings SHALL show the flag with a reward picker, and saving a replacement SHALL clear it.

#### Scenario: Reward deleted and recreated on Twitch
- **WHEN** a Screen Effect's reward ID is no longer in the catalog
- **THEN** the effect editor shows "Reward unavailable" for that trigger
- **AND** choosing the recreated reward and saving makes the trigger match again
