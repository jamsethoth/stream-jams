# Frontend Agent Guide

Use this guide for changes that touch `apps/web`, Storybook, browser-visible management UI, or browser-source overlays.

## Target

Stream Jams is a local-first streamer tool. Its frontend surfaces have distinct responsibilities:

- Management UI: dense, quiet, operational controls for repeated setup and troubleshooting.
- Operator UI: focused live playback and safety controls at `/operator`, using management authorization.
- Overlay UI: fullscreen transparent browser-source output that must not expose secrets or debug text on live routes.
- Private desktop-overlay renderer: transparent output hosted by Electron, with a narrow preload boundary and no management credentials.

Do not treat this as a marketing site. Build the actual management or overlay workflow first.

## Before Editing

1. Check the active OpenSpec change when one exists.
2. Read `docs/product-plan.md`, `docs/design/ui-refactor-mvp-ux-spec.md`, `docs/ui-guidelines.md`, `docs/design-tokens.md`, and this guide.
3. For management UI, overlay UI, integrations, assets, diagnostics, alert-module, or alert-editor changes, identify the applicable MVP UX spec sections and whether the requested behavior is MVP or backlog before editing.
4. For UI changes, inspect the current component and API boundaries before adding abstractions.
5. If `.codegraph/` is usable, sync and query it before broad text search. If CodeGraph reports no usable index, continue with normal tools.

## Implementation Rules

- Use real production components in stories and tests. Mock typed API boundaries, not rendered markup.
- Keep domain behavior out of React components. Matching, queueing, provider normalization, persistence, auth, and overlay composition belong in services/packages.
- Keep management and overlay auth separate. Never put secrets, OAuth tokens, overlay keys, signed URLs, or credential refs in Storybook args, client env, logs, screenshots, or docs examples.
- Use `import type` for type-only imports and keep relative TypeScript imports ESM-compatible.
- Preserve strict TypeScript. Do not weaken `strict`, `noUncheckedIndexedAccess`, or `exactOptionalPropertyTypes`.
- Management standard controls use the installed Mantine components and the management presentation provider. Read the ownership contract in `docs/design-tokens.md`; keep workflow components and typed API boundaries intact.
- Do not silently fail. User-visible failures need human-readable next steps and a log/reference ID when one is available.
- Keep live-runtime changes explicit, especially actions that affect active alert consumption, active alert sets, overlay routes, or provider selection.

## PR UX Contract

Every browser-visible PR must include a short UX note covering:

- Applicable sections reviewed from `docs/design/ui-refactor-mvp-ux-spec.md`.
- MVP/backlog boundary for the changed behavior.
- Failure, empty, loading, and success states touched by the change.
- Accessibility and keyboard behavior considered.
- Storybook and Playwright coverage added, updated, or explicitly skipped with reason.

## Storybook Rules

Storybook is the component workbench for `apps/web`.

- Add or update stories for new or changed production UI components.
- Cover the useful UI states: loaded, empty, loading, error, and success when the component has those states.
- Include representative management shell, form-heavy panels, list/table panels, and overlay render states.
- Use tiny checked-in assets under `apps/web/public/storybook-assets/` for media-backed stories.
- Name stories by the user or operator scenario they represent.
- Keep each story focused on one concept or state. Storybook's AI guidance says stories are useful to agents as usage examples when they explain when and why a pattern is used.

## Accessibility

- Storybook includes `@storybook/addon-a11y`; production stories default to automated axe checks.
- New controls need accessible names, stable focus behavior, and keyboard operation.
- Prefer role and label based testing selectors. Use test IDs only when user-facing selectors do not exist.
- Automated accessibility checks are a first pass, not a replacement for keyboard and screen-reader review.

## Management Presentation Boundary

`ManagementPresentationProvider` owns the sole persisted preference, `stream-jams-theme`, and synchronizes System mode with the OS. Do not add another color-scheme manager or provider to a page. The existing native error boundary surrounds this provider so recovery remains available if initialization fails.

Use direct Mantine Button/ActionIcon and field components for standard controls. Command buttons default to `type="button"`; declare submit intent explicitly. Keep navigation as native anchors. Preserve labels, descriptions, errors, refs and draft values when migrating fields. Numeric drafts that allow blanks, negative corrections or specialized clamping stay native until an equivalent tested adapter exists.

Management dialogs use `ManagementModalSurface` with `ManagementModalTitle`; pending actions disable dismissal. Menus use the existing thin ActionMenu contract. Mantine owns portals, positioning and keyboard behavior; retain workflow safeguards and valid focus fallback. Library CSS loads in the management entry only, with semantic overrides after its layer. Modal/menu/select z-index defaults are 1000/1100/1200. Direction follows the document without remounting drafts.

Operator and browser/private overlays retain their provider-independent ModalSurface, StatusBadge, TimerAdjustmentControls and shared CSS. They must not import management Mantine CSS or JS. Bootstrap and recovery also remain native. Use `renderManagement` for management unit tests and the scoped Management Storybook decorator; never disable real browser portals or focus to make tests pass. Management axe checks include portal roots.

Real management inspector and Diagnostics panels use direct Mantine Tabs with `keepMounted={false}`. Mantine owns focus/navigation/RTL and panel IDs; synchronize each tab's value on focus for canonical automatic Home/End activation. Keep same-value activation idempotent and preserve parent drafts and preview/poll owners. TimerStackEditor profiles select values over one canvas with labelled SegmentedControl radio semantics.

Use the existing ManagementToast/ManagementErrorToast for command outcomes and the foundation `actionableError` boundary to retain typed server references and next steps. Blocking load/stale failures and field validation remain inline. If a command dialog remains open, render its single fixed feedback instance inside that dialog's focus surface. Explicit close or a fresh command/review clears that outcome; do not move an existing toast between page and dialog and restart its expiry or announcement. Newly completed success can close a dialog and mount once at page level.

Assets uses direct Mantine controls, inventory Table and picker Tabs. Its native secondary-filter disclosure, datalist tag suggestions and image/video/audio/font rendering retain their product-specific behavior. Media controls are siblings of picker selection buttons so playback remains independently reachable. Assets and Timers use the existing lazy route boundary to keep the shared picker out of management startup.

All four module pages use `ModulePageLayout` in feedback → saved controls → outputs → workspace → secondary order. Route headers remain in ManagementApp. `ModuleControls`, `SectionHeading`, `ModuleSection` and controlled `DisclosureSection` share spacing and wrapping; pages own expansion, stable correction IDs and focus. `BrowserSourceRow` takes owner-rendered URL, metadata, guidance, telemetry and actions, with readiness separate from activity. Masking/reveal state, clipboard, URL purpose, regeneration, polling and freshness remain with typed workflow owners. Effects retains module live/test source identities and explains existing unified-source membership without inventing profiles. Timers retains independent landscape/vertical dimensions in LTR `bdi`, saved enablement, active run snapshots, polling and profile draft ownership. `#browser-sources` expands and focuses in every module owner.

Effects and Timers ordinary page, inventory and module-action controls use Mantine. Effects' set disclosure button and effect `details/summary` preserve hierarchy/count/conditional child semantics; the shared variant-selection tree uses Mantine buttons in both page and editor. Timer definition modal command buttons and name field use Mantine; its exact duration input, TimerEventRulesEditor, TimerStackEditor canvas/appearance controls and audio-output draft checkboxes remain embedded-editor work. TimerAdjustmentControls and its CSS remain provider-independent for Operator. Revealed output/one-time credential inputs remain readonly capability presentations. Music embedded appearance fields, numeric drafts, canvas and native test-output disclosure also retain editor ownership. AudioOutputsPanel's route fields/device controls remain Settings work; its deletion review already uses shared pending/error/target/fallback behavior and dialog-owned referenced-item facts.

Alerts inventory and page-owned dialog commands/fields use direct Mantine controls. Native set/event hierarchy disclosures preserve their tree semantics; the grouped default/variation inventory keeps its semantic table markup and existing narrow-screen card transformation. Revealed output URL inputs remain readonly owner-controlled capability presentations. The shared Twitch reward catalog picker retains its specialized selection behavior. Activation, reset and deletion retain their domain-specific consequence reviews with Mantine controls and scoped pending/error handling. The focused Alerts editor remains a separate editor slice.

For `DestructiveConfirmationDialog`, return the mutation Promise from `onConfirm` and guard submission synchronously in the workflow. `pending` also covers externally owned work; all dismissal is locked by default until completion. Set `cancelWhilePending` only when `onCancel` actually aborts that operation. Pass a stable `targetId`, scoped `error` and an available `restoreFocusFallbackRef` when the trigger can disappear or become disabled. Catch failures in the workflow, keep the reviewed same-target draft for explicit retry, and clear owned errors when opening a fresh review. Existing void handlers remain compatible; they must pass pending state or adopt the Promise contract to cover their entire request.

The optional `details` ReactNode is for caller-owned impact facts, such as Audio deletion references. Render those facts once inside the review. Pending owners must remove navigable links before shell capture navigation; the shared scoped error is hidden while pending so its correction links cannot navigate during a retry. Destructive failures remain persistent in the review and must not also become timed command toasts. Effects retains its existing REGENERATE requirement; Timers retains its existing untyped source/credential reviews and consequence copy.

## Overlay Error Rule

Production live overlays fail closed and transparent. Operators should see actionable diagnostics in `/manage`, logs, or diagnostic export. Visible overlay diagnostics are allowed only in Storybook, local development, or explicit test/debug routes.

See `docs/ai/overlay-error-presentation.md`.

## Required Commands

Run from the repo root unless a task says otherwise:

```sh
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
```

Run Playwright when browser-visible behavior changes beyond Storybook setup:

```sh
corepack.cmd pnpm test:e2e
```

Run the matching OpenSpec validation before completion:

```sh
openspec.cmd validate <change-name> --strict
```

## Current Gaps

- Storybook now provides a local component workbench and CI gate, but hosted visual approval is not selected.
- The Storybook test-runner is the current gate. Its deprecated Story Store integration is tracked for migration to the Storybook Vitest addon in [BL-035](../backlog.md); retain interaction, accessibility, and console-failure coverage during that migration.
- Local Playwright screenshots are the default visual-regression path for now. Hosted options are documented in `docs/ai/visual-regression-options.md`.

## Sources

- Storybook React/Vite docs: https://storybook.js.org/docs/get-started/frameworks/react-vite
- Storybook AI best practices: https://storybook.js.org/docs/ai/best-practices
- Storybook accessibility tests: https://storybook.js.org/docs/writing-tests/accessibility-testing
- Storybook test-runner: https://storybook.js.org/docs/writing-tests/integrations/test-runner
- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
