## Context

Baseline b1f5058 contains the completed error repairs. The audits and [implementation plan](../../../docs/superpowers/plans/2026-10-05-architecture-audit-repairs.md) define A1–A7 and S1–S5. This worktree preserves that baseline.

## Goals / Non-Goals

Goals: explicit substitutable contracts, one owner for shared transformations, verified real production paths.
Non-goals: new product features, generic hierarchies, dependencies, migrations, normal-profile or device changes.

## Decisions

Use neutral server playback ports before tightening required safety capabilities. Shared core response schemas validate unknown client input. Domain-specific repository ports preserve atomic persistence rather than generic CRUD. Music artwork stays server-private with explicit absent capability, and delivery tests exercise production subscription/coalescing rather than an unused sink. Dialogs keep independent nullable state objects to retain current behavior. Exact pure transformations are shared, while distinct domain policies remain at callers.

## Risks / Trade-offs

- Fixture changes can hide unsupported output capabilities → require complete typed substitutes plus malformed runtime-input negative tests.
- Validation can discard diagnostic fields → preserve actual producer shapes and test round trips.
- Removing Music test delivery loses coverage → transfer it to real runtime publication before removal.
- Credential extraction can change rotation timestamps → SQLite transaction and failure tests.
- Refactoring dialog state can retain stale errors → close/reopen and focus tests.

## Migration Plan

Execute ten independently reviewable tasks in the linked plan, with affected tests/typechecks and one integrated verification/review. No persistence migration. Revert each slice independently if regression occurs. Publishing is separate from local implementation.

## Open Questions

None blocking. Record evidence-based implementation rulings in the execution ledger.
