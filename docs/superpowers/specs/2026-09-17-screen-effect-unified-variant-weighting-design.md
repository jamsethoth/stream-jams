# Unified Screen Effect variant weighting

## Context

Screen Effect variants currently have two kinds: one enabled `default` variant and optional `weighted` variants. When any enabled weighted variant exists, the resolver excludes the default variant entirely. Preview and `Test saved…` select one explicit variant, so the editor also provides no safe way to inspect the distribution produced by weights.

Operators should author one consistent kind of variant. A variant's editable name, enabled state, and weight should fully describe its selection behavior.

## Product behavior

- Remove Default and Weighted as variant kinds from the management API and editor.
- Every enabled variant participates in automatic selection using its positive integer weight.
- Require at least one enabled variant in every Screen Effect.
- A new Screen Effect starts with one enabled variant named `Default` at weight `1`. `Default` is an ordinary editable name with no special runtime meaning.
- Existing default variants join the selection pool at their existing weight, which is currently `1`. Existing weighted variants keep their enabled state and weight.
- Copied variants keep the source weight and start disabled, preserving the current safe authoring behavior.
- Preview and `Test saved…` continue to target the explicitly selected variant. Automatic trusted triggers use weighted selection across all enabled variants.

For enabled variants, the editor shows the calculated expected chance next to weight:

`variant weight / sum of enabled variant weights`

Disabled variants show `Disabled · 0%` and do not contribute to the denominator.

## Local weight simulation

The editor adds a `Simulate 1,000 selections` action near the variant inventory. It invokes the same framework-independent weighted selector used by live admission, without saving the draft, queueing playback, firing triggers, or using output routes.

The result lists every variant with:

- configured weight;
- expected percentage;
- simulated count and percentage from 1,000 selections.

Disabled variants remain visible with zero selections. Re-running replaces the previous result. Simulation failure is shown inline with an actionable message and does not modify the draft.

## Contracts and compatibility

`EffectVariant.kind` is removed from the core type and strict management document schema. `ScreenEffectDocument.schemaVersion` remains `1` because Screen Effect documents are internal local-management contracts and the SQLite repository supplies a compatibility boundary for existing persisted rows.

The existing SQLite `screen_effect_variants.kind` column and JSON check remain as a deprecated storage detail for compatibility with current databases and configuration backups. The repository:

1. accepts existing stored `default` or `weighted` values;
2. removes `kind` before parsing a variant into the current domain model;
3. writes the neutral legacy value `weighted` into the storage column and stored JSON for every newly saved variant.

This avoids rebuilding foreign-keyed Screen Effect tables while making kind unobservable through current product and API contracts. Backups remain structurally compatible. A future storage cleanup may remove the deprecated column in a dedicated migration.

## Selection and validation

`resolveEffectContent` filters all enabled variants and passes them to the existing `chooseWeightedVariant` function. The document schema rejects a document with no enabled variants. Weight remains an integer from `1` through `10,000`, and the existing safe-total check remains authoritative.

The editor enables Weight and Enabled controls for every variant. Attempting to disable the final enabled variant leaves the draft visibly invalid and disables Save, with guidance to enable another variant first. The editor does not silently alter another variant.

## UI and accessibility

The change follows the Screen Effects focused editor and dense hierarchy conventions from the management UX specification:

- remove the Kind control;
- show weight and calculated chance on every variant row;
- keep precise number inputs for weight;
- expose simulation as an explicit button;
- present simulation results as a semantic table with variant names as row headers;
- announce refreshed simulation results through a polite status region;
- preserve keyboard navigation, inline preview, dirty-state handling, and explicit live-test confirmation.

Loading, media preview, save failure, live test, and output delivery behavior remain unchanged.

## Verification

- Core schema tests cover one or many enabled variants, rejection of none enabled, and removal of `kind` from the strict API document.
- Resolver tests prove all enabled variants, including the formerly default row, share one weighted pool and disabled variants are excluded.
- Repository tests prove legacy default/weighted rows read into the unified model and round-trip without losing media, routes, bindings, IDs, enabled states, or weights.
- Backup tests prove current stored rows remain capturable and restorable.
- Editor unit and Storybook tests cover chance labels, last-enabled validation, simulation results, disabled rows, accessibility, and unchanged draft state.
- Playwright covers editing all variant weights, running local simulation, saving/reloading, and confirming no live-test or trigger request is sent by simulation.
- Run affected unit tests, lint, typecheck, builds, Storybook accessibility checks, Playwright, and strict OpenSpec validation.

## Scope

This change does not alter Screen Effect sets, bindings, queue policy, cooldowns, priorities, explicit selected-variant preview/test behavior, output routing, or Alerts variant contracts.
