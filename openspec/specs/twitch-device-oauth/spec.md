# twitch-device-oauth Specification

## Purpose
TBD - created by archiving change replace-twitch-oauth-with-device-code. Update Purpose after archive.
## Requirements
### Requirement: Public Twitch application identity
The system SHALL use the project Twitch Client ID `r6jy78npqxcqe68xpsctkcecti6ba3` by default, SHALL permit `TWITCH_CLIENT_ID` to override it, and SHALL NOT require or ship a Twitch client secret.

#### Scenario: Default application identity
- **WHEN** the local service starts without a Twitch client override
- **THEN** Twitch OAuth and EventSub use the project Twitch Client ID

#### Scenario: Development override
- **WHEN** `TWITCH_CLIENT_ID` contains a non-empty value
- **THEN** Twitch OAuth and EventSub use the override

### Requirement: Device authorization start
The system SHALL start Twitch Device Code OAuth from a management-authenticated, rate-limited endpoint and SHALL keep Twitch's device code server-side.

#### Scenario: Authorization starts
- **WHEN** an authorized management client starts Twitch connection
- **THEN** the server requests a Twitch device authorization and returns an opaque authorization ID, verification URI, user code, expiry, polling interval, and requested scopes

#### Scenario: Sensitive device code remains private
- **WHEN** Twitch returns a device code
- **THEN** the server stores it only in ephemeral memory and excludes it from browser responses, logs, diagnostics, URLs, and SQLite

#### Scenario: Unauthorized start is rejected
- **WHEN** a client without a valid management session starts Twitch connection
- **THEN** the request is rejected before Twitch is called

### Requirement: Device authorization polling
The system SHALL poll Twitch through a management-authenticated, rate-limited endpoint, SHALL enforce Twitch's polling interval, and SHALL remove pending authorization state after success, terminal failure, or expiry.

#### Scenario: Authorization remains pending
- **WHEN** Twitch reports `authorization_pending`
- **THEN** the server returns a pending state without presenting an error to the user

#### Scenario: Browser polls early
- **WHEN** the browser polls before the next permitted time
- **THEN** the server returns a pending state without calling Twitch

#### Scenario: Authorization succeeds
- **WHEN** Twitch returns a valid token grant
- **THEN** the server validates the token and client ID, resolves the broadcaster, stores tokens through the OS credential store, persists only non-secret account metadata, reconnects EventSub, and returns the connected account

#### Scenario: Authorization is denied
- **WHEN** Twitch reports access denial
- **THEN** the server deletes pending state and returns an actionable terminal failure that allows a fresh authorization

#### Scenario: Authorization expires
- **WHEN** the local expiry passes or Twitch reports an expired or invalid device code
- **THEN** the server deletes pending state and returns an actionable terminal failure that allows a fresh authorization

#### Scenario: Poll identifier is invalid
- **WHEN** the client polls an unknown authorization ID
- **THEN** the server returns a controlled client error without calling Twitch

### Requirement: Public-client token refresh
The system SHALL refresh connected Twitch accounts with the client ID and stored refresh token, SHALL omit client secret, and SHALL replace rotated access and refresh tokens after successful validation.

#### Scenario: Refresh succeeds
- **WHEN** Twitch accepts the current refresh token
- **THEN** the system validates and stores the new token pair and preserves the account's original connection time

#### Scenario: Refresh requires reauthorization
- **WHEN** Twitch rejects an expired or invalid refresh token
- **THEN** the system fails closed and directs the user to connect Twitch again

### Requirement: Runtime token lifecycle recovery
The system SHALL validate a connected Twitch token when EventSub starts and at least hourly while the app is running, SHALL automatically refresh an invalid access token once, and SHALL reconnect EventSub with the rotated token pair without user action.

#### Scenario: Startup finds an expired access token
- **WHEN** Twitch rejects the stored access token during startup validation
- **THEN** the system refreshes and validates the token pair before creating EventSub subscriptions
- **AND** the user is not asked to authorize Twitch again

#### Scenario: EventSub subscription returns unauthorized
- **WHEN** EventSub subscription creation returns HTTP 401
- **THEN** the system stops retrying with the rejected access token, refreshes the token pair once, and reconnects EventSub

#### Scenario: Automatic refresh fails
- **WHEN** Twitch rejects the refresh token or token recovery otherwise fails
- **THEN** EventSub stops retrying the rejected credentials
- **AND** management reports an actionable reconnect requirement with a diagnostics reference ID

#### Scenario: EventSub becomes silent
- **WHEN** no notification or keepalive arrives within the session keepalive timeout
- **THEN** the system treats the connection as lost and reconnects with bounded backoff

### Requirement: Management Device Code experience
The Event Source wizard SHALL start Device Code OAuth from `Connect Twitch`, attempt to open Twitch activation, poll automatically, and keep an accessible fallback inside the wizard.

#### Scenario: Authorization is waiting
- **WHEN** Device Code OAuth starts successfully
- **THEN** the wizard displays the user code, verification link, expiry, and waiting status while polling at the server-provided interval

#### Scenario: Automatic browser opening is blocked
- **WHEN** Twitch activation cannot open automatically
- **THEN** the wizard retains an `Open Twitch` link and the user code without losing setup state

#### Scenario: Account connects
- **WHEN** polling returns a connected Twitch account
- **THEN** the wizard stops polling, displays the account, and enables the existing provider connection test

#### Scenario: Authorization fails terminally
- **WHEN** polling reports denial, expiry, invalid state, credential-store failure, or upstream failure
- **THEN** the wizard remains open with a human-readable summary, next step, stable code, reference ID when available, and retry action

#### Scenario: Wizard closes while pending
- **WHEN** the user closes the setup wizard during authorization
- **THEN** browser polling stops and no provider is registered

### Requirement: Authorization Code removal
The system SHALL remove the Twitch authorization-code callback route and SHALL NOT expose an Authorization Code or Implicit Grant fallback.

#### Scenario: Legacy callback is unavailable
- **WHEN** a client requests the former Twitch OAuth callback route
- **THEN** no callback exchange is performed
