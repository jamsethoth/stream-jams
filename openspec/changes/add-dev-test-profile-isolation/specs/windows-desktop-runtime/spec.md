## MODIFIED Requirements

### Requirement: Installer Installs Per User And Preserves User Data
The installer SHALL be an assisted setup wizard. It SHALL let the user choose between installing for the current user, the preselected default needing no administrator rights, and installing for all users after elevation. It SHALL let the user choose the installation folder and SHALL offer to start Stream Jams when it finishes. It SHALL create Desktop and Start menu shortcuts and register an uninstall entry in the Apps list. Every launch of Stream Jams in the production profile SHALL set the same AppUserModelID that the installer writes into its shortcuts. Launches in the `dev` or `test` profile SHALL instead set `io.github.jamsethoth.streamjams.dev`. Uninstall SHALL remove the installed application folder, its shortcuts and its uninstall entry while preserving configuration, data, assets, Electron user data and keyring credentials.

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
- **WHEN** the runnable folder is launched without an installation and without a profile variable
- **THEN** it runs as before and sets the same AppUserModelID as an installed copy

#### Scenario: Dev launch beside the installed app
- **WHEN** the desktop app is launched with `STREAM_JAMS_PROFILE=dev` while the installed app is running
- **THEN** it uses the app name `Stream Jams Dev`, its own Electron profile and single-instance lock, the dev AppUserModelID, and a tray labelled "Stream Jams (Dev)"
- **AND** the installed app keeps running, unaffected
