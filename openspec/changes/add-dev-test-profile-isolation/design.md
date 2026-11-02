## Context

The [isolation evaluation](../../../docs/engineering/dev-environment-isolation.md) lists every place development and production collide on the maintainer's PC, with code references, and records the maintainer's decisions of 2026-11-02. In short:

- Stream Jams state is located by `homedir()` in three places: `apps/server/src/index.ts`, `apps/desktop/src/service-worker.ts`, and the safety-backup path in `runtime-composition.ts:1497`.
- `STREAM_JAMS_CONFIG_PATH` moves the config file. A missing file is then seeded with production-root defaults.
- `OsSecretStore` already accepts a `servicePrefix`, but nothing passes one.
- The desktop identity (app name, AppUserModelID, tray label) is fixed.
- Desktop tests isolate config and the Electron profile per test, but not credentials or backups.

## Goals / Non-Goals

**Goals:**
- Dev and test runs cannot read or write production paths, the production port, production credentials or the production Electron profile, and the refusal comes from code rather than convention.
- Installed production behaviour is unchanged, apart from writing a profile marker and refusing a dev- or test-marked data directory.
- A dev instance can run beside the production app, with its own tray, lock and port.
- Tests that forget the rules fail early instead of leaking state.

**Non-Goals:**
- Machine setup: the `C:\StreamJamsDev` folders, the portable dev OBS copy, the Twitch test account, the Windows Sandbox `.wsb` file.
- Cleaning up the 85 existing orphaned credentials or the 11 test-made backups. That has separate approval.
- Isolating the GPU, camera or audio hardware beyond the refusals in the spec.
- A real obs-websocket feature in the product. Only the test guard is added.

## Decisions

1. **One resolver, in `apps/server/src/config/`.** Add `resolveRuntimeProfile(environment, homedir)`, which returns `{ profile, home, configPath, productionRoot, credentialPrefix, defaultPort }`. The server entrypoint, the desktop main process and the service worker all call it, and nothing else reads the variables. *Alternative:* separate variables for each path. Rejected, because a forgotten variable falls back to production, which is exactly the current bug.

2. **Unset means production.** Installed shortcuts, the installer and the portable folder set no variables, so making production the default keeps them unchanged. Dev scripts and test configs set the profile explicitly. *Alternative:* default to `dev` when run from a checkout. Rejected, because the packaged app and a checkout cannot be told apart reliably.

3. **Refusals run before side effects.** `assertProfileSafe(resolved, config)` runs after the config is read, before `openStreamJamsDatabase`, `createRuntimeSecretStore` and `startServer`. The desktop main process runs the `userData` check before `app.setPath` and `requestSingleInstanceLock`. Paths are compared after `realpath` (of the nearest existing ancestor), case-insensitively on Windows, so letter case and junctions cannot bypass the check.

4. **Profile marker `profile.json` in the data directory.** This catches a moved or renamed production directory that path comparison would miss, and it guards the reverse direction. It is written with an atomic temporary file and rename, like `gpu-preference.json`.

5. **App identity is chosen before Electron resolves paths.** In `dev` and `test`, `app.setName("Stream Jams Dev")` runs first and gives `%APPDATA%\Stream Jams Dev`. `STREAM_JAMS_DESKTOP_USER_DATA_PATH` still overrides it, and is then checked against the production profile. The dev AppUserModelID and tray label come from the resolved profile. The check modes keep their temporary profiles, and the camera check gains the production-OBS refusal.

6. **Credential prefix wired through `createRuntimeSecretStore`.** It passes `servicePrefix`, so the existing format `<prefix>:<namespace>:<name>` stays the same. Test cleanup enumerates Windows credentials whose target contains `.<prefix>:` using `@napi-rs/keyring`'s credential search if it offers one, and `cmdkey /list` filtered by the exact prefix otherwise. It never deletes a target without the run's unique prefix.

7. **Test enforcement lives in `packages/test-support`.** `assertSafeTestEnvironment()` runs in Vitest `setupFiles` (node project) and in a Playwright `globalSetup` shared by all four configs. `launchStreamJamsDesktop()` wraps `_electron.launch` for the app and reuses the existing temporary-root and unused-port patterns. The bypass check is a `node --test` script added to `test:unit`, which greps `tests/desktop` for `_electron.launch` with an app entry point; fixture hosts are exempt.

8. **The OBS guard is a thin wrapper in `packages/test-support`.** It resolves the owning process with the same PowerShell `Get-NetTCPConnection` and process-path approach `obs-browser-security.spec.ts` already uses. It uses `obs-websocket-js` only when the first obs-websocket test arrives; until then, the guard's verification logic is unit-tested with an injected request function, and no dependency is added.

9. **Protected Twitch accounts by ID list.** `STREAM_JAMS_PROTECTED_TWITCH_ACCOUNT_IDS` is checked in the device-authorization completion path, before tokens are stored. With a separate prefix and database, the remaining shared resource is Twitch's per-account EventSub limit, which only an account-level refusal prevents.

## Risks / Trade-offs

- [The production marker write is a new production write] → One small file, written once into the existing data directory. Covered by a unit test and by the desktop runtime test using the production profile in a temporary home.
- [Bare `pnpm dev` and `start:local` refusing is a breaking change for the runbook and agents] → The error points to `pnpm dev:isolated`, and the runbook, `AGENTS.md` and `.env.example` are updated in the same change.
- [The realpath and case-folding comparison misses an exotic alias (subst drive, UNC loopback)] → The profile marker is the second line of defence. Add a test for `subst` if it proves cheap.
- [Credential cleanup deletes the wrong entries] → Deletion requires the exact run prefix, which includes a random run ID. It is unit-tested against a fake adapter, and it never accepts the bare `stream-jams` prefix.
- [Desktop spec migration is large (about 25 specs)] → Mechanical, one launcher. CI on `windows-2025` exercises every migrated spec.
- [Hardware deny list and Parsec display name depend on the maintainer's machine] → Both are environment configuration, not code constants, and the refusal fails closed when the configuration is missing in `dev`.

## Migration Plan

Ship in one PR. Production users see only the marker file. Developers switch to `pnpm dev:isolated` and set `STREAM_JAMS_HOME`. To roll back, revert the PR. The marker file is ignored by older builds.

## Open Questions

- Whether `@napi-rs/keyring` 2.1.0 offers credential search on Windows, or the cleanup falls back to `cmdkey`. Resolve during implementation.
- The exact display identifier used to recognise the Parsec virtual display. Resolve during implementation from `enumerateDesktopDisplays()` output on the maintainer's machine.
