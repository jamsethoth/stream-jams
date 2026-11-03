## 1. Profile resolution and refusals (server)

- [x] 1.1 Add `resolveRuntimeProfile` to `apps/server/src/config/` (profile, home, config path, production root, credential prefix, default port) with unit tests for unset, `dev`, `test`, an unknown value, and a missing or relative home
- [x] 1.2 Seed new `dev` and `test` configs from the profile home and port instead of `createDefaultAppConfig(homedir())`
- [x] 1.3 Add `assertProfileSafe` (split into `assertProfileLocationSafe` before the config is touched and `assertProfileConfigSafe` after it is read): production root paths (realpath, case-insensitive), port 39187, `stream-jams` prefix. Tests cover every refusal, including case and junction aliases
- [x] 1.4 Add the `profile.json` marker (atomic write) and the two-way marker refusal, with tests
- [x] 1.5 Route `apps/server/src/index.ts` (including the emergency log) and the safety-backup path in `runtime-composition.ts` through the resolved home, and run the refusals before SQLite, the credential store and the listener open
- [x] 1.6 Pass the profile `servicePrefix` through `createRuntimeSecretStore`, with tests showing `dev` and `test` never touch `stream-jams:` entries

## 2. Desktop identity and checks

- [x] 2.1 Resolve the profile in `apps/desktop/src/main.ts` before any `getPath`: set the `dev` and `test` app name, check `userData` against the production profile, and use the dev AppUserModelID
- [x] 2.2 Service worker home: no change needed. The utility process inherits the profile environment and the composition resolves the same profile from it
- [x] 2.3 Tray label "Stream Jams (Dev)" and an orange-badged dev tray icon
- [x] 2.4 `dev` and `test` defaults: playback muted; the desktop overlay is already disabled in a new database, and the desktop host offers only the configured dev display (Parsec by default)
- [ ] 2.5 Camera check refusal while production OBS is running, with the explicit override (deferred: `--camera-effects-check` exists only on PR #200)

## 3. Accounts and devices

- [x] 3.1 Reject protected Twitch account IDs (`STREAM_JAMS_PROTECTED_TWITCH_ACCOUNT_IDS`) in `dev` and `test` before tokens are stored, with a test
- [x] 3.2 Hardware audio suite refuses device labels in the stream-device deny list, and refuses to run without one, with tests

## 4. Test harness enforcement

- [x] 4.1 Add `assertSafeTestEnvironment()` and `enterTestRunProfile()` to `packages/test-support`, and wire them into Vitest `globalSetup` and a shared Playwright `globalSetup` for all four configs
- [x] 4.2 Add `isolatedDesktopEnvironment()` (home, Electron profile, `stream-jams-test-<runId>-<n>` prefix). The global teardown removes the run's prefix family on success and failure; cleanup is tested against a fake `cmdkey`
- [x] 4.3 Migrate every `tests/desktop` spec that launches Electron or the app to the shared environment, including `music-live.spec.ts`, `windows-close.spec.ts` and the `native-binary.spec.ts` composition probe
- [x] 4.4 Add the `node --test` bypass check (`scripts/desktop-isolation-check.test.mjs`) to `test:unit`

## 5. Dev OBS guard

- [x] 5.1 Add `connectGuardedObs` to `packages/test-support`: port, owning-process path, profile and collection names, persistent-data marker, and the request deny list, unit-tested with injected dependencies
- [x] 5.2 Add `assertPortableMarkerTarget` (refuse `portable_mode.txt` outside an owned copy or inside an install) and apply it to `obs-browser-security.spec.ts`

## 6. Scripts and docs

- [x] 6.1 Add `dev:isolated` and `start:dev`. Make bare `dev`, `start:local` and the server package `dev` refuse without `STREAM_JAMS_PROFILE`
- [x] 6.2 Require `--base-url` in `scripts/desktop-overlay-game-check.mjs`, and move the cold-timing lock to `~/.stream-jams-tools`
- [x] 6.3 Update `docs/mvp-runbook.md`, `.env.example`, `AGENTS.md` (dev command rule), and the BL-077 backlog row

## 7. Verification

- [ ] 7.1 Run lint, typecheck, `pnpm test`, `test:e2e` and `test:desktop` with the guards in place, and confirm the Credential Manager `stream-jams:` count and `~/.stream-jams` contents are unchanged afterwards
- [ ] 7.2 Live check: start `pnpm dev:isolated` beside the running production app. Confirm a separate tray, lock and port 39287, and that production keeps serving on 39187
- [ ] 7.3 Reconcile the specs against code and tests, then sync specs and archive the change after merge
