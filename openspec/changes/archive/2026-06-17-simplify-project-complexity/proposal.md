## Why

Recent MVP slices left useful behavior in place, but also left small wrappers, duplicated HTTP/session helpers, duplicated DTO shapes, and speculative UI field types that add review and maintenance cost. This change trims complexity that does not currently buy product value while preserving the product-plan seams that are already justified by runtime, security, persistence, or future module requirements.

## What Changes

- Delete one-call wrappers such as the server-side static overlay module registry and wire the existing core registry factory directly.
- Replace duplicated management-session, CSRF, JSON request, and error-handling code in web API clients with one small local HTTP helper.
- Reuse exported core alert and event types in the alert configuration web API instead of maintaining parallel DTO definitions.
- Remove unused overlay module wizard field kinds that have no renderer support or module definitions yet.
- Consolidate repeated test-only secret store and sequence helpers into existing test support instead of duplicating local fakes across server tests.
- Keep repository, service, provider, SQLite, secret-store, and runtime composition seams that are currently backed by product-plan or security requirements.

## Capabilities

### New Capabilities
- `project-complexity-management`: Audit-backed simplification requirements for removing unsupported abstractions, duplicate client helpers, duplicated DTOs, and repeated test fakes without changing user-facing behavior.

### Modified Capabilities

## Impact

- Affected code: `apps/server/src/runtime/runtime-composition.ts`, `apps/server/src/modules/overlay-modules/static-module-registry.ts`, `apps/web/src/management/management-api.ts`, `apps/web/src/management/modules/alerts/alert-api.ts`, `apps/web/src/management/modules/ModuleManagementPanel.tsx`, `packages/core/src/overlay-modules/{types.ts,schemas.ts}`, `packages/test-support/src/index.ts`, and server tests that duplicate secret-store fixtures.
- Affected APIs: internal TypeScript client/helper boundaries only; no HTTP route, WebSocket, persisted schema, or user workflow behavior change is intended.
- Dependencies: no new runtime or dev dependencies.
- Validation: existing unit, typecheck, lint, build, and relevant Playwright coverage should remain green.
