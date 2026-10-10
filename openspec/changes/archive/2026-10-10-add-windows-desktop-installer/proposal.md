# Proposal: Add Unsigned Windows Desktop Installer

## Why

The desktop app ships only as a runnable folder that users unzip and keep together by hand. There is no Start menu entry, no Apps-list uninstall, and replacing a build means swapping folders manually. The maintainer decided on 2026-10-09 not to pay for code signing; free signing through SignPath Foundation may follow if the repository becomes open source. An unsigned installer delivers the install experience now and leaves a clean place to add signing later.

## What Changes

- Build a per-user Squirrel.Windows installer (`StreamJamsSetup.exe`) from the already packaged Windows x64 folder with `electron-winstaller`, Electron's maintained Squirrel builder.
- Handle Squirrel install, update, uninstall and obsolete hooks in the desktop main process: create or remove Desktop and Start menu shortcuts and exit without starting the local service.
- Give installed copies the AppUserModelID that Squirrel writes into their shortcuts so tray notifications group with the app.
- Give the desktop package a release version (`0.1.0`) because Squirrel packages require one.
- Publish the installer as a second short-lived authenticated CI artifact beside the portable folder, and add an opt-in install/launch/uninstall test that CI runs on its disposable Windows user profile.

## Out Of Scope

Code signing, durable release publication, update feeds and automatic updates, MSI or MSIX packages, machine-wide installation, startup-at-login, a Windows service, and secret-store migration remain deferred under BL-030.

## Impact

- `apps/desktop`: new `squirrel-events.ts`, a small `main.ts` change, version `0.1.0`, `electron-winstaller` dev dependency.
- `scripts/`: new `make-desktop-installer.mjs`; installer commands in `portable-desktop-artifact.mjs`.
- CI `windows-desktop-package` and `windows-desktop` jobs.
- `windows-desktop-runtime` spec: the runnable-folder-only requirement now allows an unsigned per-user installer.
