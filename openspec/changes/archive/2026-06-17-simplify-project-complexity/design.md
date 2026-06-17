## Context

The audit ran against `origin/main` at `bdc7dec`. The repo is healthy enough that most service, repository, provider, SQLite, and secret-store interfaces should stay: they support product-plan boundaries around local runtime wiring, secure storage, overlay authorization, persistence, and future modules. The removable complexity is smaller and more concrete: one-call wrappers, duplicated web HTTP session helpers, duplicated web DTO types, unused module wizard field kinds, and repeated test fakes.

## Goals / Non-Goals

**Goals:**
- Reduce code paths without changing HTTP routes, persisted data, overlay URL behavior, or user workflows.
- Keep simplifications mechanical and reviewable.
- Make future drift easier to catch through type reuse and existing tests.
- Use existing packages and standard platform APIs only.

**Non-Goals:**
- Do not replace repository/service/provider boundaries justified by current runtime or product requirements.
- Do not refactor SQLite repositories, runtime composition, or Fastify route modules beyond direct simplifications.
- Do not add a generic client framework or new dependency.
- Do not implement deferred module field controls such as select, asset, or color pickers.

## Decisions

1. Delete wrappers before adding helpers.

   `apps/server/src/modules/overlay-modules/static-module-registry.ts` only calls `createDefaultOverlayModuleRegistry()` and has one caller. Import the core factory directly in runtime composition and remove the wrapper.

2. Add one tiny web HTTP helper because duplication is already real.

   `management-api.ts` and `alert-api.ts` each create management sessions, cache session IDs and CSRF tokens, build headers, JSON-stringify requests, parse HTTP errors, and cast JSON responses. A local helper should own only those repeated mechanics. It should not become endpoint metadata, code generation, or a router abstraction.

3. Reuse core alert/event types instead of maintaining parallel DTOs.

   The web alert API can import shared core types already exported by `@stream-jams/core`, then keep only UI-specific aliases where it intentionally narrows the editor surface. This turns drift into a typecheck failure instead of another manual audit.

4. Cut unsupported wizard field kinds.

   Core and web types currently list `select`, `asset`, and `color`, but no module definition uses them and the renderer treats non-boolean/non-number fields as text. Remove those field kinds until real controls exist.

5. Consolidate generic test doubles only when they are used more than once.

   `packages/test-support` already exists. Put repeatable generic helpers there, such as in-memory `SecretStore` and deterministic sequence helpers. Leave one-off fakes local.

## Risks / Trade-offs

- Web helper becomes too broad -> keep it request-level only: session, headers, JSON body, HTTP error text.
- Type reuse exposes intentional UI narrowing -> keep narrow aliases at the UI boundary and document them in tests.
- Removing field kinds blocks future module metadata -> re-add field kinds with matching rendered controls and tests when a real module needs them.
- Test-support imports add indirection -> move only repeated generic fakes, not behavior-specific fake services.

## Migration Plan

1. Make mechanical code cuts and helper extraction.
2. Update tests/imports affected by deleted wrappers or consolidated fakes.
3. Run typecheck, lint, unit tests, build, and targeted Playwright if UI behavior is touched.
4. Rollback is normal Git revert; no data migration or user config migration is required.

## Open Questions

- None blocking. Future modules can reintroduce richer wizard field kinds with real controls and tests.
