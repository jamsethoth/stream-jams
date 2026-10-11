# Design: NSIS Setup Wizard

## Context

Sources reviewed on 2026-10-10:
- electron-builder NSIS options: https://www.electron.build/docs/nsis. The default is one-click; `oneClick: false` gives the assisted wizard with an install-mode page, `allowToChangeInstallationDirectory` and `runAfterFinish`.
- electron-builder `--prepackaged`, "The path to prepackaged app (to pack in a distributable format)": https://www.electron.build/docs/cli
- electron-builder with Forge, where signing, publishing and auto-update need electron-builder as the primary tool: https://www.electron.build/docs/features/electron-forge
- Forge Squirrel maker, "a no-prompt, no-hassle, no-admin method": https://www.electronforge.io/config/makers/squirrel.windows
- Forge WiX MSI maker, which calls MSI "a worse user experience" and needs WiX Toolset v3: https://www.electronforge.io/config/makers/wix-msi
- Forge MSIX maker, "currently experimental": https://www.electronforge.io/config/makers/msix
- npm downloads from 2026-09-09 to 2026-10-08: electron-builder 22,724,074; @electron-forge/cli 6,120,308; @electron-forge/maker-squirrel 1,563,261 (api.npmjs.org).
- Open-source apps shipping NSIS via electron-builder:
  - Signal Desktop: https://github.com/signalapp/Signal-Desktop/blob/main/package.json
  - Joplin: https://github.com/laurent22/joplin/blob/dev/packages/app-desktop/package.json
  - Bitwarden: https://github.com/bitwarden/clients/blob/main/apps/desktop/electron-builder.json

## Decisions

### electron-builder in prepackaged mode

Forge keeps packaging the app folder that CI tests and publishes. `scripts/make-desktop-installer.mjs` calls electron-builder's `build()` with `prepackaged` pointing at that folder and only the `nsis` x64 target, so packaging, ASAR layout and native-module handling are untouched.
- `signAndEditExecutable: false` installs the packaged files byte for byte. The executable already carries its icon and version resources, and signing is deferred.
- `publish: null` and `differentialPackage: false` produce no update metadata.

electron-builder documents its own signing, publishing and auto-update only when it is the primary build tool. Signing the installer later (for example through SignPath Foundation) is still possible on the built files. Choosing an update mechanism stays a separate decision under BL-030.

### Assisted wizard settings

- `oneClick: false`, `perMachine: false`, `selectPerMachineByDefault: false`: the wizard shows an install-mode page and preselects the current user.
  - Per-user installs go to `%LocalAppData%\Programs\Stream Jams` and need no administrator rights.
  - All-users installs go to `Program Files\Stream Jams` after elevation (`allowElevation: true`).
- `allowToChangeInstallationDirectory: true` shows a folder page. electron-builder appends the `Stream Jams` folder name when the chosen path lacks it.
- `runAfterFinish: true` adds a "Run Stream Jams" checkbox to the finish page.
- Desktop and Start menu shortcuts are named `Stream Jams`, and the Apps-list name is `Stream Jams`.
- `deleteAppDataOnUninstall: false`. Configuration, data, assets and keyring credentials live outside the install folder, and the uninstaller does not remove them.

### App identity

`apps/desktop/src/app-identity.ts` holds `io.github.jamsethoth.streamjams`.
- electron-builder uses it as `appId`. It names the shortcuts' AppUserModelID and derives the uninstall registry GUID.
- `main.ts` sets it on every launch, including the portable folder, so tray notifications group with the installed shortcuts.
- The installer build imports it from the compiled desktop output, so the two values cannot drift.

### Squirrel removal

The Squirrel lifecycle hooks are no longer passed by any installer, so `squirrel-events.ts` and its test are removed. `main.ts` again begins with the single-instance lock.
- `electron-winstaller` stays installed only as an unused transitive dependency of electron-builder's optional Squirrel target. Its install-script approval remains, with an updated comment.

### Test

The opt-in Playwright test (`STREAM_JAMS_INSTALLER_TEST=1`, set in CI) runs the installer silently with `/S /currentuser /D=<temp folder>`. This exercises the per-user mode and the folder choice. The test then:
1. Checks the installed files, both shortcuts, and the HKCU Apps-list entry.
2. Starts the installed executable on an isolated profile and checks `/health`, then stops it.
3. Runs `Uninstall Stream Jams.exe /S` and waits for the install folder to disappear.
4. Checks that shortcuts and the Apps entry are gone and that user configuration and data remain.

The interactive pages cannot be driven in CI; their configuration is covered by unit tests of `installerConfig`.

## Risks

- electron-builder is a large build-only dependency tree. It is pinned exactly and the dependency audit gates it.
- Building the uninstaller requires Windows (other platforms need Wine), so the build command refuses to run elsewhere, as before.
- The NSIS uninstaller stops a running Stream Jams instead of using the graceful quit path. The runbook keeps the advice to quit from the tray first.
