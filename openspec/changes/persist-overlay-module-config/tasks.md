# Tasks

## 1. Dependency Gate

- [ ] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [ ] 1.2 Re-read current runtime composition before editing module config wiring.
- [ ] 1.3 Stop implementation if the dependency is absent from remote `main`.

## 2. Runtime Wiring

- [ ] 2.1 Replace `InMemoryServerOverlayModuleConfigRepository` runtime wiring with `SqliteOverlayModuleConfigRepository`.
- [ ] 2.2 Keep in-memory repositories only for explicit tests or narrow test fixtures.
- [ ] 2.3 Ensure database migrations create the required table before the module config service is used.

## 3. UI And Contract Audit

- [ ] 3.1 Audit module wizard fields against `alertsOverlayModuleConfigSchema`.
- [ ] 3.2 Remove, defer, or explicitly document fields that are not schema-backed durable module config.
- [ ] 3.3 Keep alert rule/variant setup out of this slice unless needed to prevent misleading persistence behavior.

## 4. Verification

- [ ] 4.1 Add restart-style integration tests for saving config, recreating services over the same SQLite database, and reading config back.
- [ ] 4.2 Add tests for invalid config rejection and fresh database defaults.
- [ ] 4.3 Add UI/API tests covering saved canvas config behavior.
- [ ] 4.4 Add or update production-entrypoint smoke coverage if that test harness exists on remote `main`.
- [ ] 4.5 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and applicable smoke/e2e checks.

## 5. Documentation

- [ ] 5.1 Update `docs/mvp-final-review.md` or successor review notes to remove the in-memory module config gap after implementation.
- [ ] 5.2 Document durable module config behavior in the runbook if user-visible.
