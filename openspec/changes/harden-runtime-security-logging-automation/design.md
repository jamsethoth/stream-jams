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

- Implement CSRF as a management-session-bound or local token mechanism rather than relying only on bearer tokens and same-origin defaults.
- Add CORS/origin checks as Fastify hooks or plugins with a small allowlist derived from configured host/port and local development origins.
- Wire the existing structured logger/log config/log retention services into runtime composition instead of adding a second logging framework.
- Add `.github/dependabot.yml` for package ecosystem updates and GitHub Actions updates, grouping low-risk updates where maintainable.

## Initial Implementation Plan

1. Confirm all dependency changes are present in remote `main`.
2. Define the local origin and CSRF threat model in the runbook/design notes.
3. Add management CSRF middleware and client token handling.
4. Add local origin/CORS restrictions with overlay route exceptions.
5. Wire structured logging, retention, and diagnostics export behavior.
6. Add Dependabot config and CI/runbook docs.
7. Add tests and run the full validation gate.

## Risks / Trade-offs

- CSRF controls can accidentally block legitimate local management actions. Mitigation: add route tests and browser tests for every management mutation category.
- CORS/origin checks can break OBS overlays if applied too broadly. Mitigation: separate management and overlay route policies.
- Log files can grow or leak sensitive data. Mitigation: enforce retention and test redaction against secrets, route keys, tokens, and provider payloads.
- Dependabot can create update noise. Mitigation: group compatible updates and document review expectations.

## Open Questions

1. Should CSRF tokens be bound to management sessions, stored in a same-site cookie, or returned through a bootstrap endpoint?
2. Which local development origins should be allowed while Vite hot reload remains supported, if any?
3. Should Dependabot version updates be weekly by default, or grouped monthly until the dependency baseline is stable?
