## Why

Stream Jams needs a desktop-owned service lifetime so closing the management window does not interrupt alerts. A small Windows tray application also establishes the prerequisite process boundary for direct audio-device playback without making OBS or the management page own that playback.

## What Changes

- Add a runnable Windows x64 Electron application folder, packaged with Electron Forge, containing the existing local server and built web UI.
- Own and supervise one local service process, retain the existing loopback origin and data profile, and preserve the command-line startup path.
- Add single-instance behavior, tray Open/Mute/Unmute/Quit actions, and a persisted `Close window to tray` preference enabled by default. Disabling it makes window close request full shutdown.
- Preserve unsaved edits while hiding; guard explicit quit before teardown; handle startup failures and graceful shutdown without affecting unrelated processes.
- Add isolated desktop IPC and packaged-runtime smoke coverage while retaining management HTTP authorization, CSRF, origin restrictions, and OS-backed keyring storage.
- Keep installer creation, signing, publishing, automatic updates, startup-at-login, other packaged platforms, and `safeStorage` migration out of scope. Production device playback belongs to the dependent routing change.

## Capabilities

### New Capabilities

- `windows-desktop-runtime`: Packaged Windows startup, owned service lifecycle, single-instance behavior, tray controls, close preference, and desktop security boundaries.

### Modified Capabilities

- `configuration-backup-restore`: Include the desktop close preference in portable configuration and operational rollback with compatibility defaults.
- `production-entrypoint-validation`: Verify the packaged Windows entry point, native runtime dependencies, and owned-process cleanup independently of source-tree execution.

## Impact

- Add `apps/desktop`; extend server runtime exports, configuration contracts/store, runtime composition, management Settings, and backup integration. No Electron imports enter `apps/web` or framework-independent core domain logic.
- Add exactly pinned Electron/Forge build dependencies, desktop build/test commands, Windows packaging validation, Storybook/Playwright coverage, and runbook instructions.
- This is the first of two changes. [Alert audio routing](../2026-09-07-add-alert-audio-routing/proposal.md) must verify this prerequisite is implemented before wiring device playback.
- [Implementation plan](../../../../docs/superpowers/plans/2026-09-03-windows-desktop-tray-runtime.md). The remaining distribution work stays in BL-030; this proposal does not authorize implementation or publication by itself.
