# Task 14 report — Music backup and restore

Status: implemented on `codex/add-music-widget-module`. No user data, live Pear account, or production output was changed.

## Behavior and exact follow-on interfaces

- The existing archive's `overlay_module_config` row carries saved Music profiles, four independent brand slots, all selected title/detail font IDs, CSS source/enabled/style contract version, and module enablement. The provider registration snapshot carries only Pear's validated non-secret base URL/transport and selection metadata. The explicit SQL allowlist omits `secret_ref_json`; the archive also omits pairing client ID, tokens, remote artwork/cache, and live track state. An archive with no Music row restores the disabled module default. The versioned Music schema supplies empty/disabled CSS and no branding for supported older appearance records.
- Backup export and restore preflight run the shared `@stream-jams/core/music-style-policy` AST validation even when CSS is disabled. Preflight also checks every brand and font ID across both profiles and views against packaged asset metadata and media type. Missing or incompatible assets, invalid CSS, invalid Music config, damaged asset bytes, and unsupported archive schemas block restore before staging or database replacement.
- Restore stages validated assets, suspends the Music runtime and clears its live projection before replacing the database, then rotates the per-install Pear client ID and invalidates the pairing service's cached identity/pending attempts. Rotation waits for an in-flight initial keyring read/write before writing the new ID; an older pending `begin()` is rejected by identity epoch so it cannot publish the old ID. The restored provider has no credential reference, so it requires fresh pairing and publishes no saved track. If staging, database replacement, config reload, or runtime restart fails, the operational database/config, pairing identity, asset duration catalog, and old Music runtime are restored. Existing safety archive and database restore-point logic remain in force.
- After a successful replacement, the service retires Music secret refs discoverable from the **current provider registration records**. A keyring deletion failure keeps restore completed and returns a Diagnostics warning with remediation; it does not claim rollback. Task 12's previously superseded random access-token refs that are no longer in those records cannot be enumerated through `SecretStore` and are not automatically cleaned up. No durable cleanup retry exists.
- The production SQLite connection does not enable WAL. Portable backups are logical row snapshots plus validated asset bytes, so no raw live database file is copied. A future raw database backup must use SQLite's backup API or include/checkpoint any `-wal` companion. To return to an older incompatible binary, restore a compatible pre-upgrade binary **and** database backup; this change adds no unverified down migration.

## Files and reasons

- `apps/server/src/modules/backup/configuration-backup-service.ts`: Music restore lifecycle, pairing identity rollback, old-secret retirement warning, and backup exclusion summary.
- `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`: validate Music config/CSS and every saved brand/font reference using existing portable tables.
- `apps/server/src/modules/backup/music-backup.test.ts`: six-asset round trip, default/older schema, preflight failures, staging/database/startup rollback, and committed cleanup failure.
- `apps/server/src/modules/music/music-runtime-coordinator.ts` and test: pause/cancel live source before replacement and resume from fresh state after success or rollback.
- `apps/server/src/modules/music/pear-pairing-service.ts` and test: invalidate the cached client ID and pending attempts after rotation.
- `apps/server/src/runtime/runtime-composition.ts`: bind the restore hooks to the actual provider repository, OS-backed SecretStore, pairing service, and Music runtime.

## Verification and limits

- The prescribed Corepack command could not start because its global pnpm cache raised `EPERM`; that is an environment failure, not a behavioral RED. Source audit established the missing behavior and found the pending-keyring race; the installed workspace Vitest shim then passed 7 focused files / 101 tests, including the race regression. No artificial pre-change test run was claimed.
- `tsc -b packages/core apps/server`, targeted ESLint, and `git diff --check` passed. Full repository, browser, disposable Pear, and physical OBS/desktop acceptance remain for Tasks 15–16.
- No live credential was used. Fault tests model startup failure at the restore hook; the live adapter's asynchronous first-frame readiness remains a Task 15 protocol/acceptance gate.
