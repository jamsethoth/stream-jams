# Tasks

## 1. Dependency Gate

- [x] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [x] 1.2 Verify `add-production-entrypoint-smoke-tests` is present in `origin/main`.
- [x] 1.3 Verify `replace-dev-secret-store` is present in `origin/main`.
- [x] 1.4 Stop implementation if any dependency is absent from remote `main`.

## 2. Management Security

- [x] 2.1 Document the finalized management-session-bound CSRF token flow and local-origin threat model.
- [x] 2.2 Add Fastify middleware/hooks for CSRF validation on management-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` routes, with only explicit test-covered exemptions.
- [x] 2.3 Add local origin/CORS allowlist behavior for management routes: configured app origin in production, explicit config/env origins in dev/test, and no permissive CORS for missing or null origins.
- [x] 2.4 Explicitly exempt or separately handle authorized overlay routes so OBS browser sources keep working.
- [x] 2.5 Update the management API client to send the session-bound `X-Stream-Jams-CSRF` header with state-changing requests.

## 3. Runtime Logging

- [x] 3.1 Wire existing structured logger, log config service, and retention service into runtime startup with JSONL app-data log files and hourly rollover.
- [x] 3.2 Add allowlisted log events for provider calls, management security decisions, playback transitions, diagnostics exports, and operational errors without persisting raw provider payloads or raw provider HTTP bodies.
- [x] 3.3 Add configurable log level and retention settings with `INFO` and 48 hours as safe defaults.
- [x] 3.4 Extend diagnostics/export behavior with safe log metadata by default and a separate bounded debug export path for redacted recent runtime log entries.

## 4. Dependency Automation

- [x] 4.1 Add `.github/dependabot.yml` for pnpm/npm workspace dependencies.
- [x] 4.2 Add `.github/dependabot.yml` updates for GitHub Actions.
- [x] 4.3 Group low-risk dependency updates on a weekly cadence and document review expectations.
- [x] 4.4 Confirm CI workflow permissions remain least-privilege.

## 5. Verification

- [x] 5.1 Add route tests for CSRF success/failure, unsafe-method coverage, explicit exemptions, and origin allowlist behavior including missing/null origins.
- [x] 5.2 Add overlay tests proving browser-source routes are not broken by management security controls.
- [x] 5.3 Add logger tests for allowlisted fields, raw provider payload exclusion, redaction, level filtering, hourly rollover, and 48-hour default retention.
- [x] 5.4 Add diagnostics tests proving default exports omit runtime log entries and debug exports include only bounded redacted recent entries.
- [x] 5.5 Validate Dependabot config syntax, weekly grouping behavior, and workflow permissions.
- [x] 5.6 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, production smoke tests, and applicable e2e tests.

## 6. Documentation

- [x] 6.1 Update `docs/mvp-runbook.md` with security, logging, and troubleshooting behavior.
- [x] 6.2 Update final-review notes to remove the CSRF/CORS, logging, and dependency automation gaps after implementation.
