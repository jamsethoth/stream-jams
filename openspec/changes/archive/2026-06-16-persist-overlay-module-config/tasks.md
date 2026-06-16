# Tasks

## 1. Dependency Gate

- [x] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [x] 1.2 Re-read current runtime composition before editing module config wiring.
- [x] 1.3 Stop implementation if the dependency is absent from remote `main`.

## 2. Runtime Wiring

- [x] 2.1 Replace `InMemoryServerOverlayModuleConfigRepository` runtime wiring with `SqliteOverlayModuleConfigRepository`.
- [x] 2.2 Keep in-memory repositories only for explicit tests or narrow test fixtures.
- [x] 2.3 Ensure database migrations create the required table before the module config service is used.

## 3. UI And Contract Audit

- [x] 3.1 Audit module wizard fields against `alertsOverlayModuleConfigSchema`.
- [x] 3.2 Remove or hide fields that are not schema-backed durable module config.
- [x] 3.3 Keep alert rule/variant setup out of this slice unless needed to prevent misleading persistence behavior.

## 4. Verification

- [x] 4.1 Add restart-style integration tests for saving config, recreating services over the same SQLite database, and reading config back.
- [x] 4.2 Add tests for invalid config rejection, unknown field rejection, and fresh database defaults.
- [x] 4.3 Add UI/API tests covering saved canvas config behavior.
- [x] 4.4 Add one narrow production-runtime smoke check proving durable module config wiring.
- [x] 4.5 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and applicable smoke/e2e checks.

## 5. Documentation

- [x] 5.1 Update `docs/mvp-final-review.md` or successor review notes to remove the in-memory module config gap after implementation.
- [x] 5.2 Document durable module config behavior in the runbook if user-visible.
