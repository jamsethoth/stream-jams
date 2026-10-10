## RENAMED Requirements

- FROM: `### Requirement: Desktop Scope Remains A Runnable Folder`
- TO: `### Requirement: Desktop Delivery Is A Runnable Folder And An Unsigned Installer`

## MODIFIED Requirements

### Requirement: Desktop Delivery Is A Runnable Folder And An Unsigned Installer
The desktop delivery SHALL provide a runnable Windows application folder and an unsigned per-user Windows installer built from that same packaged folder. CI SHALL publish the folder and the installer as short-lived authenticated workflow artifacts after successful packaging, independently of desktop runtime tests. Such artifact names SHALL identify the platform, ref, and full commit SHA without an untested suffix, and installer artifact names SHALL also identify them as installers. Artifacts SHALL be labelled built but not desktop-test-verified in download summaries, and the folder artifact SHALL include a build-status notice. The desktop delivery SHALL NOT introduce code signing, durable release publication, update feeds or automatic updates, machine-wide installation, startup-at-login, a Windows service, portable user state, or secret-store migration.

#### Scenario: Desktop build is completed
- **WHEN** the packaging command succeeds
- **THEN** it produces a runnable Windows x64 folder and does not install, sign, create a durable release, configure an update feed, move user state beside the executable, or alter login startup behavior

#### Scenario: Installer is built
- **WHEN** the installer command runs on Windows after successful packaging
- **THEN** it produces an unsigned `StreamJamsSetup.exe` containing the packaged application files
- **AND** the packaged folder is left unchanged
- **AND** no MSI, delta package, signature, or update feed configuration is produced or published

#### Scenario: Installer is built outside Windows
- **WHEN** the installer command runs on another operating system
- **THEN** it fails with an actionable message instead of producing a partial installer

#### Scenario: Built CI artifact is published independently of runtime tests
- **WHEN** a pull-request, main-push, or manually dispatched CI run packages the runnable Windows x64 folder and installer successfully
- **THEN** CI exposes that exact folder and that installer as bounded authenticated untested workflow artifacts without changing runtime behavior, user-data paths, or credential storage
- **AND** absent or failing desktop runtime tests do not suppress their publication

#### Scenario: Desktop tests consume the published build on every CI run
- **WHEN** a pull-request, main-push, or manually dispatched CI run packages successfully
- **THEN** the separate desktop test job downloads and tests the exact folder and installer artifacts from that run without repackaging them
- **AND** test failures remain visible independently of the successful packaging result

## ADDED Requirements

### Requirement: Installer Installs Per User And Preserves User Data
The installer SHALL install without administrator rights into the current user's local application data, create Desktop and Start menu shortcuts, register an uninstall entry in the user's Apps list, and launch the installed application. Installer lifecycle hooks SHALL only create or remove shortcuts and exit without acquiring the single-instance lock or starting the local service. Uninstall SHALL remove the installed application, its shortcuts and its uninstall entry while preserving configuration, data, assets, Electron user data and keyring credentials.

#### Scenario: User runs the installer
- **WHEN** a user without administrator rights runs `StreamJamsSetup.exe`
- **THEN** Stream Jams is installed under `%LocalAppData%\StreamJams` with Desktop and Start menu shortcuts and an Apps-list entry
- **AND** the installed application starts with the user's existing profile and configured local port

#### Scenario: Installer hook runs while Stream Jams is open
- **WHEN** Squirrel runs an install, update, uninstall or obsolete hook while another Stream Jams instance is running
- **THEN** the hook process updates shortcuts as required and exits without contacting or stopping the running instance and without starting a second service

#### Scenario: Shortcut tool is unavailable or hangs
- **WHEN** `Update.exe` is missing, cannot start, or does not exit within 10 seconds during a hook
- **THEN** the hook process still exits so installation or uninstallation can continue

#### Scenario: User uninstalls Stream Jams
- **WHEN** the user uninstalls Stream Jams from the Apps list
- **THEN** the installed application files, shortcuts and uninstall entry are removed
- **AND** at most Squirrel's own updater remnants remain in a folder marked as uninstalled
- **AND** the `.stream-jams` profile, Electron user data and keyring credentials remain

#### Scenario: Portable folder is launched
- **WHEN** the runnable folder is launched outside a Squirrel installation
- **THEN** it does not set the installer AppUserModelID and behaves as before
