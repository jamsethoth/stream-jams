# Verification

Implemented set → effect → variant navigation with one active set. Existing effect documents migrate unchanged into Default. New and copied sets are inactive; activating a set is transactional and affects subsequent live admissions. Active-set deletion is rejected. Queued snapshots and explicit confirmed saved tests retain their existing behavior.

## Checks

- Affected server/UI Vitest: 18 files, 205 tests passed. Added stale activation save regression subsequently passed with the affected route tests (2 files, 11 tests).
- Chromium: existing two effect workflows passed; the new single-active-set, collapsed variants, deep-link reload and dirty navigation workflow passed separately.
- Storybook: 2 suites, 14 scenarios passed, including axe checks and active/inactive set coverage.
- Workspace typecheck, lint, build and Storybook production build passed. Existing bundle-size warnings remain.
- Strict OpenSpec validation passed.
- Persistence coverage includes populated schema upgrade, unique names, transactional copy rollback, active deletion guard, activation during asynchronous admission, configuration backup/restore and older backup upgrade.

## Live evaluation

Rebuilt isolated runtime at http://127.0.0.1:39188, using `.playwright-mcp/effect-sets-profile`. Verified real set creation, activation and reload, then a disabled sample effect with two variants. Module and sample effect remain disabled, with no triggers or output destinations. Inspected the production editor and inventory in the in-app browser.

The normal-profile database was backed up using SQLite online backup with integrity_check=ok to `.playwright-mcp/before-effect-sets-20260916-215358`. One saved effect was present. The earlier CLI evaluation session ended; port 39187 is now owned by the packaged desktop app from worktree f1e5, so that app was left running. The new runtime uses separate storage. Normal-profile migration by this build and physical OBS/audio output acceptance were not performed.

One Storybook run overlapped a build and lost its injected browser context during Vite reloads; after the build finished all 14 scenarios passed. Initial browser fixture failures were corrected (set query matching, missing module config mock, and effect-specific variant selection).
