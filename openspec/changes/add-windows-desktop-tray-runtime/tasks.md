## 1. Execution And Dependency Gate

- [x] 1.1 Confirm scope/current remote/worktree and start the implementation branch from current origin/main without discarding these planning artifacts.
- [x] 1.2 Read the design, all capability deltas, and the linked implementation plan; commit the slice-specific spec before or with implementation.
- [x] 1.3 Resolve and exactly pin compatible Electron/Forge dependencies without expanding installer/updater/secret-storage scope.

## 2. Shared Runtime Lifecycle

- [x] 2.1 Add the side-effect-free server runtime subpath and use it from CLI and desktop worker.
- [x] 2.2 Make runtime close idempotent and stop intake/timers/providers/Fastify/SQLite on success and partial startup failure.
- [x] 2.3 Add startup, import-side-effect, duplicate-close and CLI signal regression tests; run focused server tests and typecheck.

## 3. Configuration And Restore

- [x] 3.1 Add desktop.closeToTray defaults/patches and serialize config writes without lost concurrent safety updates.
- [x] 3.2 Add desktop capability/config API with authentication, CSRF, origin and rate-limit regression tests.
- [x] 3.3 Include preference in backup restore/rollback and propagate restored state to the desktop host without closing it.
- [x] 3.4 Verify old config defaults, failed persistence, concurrent updates and exact rollback behavior.

## 4. Desktop Host And Tray

- [x] 4.1 Add the desktop workspace, single-instance guard, worker supervisor and validated request-ID/generation IPC.
- [x] 4.2 Load isolated management with no Node integration; validate sender/frame/origin and reject unapproved navigation/privileged windows.
- [x] 4.3 Add Open, authoritative Mute/Unmute and Quit tray actions; preserve normal operator navigation.
- [x] 4.4 Implement close-to-tray versus full shutdown, 20-second startup/10-second stop deadlines, explicit failure recovery and Windows session-end cleanup.
- [x] 4.5 Test duplicate launch, occupied port, worker failure, stale messages, kill ownership and repeated shutdown with injected process boundaries.

## 5. Management UX

- [x] 5.1 Add desktop-only Settings controls through typed management APIs with loaded/loading/error/unavailable stories and keyboard tests.
- [x] 5.2 Bridge explicit quit to Save and leave / Discard / Cancel without losing drafts on hide or stopping service before confirmation.
- [x] 5.3 Add Settings/dirty-editor/desktop Playwright coverage and run relevant frontend gates.

## 6. Packaged Verification And Documentation

- [x] 6.1 Stage and Forge-package a self-contained unsigned Windows x64 folder including native keyring dependencies and built web assets.
- [x] 6.2 Add Windows CI/package smoke proving non-repo launch, health, SQLite, isolated keyring operations, preference restart and no owned listener after Quit.
- [x] 6.3 Perform interactive Windows tray, duplicate-launch, port-conflict, unsaved-quit and session-end checks; record actual evidence and gaps.
- [x] 6.4 Update runbook/architecture guidance and preserve deferred BL-030 distribution scope.
- [x] 6.5 Reconcile every requirement, run lint/typecheck/tests/build/Storybook/Playwright/desktop/OpenSpec gates, and verify the rebuilt workflow before marking implementation complete.
