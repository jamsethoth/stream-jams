# Development And Test Environment Isolation

Status: evaluation for maintainer approval (BL-077), 2026-10-29. Nothing described under "Setup plan" has been implemented.

This page answers one question: how can development, automated tests and automated OBS changes run on the maintainer's streaming PC without any chance of changing the production Stream Jams install or the production OBS? It records where the two environments collide today, compares the isolation options, recommends one, and lists the guardrails and decisions needed before implementation.

The evaluation was read-only. No test, dev server, Playwright suite, Stream Jams process or OBS process was started, stopped or reconfigured. The machine facts below come from directory listings, the registry uninstall keys, the process and listening-port tables, `cmdkey /list` target names (no secrets were read), and the obs-websocket port and auth flags (the password was not read).

## Machine layout (read-only inspection)

| Item | Observed |
| --- | --- |
| Production Stream Jams | Per-user NSIS install at `C:\StreamingTools\Stream Jams`, running, listening on `127.0.0.1:39187` |
| Stale earlier install | Squirrel build still registered at `%LOCALAPPDATA%\StreamJams` (0.1.0, 2026-10-10). The runbook asks for it to be uninstalled |
| Production app data | `%USERPROFILE%\.stream-jams\` with `config.json`, `data\stream-jams.sqlite` (plus a `pre046` copy), `data\logs`, `assets`, `backups` |
| Production Electron profile | `%APPDATA%\Stream Jams` (contains `lockfile`, `gpu-preference.json`, `logs`, `Crashpad`) |
| Production keyring | 97 `stream-jams:*` entries in Windows Credential Manager: about 85 `overlay` route keys, about 15 `music` provider tokens, one fixed `music` Pear identity, two `twitch` tokens keyed by the real Twitch user ID |
| Production OBS | OBS Studio 32.2.2 in `C:\Program Files\obs-studio` (not portable), config in `%APPDATA%\obs-studio` (profiles `Recording`, `Untitled`; collections `Stream`, `Stream_2`; StreamUP backups), obs-websocket enabled on port 4455 with auth. A manual copy exists at `%APPDATA%\obs-studio-2026-10-01` |
| Other local services | Streamer.bot 1.0.1 and Speaker.bot under `C:\StreamingTools`, something listening on `127.0.0.1:8080` (Streamer.bot's default), Pear Desktop, Stream Deck BarRaider OBS Tools plugin (an obs-websocket client) |
| Hardware | One GPU (NVIDIA RTX 4070 Ti SUPER) plus a Parsec virtual display adapter, one camera (OBSBOT Meet 2), 64 GB RAM, 20 logical CPUs |
| Windows features | WSL and Virtual Machine Platform enabled (so the hypervisor already runs). Hyper-V and Windows Sandbox are present but disabled |
| Accounts | Development, Claude Code and the production app all run as the same Windows user. `CodexSandboxOffline` and `CodexSandboxOnline` local accounts exist |

## Collision inventory

"Isolated today" means a dev or test run cannot reach the production resource without someone deliberately pointing it there.

### Paths and persisted state

| Resource | Decided in | Isolated today? |
| --- | --- | --- |
| Config file `~/.stream-jams/config.json` | `resolveConfigFilePath` in `apps/server/src/config/default-config.ts:38-47`; `STREAM_JAMS_CONFIG_PATH` overrides it | **No** for `pnpm dev`, `pnpm start:local` and `node apps/server/dist/index.js` (`apps/server/src/index.ts:10,18` passes `homedir()`), and for an Electron dev launch without the variable (`apps/desktop/src/service-worker.ts:36`). Tests set the variable or inject a `configStore`. |
| Data directory, SQLite DB `stream-jams.sqlite` (WAL companions), runtime logs `data/logs` | `storage.dataDirectory` read from config, then `runtime-composition.ts:317` and `:428` | Follows the config file. A *new* config file is seeded from `createDefaultAppConfig(homedir())` (`default-config.ts:19-35`, `file-config-store.ts:36-39`), so pointing `STREAM_JAMS_CONFIG_PATH` at an empty path still stores data **in the production `~/.stream-jams/data`**. Tests avoid this only because each one writes a complete config first. |
| Asset directory | `storage.assetDirectory`, `runtime-composition.ts:352` | Same as the data directory. |
| Pre-restore safety backups | `runtime-composition.ts:1497`: `join(options.homeDirectory, ".stream-jams", "backups")`, **not** derived from config | **No.** Any desktop runtime writes safety backups to the production folder even with an isolated config. `tests/desktop/music-live.spec.ts:59` performs a restore through the packaged app, whose worker passes `homedir()`. The production `backups` folder holds 11 `pre-restore-*` archives from 2026-10-05 to 2026-10-11, most of identical size (83,287 bytes), which matches repeated runs of that fixture. |
| CLI emergency log | `apps/server/src/index.ts:13-14`: `~/.stream-jams/logs/emergency.jsonl` | **No** for any CLI start, even with `STREAM_JAMS_CONFIG_PATH` set. |
| Electron `userData` (`lockfile`, `gpu-preference.json`, Chromium caches, `logs`, `crashDumps`) | Electron default from the product name ("Stream Jams" in `apps/desktop/package.json`), overridden by `STREAM_JAMS_DESKTOP_USER_DATA_PATH` (`apps/desktop/src/main.ts:27-31`) | Tests set the override. A dev Electron launch without it uses **`%APPDATA%\Stream Jams`**, the production profile, and its GPU preference (`main.ts:39-40`). |
| Desktop emergency diagnostics | `main.ts:73-76`, `app.getPath("logs")` resolved at module load | Follows `userData` when the override is set. In the check modes it is resolved before the check switches to its temporary profile, so a fallback write from a check run launched from the installed app would land in the production profile's `logs`. |
| Local media cold-timing lock | `scripts/local-media-cold-timing.mjs:146-148`: `~/.stream-jams/local-media-cold-timing/runner.lock` | Writes a lock folder inside the production app-data root. Harmless to data, but it is a write there. |

### Network

| Resource | Decided in | Isolated today? |
| --- | --- | --- |
| Port `39187` on `127.0.0.1` | `default-config.ts:25-28`; `server.host` and `server.port` from config | Loopback ports are machine-wide, so every same-machine option shares them. Tests pick unused ports. `pnpm dev` and `start:local` use 39187. While production runs, a dev start fails with `PortUnavailableError` (safe). While production is **stopped**, a dev server takes 39187, and the production OBS browser sources, Stream Deck actions and Streamer.bot HTTP actions that point at `127.0.0.1:39187` reach the dev server instead. |
| Dev CORS origins | `STREAM_JAMS_DEV_ORIGINS`, `apps/server/src/http/middleware/management-security.ts:47` | Development only, so no collision. |
| Playwright web server | `playwright.config.ts`: Vite on `127.0.0.1:4173`, `reuseExistingServer` outside CI | Not a production port. |
| Diagnostic scripts | `scripts/desktop-overlay-game-check.mjs:8` defaults `--base-url` to `http://127.0.0.1:39187` and can `--trigger` playback | **Targets production by default.** It is a deliberate live-app diagnostic, but it is not test-safe. |

### Single instance, windows, tray, devices

| Resource | Decided in | Isolated today? |
| --- | --- | --- |
| Single-instance lock | `app.requestSingleInstanceLock()` at `main.ts:195`; the lock lives in `userData` | Isolated when `userData` is overridden. Without the override, a dev launch hands focus to the production window and quits. The `--video-mirror-check` mode and `--camera-effects-check` (PR #200) branch off **before** the lock (`main.ts:191-198`), so they run alongside production with their own temporary `userData` (`video-mirror-check/check-main.ts:26`; PR #200 `camera-effects-check/check-main.ts`). |
| Tray | `apps/desktop/src/tray.ts:18-19`: fixed icon and tooltip "Stream Jams" | Two instances look identical in the tray. |
| Desktop overlay windows | `OverlayHost` and `PrivateOverlayWindow`; display chosen in persisted settings | A dev instance with a desktop overlay enabled draws topmost windows on the same physical displays. If production OBS captures that display or game, dev overlays can go on stream. |
| Audio output devices | `AudioHost` and audio routes stored in the DB | Routes are per data directory, but they name physical devices. Dev playback can be audible on the stream audio device. Playback defaults to unmuted and unpaused (`packages/core/src/playback/types.ts:42-45`). |
| Camera | PR #200 camera effects check (`getUserMedia` in its own partition) | One physical camera. Production OBS normally holds it. A dev capture can fail, or renegotiate the camera format while production uses it. |

### Secrets and accounts

| Resource | Decided in | Isolated today? |
| --- | --- | --- |
| Credential Manager service names | `OsSecretStore`: `${servicePrefix}:${namespace}:${name}` with account `accountId`, prefix default `"stream-jams"` (`apps/server/src/modules/security/os-secret-store.ts:21,41`). The constructor already accepts `servicePrefix`, but `createRuntimeSecretStore` never passes it (`runtime-secret-store.ts:43-45`) | **No.** Keyring scope is per Windows user, not per data directory. Server tests inject `InMemorySecretStore`. Desktop Playwright tests launch the real app, which has no injection path, so they write real `stream-jams:*` entries with random IDs into the maintainer's Credential Manager. Each temporary DB is then deleted, so the entries are orphaned. This probably explains most of the ~85 overlay and ~15 music entries observed. Unverified: it needs a read-only comparison with the production `overlay_keys` and provider tables. |
| Twitch OAuth tokens | `createTwitchTokenSecretRef(accountId, …)` keyed by the Twitch user ID (`twitch-oauth-service.ts:308,397-402`). Disconnect and replace delete them (`:265-266`, `:342-343`) | **No.** A dev runtime that connects the same Twitch account **overwrites** the production tokens, and a dev disconnect **deletes** them. Twitch also limits EventSub WebSocket connections and subscription cost per client ID and user, so a dev EventSub session competes with production's. |
| Pear (music) client identity | Fixed ref `music / pear-desktop / client-id` (`pear-pairing-service.ts:9`, `runtime-composition.ts:1549-1561`) | **No.** Dev and production share one Pear identity. Dev pairing reuses, or on first use creates, the identity production presents. |
| Streamer.bot and music provider passwords and tokens | Keyed by random provider IDs (`provider-management-service.ts:361,847-848`) | Isolated by ID, but they live in the same store. A dev Streamer.bot connection to the production Streamer.bot on `127.0.0.1:8080` receives real stream events. |
| Overlay route keys | `overlay / <keyId> / route-key` (`overlay-output-management-service.ts:225-227`) | Isolated by ID, but they live in the same store (see the orphan note above). |
| Automation API pairings | `SqliteAutomationGrantRepository`, in the DB | Isolated with the data directory. External callers such as Stream Deck and Streamer.bot imports target port 39187 and therefore reach whichever process holds it. |
| Twitch client ID | `TWITCH_CLIENT_ID` env, else the built-in default (`runtime-composition.ts:304`) | Shared, which is acceptable (it is public). |

### Windows identity

| Resource | Decided in | Isolated today? |
| --- | --- | --- |
| AppUserModelID `io.github.jamsethoth.streamjams` | `apps/desktop/src/app-identity.ts:5`, set at `main.ts:198`, and written into installer shortcuts (`scripts/make-desktop-installer.mjs:70,82`) | **No.** Dev and test builds use the production AUMID, so notifications and taskbar grouping merge with production. |
| Installer, uninstall key, shortcuts | `make-desktop-installer.mjs:13-40`: `appId` = AUMID, per-user, product name "Stream Jams" | A test install would replace the production uninstall entry and shortcuts. `tests/desktop/installer.spec.ts:19` refuses while any Stream Jams uninstall entry exists. On this machine it always refuses, which is correct. |
| Protocol handlers | None. The code has no `setAsDefaultProtocolClient` and the installer config has no `protocols`. `registerSchemesAsPrivileged` (`audio/audio-window.ts:35`) is in-process only | Nothing to isolate. Twitch uses the device-code flow, so no redirect URI is involved. |

### Environment variables that select paths

`STREAM_JAMS_CONFIG_PATH` (config, and through it data, assets and port), `STREAM_JAMS_DESKTOP_USER_DATA_PATH` (Electron profile), `STREAM_JAMS_SHUTDOWN_LOG`, `TWITCH_CLIENT_ID`, `STREAM_JAMS_DEV_ORIGINS`, and the test-only `STREAM_JAMS_TEST_*` variables (`OBS_DIR`, `OBS_RENDERER`, `STREAMERBOT_DIR`, `SPEAKERBOT_DIR`, `EXECUTABLE`, `INSTALLER`, `MUSIC_ARTWORK_URL`). Nothing selects the backups folder, the CLI emergency log, the keyring prefix, the AUMID or the tray label. `.env.example` documents only the first variable and `TWITCH_CLIENT_ID`.

### What each command touches

| Command | Production contact found in code | Verdict |
| --- | --- | --- |
| `pnpm test` (Vitest node and web projects, plus `node --test` scripts) | Server composition tests use temporary roots, `InMemorySecretStore`, `configStore` or `environment: {}`, and port 0 or reserved ports (for example `start-local-runtime.test.ts:20-26`). No test calls `homedir()` or the real keyring adapter. Some composition calls rely on each caller remembering `environment: {}`, and nothing enforces that | Safe by inspection, but only by convention |
| `pnpm test:e2e` (`playwright.config.ts`) | Vite on 4173. Runtimes come from `mkdtemp` roots with `InMemorySecretStore` and ephemeral ports. References to 39187 are `page.route` mocks only | Safe by inspection |
| `pnpm storybook`, `test:storybook` | Web-only, no server | Safe |
| `pnpm dev` / `pnpm start:local` | Production config, DB, assets, keyring, backups, and port 39187 | **Unsafe**: this is the production profile |
| `pnpm test:desktop` (`playwright.desktop.config.ts`) | Temporary config, `userData` and ports, but the **real Credential Manager** (orphaned entries) and, in `music-live.spec.ts`, **production `~/.stream-jams/backups`** | **Unsafe until fixed** |
| `pnpm test:desktop:hardware` | Same as above, plus real audio devices and topmost overlays (`overlay-topmost.spec.ts` uses a probe profile) | Unsafe until fixed. Audible on physical devices by design |
| `pnpm test:security:installed` | `desktop:package`, then `native-binary` (real keyring health probe with a unique, deleted entry), `provider-security` (real keyring), and the vendor and OBS acceptance (below) | Keyring orphans. Otherwise copies to temporary folders |
| `STREAM_JAMS_INSTALLER_TEST=1` | Installs into a temporary folder under the production product identity | Self-refuses on this machine. Run it only in a disposable Windows (Sandbox) |
| `--video-mirror-check`, `--camera-effects-check` (PR #200) | Temporary `%TEMP%` profile, no service, a per-run token and loopback server. Bypasses the single-instance lock. The camera check opens the camera | Data-safe. Camera contention with production OBS |
| `scripts/desktop-overlay-game-check.mjs` | Defaults to production 39187 | Live-app diagnostic, not a test |
| CI (`.github/workflows/ci.yml`, `security-installed.yml`) | GitHub-hosted `ubuntu-24.04` and `windows-2025` runners | Never this PC |

## Existing OBS automation

There is one OBS test: `tests/desktop/obs-browser-security.spec.ts`, run by `playwright.security-installed.config.ts` (and excluded from `playwright.desktop.config.ts`). It is the "OBS acceptance test" in recent commits (`29892894` and its revert `cac648cf`, `eba7a2fd`, `d9ff5589`).

- **Connection:** no obs-websocket. It copies a selected subset of `STREAM_JAMS_TEST_OBS_DIR` (binaries, eight bundled plugins and CEF files, without obs-websocket) into a `mkdtemp` folder, writes `portable_mode.txt` and a fresh `config/obs-studio` with a `SecurityTest` profile and scene collection, and launches `obs64.exe --portable --multi --minimize-to-tray --disable-updater --only-bundled-plugins --disable-missing-files-check` (lines 30-57, 161). It drives OBS through a Lua script (`tests/desktop/fixtures/obs-browser-security.lua`) that exchanges JSON files in a temporary `coord` folder.
- **What it changes:** only its temporary portable profile: browser sources, scene, screenshots under the temporary root (asserted at line 224), and a disposable Stream Jams runtime from `createProviderSecurityRuntimeFixture` (temporary home, `InMemorySecretStore`, ephemeral port).
- **Its own guardrails:** it asserts `Portable mode: true` and that obs-websocket did not load (lines 447-449). It asserts that the OBS process tree has no listening TCP ports (lines 451-452). It stops OBS by PID only after confirming the executable path is under the temporary portable root (line 463).
- **Production impact:** none found. It reads the production OBS install folder (`C:\Program Files\obs-studio` would be the local value) and never writes to it or to `%APPDATA%\obs-studio`. `--multi` lets it run alongside production OBS, and both then share the GPU.

No test today changes OBS configuration through obs-websocket. The maintainer's goal ("automatic OBS configuration changes made by tests") is new capability, so the guardrails below are for code that does not exist yet.

The vendor acceptance (`tests/desktop/fixtures/vendor-provider-harness.ts`) copies Streamer.bot and Speaker.bot binaries into temporary folders on reserved ports. It requires versions 1.0.7 and 0.1.7, so it would refuse the installed Streamer.bot 1.0.1.

## Option matrix

Every same-machine option shares loopback ports, the GPU, the camera, audio devices and displays. Port, device and display guardrails are therefore needed whichever option is chosen. Only the VM and Sandbox isolate the network.

| | A. In-place dev/test profile with guardrails | B. Separate Windows user account | C. Windows Sandbox | D. Hyper-V VM | E. WSL / dev container |
| --- | --- | --- | --- | --- | --- |
| **Isolation of files, `%APPDATA%`, keyring, HKCU** | Code-enforced: separate roots, keyring prefix, app identity, fail-closed checks. A bug or a test that skips the check can still reach production | OS-enforced (profile ACLs, per-user Credential Manager, HKCU, per-user OBS config) | Complete and disposable | Complete and persistent | Linux side complete. Windows parts not covered |
| **Ports** | Guardrail only | Shared: guardrail only | Isolated (own network stack) | Isolated | NAT mode mostly isolated; mirrored mode shares loopback |
| **Electron desktop, tray, overlays** | Full | Full, but only in that user's interactive session (fast user switching or `runas`) | Works, in the sandbox window | Works in the VM console | Not possible |
| **GPU** | Native | Native | WDDM GPU paravirtualization (`vGPU`); D3D works, encoders unlikely | GPU-P is unsupported on Windows 11 client with GeForce; community scripts copy host drivers and break on driver updates | WSLg only; not Electron for Windows |
| **Camera** | Shared with production OBS | Shared | `VideoInput` redirection | No USB passthrough; RDP camera redirection only | No |
| **OBS** | Portable copy with its own port, profile and marker | Normal per-user OBS in that account (needs `--multi` if production OBS is open in another session) | Portable OBS inside, fresh each run | Full OBS, GPU-limited | Not Windows OBS |
| **Can dev and production OBS run at once** | Yes (`--multi`, different websocket port) | Yes | Yes | Yes | n/a |
| **Setup cost** | Code change (one slice), plus copying OBS | Account, dev checkout, Node/pnpm, OBS copy, ACLs | Enable feature (admin and reboot); `.wsb` file; installs per run unless folders are mapped | Enable Hyper-V, Windows install and license, 8+ GB RAM | Low (WSL already on) |
| **Upkeep** | Keep guardrails tested | Two environments to update; the maintainer and agents must switch accounts | Toolchain reinstalled per session (cache by mapped folders) | Patch a second Windows; GPU-P breaks on driver updates | Low |
| **Dev loop speed** | Fastest (same session, same tools; agents work as today) | Slower: agents run as the maintainer, so tests need `runas` or a separate login | Slow start (minutes); good for one-off acceptance | Medium | Fast for server and web; nothing for desktop or OBS |
| **Main risks** | Relies on code discipline; same Windows user can still delete anything | Port, device and display collisions remain; Claude Code and Codex sessions in the main account bypass it | Non-persistent; possible vGPU and CEF quirks; only one sandbox at a time | Enabling Hyper-V on a gaming PC; weak GPU and camera; cost | Partial coverage only |
| **Best use** | Day-to-day dev and every automated suite | Optional hardening for unattended agent runs | Installer test and clean-machine acceptance | Not recommended now | Optional for fast server and web loops |

## Recommendation

Use **option A** for all development and automated tests: an explicit dev or test profile with fail-closed guardrails, plus a portable dev OBS. Add **option C (Windows Sandbox)** only for the installer test and clean-machine packaged acceptance, which cannot run safely on a PC with production installed.

Reasons:

1. The collisions that can break production are ports, physical devices, Twitch account state and Stream Jams' own path defaults. Option A is the only option that addresses all of them. A separate account (B) isolates files and the keyring, but leaves ports, the camera, audio and displays shared, so it needs the same guardrails anyway.
2. A and C keep the current workflow. Agents and the maintainer run as one Windows user today; B would push every desktop or OBS test through `runas` or a second login.
3. D gives up the GPU and camera that the desktop overlay, Videos and camera effects work needs. E cannot run Electron or OBS for Windows.
4. A also removes two existing production writes found in this evaluation: safety backups and orphaned Credential Manager entries.

If the maintainer wants OS-enforced protection for **unattended** agent runs on top of A, add B later as defence in depth. The guardrails stay the same (see open question 1).

## Guardrails

### Profile selection

- One environment variable, `STREAM_JAMS_PROFILE`, set to `production` (default when unset, so installed behaviour does not change), `dev` or `test`. It is resolved once, in one function, and every path, port, keyring prefix and identity below derives from it.
- `dev` and `test` take a single root, `STREAM_JAMS_HOME`, which must be absolute. Config, data, assets, backups, logs and the CLI emergency log all go under it. Nothing in `dev` or `test` may call `homedir()` for Stream Jams state, and the backups path stops using `homeDirectory` directly (`runtime-composition.ts:1497`, `index.ts:13`).
- A new config file under a `dev` or `test` root is seeded with that root's paths and the profile's port, never with `createDefaultAppConfig(homedir())`.

### Runtime refusals (server and desktop main process, `dev` and `test`)

Startup fails with a clear message, before opening SQLite or the keyring, when any of these holds:

- a resolved config, data, asset, backup or log path is inside the production root (`%USERPROFILE%\.stream-jams`), compared case-insensitively after `realpath`;
- the configured port is 39187;
- the keyring prefix is exactly `stream-jams`;
- the Electron `userData` is the production profile (`%APPDATA%\Stream Jams`);
- the data directory holds a profile marker that says `production`.

The marker: each runtime writes `profile.json` (`{ "profile": "production" | "dev" | "test", "createdAt": … }`) into its data directory on first start. Production refuses a directory marked `dev` or `test`, which prevents the reverse mistake.

### Keyring

- `createRuntimeSecretStore` passes `servicePrefix` (already supported by `OsSecretStore`). Prefixes: `stream-jams` (production, unchanged), `stream-jams-dev` (dev), and `stream-jams-test-<runId>` (test).
- Desktop test harnesses set `STREAM_JAMS_KEYRING_PREFIX=stream-jams-test-<runId>` and delete every entry with that prefix after the run, including after a failure.
- Dev and test never connect the production Twitch account. Use a separate Twitch test account (open question 4). Even with a prefix, a shared account shares Twitch-side EventSub limits.
- The Pear identity is covered by the prefix, so dev gets its own `pear-desktop` identity.

### App identity

- In `dev` and `test`, the app name is `Stream Jams Dev` (set before any `getPath`, giving `%APPDATA%\Stream Jams Dev` and a separate single-instance lock), the AUMID is `io.github.jamsethoth.streamjams.dev`, the tray tooltip is "Stream Jams (Dev)", and the tray icon is visibly distinct.
- Dev builds are never installed on this PC. The installer test runs only in Windows Sandbox.

### Devices

- `dev` and `test` start muted and with the desktop overlay disabled until the operator chooses a display. A display the production OBS does not capture is preferred (open question 6).
- Hardware suites keep their explicit opt-in (`STREAM_JAMS_AUDIO_TEST=1` plus exact device labels), and must refuse a device label on a deny list the maintainer supplies (the stream audio devices).
- Camera checks refuse to start while production OBS (`C:\Program Files\obs-studio\bin\64bit\obs64.exe`) is running, unless an explicit override is set (open question 7).

### Test harness enforcement

- Add `assertSafeTestEnvironment()` to `packages/test-support` and run it as the Vitest node-project `setupFiles` and as `globalSetup` in all four Playwright configs. It requires `STREAM_JAMS_PROFILE=test` (set by the configs themselves) and applies the refusals above to the process environment. It also refuses `STREAM_JAMS_CONFIG_PATH` or `STREAM_JAMS_HOME` values that resolve inside production roots.
- Add `launchStreamJamsDesktop()` to the shared desktop harness. It always sets the profile, home, `userData`, keyring prefix and a reserved port, and cleans up the keyring. A lint or `node --test` check fails any `tests/desktop` spec that calls `_electron.launch` on the app's `main.js` or packaged `Stream Jams.exe` without it (fixture hosts such as `module-mute-host.mjs` are exempt).
- `runtime-composition` callers in tests must pass `environment: {}`; the guard makes a missing one fail instead of reading the developer's shell.

### OBS instance guard

Every obs-websocket test client goes through one wrapper that, before its first request:

1. Refuses port 4455 (production) and any port not equal to the configured dev port.
2. Resolves the process that owns the listening port (`Get-NetTCPConnection` → `OwningProcess` → executable path) and requires it to be `<dev OBS root>\bin\64bit\obs64.exe`. This is the same PID-and-path proof the existing OBS test uses.
3. Requires the current profile and scene collection names to be `StreamJamsDev` (`GetProfileList`, `GetSceneCollectionList`).
4. Requires the profile-realm persistent data slot `StreamJamsDevInstance` (`GetPersistentData`) to equal the instance ID in `<dev OBS root>\stream-jams-dev-obs.json`.
5. Applies a request deny list: `StartStream`, `StartRecord`, `StartReplayBuffer`, `StartVirtualCam`, `SetStreamServiceSettings`, `SetProfileParameter` for output sections, and any `CreateInput` of camera or audio-capture kinds (`dshow_input`, `wasapi_input_capture`, `wasapi_output_capture`).

Any `STREAM_JAMS_TEST_OBS_DIR` may be read and copied, never written. Harnesses refuse to create `portable_mode.txt` anywhere except inside the dev OBS root or a temporary copy. A marker file in `C:\Program Files\obs-studio` would switch the **production** OBS to an empty portable profile.

## Setup plan (option A, after approval)

Implementation slice (one PR with an OpenSpec change, per `AGENTS.md`):

1. Add profile resolution (`STREAM_JAMS_PROFILE`, `STREAM_JAMS_HOME`, `STREAM_JAMS_KEYRING_PREFIX`) next to `default-config.ts`, and route `index.ts`, `service-worker.ts`, the backups path and the emergency log through it.
2. Add the runtime refusals, the `profile.json` marker, and the dev app name, AUMID and tray label in `main.ts`, `app-identity.ts` and `tray.ts`.
3. Wire `servicePrefix` through `createRuntimeSecretStore`.
4. Add `assertSafeTestEnvironment()`, `launchStreamJamsDesktop()` and the spec lint, and migrate the `tests/desktop` specs to them. `music-live.spec.ts` must then write its safety backup under the test root.
5. Add `pnpm dev:isolated` and `pnpm start:dev` scripts that set the `dev` profile. Decide whether bare `pnpm dev` and `start:local` refuse without a profile (open question 9).
6. Change `desktop-overlay-game-check.mjs` to require an explicit `--base-url`, and move the cold-timing lock under the test root.
7. Tests: unit tests for every refusal (production path, port 39187, prefix, `userData`, marker in both directions), and a desktop test showing that a dev launch while production runs gets its own lock, tray and port. Update the runbook and `.env.example`.

Machine setup (the maintainer runs these after the slice merges; agents do not):

1. Choose the dev root, for example `C:\StreamJamsDev` (open question 2), with `home\` for Stream Jams and `obs\` for OBS.
2. Dev OBS: `robocopy "C:\Program Files\obs-studio" C:\StreamJamsDev\obs /E` (read from the install, write only to the copy), then create `C:\StreamJamsDev\obs\portable_mode.txt`. Launch with `obs64.exe --portable --multi --disable-updater --profile StreamJamsDev --collection StreamJamsDev` from `bin\64bit`.
3. In the dev OBS only: set 1280×720 at 30 fps; disable Desktop Audio and Mic/Aux under global audio devices; set the monitoring device to one that production does not capture; add no camera; never start the virtual camera; enable obs-websocket on port 4456 with a new generated password, stored as `stream-jams-dev:obs:websocket` in Credential Manager.
4. Write `C:\StreamJamsDev\obs\stream-jams-dev-obs.json` with a random instance ID, and set the matching `StreamJamsDevInstance` profile persistent-data slot once through a one-off setup script.
5. Set the user environment variables for dev shells: `STREAM_JAMS_PROFILE=dev`, `STREAM_JAMS_HOME=C:\StreamJamsDev\home`, and the dev OBS port and root.
6. Optional: enable Windows Sandbox (Windows features, then reboot) and add a checked-in `.wsb` that maps the packaged artifact folder read-only and runs `installer.spec.ts`.
7. One-time cleanup, with separate approval: list `stream-jams:overlay` and `stream-jams:music` Credential Manager entries that are not referenced by the production DB (read-only query against a copy of `stream-jams.sqlite`), show the list, and delete only the approved entries. Decide what to do with the 11 test-made `pre-restore-*` archives.

Dev loop afterwards: agents and the maintainer run `pnpm test`, `test:e2e` and `test:desktop` as they do today. The configs set the `test` profile themselves, and any misconfiguration fails before touching state. `pnpm dev:isolated` runs beside the production app on its own port, tray and profile. OBS tests talk to `127.0.0.1:4456` through the guarded client.

## Open questions for the maintainer

1. Approve option A plus Windows Sandbox for installer acceptance? Or also require a separate Windows account (option B) for unattended agent runs?
2. Where should the dev root live (`C:\StreamJamsDev`, another drive, or `%USERPROFILE%\.stream-jams-dev`)?
3. Dev Stream Jams port (proposed 39287) and dev obs-websocket port (proposed 4456)?
4. Will you create a separate Twitch test account for dev and test? Without one, Twitch connections stay blocked in `dev` and `test`.
5. Should dev ever connect to the production Streamer.bot on port 8080, or only to a copied Streamer.bot on another port?
6. Which display may dev desktop overlays use: the Parsec virtual display, a monitor production OBS does not capture, or none by default?
7. Which audio devices must dev and hardware tests never use? May camera checks run while production OBS is open?
8. Approve the one-time audit and cleanup of orphaned `stream-jams:*` Credential Manager entries, and decide what to do with the 11 `pre-restore-*` archives in `~/.stream-jams/backups`?
9. Should bare `pnpm dev` and `pnpm start:local` refuse to start without an explicit `STREAM_JAMS_PROFILE`? This changes the runbook's startup steps.
10. Should the stale Squirrel install at `%LOCALAPPDATA%\StreamJams` be uninstalled, as the runbook already advises?
