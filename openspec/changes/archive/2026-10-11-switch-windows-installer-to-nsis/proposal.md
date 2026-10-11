# Proposal: Switch The Windows Installer To An NSIS Setup Wizard

## Why

The unsigned Squirrel installer from `add-windows-desktop-installer` works but shows nothing. It asks no questions, installs to `%LocalAppData%\StreamJams`, and opens the app, so the maintainer could not tell what it had done (2026-10-10). Electron Forge itself describes Squirrel as "a no-prompt, no-hassle, no-admin method", so it cannot be made clearer. The maintainer chose a setup wizard after reviewing a sourced comparison (see `design.md`). NSIS built with electron-builder is the most widely used open-source Electron route: Signal, Joplin and Bitwarden all ship it.

## What Changes

- Build `StreamJamsSetup.exe` as an assisted NSIS installer with `electron-builder`, from the already packaged Windows x64 folder (prepackaged mode, unchanged files).
- The wizard offers an install mode ("just me", the default, needs no administrator rights; or "all users" with elevation), a choice of folder, and a finish page that can start Stream Jams. It creates Desktop and Start menu shortcuts and an Apps-list entry. Its uninstaller keeps user configuration, data and credentials.
- Remove the Squirrel hook handling from the desktop main process. Every launch sets one fixed AppUserModelID, which the installer also writes into its shortcuts.
- Replace the `electron-winstaller` dependency with `electron-builder`. The CI artifact name, path and test job are unchanged; the installer test now drives the NSIS installer silently into a chosen folder.

## Out Of Scope

Code signing, durable release publication, update feeds and automatic updates (including electron-updater), MSI or MSIX packages, startup-at-login, a Windows service, and secret-store migration remain deferred under BL-030. Migrating an existing Squirrel installation is out of scope: the Squirrel build existed only as a short-lived CI artifact for one day.

## Impact

- `apps/desktop`: `squirrel-events.ts` removed; new `app-identity.ts`; small `main.ts` change; `electron-builder` replaces `electron-winstaller`.
- `scripts/make-desktop-installer.mjs` and its tests; installer summary text in `portable-desktop-artifact.mjs`.
- `tests/desktop/installer.spec.ts`.
- `windows-desktop-runtime` spec: the installer requirement describes the wizard, and an optional all-users install is allowed.
