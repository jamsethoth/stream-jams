# music-source-providers

## Purpose

Define registered Music source contracts, authenticated Pear Desktop delivery, authoritative playback state, bounded artwork, and secret-safe portability.

## Requirements

### Requirement: Music Sources Use Existing Provider Registration
The system SHALL register validated music sources through the existing provider lifecycle under the `music-source` capability, permit at most one active music source, and keep music activation independent of event-source and TTS activation. The first successfully registered music source SHALL be selected when none is active; further registrations SHALL remain inactive until explicitly activated. Testing SHALL NOT activate a provider.

#### Scenario: Music setup preserves event intake
- **WHEN** Pear setup validates successfully while Twitch is the active event source
- **THEN** Pear can become the active music source without replacing Twitch or changing its subscriptions
- **AND** the disabled-by-default Music module remains disabled

#### Scenario: Failed setup and inactive test
- **WHEN** pairing or selected-transport validation fails, or an inactive registration is tested
- **THEN** failed setup creates no usable registration and testing does not change the selected music source
- **AND** management provides a corrective action with redacted diagnostics

### Requirement: Music State Is Normalized And Transport Independent
Each adapter SHALL expose bounded connection testing, start, full snapshot/status publication, snapshot reading and idempotent stop through the common contract. Normalized snapshots SHALL contain provider/generation/revision identity, nullable track/session, playback state, nullable position/duration in milliseconds and server observation time. Provider-specific frames, secrets and upstream authenticated artwork URLs SHALL remain server-side. The renderer SHALL NOT branch on provider kind.

#### Scenario: Push and polling sources provide equivalent music state
- **WHEN** push and polling test adapters describe the same track, pause and seek observations
- **THEN** both produce the same display semantics through the production renderer
- **AND** authentication and transport differences remain inside their adapters/setup controllers

#### Scenario: Missing metadata and unsupported observations
- **WHEN** album, artwork, position or duration is unavailable
- **THEN** absent values remain explicit and the shared display uses appropriate fallbacks
- **AND** unknown duration is not converted into a zero-length song or a fabricated progress percentage

#### Scenario: Session selection is provider specific
- **WHEN** a session-selecting test adapter is configured for one session
- **THEN** only that session contributes a normalized snapshot and other sessions cannot replace its track

### Requirement: Pear Pairing And Transport Require Credentials
Pear setup SHALL use an explicit pairing action against `POST /auth/{id}`, durable OS-backed token storage after successful registration, bearer-authenticated REST and token-authenticated WebSocket connections. Pairing SHALL time out after 60 seconds and be cancellable. WebSocket readiness SHALL require a validated initial `PLAYER_INFO` within five seconds of connection, not just socket open. The supported initial protocol baseline SHALL be Pear Desktop 3.12.0.

#### Scenario: Pair and reconnect after application restart
- **WHEN** the user approves pairing in Pear configured with `AUTH_AT_FIRST`, completes setup and restarts Stream Jams over the same profile
- **THEN** Stream Jams retrieves the token from its secret store and requests current playback through an authenticated transport
- **AND** no token is stored in module config, SQLite, renderer storage or browser-source URLs

#### Scenario: Pairing is rejected cancelled or times out
- **WHEN** Pear denies pairing or setup is cancelled or exceeds its deadline
- **THEN** setup remains incomplete with an actionable status and no late result can register, activate or publish music

#### Scenario: Socket opens before rejecting authentication
- **WHEN** Pear opens a socket and closes it with code 1008 before an authenticated initial snapshot
- **THEN** validation fails with auth-required status and no connected success or track is published

#### Scenario: Healthy source has no song
- **WHEN** authenticated initialization returns an empty `PLAYER_INFO` or HTTP 204 in polling mode
- **THEN** setup can validate successfully with empty playback rather than requiring the user to play music

### Requirement: Authentication Failures Never Downgrade Transport Security
Pear SHALL support `auto`, `ws` and `poll` modes. Auto fallback SHALL preserve authentication. WS close 1008 and HTTP 401/403 SHALL clear live music, stop automatic reconnect/pairing loops and request explicit credential recovery. Pear endpoints SHALL be loopback-only with validated ports and matched HTTP/WS or HTTPS/WSS schemes; TLS certificate validation SHALL remain enabled. Credential-bearing redirects SHALL be rejected.

#### Scenario: Auto falls back on transport unavailability
- **WHEN** the WS endpoint is unavailable but authenticated REST is usable
- **THEN** auto mode continues with authenticated polling and reports the transport accurately
- **AND** WS-only mode reports failure instead of treating an HTTP-only test as success

#### Scenario: Token is revoked during operation
- **WHEN** a request returns 401/403 or a socket closes with 1008
- **THEN** live output becomes transparent and management offers explicit reconnect/pairing
- **AND** no unauthenticated retry or automatic repeated pairing prompt occurs

#### Scenario: Unsafe endpoint is supplied
- **WHEN** setup receives a non-loopback host, embedded userinfo, invalid port or a TLS certificate validation failure
- **THEN** it rejects the connection with a non-secret correction message
- **AND** it does not disable TLS verification or change the Stream Jams listen address

### Requirement: Adapter Lifecycles Reject Obsolete Work
The runtime SHALL bound requests, frame size, reconnect delays and pending state, serialize polling, and cancel outstanding work on stop, module disable or provider switch. Each adapter generation SHALL prevent prior requests, sockets, timers and artwork completions from publishing. Transient reconnects SHALL use bounded backoff; rate-limited requests SHALL honor `Retry-After`.

#### Scenario: Poll resolves after disconnect
- **WHEN** an in-flight poll finishes after its generation has stopped
- **THEN** it cannot publish state or change live status back to connected

#### Scenario: Rapid source switch and slow requests
- **WHEN** the selected source changes while a request or socket initialization is pending
- **THEN** its result is ignored, the new source alone owns publication, and no overlapping poll/retry resources accumulate

#### Scenario: Malformed or oversized provider input
- **WHEN** a provider sends invalid JSON, invalid normalized values or a frame larger than 256 KiB
- **THEN** the runtime rejects the input with redacted diagnostics, retains no unbounded raw buffer, and resynchronizes or fails closed

### Requirement: Empty And Stale Playback Cannot Persist Live
The runtime SHALL clear track and progress for an explicit empty observation, disconnect, authentication failure, disable or source switch. Healthy WS sessions SHALL reconcile current state at least every 15 seconds when not rate limited. A snapshot older than 45 seconds without a successful observation SHALL be stale and transparent live. Management SHALL distinguish last known stale evidence from current state.

#### Scenario: Song disappears after playing
- **WHEN** a successful observation reports HTTP 204 or no current song after a playing snapshot
- **THEN** the previous track, artwork and progress are cleared

#### Scenario: Connected socket silently stops delivering useful state
- **WHEN** no successful observation or reconciliation occurs for 45 seconds
- **THEN** the widget hides and management reports stale state instead of advancing an old track indefinitely

#### Scenario: Partial update and new track
- **WHEN** a position-only event arrives for a known track or a new track arrives without album/artwork
- **THEN** the partial update preserves current metadata, while the new track cannot inherit the preceding track's album/artwork

### Requirement: Artwork Is Served Through Authorized Bounded Access
The system SHALL provide opaque artwork references and authorized image delivery for management, browser output and private desktop recipients. It SHALL validate provider-owned origins, destination addresses, redirects, MIME/content, size and decoding bounds; it SHALL NOT expose an arbitrary URL proxy. Fetches SHALL time out after five seconds, images SHALL be at most 2 MiB and 4096 pixels per side, and cache retention SHALL be bounded to 16 MiB and 32 items. Unsupported artwork SHALL use a placeholder without hiding otherwise valid text.

#### Scenario: Artwork requires provider credentials
- **WHEN** an adapter resolves protected artwork
- **THEN** only the server attaches credentials and the recipient receives an opaque authorized local image reference

#### Scenario: Unsafe image or unauthorized recipient
- **WHEN** an image resolves outside the adapter's allowed destination policy, contains HTML/SVG, exceeds bounds, or is requested with a wrong-purpose/revoked key or obsolete source generation
- **THEN** delivery is rejected without exposing credentials or local network content

### Requirement: Configuration Is Durable And Portable Without Secrets
Music registration, selection, enablement and presentation SHALL survive normal restarts. Credentials SHALL use the existing durable secret store and fail closed when unavailable. Portable backups SHALL include non-secret Music configuration while excluding credentials, credential references, pairing identities, cached artwork and current playback. Restore SHALL require fresh pairing; failed restore SHALL preserve the previous operational state and credentials.

#### Scenario: Successful portable restore
- **WHEN** a Music configuration backup is restored
- **THEN** display settings and non-secret registration metadata survive, a fresh pairing identity is used, and live music remains transparent until pairing and validation succeed

#### Scenario: Credential store or database save fails
- **WHEN** token persistence or registration save fails
- **THEN** setup cannot report success or fall back to plaintext storage and compensating cleanup leaves no usable partial registration

#### Scenario: Restore rolls back
- **WHEN** configuration replacement fails
- **THEN** prior registration/settings/credential access are restored together without deleting the old credentials before successful replacement

### Requirement: Music Secrets Are Redacted At Every Boundary
The system SHALL redact tokens, authorization headers, credential references and token-bearing HTTP/WS/WSS URLs from logs, error causes, diagnostics, configuration exports, UI responses and renderer payloads. Management errors SHALL provide a human-readable next action and a stable failure reference when available.

#### Scenario: Authentication failure contains a URL and nested cause
- **WHEN** a Pear connection fails with credential-bearing values in its message, request metadata or serialized cause
- **THEN** exported diagnostics and management errors contain only redacted evidence with a usable failure reference

### Requirement: Artwork trust belongs to the active provider
The server SHALL obtain a private artwork policy from the active provider generation and deny artwork without a policy. Public CDN policies SHALL allow only declared HTTPS domain families with dot-boundary matching and exclusively public validated DNS answers. Configured-server policies SHALL permit only the explicitly selected exact scheme, host and port, including private destinations for that origin. Track metadata SHALL NOT select or broaden trust. Shared fetching SHALL pin DNS, reject redirects, enforce existing raster/time/cache limits, isolate credentials and revalidate cached images and grants against current policy.

#### Scenario: Provider changes CDN subdomain
- **WHEN** Pear supplies artwork from another subdomain of `ytimg.com` or `googleusercontent.com`
- **THEN** automatic fetching uses the shared protections without a per-image approval
- **AND** suffix-spoofed domains and private CDN DNS answers are rejected

#### Scenario: Configured local server
- **WHEN** an adapter declares a configured-server origin
- **THEN** only that exact origin can use private-address artwork fetching and no other origin inherits the exception
- **AND** withdrawing the active policy makes existing cache and grants unavailable
