# Tasks

## 1. Installer build

- [x] 1.1 Add `electron-winstaller` as an exact desktop dev dependency and allow its reviewed install script.
- [x] 1.2 Add `scripts/make-desktop-installer.mjs` building `StreamJamsSetup.exe` from a copy of the packaged folder, with `pnpm desktop:installer`.
- [x] 1.3 Set the desktop package version to `0.1.0`.

## 2. Desktop lifecycle

- [x] 2.1 Add `squirrel-events.ts` for hook parsing, shortcut commands, the installed AppUserModelID, and bounded hook execution.
- [x] 2.2 Handle hooks in `main.ts` before the single-instance lock and set the AppUserModelID for installed copies.

## 3. CI

- [x] 3.1 Build, upload and summarize the installer artifact in `windows-desktop-package`.
- [x] 3.2 Download it in `windows-desktop` and run the opt-in installer test there.

## 4. Verification

- [x] 4.1 Unit tests for hook handling, installer options, and installer artifact metadata.
- [x] 4.2 Playwright install, launch, uninstall and data-retention test.
- [x] 4.3 Hosted Windows CI passes the installer test (CI run 38022728101).

## 5. Documentation

- [x] 5.1 Runbook install and uninstall instructions, unsigned warning, and data behavior.
- [x] 5.2 Update the BL-030 backlog row and product-plan open question.
