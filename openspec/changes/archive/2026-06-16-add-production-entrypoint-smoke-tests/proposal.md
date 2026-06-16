# Proposal: Add Production Entrypoint Smoke Tests

## Why

Current unit and Playwright coverage can pass while the assembled local app remains broken because browser tests run against Vite and mock several backend routes. The MVP needs a small production-entrypoint test layer that proves the actual Fastify composition serves the management shell, overlay shell, APIs, and critical runtime adapters together.

## What Changes

- Add tests that compose or start the production server graph through the same factory used by runtime startup.
- Verify the server-served management and overlay shells are reachable from the configured local origin.
- Verify key runtime adapters are wired to durable or intended implementations, not stale in-memory placeholders.
- Keep browser-heavy workflows in Playwright, but make the production-entrypoint smoke path fast and deterministic.
- Update CI/scripts so this validation runs as part of normal pre-PR gates.

## Capabilities

### New Capabilities

- `production-entrypoint-validation`: Automated validation proves the production app composition is assembled and exposes the expected local surfaces.

### Modified Capabilities

None. No repo-local base specs exist yet for this behavior.

## Impact

- Affected code: server runtime composition, test-support helpers, Vitest integration tests, Playwright configuration if an assembled-app browser smoke is added, CI workflow scripts, and runbook validation docs.
- Dependencies: implementation MUST wait until `serve-local-web-app-shell` is merged and present in remote `main`, because this change validates that serving contract.
