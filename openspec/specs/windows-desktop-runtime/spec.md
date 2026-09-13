# Windows Desktop Runtime Specification

## Purpose

Define the packaged Windows desktop application's ownership of the local runtime, durable close-to-tray behavior, bounded lifecycle, and renderer security boundaries.

## Requirements

### Requirement: Windows Application Owns The Local Runtime
The system SHALL provide a runnable Windows x64 application folder containing its runtime dependencies and built management UI. The desktop application SHALL own one local service process while preserving configured loopback URLs, the existing local data profile, OS-backed secret storage, and command-line startup.

#### Scenario: Packaged application starts outside the repository
- **WHEN** a user launches the packaged executable on supported Windows without a separate Node installation
- **THEN** the application starts its owned service and loads `/manage` from the configured local origin
- **AND** SQLite, assets, and the supported OS keyring operate without source-tree paths

#### Scenario: Existing profile is opened
- **WHEN** the desktop application starts with an existing Stream Jams profile
- **THEN** it uses that profile's configured port, data, assets, and secret references without copying or migrating credentials

#### Scenario: Port is occupied
- **WHEN** the configured local port is already occupied
- **THEN** startup reports an actionable error without automatically changing the port, attaching to the listener, or terminating its process

### Requirement: Desktop Launch Is Single Instance
The desktop application SHALL acquire a single-instance lock before starting its service and SHALL route subsequent launches to the existing desktop instance.

#### Scenario: Application is launched twice
- **WHEN** a desktop instance is already running and the executable is launched again
- **THEN** the existing management window is shown and focused
- **AND** no second service, tray icon, or database-owning desktop instance is started

### Requirement: Window Close Policy Is Durable And Explicit
The system SHALL persist `desktop.closeToTray`, default it to true, and expose an explicit desktop-only management setting. Hiding a window SHALL preserve unsaved management state; an explicit quit SHALL guard unsaved edits before stopping the service.

#### Scenario: Default close hides management
- **WHEN** a user closes the management window with close-to-tray enabled
- **THEN** the window hides and the tray remains available
- **AND** event intake and browser-source serving continue without discarding editor drafts

#### Scenario: Close-to-tray is disabled
- **WHEN** a user closes the management window with close-to-tray disabled
- **THEN** the application requests full shutdown rather than leaving a background service

#### Scenario: Quit is cancelled for unsaved edits
- **WHEN** an unsaved editor offers Save and leave, Discard, and Cancel during an explicit quit and the user chooses Cancel
- **THEN** the window and service remain running and the draft is unchanged

#### Scenario: Close preference cannot be persisted
- **WHEN** saving the close-to-tray preference fails
- **THEN** the previous preference remains authoritative and the user receives an actionable failure

#### Scenario: Configuration writes overlap
- **WHEN** desktop preference and playback safety updates are requested concurrently
- **THEN** successful updates are preserved together without a lost-update overwrite

### Requirement: Tray Controls Reuse Authoritative Playback State
The tray SHALL offer Open, Mute or Unmute according to authoritative playback state, and Quit. It SHALL NOT maintain a separate audio-mute state.

#### Scenario: Hidden application is reopened
- **WHEN** the user chooses Open from the tray
- **THEN** the existing management window is restored and focused with its draft state intact

#### Scenario: Tray changes mute
- **WHEN** the user activates the tray mute or unmute action
- **THEN** the existing persisted playback-safety command controls the result
- **AND** management, operator, and tray state reflect the same success or failure

#### Scenario: Tray Quit is chosen
- **WHEN** the user confirms any required unsaved-edit decision and chooses Quit
- **THEN** full shutdown occurs irrespective of the close-to-tray preference

### Requirement: Owned Runtime Shutdown And Failure Are Bounded
The desktop application SHALL perform idempotent graceful shutdown of owned runtime resources, use bounded startup and shutdown waits, and report unexpected service failure without silently restarting event intake.

#### Scenario: Graceful shutdown succeeds
- **WHEN** full shutdown starts
- **THEN** new intake stops, owned work and provider connections close, Fastify closes, and SQLite closes before normal process exit
- **AND** no owned service remains listening after Quit completes

#### Scenario: Multiple shutdown requests arrive
- **WHEN** close and Quit request teardown concurrently
- **THEN** they share one shutdown operation rather than closing resources twice

#### Scenario: Shutdown does not acknowledge
- **WHEN** the owned worker fails to acknowledge shutdown within 10 seconds
- **THEN** the desktop application terminates only its owned worker and reports the abnormal shutdown

#### Scenario: Worker fails or startup times out
- **WHEN** the worker exits unexpectedly or has not become ready within 20 seconds
- **THEN** management shows a failure with explicit Retry and Quit actions
- **AND** no automatic provider-reconnecting restart loop begins

#### Scenario: Windows ends the session
- **WHEN** Windows requests session termination
- **THEN** the application initiates best-effort cleanup rather than translating the event into hide-to-tray

### Requirement: Desktop Privilege Does Not Leak Into Web Content
The desktop shell SHALL use sandboxed, context-isolated renderers without Node integration, validate private IPC payloads and senders, and retain existing management authentication, CSRF, origin, rate-limit, and overlay authorization boundaries.

#### Scenario: Untrusted renderer requests desktop control
- **WHEN** a non-management origin, subframe, or unrecognized webContents requests desktop IPC
- **THEN** the request is rejected before accessing the service or filesystem

#### Scenario: Desktop preference HTTP request lacks CSRF proof
- **WHEN** a management-authenticated preference mutation has no valid session-bound CSRF proof
- **THEN** it is rejected without changing configuration

#### Scenario: Overlay requests desktop authority
- **WHEN** an overlay client possesses a valid overlay key
- **THEN** that key does not authorize desktop settings, tray commands, shutdown, or management APIs

#### Scenario: Web content attempts privileged navigation
- **WHEN** a renderer attempts an unapproved navigation or window-open operation
- **THEN** the shell blocks it or opens an explicitly permitted external HTTP(S) destination in the system browser without carrying desktop privileges

### Requirement: Desktop Scope Remains A Runnable Folder
This change SHALL deliver the runnable Windows application folder without introducing an installer, signing, publishing, automatic updates, startup-at-login, a Windows service, or secret-store migration.

#### Scenario: Desktop build is completed
- **WHEN** the packaging command succeeds
- **THEN** it produces a runnable Windows x64 folder and does not publish, install, configure an update feed, or alter login startup behavior

### Requirement: Shutdown Diagnostics Preserve Runtime Policy
Opt-in instrumentation SHALL preserve persistent management/audio sessions, Save/Discard/Cancel decisions, close-to-tray behavior and the ten-second owned-worker timeout. It SHALL NOT add automatic native termination, restart, migration, a public control API or security overrides.

#### Scenario: Cancel then explicit Quit
- **WHEN** a user cancels a dirty-edit quit and later explicitly discards or saves
- **THEN** the first attempt leaves the service running and the accepted attempt follows existing cleanup
- **AND** the diagnostic record distinguishes the attempts

#### Scenario: Log destination is unavailable
- **WHEN** logging cannot write evidence
- **THEN** original graceful Quit still executes

#### Scenario: Normal restart
- **WHEN** the application restarts after diagnostics
- **THEN** persistent profiles remain compatible and old records never cause process actions or notices
