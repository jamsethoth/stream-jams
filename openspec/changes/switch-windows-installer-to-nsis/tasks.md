# Tasks

## 1. Installer build

- [x] 1.1 Replace `electron-winstaller` with an exact `electron-builder` desktop dev dependency.
- [x] 1.2 Rewrite `scripts/make-desktop-installer.mjs` to build the assisted NSIS `StreamJamsSetup.exe` from the packaged folder.

## 2. Desktop lifecycle

- [x] 2.1 Remove Squirrel hook handling and `squirrel-events.ts`.
- [x] 2.2 Add `app-identity.ts` and set the AppUserModelID on every launch.

## 3. Verification

- [x] 3.1 Unit tests for the installer configuration and app identity.
- [x] 3.2 Playwright silent install into a chosen folder, launch, uninstall and data-retention test.
- [ ] 3.3 Hosted Windows CI passes the installer test.

## 4. Documentation

- [x] 4.1 Runbook install and uninstall instructions.
- [x] 4.2 Backlog, product plan and AGENTS.md wording.
