## Context

The management application uses React, strict TypeScript and Vite, with an existing route shell, semantic CSS tokens and shared foundation. The audit identifies F1–F7 across feedback, tabs, destructive dialogs, module presentation, output rows, sections and controls. Mantine and React Aria Assets spikes demonstrated the tradeoff; the user chose Mantine for simplicity and consistency.

The spikes deliberately omit production features and persistence. Canonical specs and current production behavior govern migration, particularly Assets' collapsed secondary filters, media streaming, dirty navigation, usage-aware replacement and stable IDs. Prototype sidebar labels and simulated operations must not replace real routes or workflows.

This plan supersedes the audit's earlier native-only library recommendation; F1–F7 remain the finding/acceptance baseline. The audit remains a dated record. Library selection does not authorize changing the canonical navigation, typography, responsive reachability or interaction contracts to match the spikes.

## Goals / Non-Goals

**Goals:** Adopt a coherent maintained component library; repair all seven findings; reduce duplicate markup/styles; compose consistent module pages; retain domain ownership, accessible workflows and local-first security.

**Non-Goals:** Backend changes, configuration migration, a new UI workspace package, class inheritance, schema-generated pages, wholesale editor rewrites, Operator redesign, or Mantine in live/private overlay renderers.

## Decisions

### Use Mantine directly with a small application foundation

Add exact `@mantine/core` and `@mantine/hooks` dependencies to the web workspace. The tested candidate is 9.7.0; verify maintained release status, React peer compatibility, license and dependency advisories before installation. Add further Mantine packages only for a concrete gap. Prefer native platform behavior and existing dependencies for everything else.

Use Mantine Button/ActionIcon, appropriate input/select components, Tabs, Modal, Menu and layout primitives to compose control and empty/loading presentation. Expose shared variants/defaults through the theme and small wrappers only where Stream Jams adds policy. Avoid wrapping every Mantine export or creating a parallel prop vocabulary. Command buttons must default safely to `type="button"`; form submission remains explicit. Navigation remains real anchors with hrefs, including modified clicks/downloads/new windows and existing dirty-navigation interception. Standardize field label/help/error association without replacing specialized numeric draft and commit semantics.

React Aria was considered and prototyped. It would require more local CSS and composition to achieve the chosen maintenance goal. Continuing only with custom native primitives would retain more standard interaction implementation than needed.

### Scope provider and styles to management

Install one MantineProvider at the management entry boundary, including a provider-aware unit-test render helper and scoped Storybook decorators. Keep the bootstrap/error-boundary recovery surface able to render if the provider or theme fails. Do not add providers to individual pages or globally decorate overlay/Operator stories.

Use one theme-preference owner and the existing `stream-jams-theme` persistence key. Map `system` to Mantine's resolved auto behavior, synchronize `data-theme` and Mantine's scheme, and preserve storage-failure feedback. Do not introduce a second localStorage key or competing state in ThemeSwitcher. Verify initial load, reload, live OS theme changes while in system mode, and explicit light/dark overrides.

Keep semantic CSS custom properties as the runtime color contract and map Mantine component variables/variants to them in one management theme adapter. Preserve positive/warning/negative meanings separately from the teal accent, existing typography/radius/density and readable contrast. Avoid two independently authored palettes. Update token/ownership guidance with the foundation slice, not only at final cleanup.

Check CSS layer/selector order against existing global rules; prevent blanket legacy button/input CSS from overriding migrated components. Define portal styling, theme inheritance and z-index alongside the provider so dialogs, menus, selects and toasts share the intended layers, including when opened inside another dialog. Preserve document language, RTL direction and existing Intl formatters. Validate the served production CSP; do not add inline initialization scripts or weaken CSP to install a theme helper.

Use the existing route shell. Import library CSS and components through management entry paths rather than common overlay entry points. Check route bundle outputs and load an overlay to verify transparent fail-closed presentation. The provider does not own authentication, APIs, config or playback.

### Preserve existing cross-surface dependencies before changing shared primitives

`OperatorApp.tsx` currently imports `ModalSurface`, `StatusBadge`, `TimerAdjustmentControls`, their related CSS and `App.css`; the private desktop-overlay entry also imports `App.css`. A provider scoped to management is insufficient if those shared imports become Mantine-dependent.

Keep provider-independent implementations for Operator-consumed components and retain their required styles. Introduce a management-only Mantine modal adapter and migrate management callers to it; the current native ModalSurface remains for Operator. StatusBadge and TimerAdjustmentControls can remain provider-independent shared exceptions while keeping semantic token styling. If a later concrete need requires separate presentation, share domain logic without duplicating mutation state or adding a runtime library-switch prop. Inventory reverse imports before each shared/CSS edit. Never delete a legacy rule solely because management has no callers.

Run Operator status, timer-adjustment and clear-dialog focus/cancellation checks immediately when shared dependencies change. Check actual JS and CSS dependency graphs for Operator and both overlay outputs. Keep the existing build budget checker (`scripts/check-web-route-bundles.mjs`) effective; reduce imports or use existing route splitting if a budget fails, rather than raising limits to pass the migration.

### Keep product-specific presentation and behavior distinct

Retain the application contracts for StatusBadge, MaskedValue, BrowserSourcesPanel/BrowserSourceRow, feedback components and dirty/destructive dialogs, subject to the cross-surface exceptions above. Complete the management modal/menu foundation before migrating pages: replace management modal focus/portal plumbing with Mantine's Modal, and replace ActionMenu's custom positioning/keyboard listeners with Mantine Menu behind its small existing action contract. Preserve accessible labels, disabled actions, danger tone, focus return and opening another dialog from a menu. Migrate DirtyNavigationDialog's surface in this step so Assets and later pages do not mix incompatible modal stacks.

Use existing typed fixed feedback for transient command outcomes (F1), not a second notification system. Blocking load errors, stale data and validation stay inline, preserving reference IDs and correction links. Preserve success/warning expiry at four seconds and failure expiry at eight seconds, dismissal, safe copy and single announcements.

Use Mantine Tabs for real inspector panels (F2), retaining the current canonical automatic arrow/Home/End selection and tab/panel associations. TimerStackEditor selects landscape/vertical values for one editing surface; represent this as a labelled radio group or segmented radio control rather than declaring tab panels. Decide mounted/hidden behavior from each editor's existing state and preview lifecycle: preserve unsaved drafts, avoid starting playback/polling in hidden panels, and retain media/resource cleanup. Do not change lifecycle simply to adopt a component default.

DestructiveConfirmationDialog gains explicit pending/error/cancel policy (F3). Workflow handlers also guard repeat submission synchronously; a disabled button alone is insufficient. For non-abortable destructive requests, default to blocking confirm, close button, Escape, outside click and cancel while pending; closing UI must never imply an in-flight mutation was cancelled. A cancellable workflow requires actual transport/domain support and a tested caller policy. On failure, release busy state, show a scoped recoverable error and allow explicit retry. Do not automatically retry uncertain mutations.

Reset typed confirmation and target-specific error when reopening or changing stable target identity. Preserve the current draft while a same-target failure is being reviewed; do not carry an old target's error into another dialog. Restore focus to the trigger or an explicit valid fallback if the trigger was removed/disabled. Apply the same single-submission discipline to Save and leave where the shared dirty-navigation workflow owns an asynchronous save. Do not loosen consequences or typed confirmation to simplify sharing.

### Compose module pages using a stable presentation contract

Keep PageHeader and route descriptions in ManagementApp. Add ModulePageLayout with ReactNode slots for feedback, module controls, outputs and secondary sections, plus children for the workspace. Common order: inline blocking/stale feedback; saved module enablement/actions; output setup; primary workspace; secondary settings (F4).

ModuleControls, SectionHeading, ModuleSection and DisclosureSection own spacing, headings and compact wrapping (F6). Disclosure remains native where appropriate; controlled expansion supports existing correction links. Pages own data fetching, mutations, dirty state, polling, summaries and feature-specific content. No child inspection, cloneElement, feature-boolean matrix or generic mutation controller.

Reuse BrowserSourceRow across compatible module outputs (F5), with explicit metadata slots for genuine differences. Preserve masking, scoped URLs, readiness versus runtime state, telemetry freshness, dimensions and regeneration rules. Do not invent profile semantics for Effects.

### Adopt incrementally and remove completed duplication

F7 is a migration of equivalent controls, not a ban on HTML. Native media, disclosure, specialized canvas handles, raw numeric drafts, provider-independent cross-surface controls and purpose-specific interaction surfaces remain documented exceptions. Add only targeted import/lint checks for completed patterns; avoid an AST project or global raw-element prohibition. Delete superseded code and update the ownership guide in each slice once all relevant callers move; final cleanup checks for leftovers rather than deferring every deletion.

### Track every management route and its completion evidence

Use `management-route.ts` as the route inventory and update the mapping if fresh source differs. Migration owns presentation only:

| Slice | Routes / shared surfaces | Required preserved behavior |
| --- | --- | --- |
| Foundation | ManagementNavigation, PageHeader/Breadcrumbs, ThemeSwitcher, shared fields/menu/modal/feedback, error recovery | Native anchors, mobile navigation disclosure, theme, dirty links, pending/focus, safe fallback |
| Assets | assets, AssetPicker, AssetPreview | Complete filters and selection, validation, media ownership, metadata/usage/replace/delete |
| Module proofs | modules-alerts, modules-music | Inventory and preview/appearance workspaces; saved state, outputs, disclosure/deep links |
| Remaining modules | modules-screen-effects, modules-timers | Sets/variants, timer rules/profiles/live adjustments, purpose-scoped outputs |
| Other pages | home, event-sources, tts-providers, music-sources, alert-safety, settings, diagnostics | Readiness, registration/auth/validation/activation, moderation, backup/restore, audio/devices, desktop/automation settings, diagnostic filters |
| Editors | alert-editor, screen-effect-editor, embedded Music/Timer editors and shared audio controls | Canvas/warp/color/typography, numeric drafts, profile selection, preview ownership, dirty navigation |

No new EditorLayout is required unless recurring regions justify a small composition. Each route ends with either migrated common patterns or a specific documented exception; “remaining surfaces” alone is not completion evidence.

## Verification Contract Per Slice

Before a slice, identify affected callers and baseline their existing tests/stories. Foundation changes require representative smoke checks of all management routes plus cross-surface consumers because they apply before those pages are visually migrated. Every deliverable slice must pass its affected lint/typecheck/tests, relevant production-component Storybook interaction/accessibility/console gates and browser workflow checks before the next slice relies on it. Use a shared provider-aware test helper, deterministic tiny fixtures and typed API mocks; retain real portal/focus behavior in browser and Storybook checks even if isolated unit tests disable animation.

Cover loaded, loading, valid empty, initial-load failure, stale refresh, field/action error, success, disabled and pending states where applicable. Capture and review desktop and 390px/appropriate tablet layouts, LTR/RTL, light/dark/system and long/user-generated text. Identity, status and primary actions must stay reachable without horizontal scrolling; table overflow alone does not satisfy the canonical mobile contract. Preserve reduced-motion behavior, readable focus/contrast and a manual keyboard check for migrated composite widgets. Re-run existing media/preview tests when panel lifecycle changes.

Run production-serving/CSP, route budgets, Operator and overlay isolation checks in the foundation slice and whenever their dependency graph changes. Final full gates supplement these slice exits. Use disposable profiles/data for rebuilt live workflows; screenshots must not contain real keys, credentials or personal channel data. Record evidence by slice/route/state, and keep any unavailable physical acceptance explicit.

## Risks / Trade-offs

- Library defaults conflict with legacy CSS → management scoping, explicit layer/order review, responsive/theme stories and rendered comparison.
- Styling changes hide domain regressions → reuse typed APIs/controllers; preserve existing scenario tests and real media/usage workflows.
- Wrappers recreate a custom library → direct Mantine use by default, wrappers only for app policy or demonstrated reuse.
- Portal focus disrupts editors/menus → verify focus containment/return, Escape, cancellation during requests and dirty navigation.
- Library enters overlays or increases startup cost → inspect route bundles, lazy route boundaries and actual build output; do not infer production cost from prototype bundles.
- Partial migration leaves conflicting conventions → migrate one family at a time, document temporary boundaries and delete obsolete rules after final callers move.

## Migration Plan

1. Refresh remote state, start the implementation branch from current `origin/main`, preserve existing local audit/prototype/planning artifacts and inventory routes plus shared callers; commit this plan before or with implementation.
2. Establish management theme/provider, cross-surface boundaries, provider-aware tests and core modal/menu/field foundation with stories and guidance; pass the foundation exit checks.
3. Migrate production Assets as the first end-to-end page slice, including pending deletion repair; verify real workflows and shared picker callers.
4. Repair feedback and tab contracts once, then build the module layout/output presentation and prove it with Alerts and Music.
5. Migrate remaining modules and compatible output rows; verify all four routes share the same order. Complete other route families and editors without repeating already-migrated feedback/tabs/pickers.
6. Close each slice with checks, obsolete code removal and guidance updates; finish with the complete evidence matrix and required publishing gates. Sync/archive specs only when implementation is complete. Prototype artifacts do not count as acceptance.

No stored data changes are required. Rollback reverts a presentation slice while retaining prior route/domain contracts; do not maintain permanent duplicate production implementations.

## Open Questions

No product choice blocks the plan. During each slice, resolve component suitability from the concrete workflow; document justified exceptions rather than adding speculative configuration. A fresh release/advisory check and current-source reconciliation are implementation prerequisites.

## Review Evidence

Plan re-review on October 6, 2026 checked the frontend audit, canonical management/asset specs, route inventory, bootstrap, theme storage, shared modal/menu, Storybook setup and route-budget checker. Independent review confirmed the Operator dependency omission. This revision resolves that boundary, theme ownership, foundation ordering, unnamed route coverage and slice-level acceptance; it does not claim implementation verification.

Mantine integration references: [provider and scope options](https://mantine.dev/theming/mantine-provider/), [color schemes](https://mantine.dev/theming/color-schemes/), [modal behavior](https://mantine.dev/core/modal/). These inform the adapter decisions; existing product contracts remain authoritative.
