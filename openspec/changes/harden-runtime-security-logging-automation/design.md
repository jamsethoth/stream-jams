# Design: Harden Runtime Security Logging Automation

## Context

Once the app is served from one local Fastify origin and real secrets are stored durably, the management surface should enforce local browser protections and log enough operational detail to debug streamer setups without leaking secrets. The repo also needs automated dependency update PRs, not just audit reports.

## Goals / Non-Goals

**Goals:**

- Add CSRF protection for management mutations with a browser-compatible token flow.
- Restrict cross-origin requests to known local origins and explicitly handle overlay browser-source routes.
- Wire structured logging into runtime startup with redaction, configurable level, rollover, and retention.
- Surface log configuration and export behavior through management/diagnostics where useful.
- Add Dependabot version updates for workspace package dependencies and GitHub Actions.
- Keep implementation readable by isolating middleware, log configuration, and automation config.

**Non-Goals:**

- Do not add LAN or remote access security models.
- Do not add user accounts or cloud authentication.
- Do not make audit workflows blocking unless a separate baseline-triage decision is made.
- Do not replace existing CodeQL or dependency-review workflows.

## Dependency Gate

Implementation MUST NOT begin until all of these changes have landed in remote `main`:

- `serve-local-web-app-shell`, so origin and CSRF behavior target the final single-origin app.
- `add-production-entrypoint-smoke-tests`, so hardening has an assembled-app validation path.
- `replace-dev-secret-store`, so redaction and logging rules can include the real secret-store behavior.

## Assumptions

- The MVP remains bound to `127.0.0.1` by default.
- Management UI and APIs share one local origin after the app-shell change.
- Overlay routes are not management APIs and need explicit treatment so OBS browser sources keep working.
- Dependabot can be configured without adding write permissions to normal CI jobs.

## Decisions

- Implement CSRF with a management-session-bound synchronizer token returned by the management session/bootstrap flow and sent by the browser client as an `X-Stream-Jams-CSRF` header.
- Apply CSRF to every management-authenticated unsafe method (`POST`, `PUT`, `PATCH`, and `DELETE`) by default. Any exemption must be explicit, documented, and test-covered.
- Add CORS/origin checks as Fastify hooks or plugins with production allowing only the configured app origin and dev/test allowing only explicit config/env origins.
- Reject explicit unapproved `Origin` headers on management routes. Missing or `null` origins may proceed only when management auth and CSRF proof pass, and the server must not emit permissive CORS headers for them.
- Keep overlay HTTP and WebSocket routes outside management CSRF requirements while preserving route-key authorization for browser-source access.
- Wire the existing structured logger/log config/log retention services into runtime composition instead of adding a second logging framework.
- Persist runtime logs as JSONL files under the app data log directory with hourly rollover, default `INFO` level, default 48-hour retention, and fixed structured fields.
- Log provider/runtime data through allowlisted per-event schemas before running the global redactor. Runtime logs must not persist raw provider payloads or raw provider HTTP bodies.
- Keep default diagnostics exports safe and small, with log settings/metadata only. Add a separate debug export path for bounded, redacted recent runtime log entries.
- Add `.github/dependabot.yml` for weekly grouped package ecosystem updates and GitHub Actions updates while preserving least-privilege workflow permissions.

## Initial Implementation Plan

1. Confirm all dependency changes are present in remote `main`.
2. Document the finalized local origin, CSRF, diagnostics export, and logging threat models in the runbook/design notes.
3. Add management CSRF middleware and client token handling.
4. Add local origin/CORS restrictions with overlay route exceptions.
5. Wire structured JSONL logging, retention, redaction, and diagnostics export behavior.
6. Add weekly grouped Dependabot config and CI/runbook docs.
7. Add tests and run the full validation gate.

## Risks / Trade-offs

- CSRF controls can accidentally block legitimate local management actions. Mitigation: add route tests and browser tests for every management mutation category.
- CORS/origin checks can break OBS overlays if applied too broadly. Mitigation: separate management and overlay route policies.
- Log files can grow or leak sensitive data. Mitigation: enforce retention and test redaction against secrets, route keys, tokens, and provider payloads.
- Dependabot can create update noise. Mitigation: use weekly grouped updates and document review expectations.

## Resolved Questions

1. CSRF tokens are management-session-bound synchronizer tokens returned by the management session/bootstrap flow and sent as `X-Stream-Jams-CSRF`.
2. Production allows only the configured app origin. Development and test origins must be explicit config/env allowlist entries.
3. Dependabot version updates run weekly and group low-risk pnpm/npm and GitHub Actions updates.
