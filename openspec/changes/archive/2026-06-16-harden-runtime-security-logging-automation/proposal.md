# Proposal: Harden Runtime Security Logging Automation

## Why

The product plan calls out CSRF protection, local-origin/CORS restrictions, first-class structured logging, retention, redaction, and dependency update automation. Current CI and diagnostics are useful, but the local runtime still lacks several explicit security/logging controls and the repo has audit reporting without Dependabot update automation.

## What Changes

- Add explicit management CSRF protection for state-changing requests.
- Restrict CORS/origin behavior to known local origins while preserving OBS browser-source overlay behavior.
- Wire structured runtime logging with configurable level, hourly/durable files, retention, and redaction.
- Expand diagnostics and runbook coverage for log location, retention, redaction, and provider/security events.
- Add Dependabot version-update automation for pnpm/npm and GitHub Actions.
- Keep GitHub Actions permissions least-privilege and preserve existing CodeQL/dependency-review behavior.

## Capabilities

### New Capabilities

- `local-management-security`: Local management APIs enforce CSRF and origin protections appropriate for the single-origin local app.
- `runtime-log-operations`: Runtime logging produces redacted structured logs with level configuration and retention.
- `dependency-update-automation`: Repository automation opens routine dependency update pull requests in addition to audit reporting.

### Modified Capabilities

None. No repo-local base specs exist yet for this behavior.

## Impact

- Affected code: Fastify hooks/middleware, management API client, diagnostics/logger wiring, config services, CI workflows, Dependabot config, tests, and runbook docs.
- Dependencies: implementation MUST wait until `serve-local-web-app-shell`, `add-production-entrypoint-smoke-tests`, and `replace-dev-secret-store` are merged and present in remote `main`.
