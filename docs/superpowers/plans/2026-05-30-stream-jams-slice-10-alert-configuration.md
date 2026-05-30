# Stream Jams Slice 10 Alert Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice 10 by adding an alert configuration service, management-protected CRUD routes for alert collections/rules/variants, Alerts module wizard metadata, and management UI lists/toggles for collection active state and individual alert enabled state.

**Architecture:** Keep alert configuration rules in `@stream-jams/core` behind `AlertService` and `AlertRepository`. Server routes validate request shape, enforce management auth/rate limiting, and call services instead of repositories directly. The web app uses typed HTTP API clients and local DTOs only; it must not import server modules, SQLite adapters, or core business logic.

**Tech Stack:** TypeScript, React, Vite, Fastify, SQLite-backed `AlertRepository`, Zod, Vitest, Testing Library, existing pnpm workspace scripts.

---

## Source Scope

Base slice: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, Slice 10.

Slice 10 required behavior:

- Implement `AlertService` with collection, rule, and variant operations.
- Register the Alerts module configuration wizard with the overlay module registry.
- Enforce that an alert can be individually disabled.
- Enforce that multiple collections can be enabled at once.
- Enforce that an alert in multiple active collections is considered once per event.
- Add management UI lists for rules and collections.
- Add management UI toggles for individual alert enabled state and collection active state.
- Unit test collection activation and individual rule disable precedence.
- Integration test alert CRUD routes.

Acceptance checks:

- Collection toggles and individual alert toggles are independent.
- Disabled alert rules do not match even when their collection is active.
- Alert configuration is accessible through services, not direct database calls from routes.
- Alert configuration is owned by the Alerts module and exposed to the management shell through module routes and API clients.

Non-goals:

- Alert condition matching and variant resolution; Slice 11 owns matching/resolution.
- Playback queue integration; Slice 12 and Slice 19 own runtime playback.
- Full management navigation shell; Slice 14 owns broader navigation.
- Provider-specific event ingestion; Slices 17 and 18 own Twitch integration.

## Baseline Evidence

- `origin/main` includes Slice 9 at `370a350`.
- Branch `codex/slice-10-alert-configuration` was created from fresh `origin/main`.
- Existing alert schemas, repository contracts, SQLite alert repository, and alert tables already exist.
- Existing management routes use Fastify dependency injection plus management auth/rate-limit pre-handlers.
- Existing web shell hosts focused management panels with API clients injected for tests.

## File Ownership

- Create `packages/core/src/alerts/alert-service.ts`: service operations, activation state, active-rule filtering, and typed errors.
- Modify `packages/core/src/alerts/schemas.ts`, `types.ts`, and `index.ts`: export service input schemas/types as needed.
- Modify `packages/core/src/overlay-modules/module-definition.ts`: enrich the Alerts module wizard with alert configuration steps.
- Create `apps/server/src/http/routes/collections.ts`: collection CRUD/toggle routes.
- Create `apps/server/src/http/routes/alerts.ts`: rule CRUD/toggle, variant upsert/delete, and activation routes.
- Modify `apps/server/src/app.ts`, `app.test.ts`, and `index.ts`: register alert routes and wire runtime alert service/repository.
- Create `apps/web/src/management/collections/`, `apps/web/src/management/alerts/`, and `apps/web/src/management/modules/alerts/`: management lists, toggles, API client, and tests.
- Modify `apps/web/src/App.tsx`, `App.test.tsx`, and styles to host alert configuration alongside assets.
- Modify `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` after validation to mark Slice 10 complete.
- Update this plan as execution proceeds: check boxes only after implementation and validation pass.

## Sub-Slice 10.1: Core Alert Service

**Objective:** Provide service-level alert configuration operations over `AlertRepository`.

**Expected files or areas touched:**

- `packages/core/src/alerts/alert-service.ts`
- `packages/core/src/alerts/alert-service.test.ts`
- `packages/core/src/alerts/schemas.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [ ] Write failing service tests for creating/updating/deleting collections, rules, and variants.
- [ ] Write failing service tests for multiple active collections, disabled-rule precedence, and duplicate suppression for rules in multiple active collections.
- [ ] Write failing service tests for not-found and last-variant deletion errors.
- [ ] Run focused tests and confirm missing service failures.
- [ ] Implement `DefaultAlertService`, input schemas, active-rule filtering, and typed errors.
- [ ] Run focused tests and confirm they pass.

**Positive test cases:**

- Multiple collections can be enabled at once.
- A rule in two active collections appears once in active rules.
- Variant upsert updates only the target rule's variants.

**Negative test cases:**

- Disabled rules are excluded even when their collections are active.
- Missing collection/rule/variant IDs produce typed not-found errors.
- Deleting the final variant is rejected.

**Validation commands:**

- `pnpm test -- packages/core/src/alerts/alert-service.test.ts`

**Acceptance criteria:**

- Alert activation and CRUD behavior is testable without Fastify, SQLite, or React.

## Sub-Slice 10.2: Alerts Module Wizard Metadata

**Objective:** Expose Alerts module configuration steps through the existing overlay module registry.

**Expected files or areas touched:**

- `packages/core/src/overlay-modules/module-definition.ts`
- `packages/core/src/overlay-modules/module-registry.test.ts`
- `packages/core/src/overlay-modules/schemas.test.ts`

**Implementation steps:**

- [ ] Write failing registry/schema tests asserting the Alerts wizard exposes canvas, collections, rules, and variants steps.
- [ ] Update Alerts module wizard metadata with configuration steps that management shell can render later.
- [ ] Run focused registry/schema tests and confirm they pass.

**Positive test cases:**

- `createDefaultOverlayModuleRegistry()` returns an Alerts definition with alert configuration wizard steps.

**Negative test cases:**

- Wizard metadata remains schema-valid and serializable without Zod schema internals.

**Validation commands:**

- `pnpm test -- packages/core/src/overlay-modules/module-registry.test.ts packages/core/src/overlay-modules/schemas.test.ts`

**Acceptance criteria:**

- The Alerts module owns the configuration metadata instead of hard-coding it in the management shell.

## Sub-Slice 10.3: Alert CRUD HTTP Routes

**Objective:** Expose protected collection, rule, variant, and activation endpoints that call `AlertService`.

**Expected files or areas touched:**

- `apps/server/src/http/routes/collections.ts`
- `apps/server/src/http/routes/collections.test.ts`
- `apps/server/src/http/routes/alerts.ts`
- `apps/server/src/http/routes/alerts.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/index.ts`

**Implementation steps:**

- [ ] Write failing route tests for authenticated collection CRUD and enabled toggles.
- [ ] Write failing route tests for authenticated rule CRUD, rule enabled toggles, variant upsert/delete, and activation state.
- [ ] Write failing route tests for invalid payloads, not-found IDs, and missing management sessions.
- [ ] Run focused route tests and confirm missing route failures.
- [ ] Implement route handlers with management auth/rate-limit pre-handlers and structured errors.
- [ ] Add app dependency guards and runtime wiring for `SqliteAlertRepository` and `DefaultAlertService`.
- [ ] Run focused route tests and confirm they pass.

**Positive test cases:**

- Authenticated management clients can create/list/update/toggle/delete collections and rules.
- Authenticated management clients can upsert and delete non-final variants.

**Negative test cases:**

- Missing sessions cannot read or mutate alert configuration.
- Routes do not directly use SQLite repositories.
- Invalid payloads return structured 400 responses; missing records return structured 404 responses.

**Validation commands:**

- `pnpm test -- apps/server/src/http/routes/collections.test.ts apps/server/src/http/routes/alerts.test.ts apps/server/src/app.test.ts`

**Acceptance criteria:**

- Route handlers remain thin and delegate alert rules/activation behavior to the service.

## Sub-Slice 10.4: Management Alert Configuration UI

**Objective:** Add operational management UI for listing alert collections/rules and toggling their enabled states.

**Expected files or areas touched:**

- `apps/web/src/management/modules/alerts/AlertConfigurationPanel.tsx`
- `apps/web/src/management/modules/alerts/AlertConfigurationPanel.test.tsx`
- `apps/web/src/management/modules/alerts/alert-api.ts`
- `apps/web/src/management/collections/AlertCollectionsList.tsx`
- `apps/web/src/management/alerts/AlertRulesList.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/App.css`

**Implementation steps:**

- [ ] Write failing component tests for loaded collection/rule rows, empty states, collection toggle calls, rule toggle calls, and error diagnostics.
- [ ] Run focused web tests and confirm missing component failures.
- [ ] Implement an alert API client and management panel with injected API for tests.
- [ ] Update the app shell to host alert configuration alongside the asset panel.
- [ ] Run focused web tests and confirm they pass.

**Positive test cases:**

- Users can see alert collection and rule metadata.
- Users can toggle collection active state and individual rule enabled state independently.

**Negative test cases:**

- Failed loads or toggles produce visible diagnostics without importing server logic.

**Validation commands:**

- `pnpm test -- apps/web/src/App.test.tsx apps/web/src/management/modules/alerts/AlertConfigurationPanel.test.tsx`

**Acceptance criteria:**

- UI accesses alert configuration through API clients only and remains React/Vite-only.

## Sub-Slice 10.5: Plan Reconciliation And Full Validation

**Objective:** Reconcile Slice 10 against the base MVP plan, run the standard validation suite, and prepare the PR packet.

**Expected files or areas touched:**

- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/plans/2026-05-30-stream-jams-slice-10-alert-configuration.md`

**Implementation steps:**

- [ ] Run architecture scans proving routes depend on services and web UI has no server/core/Node-only imports.
- [ ] Update the base MVP plan Slice 10 checklist and completion evidence.
- [ ] Update this detailed plan with validation evidence.
- [ ] Run full validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `git diff --check`.
- [ ] Self-review the diff for scope creep and weak tests.
- [ ] Commit with message `feat: add alert configuration`.

**Validation commands:**

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `git diff --check`

**Acceptance criteria:**

- Slice 10 is implemented, tested, documented, and ready for PR review.
