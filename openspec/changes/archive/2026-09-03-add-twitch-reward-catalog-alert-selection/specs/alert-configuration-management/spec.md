## ADDED Requirements

### Requirement: Channel Point Reward Conditions Support Set Membership

The alert condition contract SHALL support `channelPointReward oneOf <rewardIds>` as exact membership matching against the normalized event `rewardId`. The value SHALL contain 1 through 50 non-empty unique strings, and authoring SHALL restrict `oneOf` to the channel-point reward field in this change.

#### Scenario: Redemption matches one selected reward

- **WHEN** a channel-point redemption event's normalized `rewardId` exactly equals any ID in a rule's `channelPointReward oneOf` value
- **THEN** that condition matches
- **AND** the rule's other conditions continue to use the existing AND semantics

#### Scenario: Redemption is outside the selected set

- **WHEN** a channel-point redemption event's normalized `rewardId` equals no ID in the rule's `oneOf` value
- **THEN** that condition does not match

#### Scenario: Invalid membership condition is rejected

- **WHEN** a caller submits an empty array, more than 50 IDs, a blank ID, a duplicate ID, a non-string member, or a `oneOf` condition for another field
- **THEN** the condition is rejected at the management boundary
- **AND** the previously saved alert remains unchanged

#### Scenario: Existing exact reward condition remains compatible

- **WHEN** an existing alert contains `channelPointReward equals <rewardId>`
- **THEN** the system continues to read, edit, export, restore, and evaluate it without rewriting it to `oneOf`

### Requirement: Reward Authoring Distinguishes Catch-All From Snapshot Selection

The Add alert workflow and focused alert editor SHALL offer `Every custom reward, including future rewards` and `Selected rewards` modes for custom channel-point redemption rules. Catch-all mode SHALL persist no `channelPointReward` condition, while selected mode SHALL persist one `channelPointReward oneOf` condition.

#### Scenario: User creates a shared selected-reward alert

- **WHEN** a user creates a custom channel-point redemption alert in selected mode with two or more catalog rewards
- **THEN** the system atomically creates one disabled starter alert whose rule contains one `channelPointReward oneOf` condition with those stable IDs
- **AND** all selected rewards share that alert's design, cooldown, priority, and variations

#### Scenario: User creates a catch-all alert

- **WHEN** a user creates a custom channel-point redemption alert in catch-all mode
- **THEN** the created rule has no `channelPointReward` condition
- **AND** current and future custom reward redemptions can match it subject to its other conditions

#### Scenario: Select all captures a snapshot

- **WHEN** a user chooses `Select all currently listed` and saves the alert
- **THEN** the rule stores the IDs currently selected from that catalog response
- **AND** a custom reward created later on Twitch is not added to the saved condition automatically

#### Scenario: Selected mode has no rewards

- **WHEN** selected mode contains no reward IDs
- **THEN** the management UI prevents save or creation and explains that at least one reward is required
- **AND** it does not reinterpret the empty selection as catch-all

### Requirement: Reward Picker Uses Current Catalog Metadata Without Owning Identity

The channel-point reward picker SHALL load the linked Twitch catalog when the relevant create or edit control opens, SHALL provide explicit refresh and retry actions, and SHALL use catalog metadata only to present choices. Stable reward IDs SHALL remain the saved matching identity.

#### Scenario: Current rewards are presented for multi-selection

- **WHEN** a connected user's reward picker receives a successful catalog response
- **THEN** it presents each reward's title, cost, and applicable disabled, paused, out-of-stock, and user-input status
- **AND** every returned custom reward remains selectable
- **AND** the user can select or clear multiple rewards before saving

#### Scenario: Catalog refresh reconciles labels

- **WHEN** a user refreshes the picker after a Twitch reward title or status changes
- **THEN** the picker displays the current metadata for the same stable ID
- **AND** the draft condition remains based on the ID rather than the title

#### Scenario: Saved reward cannot be resolved

- **WHEN** a saved reward ID is absent from the current catalog because it was deleted, belongs to a previously linked account, or cannot otherwise be resolved
- **THEN** the picker preserves the ID and labels it as an unavailable reward with its ID visible
- **AND** the system does not remove or replace the selection automatically

#### Scenario: Catalog request fails while editing

- **WHEN** the catalog cannot be loaded because Twitch is disconnected, authorization is insufficient, the channel is ineligible, or the provider is unavailable
- **THEN** the UI presents the corresponding actionable state and retry or reconnect path
- **AND** existing reward conditions remain visible by ID and editable without data loss

### Requirement: Potential Shared Reward Overlap Is Visible But Allowed

The management UI SHALL warn without blocking when a channel-point redemption rule's reward coverage intersects another active rule in the current alert set or when either rule is catch-all. Live resolution SHALL continue to allow every matching active alert to play.

#### Scenario: Selected reward overlaps another active rule

- **WHEN** a user creates or edits a selected-reward rule whose IDs intersect another active selected-reward rule
- **THEN** the UI warns that the alerts may both play for the intersecting reward
- **AND** the user can intentionally save the configuration

#### Scenario: Catch-all overlaps a selected rule

- **WHEN** a catch-all custom-reward rule and an active selected-reward rule coexist in the same set
- **THEN** the UI warns that a selected reward can match both rules
- **AND** the system does not add hidden precedence or deduplication

#### Scenario: Multiple active alerts match at runtime

- **WHEN** a normalized redemption event satisfies two or more active alert rules
- **THEN** the existing resolver behavior allows every matching alert to enter playback

### Requirement: Shared Reward Samples Use Real Matching Semantics

The focused editor SHALL let the user use a selected custom reward as the current session sample, defaulting to the first selected reward when the current sample no longer matches. Preview, condition explanation, and Send test SHALL continue to use the normalized sample and existing matching paths.

#### Scenario: Selected reward becomes the session sample

- **WHEN** a user chooses a selected catalog reward for testing
- **THEN** the session sample uses that reward's stable ID and available title
- **AND** condition explanation reports the shared rule as matching subject to its other conditions
- **AND** Twitch catalog metadata is not persisted as a new built-in sample

#### Scenario: Sample is outside the selected set

- **WHEN** the current normalized sample has a `rewardId` outside the rule's saved `oneOf` value
- **THEN** condition explanation reports the rule as not matching
- **AND** Preview and Send test continue targeting the selected alert without rewriting the rule condition or claiming live rule eligibility

#### Scenario: Catch-all uses an arbitrary valid custom reward sample

- **WHEN** the rule is in catch-all mode and the user supplies a valid normalized custom-reward sample
- **THEN** no reward-membership condition prevents that sample from matching

### Requirement: Shared Reward Matching Remains Provider Independent

Shared reward selection SHALL match only the canonical normalized `rewardId` and SHALL NOT add an implicit intake-provider condition or alter Twitch EventSub subscription coverage.

#### Scenario: Direct Twitch and Streamer.bot normalize the same reward

- **WHEN** direct Twitch intake and Streamer.bot intake each produce a valid custom-reward redemption with the same normalized `rewardId`
- **THEN** the same `channelPointReward oneOf` condition produces the same match result for both events

#### Scenario: Runtime subscription remains broad

- **WHEN** direct Twitch intake starts with shared reward alerts configured
- **THEN** it continues to subscribe to broadcaster-level custom reward redemption events
- **AND** selected reward IDs are evaluated locally rather than creating per-reward EventSub subscriptions
