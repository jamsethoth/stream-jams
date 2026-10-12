## ADDED Requirements

### Requirement: Voice Is A Disabled-By-Default Overlay Module
The system SHALL provide a native `voice` overlay module that is disabled by default, renders the streamer's current Discord call through ordinary landscape and vertical module browser sources and explicitly selected desktop surfaces, emits no audio, and SHALL NOT publish joins, leaves or speaking changes to the central event bus.

#### Scenario: Module is enabled with a connected source
- **WHEN** Voice is enabled, a Discord voice source is connected and the streamer is in a call
- **THEN** every enabled Voice output shows the same roster and speaking state from one Discord connection

#### Scenario: Speaking does not trigger other modules
- **WHEN** a participant starts speaking or joins the call
- **THEN** no event is journaled on the central event bus and no alert, effect, timer or video rule runs

### Requirement: Discord Connection Uses The Streamer's Own Application Over Local IPC
The system SHALL connect to the Discord desktop client only through its local IPC pipes using a Discord application created and owned by the streamer, identified by its Client ID. The system SHALL NOT use Discord's WebSocket RPC transport, another application's Client ID or token service, a Discord bot, a modified Discord client, or automation of the Discord Developer Portal.

#### Scenario: Discord is not running
- **WHEN** Voice is enabled and no Discord IPC pipe accepts a connection
- **THEN** status is "Waiting for Discord", live output is transparent, and connection attempts continue with bounded backoff that never exceeds two attempts per minute after repeated failures

#### Scenario: Discord starts or restarts
- **WHEN** Discord becomes reachable while Voice is enabled and stored credentials are valid
- **THEN** the source authenticates without a Discord prompt and resumes following the current call

#### Scenario: Voice is disabled
- **WHEN** the Voice module is disabled
- **THEN** the Discord connection is closed and no reconnect attempts run

### Requirement: Discord Credentials Stay In The Secret Store
The system SHALL authorize with scopes `rpc` and `identify`, SHALL prefer PKCE with a Public Client application and no client secret, and SHALL fall back to a streamer-supplied client secret only when the recorded spike shows PKCE is rejected. Access tokens, refresh tokens and any client secret SHALL be stored only in the OS-backed secret store, refreshed before expiry, and kept out of SQLite, config files, logs, diagnostics exports, backups, browser bundles and overlay URLs.

#### Scenario: Token refresh
- **WHEN** the access token nears expiry or Discord reports an invalid token
- **THEN** the server refreshes once, stores rotated tokens and re-authenticates without a Discord prompt

#### Scenario: Authorization is revoked
- **WHEN** refresh fails or Discord closes the connection as token revoked
- **THEN** live output clears, status is "auth-required", and management offers Reconnect
- **AND** the server never sends a new authorization request on its own

#### Scenario: Backup and restore
- **WHEN** configuration is backed up and restored
- **THEN** the Client ID, appearance and overrides round-trip, no token or secret is exported, and the restored source asks the user to reconnect

### Requirement: Setup Wizard Automates Every Step Discord Allows
Management SHALL provide a Discord voice setup wizard that detects Discord and its signed-in account before authorization, opens the Developer Portal in the default browser, offers copyable suggested values, validates the pasted Client ID format inline, requests authorization with a visible 60-second cancellable wait, maps each failure to the step that fixes it, and finishes by showing the live current call. The wizard SHALL NOT complete or register a usable source until authorization and authentication succeed.

#### Scenario: Discord detected before setup
- **WHEN** the wizard opens while Discord is running
- **THEN** it shows the Discord account found locally and enables the next step without asking for credentials

#### Scenario: Invalid Client ID
- **WHEN** the user pastes a value that is not a Discord application ID, or Discord rejects the ID
- **THEN** the wizard stays on the Client ID step with an inline correction and no source is registered

#### Scenario: Public Client is off
- **WHEN** the token exchange fails because the application is not a public client
- **THEN** the wizard explains how to turn on Public Client and retries authorization when asked

#### Scenario: User denies or ignores the Discord prompt
- **WHEN** the user denies authorization or 60 seconds pass, or the user cancels
- **THEN** setup stays incomplete with a retry action and a late result cannot register or activate the source

#### Scenario: Setup succeeds
- **WHEN** authorization and authentication succeed
- **THEN** the source is registered and selected, the wizard shows the current call roster live, and the Voice module stays in its existing enabled or disabled state

### Requirement: Voice Follows The Current Call With A Normalized Roster
The server SHALL follow the call the streamer is in, including server voice channels, DMs and group DMs, replacing the roster whenever the streamer changes or leaves a call. Snapshots SHALL be normalized and bounded (at most 100 participants) with channel kind and name, and per participant: ID, display name (nickname, then global name, then username), avatar reference, speaking, self and server mute and deafen, and bot flag. Overlays SHALL never receive raw Discord payloads or contact Discord hosts.

#### Scenario: Streamer switches calls
- **WHEN** the streamer moves from one voice channel to another
- **THEN** subscriptions move to the new channel and outputs show only the new call's participants

#### Scenario: Streamer leaves the call
- **WHEN** the streamer leaves all calls
- **THEN** the roster is empty and outputs follow the configured empty behavior

#### Scenario: Avatars load locally
- **WHEN** a participant has a custom Discord avatar
- **THEN** the server fetches it only from the Discord CDN host, bounds and caches it, and outputs load it from an overlay-authorized Stream Jams path; participants without one use bundled default avatars

### Requirement: Voice Appearance Is Brandable With Shared Module Patterns
The Voice editor SHALL follow the shared module editing patterns: browser sources, production-renderer preview with a mock roster, Configuration, collapsed Appearance, Custom CSS confined like Music's, the shared shadow setting and independent desktop placement. Configuration SHALL include layout (vertical list, horizontal row, avatar grid), show names, participant order (join order or alphabetical, optional speaking first), who to show (everyone, speaking only, or only listed participants), hide self, hide bots, and empty-call behavior. Appearance SHALL include speaking highlight style, idle dimming, avatar shape and size, name typography and colors, and spacing.

#### Scenario: Preview does not touch live output
- **WHEN** the user edits appearance or previews the mock roster
- **THEN** only the preview changes until Save, and no mock data reaches live outputs

#### Scenario: Live failure is transparent
- **WHEN** the source is waiting for Discord, needs authorization, fails or the module is disabled
- **THEN** live outputs are transparent without setup text or secrets, and management shows the cause and recovery action

### Requirement: Per-Participant Overrides
The system SHALL let the streamer save overrides per Discord user ID: hidden, display name, idle image and speaking image from the asset library. Overrides SHALL persist across restarts, be included in backups, and apply in every Voice output. Participants seen in the current or recent calls SHALL be offered for selection.

#### Scenario: Reactive images
- **WHEN** a participant has idle and speaking images and starts speaking
- **THEN** every Voice output swaps to the speaking image and back to the idle image when they stop

#### Scenario: Hidden participant
- **WHEN** a participant is marked hidden
- **THEN** no Voice output shows them, including their name and avatar

### Requirement: Operator Voice Controls
The operator UI SHALL show the Voice connection status, the current call and its participants with live speaking indicators, and SHALL offer persisted controls to hide or show the Voice overlay and to hide or show an individual participant.

#### Scenario: Operator hides the overlay
- **WHEN** the operator hides Voice
- **THEN** all Voice outputs become transparent until shown again, including after an app restart

#### Scenario: Operator hides a participant
- **WHEN** the operator hides a participant from the operator panel
- **THEN** the participant's hidden override is saved and every output removes them
