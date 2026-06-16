# Design: Persist Overlay Module Config

## Context

The codebase already has `SqliteOverlayModuleConfigRepository`, an `overlay_module_config` table, and repository tests. Runtime startup still wires `InMemoryServerOverlayModuleConfigRepository`, so saved module config is lost when the app closes. The MVP product plan calls for exactly one configurable canvas per module; the existing generic wizard also presents fields that are not part of the module config schema.

## Goals / Non-Goals

**Goals:**

- Replace runtime in-memory module config storage with SQLite persistence.
- Prove saved module enablement and canvas config survive restart.
- Keep unknown or non-schema wizard fields from being silently presented as durable module config.
- Keep route handlers thin and repository access behind typed service interfaces.

**Non-Goals:**

- Do not build the full alert rule/variant editor; that is handled by `expand-alert-configuration-ui`.
- Do not add multiple module instances unless a separate slice defines that behavior.
- Do not broaden module config beyond schema-backed MVP canvas settings without a spec update.

## Dependency Gate

Implementation MUST NOT begin until `serve-local-web-app-shell` has landed in remote `main`. This avoids conflicting runtime-composition edits and lets this change align with the final server startup factory.

## Assumptions

- SQLite remains the local persistence layer for module config.
- The existing `overlay_module_config` migration is compatible with the intended runtime repository.
- Zod validation should remain the source of truth for persisted module config shape.

## Decisions

- Wire `SqliteOverlayModuleConfigRepository` in runtime composition rather than adding a second persistence layer.
- Add a restart-style integration test over the same temp database to prove durability.
- Remove or hide non-schema wizard fields from the module config UI rather than persisting unknown keys. This keeps persistence predictable and avoids hiding accidental config loss.
- Keep the current Alerts module default enabled state on fresh databases. A future startup wizard can let users choose which modules to configure first once multiple modules exist.
- Add one narrow production-runtime smoke check that proves runtime composition uses durable module config wiring; keep edge cases in lower-level integration tests.
- Reject unknown module config fields and leave persisted config unchanged.
- Keep the module config service responsible for validation and repository orchestration.

## Initial Implementation Plan

1. Confirm app-shell runtime composition has landed in remote `main`.
2. Replace runtime in-memory repository wiring with the SQLite repository.
3. Add integration tests for save, restart, read-back, invalid config rejection, and default config behavior.
4. Audit the module UI fields against the config schema and remove or hide non-persistent fields.
5. Update final-review docs and run validation.

## Risks / Trade-offs

- Unknown wizard fields may currently appear to save but are rejected by schema validation. Mitigation: show only schema-backed fields and move alert-specific setup to the alert UI change.
- A direct repository swap can conflict with other runtime composition changes. Mitigation: gate on the app-shell branch and keep the edit narrow.
- Existing local databases may have no row for module config. Mitigation: preserve default config behavior when no row exists.

## Resolved Questions

1. Non-schema wizard fields should be removed or hidden from this module config UI.
2. Alerts should remain enabled by default on a fresh database.
3. Module config persistence should get one narrow production-runtime smoke check now that the harness exists.
4. Unknown module config fields should be rejected rather than silently omitted.
