## Context

Electron Forge 8 packages `apps/desktop/.stage` into `apps/desktop/out/Stream Jams-win32-x64` with `api.package`; Forge makers are not configured. The staged project has only runtime dependencies, so Forge could not resolve maker modules from it. CI publishes the folder as an authenticated artifact and a separate job tests that exact artifact. User configuration, data and assets live in the `.stream-jams` profile under the user's home, Electron user data lives under `%AppData%`, and credentials live in the OS keyring; none are inside the application folder.

## Goals / Non-Goals

**Goals:** a double-click installer that needs no administrator rights, creates Desktop and Start menu shortcuts, registers an Apps-list uninstall entry, launches the app after install, and leaves user data untouched on uninstall. The build must not change the tested portable folder, and signing must be addable later without restructuring.

**Non-Goals:** signing, releases, update feeds, MSI/MSIX, machine-wide install, startup-at-login.

## Decisions

### Squirrel.Windows through electron-winstaller

Squirrel is Electron Forge's default Windows installer, needs no administrator rights, and is the format Electron's built-in `autoUpdater` understands, which keeps the deferred update work open. `electron-winstaller` is the Electron project's maintained builder, which `@electron-forge/maker-squirrel` wraps. The script calls it directly because Forge's maker would need to be resolvable from the staged project and adds nothing beyond defaults. It also accepts `windowsSign`, the hook a later SignPath or certificate change will use.

WiX MSI was rejected because it needs the WiX toolset on the runner and targets machine-wide IT deployment. MSIX was rejected for now because sideloaded MSIX requires a trusted signature.

`electron-winstaller` has an install script that copies its vendored 7-Zip binary for the host architecture. It is reviewed and allowed in `pnpm-workspace.yaml`.

### Build from a copy of the packaged folder

`electron-winstaller` writes `Squirrel.exe` into its input directory. The script copies the packaged folder to a temporary directory first, so the portable artifact and the installer contain identical application files. The installer is built before the portable `BUILD-STATUS.txt` notice is written.

### Package identity

The Squirrel package id is `StreamJams` (Squirrel rejects hyphens). It sets the install directory `%LocalAppData%\StreamJams` and the shortcut AppUserModelID `com.squirrel.StreamJams.StreamJams`. The id lives in `apps/desktop/src/squirrel-events.ts` and the build script reads it from the compiled module so the two cannot drift. Setup is named `StreamJamsSetup.exe`, without spaces, which also avoids a known signing-tool problem with spaced paths.

### Lifecycle hooks before the single-instance lock

Squirrel runs the app with `--squirrel-install|updated|uninstall|obsolete` and waits for it to exit. The main process checks this first argument before acquiring the single-instance lock, runs `Update.exe --createShortcut` or `--removeShortcut` for `Desktop,StartMenu`, and exits. The hook never starts the service, so an update can finish while another instance runs. A missing `Update.exe`, spawn failure or a hang over 10 seconds still exits, keeping Squirrel's 15-second hook budget. `--squirrel-firstrun` starts the app normally. A small handler was chosen over `electron-squirrel-startup` because that package spawns the same command but has no timeout and no tests here, and the behavior is four branches.

### Version

Squirrel needs a `MAJOR.MINOR.PATCH` version. The desktop package moves from `0.0.0` to `0.1.0`. Every CI build of a commit uses the same version until a release policy exists; reinstalling the same version reinstalls in place.

### CI publication and test

The packaging job builds the installer, uploads only `StreamJamsSetup.exe` as `stream-jams-windows-x64-installer-<ref>-<sha>` with 30-day retention, and records name, digest, URL and unsigned status in the job summary. The Squirrel `RELEASES` file and `.nupkg` are not published because update feeds are out of scope. The desktop test job downloads the installer and runs `tests/desktop/installer.spec.ts`, which installs with an isolated config inherited by the post-install launch, checks files, shortcuts, the uninstall registry entry and `/health`, then uninstalls and checks everything is removed while config and data remain. The spec only runs when `STREAM_JAMS_INSTALLER_TEST=1`, because it changes the current Windows user's Start menu and Apps list; CI sets it on its disposable runner profile.

## Risks / Trade-offs

- Unsigned Setup triggers SmartScreen and an "Unknown publisher" prompt. Documented, with the planned free signing route recorded in BL-030.
- Squirrel uninstall terminates a running app instead of using the graceful quit path. User data is outside the install directory and SQLite uses WAL recovery; documented as "quit before uninstalling".
- Squirrel.Windows itself receives little upstream development. It remains Electron Forge's default and the format Electron's `autoUpdater` supports; a different installer can replace it later without changing user data.
