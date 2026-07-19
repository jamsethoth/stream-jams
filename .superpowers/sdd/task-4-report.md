# Task 4 Report: Twitch Authorization Readiness

## Files

- Server OAuth, account status, EventSub runtime, provider validation, route fixtures, and runtime composition smoke coverage.
- `packages/core/src/management/contracts.ts`, `apps/server/src/modules/providers/management-ui-service.ts`, and `apps/server/src/runtime/runtime-composition.ts` project Twitch authorization readiness into every event-source row and detail response.
- `apps/web/src/management/management-api.ts`, `apps/web/src/management/providers/ProviderPage.tsx`, and `apps/web/src/management/providers/ProviderPages.stories.tsx` validate coherent readiness states and expose recovery in the Event Sources list, detail, and stories.
- `apps/server/src/modules/providers/management-ui-service.test.ts`, `apps/web/src/management/management-api.test.ts`, and `apps/web/src/management/providers/ProviderPages.test.tsx` cover the follow-up behavior.
- `apps/server/src/runtime/runtime-composition.ts` keeps recovery text inline but exposes an Open Diagnostics correction only for runtime failures with a reference ID; `apps/server/src/runtime/runtime-composition.test.ts` covers both cases.
- `openspec/changes/add-normalized-twitch-event-types/tasks.md` marks 4.1 through 4.3 complete.

## Tests

- `corepack.cmd pnpm vitest run --reporter=json apps/server/src/modules/twitch/twitch-oauth-service.test.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts apps/server/src/modules/providers/provider-management-adapters.test.ts apps/server/src/http/routes/twitch-auth.test.ts apps/web/src/management/management-api.test.ts apps/web/src/management/providers/ProviderPages.test.tsx apps/server/src/runtime/runtime-composition.smoke.test.ts`
  - PASS: 14 suites, 95 tests.
- `corepack.cmd pnpm typecheck`
  - PASS.
- `corepack.cmd pnpm vitest run apps/server/src/runtime/runtime-composition.test.ts`
  - PASS: 1 file, 1 test.
- `corepack.cmd pnpm vitest run apps/server/src/modules/twitch/twitch-oauth-service.test.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts apps/server/src/modules/providers/provider-management-adapters.test.ts apps/server/src/modules/providers/management-ui-service.test.ts apps/server/src/http/routes/twitch-auth.test.ts apps/web/src/management/management-api.test.ts apps/web/src/management/providers/ProviderPages.test.tsx apps/server/src/runtime/runtime-composition.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts`
  - PASS: 9 files, 105 tests.
- `corepack.cmd pnpm typecheck`
  - PASS.
- `corepack.cmd pnpm vitest run --reporter=json apps/server/src/modules/twitch/twitch-oauth-service.test.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts apps/server/src/modules/providers/provider-management-adapters.test.ts apps/server/src/modules/providers/management-ui-service.test.ts apps/server/src/http/routes/twitch-auth.test.ts apps/web/src/management/management-api.test.ts apps/web/src/management/providers/ProviderPages.test.tsx apps/server/src/runtime/runtime-composition.smoke.test.ts`
  - PASS: 8 files, 104 tests.
- `corepack.cmd pnpm typecheck`
  - PASS.

## Concerns

- No token schema migration was needed; account metadata and secret references remain unchanged when scopes are missing.
- Storybook states were updated, but the full Storybook build and test-runner gates were not run because the checkpoint required only the focused suite and typecheck.
