## 1. Mechanical Cuts

- [x] 1.1 Delete `apps/server/src/modules/overlay-modules/static-module-registry.ts` and import `createDefaultOverlayModuleRegistry` directly in runtime composition.
- [x] 1.2 Remove `select`, `asset`, and `color` from overlay module wizard field type unions and Zod validation until real controls exist.
- [x] 1.3 Update affected module registry, module panel, and schema tests for the reduced wizard field set.

## 2. Web Client Simplification

- [x] 2.1 Add one small management HTTP helper for session creation, CSRF headers, JSON bodies, JSON response parsing, and `readHttpError` fallback handling.
- [x] 2.2 Refactor `apps/web/src/management/management-api.ts` to use the helper without changing endpoint paths or response mapping.
- [x] 2.3 Refactor `apps/web/src/management/modules/alerts/alert-api.ts` to use the helper.
- [x] 2.4 Replace duplicated alert and test-event DTO definitions in the alert API with exported core types plus narrow UI-specific aliases where needed.
- [x] 2.5 Update web API unit tests to cover the shared helper path and prove CSRF/session behavior remains unchanged.

## 3. Test Fixture Consolidation

- [x] 3.1 Add repeated generic test helpers to `packages/test-support`, starting with an in-memory `SecretStore` and deterministic sequence helper.
- [x] 3.2 Replace duplicated local secret-store and sequence helpers in server tests where the helper is behavior-neutral.
- [x] 3.3 Leave behavior-specific fakes local to their tests.

## 4. Verification

- [x] 4.1 Run `corepack.cmd pnpm typecheck`.
- [x] 4.2 Run `corepack.cmd pnpm lint`.
- [x] 4.3 Run `corepack.cmd pnpm test`.
- [x] 4.4 Run `corepack.cmd pnpm build`.
- [x] 4.5 Run targeted Playwright coverage if any rendered management behavior changes. Not applicable; no rendered management workflow changed.
- [x] 4.6 Re-run `openspec.cmd status --change simplify-project-complexity` and confirm the change remains apply-ready.
