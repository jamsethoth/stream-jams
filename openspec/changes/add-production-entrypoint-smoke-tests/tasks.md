# Tasks

## 1. Dependency Gate

- [ ] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [ ] 1.2 Confirm the final `/manage` and overlay shell URL contract from remote `main`.
- [ ] 1.3 Confirm production-entrypoint smoke coverage uses the Fastify-served local runtime path, not the Vite hot-reload development server.
- [ ] 1.4 Stop implementation if the dependency is absent or only exists in an unmerged branch.

## 2. Composition Test Harness

- [ ] 2.1 Extract or identify a production app composition factory used by runtime startup.
- [ ] 2.2 Add temp config, temp SQLite, and external-client test-double support without weakening production defaults.
- [ ] 2.3 Keep the harness in a shared test-support location if it will be reused by later slices.

## 3. Smoke Coverage

- [ ] 3.1 Add smoke coverage for `/health` and `/manage`.
- [ ] 3.2 Add smoke coverage for module and unified overlay shell routes using generated test route keys.
- [ ] 3.3 Add smoke coverage proving server shell HTML does not reference Vite source paths.
- [ ] 3.4 Add representative management API checks for playback, diagnostics, overlay modules, and Twitch status with local test doubles.
- [ ] 3.5 Add a restart-style durable wiring check for overlay module config if that dependency has landed; otherwise leave a blocked task reference to `persist-overlay-module-config`.

## 4. CI And Scripts

- [ ] 4.1 Add a script for production-entrypoint smoke validation.
- [ ] 4.2 Wire the script into CI and documented local validation.
- [ ] 4.3 Ensure the script runs through Corepack-compatible commands on Windows, macOS, and Linux.

## 5. Verification

- [ ] 5.1 Run `pnpm lint`.
- [ ] 5.2 Run `pnpm typecheck`.
- [ ] 5.3 Run `pnpm test`.
- [ ] 5.4 Run `pnpm build`.
- [ ] 5.5 Run the new production-entrypoint smoke command in CI-equivalent mode.
