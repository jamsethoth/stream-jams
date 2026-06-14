# Tasks

## 1. Dependency Gate

- [ ] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [ ] 1.2 Re-read current runtime composition before editing startup wiring.
- [ ] 1.3 Stop implementation if the app-shell runtime composition is not present in remote `main`.

## 2. Platform Decision

- [ ] 2.1 Evaluate Windows, macOS, and Linux credential adapter options.
- [ ] 2.2 Document the chosen adapter, exact dependency impact, and fallback behavior.
- [ ] 2.3 Confirm no selected approach stores plaintext secrets in repo, SQLite, config, or browser-accessible files.

## 3. Runtime Implementation

- [ ] 3.1 Add a secret-store factory with explicit development, test, and production/local-app modes.
- [ ] 3.2 Wire Twitch OAuth and EventSub runtime services through the factory.
- [ ] 3.3 Ensure unsupported production credential storage fails closed with actionable non-secret errors.
- [ ] 3.4 Keep `DevSecretStore` available only for explicit development/test paths.

## 4. Verification

- [ ] 4.1 Add fake-adapter unit tests for `OsSecretStore` runtime selection.
- [ ] 4.2 Add restart-style integration tests for Twitch token reference persistence and secret retrieval.
- [ ] 4.3 Add diagnostics/export tests proving token values are redacted.
- [ ] 4.4 Add startup failure tests for unavailable credential storage.
- [ ] 4.5 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and relevant smoke tests.

## 5. Documentation

- [ ] 5.1 Update `docs/mvp-runbook.md` with credential-store behavior and troubleshooting.
- [ ] 5.2 Update final-review notes that currently identify the development secret store gap.
