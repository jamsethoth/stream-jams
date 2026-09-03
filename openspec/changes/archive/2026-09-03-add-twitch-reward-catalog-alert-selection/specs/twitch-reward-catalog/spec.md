## ADDED Requirements

### Requirement: Linked Broadcaster Custom Reward Catalog

The system SHALL retrieve the custom channel-point rewards owned by the currently linked Twitch broadcaster using that account's user access token and SHALL expose the catalog only through a rate-limited, management-authenticated server endpoint.

#### Scenario: Authorized management user lists custom rewards

- **WHEN** an authorized management user requests the catalog while a Twitch broadcaster with the required scope is linked
- **THEN** the server requests that broadcaster's custom rewards from Twitch using the server-held access token
- **AND** the response contains all custom rewards returned by Twitch, up to Twitch's 50-reward limit
- **AND** the access token is not returned to the browser or written to logs

#### Scenario: Missing management session is rejected

- **WHEN** a client without a valid management session requests the custom reward catalog
- **THEN** the server rejects the request before reading the linked account or calling Twitch

#### Scenario: Linked account is unavailable

- **WHEN** an authorized management user requests the catalog without a connected Twitch account or with an account missing `channel:read:redemptions`
- **THEN** the system returns an actionable disconnected or reconnect-required result
- **AND** the system does not return a partial catalog

### Requirement: Catalog Uses Sanitized Stable Reward Metadata

The catalog SHALL identify rewards by Twitch's stable custom reward ID and SHALL return only validated metadata needed for management selection: title, prompt, cost, background color, user-input requirement, and enabled, paused, and in-stock state.

#### Scenario: Inactive custom rewards remain available

- **WHEN** Twitch returns a custom reward that is disabled, paused, or out of stock
- **THEN** the catalog includes the reward with its current status
- **AND** the server does not filter it from authoring choices

#### Scenario: Provider-specific extras are omitted

- **WHEN** Twitch returns reward images, provider URLs, or additional raw fields
- **THEN** the management response omits those fields
- **AND** the response remains valid against the Stream Jams catalog contract

#### Scenario: Non-custom rewards are outside the catalog

- **WHEN** the linked channel has automatic Twitch rewards or Power-Ups
- **THEN** the custom reward catalog does not synthesize or include them
- **AND** the operation does not fetch redemption history

### Requirement: Catalog Retrieval Is On Demand And Recovers Once From Authorization Failure

The system SHALL fetch the reward catalog on demand without persisting it and SHALL use the existing Twitch token lifecycle to retry exactly once after an authorization failure.

#### Scenario: Expired token is refreshed successfully

- **WHEN** Twitch rejects the first catalog request because the access token is no longer authorized
- **THEN** the system validates or refreshes the linked account through the existing token lifecycle
- **AND** the system retries the catalog request once with the recovered token
- **AND** a successful retry returns the catalog normally

#### Scenario: Authorization recovery fails

- **WHEN** the catalog retry remains unauthorized or the linked account cannot be refreshed
- **THEN** the system returns an actionable reconnect-required result
- **AND** the system does not retry indefinitely

#### Scenario: Empty catalog succeeds

- **WHEN** Twitch successfully returns no custom rewards
- **THEN** the system returns a successful empty catalog rather than an upstream failure

#### Scenario: Broadcaster is ineligible for custom rewards

- **WHEN** Twitch reports that the linked broadcaster is not eligible to use custom rewards
- **THEN** the system returns a distinct actionable ineligible-channel result
- **AND** the system does not misreport the account as disconnected

#### Scenario: Upstream response fails validation

- **WHEN** Twitch is unavailable or returns a response that fails the catalog schema
- **THEN** the system returns a bounded provider-error result with retry guidance
- **AND** provider tokens and raw response bodies are not exposed
