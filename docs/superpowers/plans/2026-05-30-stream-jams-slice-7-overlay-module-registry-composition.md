# Stream Jams Slice 7 Overlay Module Registry And Composition Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement Slice 7 by registering Alerts as the first overlay module, adding module enable/disable configuration, exposing module configuration routes, and resolving module-specific and unified overlay compositions without coupling composition to alert internals.

**Architecture:** Keep overlay module platform behavior in `@stream-jams/core` as framework-independent services over explicit repository and runtime interfaces. Server code supplies a static MVP module registry, an in-memory module-config repository until Slice 8 replaces it with SQLite, and thin Fastify routes protected by the existing management auth/rate-limit hooks. Composition returns normalized module snapshots and never imports alert matching, Twitch, TTS, React, SQLite, or Fastify behavior.

**Tech Stack:** TypeScript, Zod schemas, Fastify route modules, Vitest, existing pnpm workspace scripts.

---

## Source Scope

Base slice: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, Slice 7.

Slice 7 required behavior:

- Implement `OverlayModuleRegistry` with static registration for the Alerts module.
- Implement `OverlayModuleConfigService` with enabled/disabled state per module.
- Implement wizard/form metadata support through `OverlayModuleWizardDefinition`.
- Implement `OverlayCompositionService.resolveModuleOutput` for one module-specific overlay.
- Implement `OverlayCompositionService.resolveUnifiedOutput` for all enabled modules selected for a unified overlay.
- Add HTTP routes for listing modules, reading module config, saving module config, and toggling module enabled state.
- Unit test module registration, unknown module lookup, module enable/disable, and wizard schema validation.
- Unit test that disabled modules are excluded from module-specific and unified overlay composition.

Acceptance checks:

- Alerts are registered as an overlay module.
- Module enable/disable is independent from alert rule enable/disable.
- The composition service can resolve both module-specific and unified overlay outputs without importing alert internals.

Non-goals:

- SQLite-backed module-config persistence; Slice 8 owns the durable repository.
- Alert rule/collection/variant CRUD; Slice 10 owns alert configuration.
- Browser overlay transport/rendering; Slice 13 owns WebSocket and overlay shell behavior.
- Management UI screens; Slice 14 owns the module management UI.
- Multiple instances per module; MVP uses one configured canvas per module.

## Baseline Evidence

- `origin/main` was refreshed and includes PR #20 (`29f552e`) with repo-level `AGENTS.md` and Node 24 Codex environment setup.
- Branch `codex/slice-7-overlay-module-registry` was created from `origin/main` and fast-forwarded to `29f552e`.
- Fresh `pnpm install --frozen-lockfile` passed in the isolated slice 7 worktree.
- Fresh `pnpm test` alone failed before `dist/` existed because server tests resolved `@stream-jams/core` package exports to missing built output.
- Root cause: the repository validation order runs `pnpm typecheck` before `pnpm test`; `tsc -b` emits package `dist/` output used by workspace package exports.
- Baseline `pnpm typecheck` passed.
- Baseline `pnpm test` after typecheck passed: 27 test files, 83 tests.

## File Ownership

- Create `packages/core/src/overlay-modules/module-definition.ts`: Alerts module definition and helpers for validating module definitions.
- Create `packages/core/src/overlay-modules/module-registry.ts`: static registry implementation and registry contract.
- Create `packages/core/src/overlay-modules/module-config-service.ts`: module config repository boundary, in-memory implementation for tests, and service behavior.
- Create `packages/core/src/overlay-modules/overlay-composition-service.ts`: composition service over registry, config repository, and module runtime snapshots.
- Modify `packages/core/src/overlay-modules/types.ts`: add registry/config/composition/runtime interfaces where useful for consumers.
- Modify `packages/core/src/overlay-modules/schemas.ts`: tighten module definition/config validation where Slice 7 needs runtime checks.
- Modify `packages/core/src/overlays/types.ts`: keep request and composition contracts compatible with the composition service.
- Modify `packages/core/src/index.ts`: export Slice 7 module platform services and the Alerts module definition.
- Add `packages/core/src/overlay-modules/*.test.ts`: focused service and schema tests.
- Create `apps/server/src/modules/overlay-modules/static-module-registry.ts`: server adapter that exposes the static Alerts registry.
- Create `apps/server/src/modules/overlay-modules/in-memory-module-config-repository.ts`: MVP in-memory repository until Slice 8 adds SQLite.
- Create `apps/server/src/http/routes/overlay-modules.ts`: management-protected routes for module list, config read/save, and enabled-state toggle.
- Create `apps/server/src/http/routes/overlay-modules.test.ts`: HTTP route tests for auth, validation, config persistence, and thin handler behavior.
- Modify `apps/server/src/app.ts`: register overlay-module routes when dependencies are supplied.
- Modify `apps/server/src/app.test.ts`: assert route registration dependency guards.
- Modify `apps/server/src/index.ts`: compose static module registry and in-memory module-config repository for MVP runtime wiring.
- Modify `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`: mark Slice 7 complete only after implementation, validation, and reconciliation.
- Modify this plan as execution proceeds: check boxes only after implementation and validation pass.

## Sub-Slice 7.1: Core Module Registry And Alerts Definition

**Objective:** Add a framework-independent static module registry and register Alerts as the first built-in overlay module with wizard/form metadata.

**Expected files or areas touched:**

- `packages/core/src/overlay-modules/module-definition.ts`
- `packages/core/src/overlay-modules/module-registry.ts`
- `packages/core/src/overlay-modules/module-registry.test.ts`
- `packages/core/src/overlay-modules/schemas.test.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [x] Write failing tests that expect `createDefaultOverlayModuleRegistry().listModules()` to include exactly the built-in Alerts module.
- [x] Write failing tests that expect unknown module lookup to return `null`.
- [x] Write failing schema tests for valid Alerts wizard metadata and invalid empty wizard steps.
- [x] Run focused tests and confirm they fail for missing registry/definition exports.
- [x] Implement the Alerts module definition with id `alerts`, display name `Alerts`, default enabled state, config schema version, default config, wizard steps, and renderer metadata.
- [x] Implement `StaticOverlayModuleRegistry` with duplicate-id rejection, stable list ordering, and `getModule`.
- [x] Export the registry, definition, and helpers from `@stream-jams/core`.
- [x] Run focused tests and confirm they pass.

**Positive test cases:**

- Alerts module is registered with module and unified output support.
- Alerts wizard metadata validates through `overlayModuleWizardDefinitionSchema`.
- Registry list order is stable.

**Negative test cases:**

- Unknown module ids return `null`.
- Duplicate module ids throw a deterministic setup error.
- Empty wizard definitions fail schema validation.

**Non-trivial assertions:**

- Alerts module wizard includes at least one required field and does not require alert-rule CRUD to exist yet.
- Registry returns readonly module definitions rather than mutable internal arrays.

**Validation commands:**

- `pnpm test -- packages/core/src/overlay-modules/module-registry.test.ts packages/core/src/overlay-modules/schemas.test.ts`

**Acceptance criteria:**

- Alerts is available as a module definition through core registry APIs without importing alert matching internals.

## Sub-Slice 7.2: Module Config Service

**Objective:** Add enabled/disabled state and config persistence behind a typed repository boundary that can later be backed by SQLite.

**Expected files or areas touched:**

- `packages/core/src/overlay-modules/module-config-service.ts`
- `packages/core/src/overlay-modules/module-config-service.test.ts`
- `packages/core/src/overlay-modules/types.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [x] Write failing tests for default config creation, reading saved config, saving valid config, toggling enabled state, and unknown module rejection.
- [x] Run focused tests and confirm missing-service failures.
- [x] Define `OverlayModuleConfigRepository` and `OverlayModuleConfigService` contracts.
- [x] Implement service behavior that falls back to registry defaults when no persisted config exists.
- [x] Validate module config records before returning or saving them.
- [x] Implement an in-memory repository for focused tests and MVP server wiring.
- [x] Run focused tests and confirm they pass.

**Positive test cases:**

- A module without persisted config returns default config and default enabled state.
- Saving config preserves module id, enabled state, config payload, and ISO update time.
- Toggling enabled state preserves existing config payload.

**Negative test cases:**

- Unknown module id reads, saves, and toggles are rejected with typed errors.
- Invalid persisted module config records are rejected before service consumers receive them.

**Non-trivial assertions:**

- Module enable/disable is stored on `OverlayModuleConfig` and is independent from any future alert rule enabled flag.
- Service code depends on registry and repository interfaces, not concrete server adapters.

**Validation commands:**

- `pnpm test -- packages/core/src/overlay-modules/module-config-service.test.ts`

**Acceptance criteria:**

- Module configuration can be tested and used without Fastify, SQLite, or React.

## Sub-Slice 7.3: Overlay Composition Service

**Objective:** Resolve module-specific and unified overlay compositions from registry, module config, and runtime snapshots while excluding disabled modules.

**Expected files or areas touched:**

- `packages/core/src/overlay-modules/overlay-composition-service.ts`
- `packages/core/src/overlay-modules/overlay-composition-service.test.ts`
- `packages/core/src/overlay-modules/types.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [x] Write failing tests for resolving enabled module-specific output, disabled module-specific output, unified output with selected enabled modules, disabled module exclusion, and unknown module rejection.
- [x] Run focused tests and confirm missing-service failures.
- [x] Define `OverlayModuleRuntime` or snapshot-provider contract for retrieving module snapshots without importing module internals.
- [x] Implement `DefaultOverlayCompositionService.resolveModuleOutput`.
- [x] Implement `DefaultOverlayCompositionService.resolveUnifiedOutput`.
- [x] Validate returned compositions with `overlayCompositionSchema` in tests.
- [x] Run focused tests and confirm they pass.

**Positive test cases:**

- Enabled Alerts module-specific output returns one Alerts module snapshot with `scope: "module"`.
- Unified output returns snapshots for selected modules that are both registered and enabled.

**Negative test cases:**

- Disabled modules are excluded from module-specific output and unified output.
- Unknown modules are rejected or skipped according to the service contract, with deterministic typed behavior.
- Runtime snapshots with mismatched module ids are rejected before composition returns.

**Non-trivial assertions:**

- Composition never imports alert matching, alert repositories, Twitch provider code, TTS providers, Fastify, SQLite, or React.
- Live/test purpose and module/unified scope are preserved on returned instructions.

**Validation commands:**

- `pnpm test -- packages/core/src/overlay-modules/overlay-composition-service.test.ts`

**Acceptance criteria:**

- Module-specific and unified composition are testable as pure service behavior.

## Sub-Slice 7.4: Server Module Registry Adapter And Routes

**Objective:** Wire the module platform into the local Fastify app with management-protected routes and MVP in-memory persistence.

**Expected files or areas touched:**

- `apps/server/src/modules/overlay-modules/static-module-registry.ts`
- `apps/server/src/modules/overlay-modules/in-memory-module-config-repository.ts`
- `apps/server/src/http/routes/overlay-modules.ts`
- `apps/server/src/http/routes/overlay-modules.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/index.ts`

**Implementation steps:**

- [x] Write failing route tests for listing modules, reading default config, saving config, toggling enabled state, unauthorized access, and invalid payload rejection.
- [x] Run focused route tests and confirm missing-route failures.
- [x] Add server registry adapter that returns the core static registry.
- [x] Add in-memory module-config repository adapter for MVP runtime.
- [x] Implement thin route handlers under management auth/rate-limit hooks.
- [x] Register overlay module routes through app dependencies.
- [x] Wire default runtime services in `apps/server/src/index.ts`.
- [x] Run focused server route and app tests and confirm they pass.

**Positive test cases:**

- Authenticated management clients can list modules and see Alerts metadata.
- Authenticated clients can read default Alerts config.
- Authenticated clients can save config and toggle enabled state.

**Negative test cases:**

- Missing or invalid management auth cannot access module management routes.
- Invalid module ids and invalid request bodies produce structured client errors.
- Disabled module state is visible after toggling.

**Non-trivial assertions:**

- Route handlers delegate to services and do not mutate in-memory state directly.
- Repeated unauthorized requests do not call service methods beyond auth/rate-limit boundaries.

**Validation commands:**

- `pnpm test -- apps/server/src/http/routes/overlay-modules.test.ts apps/server/src/app.test.ts`

**Acceptance criteria:**

- Server exposes module platform management endpoints without leaking server-specific types into core services.

## Sub-Slice 7.5: Reconciliation And Full Validation

**Objective:** Prove Slice 7 satisfies the MVP plan, update the base plan, and prepare the PR review packet.

**Expected files or areas touched:**

- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/plans/2026-05-30-stream-jams-slice-7-overlay-module-registry-composition.md`

**Implementation steps:**

- [x] Compare implemented behavior against Slice 7 source requirements.
- [x] Update the base MVP plan Slice 7 section with completion evidence only after validation passes.
- [x] Update this plan with completed checkboxes and validation evidence.
- [x] Run full validation.
- [x] Self-review `git diff` for unrelated changes, weak assertions, and accidental scope creep.
- [x] Commit implementation and documentation changes.

**Positive test cases:**

- Full validation passes in the same order as CI.

**Negative test cases:**

- No missing Slice 7 requirement remains undocumented.

**Non-trivial assertions:**

- File ownership and dependency direction respect the mandatory encapsulation rules from the MVP plan and `AGENTS.md`.

**Validation commands:**

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `git diff --check`

**Acceptance criteria:**

- Slice 7 is implemented, tested, reconciled, committed, pushed, and ready for human review in a GitHub PR.

## Validation Evidence

- Focused Slice 7 tests passed: pnpm test -- packages/core/src/overlay-modules/module-registry.test.ts packages/core/src/overlay-modules/schemas.test.ts packages/core/src/overlay-modules/module-config-service.test.ts packages/core/src/overlay-modules/overlay-composition-service.test.ts apps/server/src/http/routes/overlay-modules.test.ts apps/server/src/app.test.ts. Result: 32 test files and 109 tests passed.
- Full validation passed: pnpm lint, pnpm typecheck, pnpm test, pnpm test:e2e, pnpm build, and git diff --check.
- Self-review found no remaining in-scope Slice 7 behavior gaps and no forbidden core dependency leaks into Fastify, SQLite, React, Twitch, TTS providers, or alert matching internals.
