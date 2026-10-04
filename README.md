# Stream Jams

Stream Jams is a local-first streaming overlay application for configurable Alerts, Screen Effects, and Timers. It runs on a streamer's machine and exposes module-specific and unified browser-source URLs for OBS, Streamlabs Desktop, XSplit, vMix, or similar streaming software.

The application includes Twitch and Streamer.bot event intake, alert sets, visual media, routed audio, text, TTS, and independent Alert and Screen Effect playback. The Windows Electron host adds tray operation, explicit audio-device output, and an opt-in desktop overlay; CLI startup serves the local web application.

Start with the [runbook](docs/mvp-runbook.md) for local or Windows desktop startup and portable CI downloads. The [documentation map](docs/README.md) distinguishes current requirements from historical plans and verification records; the [product plan](docs/product-plan.md) explains product scope and boundaries.

## Local Tooling

Stream Jams pins its package manager with `packageManager: "pnpm@11.2.2"` in `package.json`. Use Corepack so local development, CI, and Docker-based workflows resolve the same pnpm version.

```bash
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:unit
```

On Windows, use `corepack.cmd pnpm` if pnpm is not directly available. Run the root typecheck after a clean install before unit tests: it builds shared package outputs used by workspace imports. Missing dependencies or shared outputs are setup failures; install from the lockfile and build them before interpreting test results.

## Workspace Build Model

Stream Jams uses pnpm workspaces for package management and workspace script orchestration. TypeScript package relationships are modeled with project references through the root `tsconfig.json`, so shared packages such as `@stream-jams/core` are built and typechecked before dependent apps such as `@stream-jams/server`.

The current build model intentionally stays simple:

- pnpm owns workspace dependency installation and recursive package script execution.
- TypeScript project references own TypeScript compile/typecheck ordering.
- Vite owns route-separated management, operator, and overlay browser bundles after the web TypeScript project check passes. The production build enforces route dependency boundaries and gzip startup budgets from the generated Vite manifest and chunk-module inventory.

Turborepo is a possible future addition if the workspace grows enough to need task-graph caching, affected-package execution, or faster CI feedback. It is not part of the MVP toolchain yet.

## Playwright E2E Tests

`corepack.cmd pnpm test:security` builds prerequisites and runs real provider transport/persistent-runtime tests, production browser workflows with actual management APIs, packaged renderers, native SQLite/keyring, and installed vendor/OBS acceptance. `test:security:portable` runs the portable transport/runtime/browser portion; `test:security:installed` requires Windows plus `STREAM_JAMS_TEST_STREAMERBOT_DIR`, `STREAM_JAMS_TEST_SPEAKERBOT_DIR`, and `STREAM_JAMS_TEST_OBS_DIR` pointing to installed binary directories. The harness copies only vendor binaries into disposable profiles, seeds synthetic credentials, and removes its profiles/processes. Missing installed-app prerequisites fail explicitly. Installed vendor/OBS tests use their own config and are excluded from ordinary `test:desktop`. Current observed vendor fixtures support Streamer.bot 1.0.7 settings schema 34 and Speaker.bot 0.1.7 settings schema 8; reviewed vendor schema changes are required for other versions. Speaker acceptance uses the observed `sapi5` engine and an installed Windows SAPI voice at volume zero, proving a nonempty WAV rather than audible output.

Provider activation replaces the active selection while retaining inactive saved provider credentials. There is currently no provider deletion API. Backup/restore tests verify secret exclusion and reconnect requirements instead of assuming credentials are deleted when a provider becomes inactive.

See the [provider security acceptance record](docs/verification/provider-security.md) for the automated matrix, actual results, and physical verification limits.

Run E2E tests directly on supported Playwright hosts with:

```bash
corepack pnpm test:e2e
```

On local operating systems where Playwright browser dependencies are unsupported or inconsistent, run browsers through the official Playwright Docker image instead. The Docker helper follows Playwright's remote-server model: the Playwright server binds to `0.0.0.0` inside the container, Docker publishes that port only to `127.0.0.1` on the host, and browser pages reach the host Vite server through `hostmachine`. When that Docker base URL is used, the Playwright config adds `hostmachine` to Vite's `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` allowlist rather than disabling host checks.

Terminal 1:

```bash
corepack pnpm playwright:docker-server
```

Terminal 2:

```bash
PLAYWRIGHT_WEB_SERVER_HOST=0.0.0.0 PLAYWRIGHT_BASE_URL=http://hostmachine:4173 PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3000/ corepack pnpm test:e2e
```

`PLAYWRIGHT_WEB_SERVER_HOST=0.0.0.0` is only for Docker-backed local E2E execution. Normal local execution keeps the default `127.0.0.1` Vite bind address.

The Docker helper derives its image tag from the installed `@playwright/test` version. Keep that dependency, `pnpm-lock.yaml`, and the image tags in `.github/workflows/ci.yml` aligned when upgrading Playwright; package manifests and the workflow are the authoritative version references.

Security operations: `corepack.cmd pnpm audit:dependencies` checks moderate, high, and critical dependency advisories without advisory exceptions; the blocking workflow retains its report on failure. `corepack.cmd pnpm security:provision` verifies pinned official vendor archives for disposable installed acceptance. `corepack.cmd pnpm security:exposure -- --pid <local-service-PID>` prints read-only Windows listener/firewall evidence; remote reachability remains unproven and no live configuration is changed. See the [verification record](docs/verification/provider-security.md) for current findings and prerequisites.
