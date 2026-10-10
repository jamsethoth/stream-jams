## MODIFIED Requirements

### Requirement: Desktop Delivery Is A Runnable Folder And An Unsigned Installer
The desktop delivery SHALL provide a runnable Windows application folder and an unsigned Windows setup wizard built from that same packaged folder. CI SHALL publish the folder and the installer as short-lived authenticated workflow artifacts after successful packaging, independently of desktop runtime tests. Such artifact names SHALL identify the platform, ref, and full commit SHA without an untested suffix, and installer artifact names SHALL also identify them as installers. Artifacts SHALL be labelled built but not desktop-test-verified in download summaries, and the folder artifact SHALL include a build-status notice. The desktop delivery SHALL NOT introduce code signing, durable release publication, update feeds or automatic updates, startup-at-login, a Windows service, portable user state, or secret-store migration.

#### Scenario: Desktop build is completed
- **WHEN** the packaging command succeeds
- **THEN** it produces a runnable Windows x64 folder and does not install, sign, create a durable release, configure an update feed, move user state beside the executable, or alter login startup behavior

#### Scenario: Installer is built
- **WHEN** the installer command runs on Windows after successful packaging
- **THEN** it produces an unsigned NSIS `StreamJamsSetup.exe` containing the packaged application files unchanged
- **AND** the packaged folder is left unchanged
- **AND** no MSI, differential package, signature, or update feed metadata is produced or published

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

### Requirement: Installer Installs Per User And Preserves User Data
The installer SHALL be an assisted setup wizard. It SHALL let the user choose between installing for the current user, the preselected default needing no administrator rights, and installing for all users after elevation. It SHALL let the user choose the installation folder and SHALL offer to start Stream Jams when it finishes. It SHALL create Desktop and Start menu shortcuts and register an uninstall entry in the Apps list. Every launch of Stream Jams SHALL set the same AppUserModelID that the installer writes into its shortcuts. Uninstall SHALL remove the installed application folder, its shortcuts and its uninstall entry while preserving configuration, data, assets, Electron user data and keyring credentials.

#### Scenario: User runs the installer
- **WHEN** a user without administrator rights runs `StreamJamsSetup.exe` and keeps the defaults
- **THEN** the wizard shows the install mode with the current user preselected, the installation folder, and a finish page offering to start Stream Jams
- **AND** Stream Jams is installed under `%LocalAppData%\Programs\Stream Jams` with Desktop and Start menu shortcuts and an Apps-list entry

#### Scenario: User chooses a folder
- **WHEN** the user installs into a different folder
- **THEN** the application files, shortcuts and Apps-list entry refer to that folder
- **AND** the installed application starts with the user's existing profile and configured local port

#### Scenario: User installs for all users
- **WHEN** the user chooses to install for all users
- **THEN** the installer requests elevation before installing under Program Files, and it does not install machine-wide without that choice

#### Scenario: User uninstalls Stream Jams
- **WHEN** the user uninstalls Stream Jams from the Apps list
- **THEN** the installation folder, shortcuts and uninstall entry are removed
- **AND** the `.stream-jams` profile, Electron user data and keyring credentials remain

#### Scenario: Portable folder is launched
- **WHEN** the runnable folder is launched without an installation
- **THEN** it runs as before and sets the same AppUserModelID as an installed copy
