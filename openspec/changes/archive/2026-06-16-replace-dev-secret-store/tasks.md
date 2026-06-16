# Tasks

## 1. Dependency Gate

- [x] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [x] 1.2 Re-read current runtime composition before editing startup wiring.
- [x] 1.3 Stop implementation if the app-shell runtime composition is not present in remote `main`.

## 2. Platform Decision

- [x] 2.1 Evaluate maintained npm credential adapter options for Windows, macOS, and Linux.
- [x] 2.2 Document the chosen adapter, exact dependency impact, and fallback behavior.
- [x] 2.3 Confirm no selected approach stores plaintext secrets in repo, SQLite, config, or browser-accessible files.

## 3. Runtime Implementation

- [x] 3.1 Add a secret-store factory that uses the same durable OS-backed path for normal development and production/local-app modes.
- [x] 3.2 Wire Twitch OAuth and EventSub runtime services through the factory.
- [x] 3.3 Ensure unsupported credential storage reports non-secret health diagnostics while Twitch OAuth/token operations fail closed.
- [x] 3.4 Keep `DevSecretStore` or fake stores available only for explicit test injection, not normal development runtime.

## 4. Verification

- [x] 4.1 Add fake-adapter unit tests for `OsSecretStore` runtime selection.
- [x] 4.2 Add restart-style integration tests for Twitch token reference persistence and secret retrieval.
- [x] 4.3 Add diagnostics/export tests proving token values are redacted.
- [x] 4.4 Add startup failure tests for unavailable credential storage.
- [x] 4.5 Add coverage proving normal development and production/local-app runtime modes select the durable secret-store path.
- [x] 4.6 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and relevant smoke tests.

## 5. Documentation

- [x] 5.1 Update `docs/mvp-runbook.md` with credential-store behavior and troubleshooting.
- [x] 5.2 Update final-review notes that currently identify the development secret store gap.
