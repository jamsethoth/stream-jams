## ADDED Requirements

### Requirement: Runtime Profile Selection
The system SHALL resolve exactly one runtime profile, `production`, `dev` or `test`, from `STREAM_JAMS_PROFILE` before it reads configuration, opens SQLite, opens the credential store or sets Electron paths. An unset variable SHALL mean `production`, with today's paths, port, credential prefix and app identity. Any other value SHALL stop startup with an error naming the accepted values.

#### Scenario: Installed app without the variable
- **WHEN** the installed desktop app or `node apps/server/dist/index.js` starts with `STREAM_JAMS_PROFILE` unset
- **THEN** it uses `~/.stream-jams`, port 39187 by default, the `stream-jams` credential prefix and the production app identity

#### Scenario: Unknown profile value
- **WHEN** `STREAM_JAMS_PROFILE` is `staging`
- **THEN** startup fails before any file, port or credential is touched, and the error lists `production`, `dev` and `test`

### Requirement: Dev And Test Paths Derive From One Home
In the `dev` and `test` profiles the system SHALL require an absolute `STREAM_JAMS_HOME`. It SHALL derive every Stream Jams path from that home: the config file, data directory, asset directory, pre-restore safety backups, runtime logs and the CLI emergency log. A config file created under that home SHALL be seeded with that home's paths and the profile's port (39287 for `dev`, 39387 for `test`; test harnesses write their own reserved port), never with defaults derived from the user's home directory. The `test` profile SHALL also require `STREAM_JAMS_KEYRING_PREFIX` of the form `stream-jams-test-<runId>`.

#### Scenario: Missing home
- **WHEN** `STREAM_JAMS_PROFILE=dev` is set without `STREAM_JAMS_HOME`, or with a relative path
- **THEN** startup fails with an error naming `STREAM_JAMS_HOME`

#### Scenario: Restore in a test runtime
- **WHEN** a `test` desktop runtime performs a configuration restore
- **THEN** its safety backup is written under `STREAM_JAMS_HOME`, and nothing is written to `~/.stream-jams/backups`

#### Scenario: Fresh dev config
- **WHEN** a `dev` runtime starts with no config file under its home
- **THEN** it creates one whose data and asset directories are under `STREAM_JAMS_HOME` and whose port is 39287

### Requirement: Dev And Test Refuse Production Resources
In the `dev` and `test` profiles the system SHALL refuse to start, before opening SQLite, the credential store or a listener, when any of these holds:
- a resolved config, data, asset, backup or log path is inside the production root `~/.stream-jams` (compared case-insensitively on Windows after resolving links);
- the configured port is 39187;
- the credential prefix is `stream-jams`;
- the Electron user data directory is the production profile;
- the data directory holds a profile marker that says `production`.

#### Scenario: Dev pointed at production data
- **WHEN** a `dev` config sets `storage.dataDirectory` to `~/.stream-jams/data`
- **THEN** startup fails, names the production path, and the production database is not opened

#### Scenario: Dev on the production port
- **WHEN** a `dev` config sets `server.port` to 39187
- **THEN** startup fails before binding, whether or not production is running

#### Scenario: Path differs only by case or a junction
- **WHEN** a `test` data directory resolves to the production data directory through different letter case or a directory junction
- **THEN** startup fails as if the production path had been given directly

### Requirement: Profile Markers Guard Data Directories
Every runtime SHALL write `profile.json` with its profile into a data directory that has no marker. The production profile SHALL refuse a data directory marked `dev` or `test`. `dev` and `test` SHALL refuse one marked `production`.

#### Scenario: First production start after upgrade
- **WHEN** the production app starts on an existing `~/.stream-jams/data` without a marker
- **THEN** it writes a `production` marker and continues normally

#### Scenario: Production pointed at dev data
- **WHEN** `STREAM_JAMS_CONFIG_PATH` makes the production profile use a data directory marked `dev`
- **THEN** startup fails without migrating or writing that database

### Requirement: Dev And Test Device And Account Defaults
In the `dev` and `test` profiles a newly created configuration SHALL start with playback muted and the desktop overlay disabled. In `dev` the desktop host SHALL offer only displays whose label contains `STREAM_JAMS_DEV_DISPLAY_LABEL` (default `Parsec`), so the desktop overlay can be enabled only on the dev display. In `test` it SHALL offer every display, because overlay tests need one on any runner, unless `STREAM_JAMS_DEV_DISPLAY_LABEL` is set. `dev` and `test` SHALL refuse to complete a Twitch connection whose account ID appears in `STREAM_JAMS_PROTECTED_TWITCH_ACCOUNT_IDS`, without storing its tokens.

#### Scenario: Fresh dev runtime
- **WHEN** a `dev` runtime creates its configuration
- **THEN** playback is muted and no desktop overlay window is created

#### Scenario: Dev overlay on a captured monitor
- **WHEN** an operator enables the dev desktop overlay on a physical monitor that is not the configured dev display
- **THEN** that monitor is not offered, the save is rejected as an unavailable display, and no overlay window opens

#### Scenario: Production Twitch account in dev
- **WHEN** a `dev` runtime completes Twitch device authorization for an account ID listed as protected
- **THEN** the connection is rejected, no token is written, and the production credentials are unchanged

### Requirement: Hardware And Camera Checks Protect The Live Setup
Hardware audio tests SHALL refuse to run without a stream-device deny list (`STREAM_JAMS_AUDIO_DENY_OUTPUTS`), and SHALL refuse any output device whose label matches it. Desktop camera checks SHALL refuse to start while a process from the production OBS install is running, unless `STREAM_JAMS_ALLOW_CAMERA_WITH_PRODUCTION_OBS=1` is set for that run.

#### Scenario: Denied audio device
- **WHEN** `STREAM_JAMS_AUDIO_TEST_OUTPUTS` names a device in the deny list
- **THEN** the hardware suite fails before playing any sound

#### Scenario: Camera check while streaming
- **WHEN** the camera effects check starts while production OBS is running and no override is set
- **THEN** it exits with a message explaining the refusal, without opening the camera

### Requirement: Dev Commands Require An Explicit Profile
`pnpm dev` and `pnpm start:local` SHALL refuse to start unless `STREAM_JAMS_PROFILE` is set. `pnpm dev:isolated` and `pnpm start:dev` SHALL start with the `dev` profile. Diagnostic scripts that call a running service SHALL require an explicit base URL instead of defaulting to the production port.

#### Scenario: Bare dev command
- **WHEN** a developer runs `pnpm dev` with no profile in the environment
- **THEN** it exits before starting Vite or the server, and points to `pnpm dev:isolated`

#### Scenario: Isolated dev beside production
- **WHEN** production is running and the developer runs `pnpm dev:isolated` with `STREAM_JAMS_HOME` set
- **THEN** the dev server listens on 39287 and production keeps serving on 39187

### Requirement: Test Suites Enforce The Test Profile
Every Vitest and Playwright configuration SHALL run a shared global setup before any test. It SHALL refuse an environment that points at production, then put the run in `STREAM_JAMS_PROFILE=test` with a temporary home and a run-scoped `stream-jams-test-<runId>` credential prefix. Its teardown SHALL remove every credential in that run's prefix family, including when tests fail. Every desktop test that launches Electron or the Stream Jams app SHALL build the child environment with the shared `isolatedDesktopEnvironment`, which gives each launch its own home, Electron profile and credential prefix within the run's family. A repository check SHALL fail when a desktop spec launches without it, or sets the Electron profile path itself.

#### Scenario: Shell points at production
- **WHEN** a developer runs `pnpm test:desktop` with `STREAM_JAMS_CONFIG_PATH` pointing inside `~/.stream-jams`
- **THEN** the suite stops in global setup, before launching anything

#### Scenario: Desktop test leaves no credentials
- **WHEN** a desktop test creates overlay keys and music provider tokens and then fails
- **THEN** after the run, Credential Manager holds no entry with that run's prefix and no new `stream-jams:` entry

#### Scenario: New spec bypasses the launcher
- **WHEN** a new desktop spec calls `_electron.launch` with an environment copied from `process.env`
- **THEN** the repository check fails and names the spec
