## 1. Profile resolution and refusals (server)

- [ ] 1.1 Add `resolveRuntimeProfile` to `apps/server/src/config/` (profile, home, config path, production root, credential prefix, default port) with unit tests for unset, `dev`, `test`, an unknown value, and a missing or relative home
- [ ] 1.2 Seed new `dev` and `test` configs from the profile home and port instead of `createDefaultAppConfig(homedir())`
- [ ] 1.3 Add `assertProfileSafe`: production root paths (realpath, case-insensitive), port 39187, `stream-jams` prefix, Electron profile. Tests cover every refusal, including case and junction aliases
- [ ] 1.4 Add the `profile.json` marker (atomic write) and the two-way marker refusal, with tests
- [ ] 1.5 Route `apps/server/src/index.ts` (including the emergency log) and the safety-backup path in `runtime-composition.ts` through the resolved home, and run the refusals before SQLite, the credential store and the listener open
- [ ] 1.6 Pass the profile `servicePrefix` through `createRuntimeSecretStore`, with tests showing `dev` and `test` never touch `stream-jams:` entries

## 2. Desktop identity and checks

- [ ] 2.1 Resolve the profile in `apps/desktop/src/main.ts` before any `getPath`: set the `dev` and `test` app name, check `userData` against the production profile, and use the dev AppUserModelID
- [ ] 2.2 Pass the resolved home to the service worker instead of `homedir()`
- [ ] 2.3 Tray label "Stream Jams (Dev)" and a distinct dev tray icon
- [ ] 2.4 `dev` and `test` defaults: playback muted, desktop overlay disabled, and overlay enable accepted only on the configured dev display (Parsec by default)
- [ ] 2.5 Camera check refusal while production OBS is running, with the explicit override (lands with or after PR #200)

## 3. Accounts and devices

- [ ] 3.1 Reject protected Twitch account IDs (`STREAM_JAMS_PROTECTED_TWITCH_ACCOUNT_IDS`) in `dev` and `test` before tokens are stored, with a test
- [ ] 3.2 Hardware audio suite refuses device labels in the stream-device deny list, with a test of the parser and refusal

## 4. Test harness enforcement

- [ ] 4.1 Add `assertSafeTestEnvironment()` to `packages/test-support`, and wire it into Vitest node `setupFiles` and a shared Playwright `globalSetup` for all four configs
- [ ] 4.2 Add `launchStreamJamsDesktop()` (home, Electron profile, reserved port, `stream-jams-test-<runId>` prefix, credential cleanup on success and failure), with cleanup tested against a fake adapter
- [ ] 4.3 Migrate every `tests/desktop` spec that launches the app to the launcher, including `music-live.spec.ts`, and confirm no backups reach `~/.stream-jams/backups`
- [ ] 4.4 Add the `node --test` bypass check for `_electron.launch` on app entry points to `test:unit`

## 5. Dev OBS guard

- [ ] 5.1 Add the OBS instance guard to `packages/test-support`: port, owning-process path, profile and collection names, persistent-data marker, and the request deny list, unit-tested with an injected request function and process resolver
- [ ] 5.2 Add the read-only install check: refuse `portable_mode.txt` outside the dev OBS root or a temporary copy, and apply it to `obs-browser-security.spec.ts`

## 6. Scripts and docs

- [ ] 6.1 Add `dev:isolated` and `start:dev`. Make bare `dev` and `start:local` refuse without `STREAM_JAMS_PROFILE`
- [ ] 6.2 Require `--base-url` in `scripts/desktop-overlay-game-check.mjs`, and move the cold-timing lock under the test home
- [ ] 6.3 Update `docs/mvp-runbook.md`, `.env.example`, `AGENTS.md` (dev command rule), and the BL-077 backlog row

## 7. Verification

- [ ] 7.1 Run lint, typecheck, `pnpm test`, `test:e2e` and `test:desktop` with the guards in place, and confirm the Credential Manager `stream-jams:` count and `~/.stream-jams` contents are unchanged afterwards
- [ ] 7.2 Live check: start `pnpm dev:isolated` beside the running production app. Confirm a separate tray, lock and port 39287, and that production keeps serving on 39187
- [ ] 7.3 Reconcile the specs against code and tests, then sync specs and archive the change after merge
