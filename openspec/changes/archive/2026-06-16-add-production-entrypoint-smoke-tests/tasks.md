# Tasks

## 1. Dependency Gate

- [x] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [x] 1.2 Confirm the final `/manage` and overlay shell URL contract from remote `main`.
- [x] 1.3 Confirm production-entrypoint smoke coverage uses the Fastify-served local runtime path, not the Vite hot-reload development server.
- [x] 1.4 Stop implementation if the dependency is absent or only exists in an unmerged branch.

## 2. Composition Test Harness

- [x] 2.1 Extract or identify the single runtime app composition factory used by the CLI entrypoint.
- [x] 2.2 Add temp config, temp SQLite, and external-client test-double support through explicit configuration and boundary-adapter inputs without creating separate local/test/production application graphs.
- [x] 2.3 Keep the harness in a shared test-support location if it will be reused by later slices.
- [x] 2.4 Confirm the CLI entrypoint and production-entrypoint smoke tests call the same runtime composition factory.

## 3. Smoke Coverage

- [x] 3.1 Add smoke coverage for `/health` and `/manage`.
- [x] 3.2 Add smoke coverage for module and unified overlay shell routes using generated test route keys.
- [x] 3.3 Add smoke coverage proving server shell HTML does not reference Vite source paths.
- [x] 3.4 Add representative management API checks for playback, diagnostics, overlay modules, and Twitch status with local test doubles.
- [x] 3.5 Add smoke coverage for built static assets and overlay WebSocket registration using Fastify inject/WebSocket test helpers.
- [x] 3.6 Do not add Playwright coverage in this slice; defer assembled-browser smoke coverage until a concrete browser-execution gap is identified.
- [x] 3.7 Confirm `persist-overlay-module-config` has not landed, so the restart-style durable wiring check remains out of scope for this slice.
- [x] 3.8 If `persist-overlay-module-config` has not landed, document a blocked follow-up task that enables the restart-style durable overlay module config smoke assertion after runtime wiring uses the SQLite-backed module config repository.

## 4. CI And Scripts

- [x] 4.1 Add production-entrypoint smoke validation to `pnpm test`.
- [x] 4.2 Wire the `pnpm test` smoke coverage into CI and documented local validation.
- [x] 4.3 Ensure the script runs through Corepack-compatible commands on Windows, macOS, and Linux.

## 5. Verification

- [x] 5.1 Run `pnpm lint`.
- [x] 5.2 Run `pnpm typecheck`.
- [x] 5.3 Run `pnpm test`.
- [x] 5.4 Run `pnpm build`.
- [x] 5.5 Confirm `pnpm test` runs the production-entrypoint smoke coverage in CI-equivalent mode.

## Blocked Follow-Up

- Enable a restart-style durable overlay module config smoke assertion after `persist-overlay-module-config` lands and runtime wiring uses the SQLite-backed module config repository.
