## Why

Development, automated tests and the maintainer's live streaming setup share one Windows PC and one Windows user. Today nothing in the code stops a dev or test run from reaching production state. `pnpm dev` and `pnpm start:local` use the production config, database, credentials and port 39187. Desktop tests leave orphaned entries in the production Credential Manager (85 found on 2026-11-02). `music-live.spec.ts` writes pre-restore safety backups into the production `~/.stream-jams/backups`. The [isolation evaluation](../../../docs/engineering/dev-environment-isolation.md) (BL-077) was approved on 2026-11-02, and this change implements its code slice.

## What Changes

- Add an explicit runtime profile, `STREAM_JAMS_PROFILE=production|dev|test`. Production is the default when it is unset, so the installed app behaves exactly as today. `dev` and `test` require an absolute `STREAM_JAMS_HOME`, and every Stream Jams path derives from it: config, data, assets, safety backups, logs and the CLI emergency log.
- Fail-closed startup refusals in `dev` and `test`, checked before SQLite or the credential store opens. The runtime refuses a production path, port 39187, the production credential prefix, the production Electron profile, and a data directory whose profile marker says `production`. Production refuses a data directory marked `dev` or `test`.
- A profile marker (`profile.json`) in every data directory.
- Profile-scoped credential prefixes: `stream-jams` for production (unchanged), `stream-jams-dev` for dev, and `stream-jams-test-<runId>` for tests.
- Separate dev and test app identity: app name `Stream Jams Dev` (own Electron profile and single-instance lock), AppUserModelID `io.github.jamsethoth.streamjams.dev`, and a tray labelled "Stream Jams (Dev)" with a distinct icon.
- Device defaults in `dev` and `test`: playback starts muted, and the desktop overlay is off until enabled, only on the Parsec virtual display. Hardware audio tests refuse a configured deny list of stream devices. Camera checks refuse to start while production OBS is running unless explicitly overridden.
- Twitch: `dev` and `test` refuse to connect the production Twitch account ID, which is configured once.
- Test harness enforcement: a shared `assertSafeTestEnvironment()` runs in Vitest setup and every Playwright `globalSetup`. A shared `launchStreamJamsDesktop()` sets the profile, home, Electron profile, credential prefix and port, and cleans up the test's credentials afterwards. A check fails any desktop spec that launches the app without it.
- A dev OBS guard in `packages/test-support`. Every obs-websocket test client must confirm the dev instance before its first request: the port, the owning process path, the profile and scene collection names, and a persistent-data instance marker. A deny list blocks streaming, recording, the virtual camera and capture inputs.
- New scripts `pnpm dev:isolated` and `pnpm start:dev`. **BREAKING:** bare `pnpm dev` and `pnpm start:local` refuse to start without an explicit `STREAM_JAMS_PROFILE`. The runbook's startup steps change to match.
- `scripts/desktop-overlay-game-check.mjs` requires an explicit `--base-url`. The local media cold-timing lock moves under the test home.

## Capabilities

### New Capabilities
- `dev-test-profile-isolation`: runtime profile selection, path derivation, fail-closed refusals, profile markers, dev and test device defaults, test-harness enforcement, and the dev scripts.
- `dev-obs-instance-guard`: verification and request deny list that every automated obs-websocket client must pass before changing a dev OBS instance.

### Modified Capabilities
- `windows-desktop-runtime`: the shared AppUserModelID, Electron profile and tray label apply to the production profile. Dev and test launches use a separate identity.
- `runtime-secret-storage`: the credential service prefix depends on the profile, and test runs remove their own credentials.

## Impact

- Server: `apps/server/src/config/default-config.ts` (profile resolution), `apps/server/src/index.ts`, `apps/server/src/runtime/runtime-composition.ts` (backups path, secret store prefix, refusals), `apps/server/src/modules/security/runtime-secret-store.ts`.
- Desktop: `apps/desktop/src/main.ts`, `service-worker.ts`, `app-identity.ts`, `tray.ts`, and the check modes (camera refusal applies to PR #200's check when it merges).
- Tests: `packages/test-support` (guard, desktop launcher, OBS guard), `vitest.config.ts`, the four `playwright*.config.ts` files, and every `tests/desktop/*.spec.ts` that launches the app.
- Scripts and docs: root `package.json`, `scripts/desktop-overlay-game-check.mjs`, `scripts/local-media-cold-timing.mjs`, `docs/mvp-runbook.md`, `.env.example`.
- No new dependencies. No change to installed production behaviour except that production refuses a data directory marked `dev` or `test`.
- Not in scope: machine setup (creating `C:\StreamJamsDev`, the portable dev OBS copy, the Twitch test account), the Windows Sandbox `.wsb`, and the approved-separately cleanup of orphaned credentials and backups.
