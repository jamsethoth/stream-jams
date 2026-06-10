# streamerbot-protocol-client

## Purpose

Define the passive Streamer.bot WebSocket protocol client used for local event intake before persistence, management APIs, runtime wiring, diagnostics storage, UI, or action execution are introduced.

## Requirements

### Requirement: Streamer.bot Local Connection URL

The protocol client SHALL build Streamer.bot WebSocket URLs from explicit connection parts and SHALL default to the documented local Streamer.bot endpoint.

#### Scenario: Default local endpoint is used

- **WHEN** the protocol client is constructed without explicit connection parts
- **THEN** it connects to `ws://127.0.0.1:8080/`

#### Scenario: Endpoint path is normalized

- **WHEN** the protocol client is configured with protocol, host, port, and endpoint path
- **THEN** it builds the WebSocket URL using URL/path-safe APIs
- **AND** it preserves a leading slash endpoint path without duplicating slashes

### Requirement: Hello And Authentication Handshake

The protocol client SHALL parse Streamer.bot `Hello` messages and perform authentication only when the server provides authentication challenge data.

#### Scenario: Hello without authentication connects

- **WHEN** the socket receives a valid `Hello` message without `authentication`
- **THEN** the client records the instance information
- **AND** the client transitions to `connected`
- **AND** no `Authenticate` request is sent

#### Scenario: Hello with authentication challenge authenticates

- **WHEN** the socket receives a valid `Hello` message with `authentication.salt` and `authentication.challenge`
- **AND** the connection input contains a non-empty password
- **THEN** the client sends an `Authenticate` request with a generated request ID
- **AND** the authentication value is computed using the documented SHA-256/base64 challenge flow
- **AND** the client transitions to `connected` only after a successful authentication response

#### Scenario: Authentication challenge without password fails

- **WHEN** the socket receives a valid `Hello` message with authentication challenge data
- **AND** the connection input has no password
- **THEN** the client transitions to `error`
- **AND** no subscription requests are sent
- **AND** status messages do not include secret values

#### Scenario: Authentication error response fails safely

- **WHEN** an `Authenticate` response has `status` set to `error`
- **THEN** the client transitions to `error`
- **AND** all pending requests are rejected
- **AND** the socket is closed

### Requirement: Passive Streamer.bot Requests

The protocol client SHALL implement only the passive Streamer.bot request set needed for event intake.

#### Scenario: GetInfo request is correlated

- **WHEN** caller requests Streamer.bot instance info
- **THEN** the client sends a `GetInfo` request with a generated ID
- **AND** resolves the caller with the matching response `info`

#### Scenario: GetEvents request preserves category keys

- **WHEN** caller requests available events
- **THEN** the client sends a `GetEvents` request with a generated ID
- **AND** resolves the caller with the response event map without changing category key casing

#### Scenario: Subscribe request uses selected categories

- **WHEN** caller subscribes to selected events
- **THEN** the client sends a `Subscribe` request with the selected category keys and event names
- **AND** stores those selected category keys for future reconnect resubscription

#### Scenario: UnSubscribe request updates selected categories

- **WHEN** caller unsubscribes from selected events
- **THEN** the client sends an `UnSubscribe` request with the selected category keys and event names
- **AND** removes those selections from the stored reconnect subscription set

#### Scenario: Active automation requests are unavailable

- **WHEN** using the Stream Jams Streamer.bot protocol client
- **THEN** it exposes no method for `DoAction`, `SendMessage`, `ExecuteCodeTrigger`, command mutation, trigger mutation, or global variable mutation

### Requirement: Request Correlation And Failure Handling

The protocol client SHALL correlate request responses by request ID and fail pending requests deterministically on protocol failures.

#### Scenario: Response with matching ID resolves pending request

- **WHEN** a response has `status: "ok"` and an ID matching a pending request
- **THEN** only that pending request is resolved

#### Scenario: Response with error status rejects pending request

- **WHEN** a response has `status: "error"` and an ID matching a pending request
- **THEN** that pending request is rejected with a safe protocol error

#### Scenario: Unknown response ID is rejected safely

- **WHEN** a response arrives with an ID that is not pending
- **THEN** no pending request is resolved
- **AND** the client records a degraded or error status with a safe message

#### Scenario: Malformed response rejects pending request

- **WHEN** a response for a pending request is malformed
- **THEN** the pending request is rejected
- **AND** the client records a safe error status

#### Scenario: Request timeout rejects pending request

- **WHEN** a pending request does not receive a response before the configured timeout
- **THEN** the request is rejected
- **AND** the pending request is removed from the pending map

#### Scenario: Socket close rejects pending requests

- **WHEN** the socket closes while requests are pending
- **THEN** every pending request is rejected
- **AND** no pending request remains unresolved

#### Scenario: Socket error rejects pending requests

- **WHEN** the socket emits an error while requests are pending
- **THEN** every pending request is rejected
- **AND** status records a safe socket error message

### Requirement: Event Envelope Validation

The protocol client SHALL validate Streamer.bot event envelopes before forwarding them to event intake callbacks.

#### Scenario: Valid event envelope is emitted

- **WHEN** the socket receives a message with `timeStamp`, `event.source`, `event.type`, and object `data`
- **THEN** the client invokes the event callback with the envelope
- **AND** preserves `event.source`, `event.type`, `timeStamp`, and `data` unchanged

#### Scenario: Unknown source and type are accepted

- **WHEN** the socket receives a valid envelope for an unknown source/type pair
- **THEN** the client invokes the event callback
- **AND** it does not require the source/type pair to be alert-compatible

#### Scenario: Malformed event envelope is rejected

- **WHEN** the socket receives an event-like message missing `timeStamp`, `event.source`, `event.type`, or object `data`
- **THEN** the client does not invoke the event callback
- **AND** status records a safe malformed-envelope error

### Requirement: Connection Status

The protocol client SHALL expose safe connection status for runtime and diagnostics consumers.

#### Scenario: New client is idle

- **WHEN** the protocol client has not been connected
- **THEN** status state is `idle`
- **AND** connection timestamps, instance info, subscriptions, and error message are empty

#### Scenario: Connecting state is reported

- **WHEN** the protocol client opens a socket and is waiting for `Hello`
- **THEN** status state is `connecting`

#### Scenario: Connected state includes safe metadata

- **WHEN** the protocol client successfully completes the `Hello` and optional authentication flow
- **THEN** status state is `connected`
- **AND** status includes safe instance metadata, last message timestamp, selected subscription keys, and no secret values

#### Scenario: Malformed messages degrade status safely

- **WHEN** the protocol client receives malformed JSON, a malformed `Hello`, malformed response, or malformed event envelope
- **THEN** status state is `degraded` or `error` according to whether the connection can continue
- **AND** status messages omit passwords, authentication hashes, raw payloads, and secret refs

#### Scenario: Disconnect returns to idle

- **WHEN** caller disconnects the protocol client
- **THEN** the active socket is closed
- **AND** all pending requests are rejected
- **AND** status state returns to `idle`

### Requirement: Reconnect And Resubscribe

The protocol client SHALL reconnect with bounded backoff and restore selected subscriptions after a reconnect.

#### Scenario: Unexpected close schedules reconnect

- **WHEN** the socket closes unexpectedly after a connection was requested
- **THEN** the client transitions to `reconnecting`
- **AND** schedules a reconnect using the next configured bounded backoff delay

#### Scenario: Reconnect backoff is bounded

- **WHEN** repeated reconnect attempts occur
- **THEN** the scheduled delay never exceeds the maximum configured backoff delay

#### Scenario: Reconnect resubscribes stored selections

- **WHEN** a reconnect succeeds after subscriptions were selected
- **THEN** the client sends `Subscribe` for the stored subscription category keys and event names
- **AND** it preserves the stored category key casing

#### Scenario: Stale socket messages are ignored

- **WHEN** an older socket emits a message after a newer socket has been opened
- **THEN** the client ignores the older socket message
- **AND** it does not change status or resolve pending requests for the newer socket
