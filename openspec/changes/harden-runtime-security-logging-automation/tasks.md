# Tasks

## 1. Dependency Gate

- [ ] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [ ] 1.2 Verify `add-production-entrypoint-smoke-tests` is present in `origin/main`.
- [ ] 1.3 Verify `replace-dev-secret-store` is present in `origin/main`.
- [ ] 1.4 Stop implementation if any dependency is absent from remote `main`.

## 2. Management Security

- [ ] 2.1 Define CSRF token flow for management sessions and document the threat model.
- [ ] 2.2 Add Fastify middleware/hooks for CSRF validation on management mutations.
- [ ] 2.3 Add local origin/CORS allowlist behavior for management routes.
- [ ] 2.4 Explicitly exempt or separately handle authorized overlay routes so OBS browser sources keep working.
- [ ] 2.5 Update the management API client to send CSRF proof with state-changing requests.

## 3. Runtime Logging

- [ ] 3.1 Wire existing structured logger, log config service, and retention service into runtime startup.
- [ ] 3.2 Add log events for provider calls, management security decisions, playback transitions, diagnostics exports, and operational errors.
- [ ] 3.3 Add configurable log level and retention settings with safe defaults.
- [ ] 3.4 Extend diagnostics/export behavior with safe log metadata and redacted operational entries.

## 4. Dependency Automation

- [ ] 4.1 Add `.github/dependabot.yml` for pnpm/npm workspace dependencies.
- [ ] 4.2 Add `.github/dependabot.yml` updates for GitHub Actions.
- [ ] 4.3 Group low-risk dependency updates and document cadence.
- [ ] 4.4 Confirm CI workflow permissions remain least-privilege.

## 5. Verification

- [ ] 5.1 Add route tests for CSRF success/failure and origin allowlist behavior.
- [ ] 5.2 Add overlay tests proving browser-source routes are not broken by management security controls.
- [ ] 5.3 Add logger tests for redaction, level filtering, rollover, and retention.
- [ ] 5.4 Add diagnostics tests proving exports stay redacted.
- [ ] 5.5 Validate Dependabot config syntax and workflow permissions.
- [ ] 5.6 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, production smoke tests, and applicable e2e tests.

## 6. Documentation

- [ ] 6.1 Update `docs/mvp-runbook.md` with security, logging, and troubleshooting behavior.
- [ ] 6.2 Update final-review notes to remove the CSRF/CORS, logging, and dependency automation gaps after implementation.
