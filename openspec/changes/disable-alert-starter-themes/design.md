## Context

Alert creation currently accepts a starter-theme ID, materializes one of three curated themes, and exposes theme selection in Add alert plus re-theming in the focused editor. First-run starter rules have no stored editor document, so the editor also materializes a theme lazily when one is first opened. Default reset follows the same path. Variations and duplicates already copy a stored source document.

The approved product contract is that new/default alerts start as a truly empty canvas while existing saved alerts and copy workflows retain their current designs. The internal theme catalog and materializer remain available in source for possible restoration, but management UI and alert-creation entry points no longer invoke them.

## Goals / Non-Goals

**Goals:**

- Persist an empty editor document for every newly created alert and every first-run starter alert.
- Reset a default alert to the same empty document contract.
- Remove theme selection and re-theming controls from active management UI.
- Preserve variation and duplicate source-design copying.
- Avoid rewriting existing stored alert documents or changing legacy fallback hydration.
- Keep theme catalog, preview, and materialization implementation code dormant.

**Non-Goals:**

- Deleting theme implementation or its direct unit coverage.
- Migrating or blanking existing saved alerts.
- Changing user-created-template backlog scope.
- Changing copy-design, variation, or duplicate semantics.

## Decisions

1. **Add a dedicated empty-document factory.** New alerts, first-run starter seeding, and default reset will call a server-owned factory that produces a schema-valid document with `layers: []` and empty Landscape/Vertical `layerLayouts`. The alert and both profiles retain their existing disabled/review metadata semantics. This avoids weakening document validation or teaching each caller how to construct an empty document.

2. **Persist first-run starter documents at seed time.** New installations will save empty documents when the Default set and starter rules are created. Legacy installations that already have rules but no stored editor document continue through the existing compatibility hydration path, preventing an upgrade from silently rewriting their effective design.

3. **Remove the create-time theme field from the active contract.** The management create schema and UI submit only event, name, and optional channel-point reward selection. Unknown legacy theme fields are not used to choose output. The internal theme ID/catalog types remain for dormant materialization APIs.

4. **Remove active UI entry points, not the theme implementation.** Add alert no longer renders the chooser. The focused editor removes the Apply starter theme control, modal, and theme-specific undo/notice state. `AlertThemeChooser`, theme previews, catalog, materializer, and their direct tests remain in the repository.

5. **Preserve source-copy paths.** Variation creation, variation reset, alert duplication, and set duplication continue cloning their source editor documents. Only new defaults, first-run starters, and default reset use the empty factory.

## Risks / Trade-offs

- **Legacy callers may still send `themeId`.** → Boundary parsing will not use it; server tests prove created documents remain empty.
- **First-run persistence adds document writes during starter seeding.** → Use the existing document repository and schema-valid factory; verify a fresh service returns empty documents for every seeded starter.
- **Empty alerts are initially invalid for playback.** → They remain disabled and Needs review, and existing empty-content readiness directs operators to add a layer before saving/enabling output.
- **Dormant theme code can drift.** → Retain direct core/theme tests without presenting it as an active management feature.

## Migration Plan

No data migration is required. Existing stored documents are read unchanged. New starter sets and new/reset default alerts use empty documents after deployment. Rollback restores the UI entry points and theme-based factory calls; documents authored while the feature is disabled remain ordinary valid empty documents.

## Open Questions

None. The approved scope defines empty literally and explicitly preserves copied and existing designs.
