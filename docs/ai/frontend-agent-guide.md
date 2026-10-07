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

The completed migration is recorded in [Management component verification](../verification/management-component-consistency.md) and the [canonical presentation capability](../../openspec/specs/management-component-consistency/spec.md). The record maps every management route and F1–F7 to production owners, tests and concrete native exceptions. Native element counts are inventory clues, never a blanket prohibition.

Use direct Mantine imports for standard management commands/fields/tabs. `ManagementModalSurface` and `ActionMenu` add only product naming, focus and action policy. ESLint rejects value imports of native `ModalSurface` from management and Operator production code; its type-only contract remains allowed. Build graph checks reject Mantine JS/CSS from the bootstrap, browser-source and private renderer graphs; Operator shares the management provider. `App.css`, native `ModalSurface` and `StatusBadge` retain their reverse-consumer styles and provider independence for those outputs.

All navigation-save owners return `DirtyNavigationSaveResult`: request failures carry `{ saved: false, error }` with the available actionable context. The active navigation/selection review renders it once; suppress the duplicate page failure for that attempt while retaining ordinary save feedback and existing diagnostic recording. Consent-required provider drafts instruct Cancel and review; they never auto-confirm. Preserve synchronous request guards, pending dismissal/field locks, retained drafts/destination and explicit retry. Field validation stays associated with its field. `ManagementToast` remains the existing timer/announcement API, now with direct Mantine dismiss commands.

For module pages, keep `PageHeader` in the shell and compose `ModulePageLayout` with feedback, saved controls, outputs, the workspace, then secondary sections. Pages own API/state, correction/deep-link expansion, polling and media lifetimes. Slots render ReactNode directly; do not add a form/page engine. Native disclosure/hierarchy, capability readouts, specialized color/canvas/media controls and the provider-independent consumers are the documented exceptions below and in the verification record.

- Use real production components in stories and tests. Mock typed API boundaries, not rendered markup.
- Keep domain behavior out of React components. Matching, queueing, provider normalization, persistence, auth, and overlay composition belong in services/packages.
- Keep management and overlay auth separate. Never put secrets, OAuth tokens, overlay keys, signed URLs, or credential refs in Storybook args, client env, logs, screenshots, or docs examples.
- Use `import type` for type-only imports and keep relative TypeScript imports ESM-compatible.
- Preserve strict TypeScript. Do not weaken `strict`, `noUncheckedIndexedAccess`, or `exactOptionalPropertyTypes`.
- Management standard controls use the installed Mantine components and the management presentation provider. Read the ownership contract in `docs/design-tokens.md`; keep workflow components and typed API boundaries intact.
- The management shell and Home/Event sources/TTS providers/Music sources/Alert safety use direct Mantine controls and the shared section headings. Links remain native anchors (including Anchor/Button rendered as `a`) so modified clicks and dirty-navigation capture work. Home's derived completed-setup `details` remains a native product disclosure. Provider and moderation numeric fields use TextInput with native `type="number"`, retaining existing value conversion, blank drafts and HTML validity; do not replace them with NumberInput coercion. TTS help and moderation errors use Mantine's associated description/error props. Provider setup, live-health polling, credential/pairing generations, explicit activation and moderation save/preview owners remain in their pages.
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

Operator renders inside `ManagementPresentationProvider` and uses the same Mantine commands, fields, `ManagementModalSurface` and `TimerAdjustmentControls` as management; its page layout stays in the scoped `operator-*` rules in App.css. Browser/private overlays retain provider-independent components and shared CSS and must not import management Mantine CSS or JS. Bootstrap and recovery also remain native. Use `renderManagement` for management unit tests and the scoped Management Storybook decorator; never disable real browser portals or focus to make tests pass. Management axe checks include portal roots.

Real management inspector and Diagnostics panels use direct Mantine Tabs with `keepMounted={false}`. Mantine owns focus/navigation/RTL and panel IDs; synchronize each tab's value on focus for canonical automatic Home/End activation. Keep same-value activation idempotent and preserve parent drafts and preview/poll owners. TimerStackEditor profiles select values over one canvas with labelled SegmentedControl radio semantics.

Use the existing ManagementToast/ManagementErrorToast for command outcomes and the foundation `actionableError` boundary to retain typed server references and next steps. Blocking load/stale failures and field validation remain inline. If a command dialog remains open, render its single fixed feedback instance inside that dialog's focus surface. Explicit close or a fresh command/review clears that outcome; do not move an existing toast between page and dialog and restart its expiry or announcement. Newly completed success can close a dialog and mount once at page level.

Assets uses direct Mantine controls, inventory Table and picker Tabs. Its native secondary-filter disclosure, datalist tag suggestions and image/video/audio/font rendering retain their product-specific behavior. Media controls are siblings of picker selection buttons so playback remains independently reachable. Assets and Timers use the existing lazy route boundary to keep the shared picker out of management startup.

All four module pages use `ModulePageLayout` in feedback → saved controls → outputs → workspace → secondary order. Route headers remain in ManagementApp. `ModuleControls`, `SectionHeading`, `ModuleSection` and controlled `DisclosureSection` share spacing and wrapping; pages own expansion, stable correction IDs and focus. `BrowserSourceRow` takes owner-rendered URL, metadata, guidance, telemetry and actions, with readiness separate from activity. Masking/reveal state, clipboard, URL purpose, regeneration, polling and freshness remain with typed workflow owners. Effects retains module live/test source identities and explains existing unified-source membership without inventing profiles. Timers retains independent landscape/vertical dimensions in LTR `bdi`, saved enablement, active run snapshots, polling and profile draft ownership. `#browser-sources` expands and focuses in every module owner.

Effects and Timers page, inventory, editor and module-action controls use Mantine. Effects' set disclosure button and effect `details/summary` preserve hierarchy/count/conditional child semantics; the shared variant-selection tree uses Mantine buttons in both page and editor. Effects editor fields and local preview play/stop/mute controls use direct Button, TextInput, Textarea, NativeSelect and Checkbox; media streaming, cleanup, inspector draft and weighted-selection owners remain unchanged. Reviewed saving and explicit live tests synchronously guard repeated submission and lock dismissal while pending. Timer definition duration, event rules, audio-output checkboxes and stack fields use direct controls with their original Number/valueAsNumber conversions, required validity and blank quantity behavior. TimerStackEditor remains continuously mounted; profile selection still edits one shared draft. Its pointer/keyboard region handles remain native. TimerAdjustmentControls uses Mantine fields and is shared by the Timers editor and Operator, both inside the management provider. Revealed output/one-time credential inputs remain readonly capability presentations. AudioOutputsPanel's route fields/device controls follow Settings' Mantine adoption; its deletion review retains shared pending/error/target/fallback behavior and dialog-owned referenced-item facts.

Music embedded appearance, typography, branding, layout, desktop placement and CSS commands/fields use direct Mantine controls. MusicNumberField keeps raw text drafts, integer/fraction bounds and blur/Enter commits over a TextInput with native type=number, associated error and HTML limits. CSS validation retains one existing help/error owner through attributes.input. Native color/hex/opacity controls remain one RGBA commit surface, with its original validation and no coercion; canvas move/resize/rescale handles keep pointer capture, keyboard cancellation and snapping. Advanced native details and the test-output disclosure preserve mounted draft/poll/media behavior. Desktop placement uses the same existing saved configuration and status API without starting or changing a real device.

Alerts inventory and page-owned dialog commands/fields use direct Mantine controls. Native set/event hierarchy disclosures preserve their tree semantics; the grouped default/variation inventory keeps its semantic table markup and existing narrow-screen card transformation. Revealed output URL inputs remain readonly owner-controlled capability presentations. The shared Twitch reward catalog picker retains its specialized selection behavior. Activation, reset and deletion retain their domain-specific consequence reviews with Mantine controls and scoped pending/error handling. The focused Alerts editor remains a separate editor slice.

The focused Alerts editor and its related event/typography/audio-output controls use direct Mantine Button, UnstyledButton for compound tree/layer selection, TextInput, Textarea, NativeSelect and Checkbox. Existing inspector Tabs and AssetPicker APIs remain unchanged. Number fields use TextInput with native type=number and original Number/valueAsNumber conversions, condition range/relative-chance draft state and error IDs; boolean error props retain Mantine's invalid styling and ARIA without duplicating inline validation. Fields referencing existing sibling help/errors use the documented attributes.input slot for aria-describedby so Mantine retains label IDs while preserving those existing associations. File upload retains its File/event/reset owner. Native canvas move/resize/warp handles retain pointer capture and one-drag/one-undo commits; native RGBA color/opacity, preview seek/test color controls, media rendering and hierarchical/typography details retain their specialized semantics. Profile buttons still select one shared canvas draft without saving or remounting it. The canonical editor guard below700px retains the title and Back action.

Alerts and ScreenEffectEditor alone share MediaAudioControls, MediaVolumeControl, AudioFadeControls and MediaDurationControls. They now use Mantine Checkbox/Radio/TextInput/Button once for both consumers; public props and numeric conversion/clamp/validation contracts remain unchanged. MediaAudioControls' optional checkboxClassName is forwarded to the associated Mantine label, and disabled applies to both fields and the fieldset. Native type=number retains empty/out-of-range volume no-ops, independently clamped fade values and duration rounding/HTML validity. Screen Effects reuses this presentation without a second migration. Audio route deletion and Settings ownership remain separate.

The shared management-mantine.css input policy preserves the semantic negative border for Mantine data-error inputs, including while focused; existing focus outlines remain visible. Keep this common correction beside the neutral input policy rather than adding editor-specific copies.

Alerts active-save and design-copy reviews lock dismissal while pending and guard each request synchronously. A failed command retains one fixed typed error inside its review for explicit retry or dismissal; a fresh review clears it. Navigation saves return typed failure to the dirty-navigation review and suppress the page error. Save failures preserve server reference/next-step context and the existing editor diagnostic reporting owner; unavailable duration repair is also caught by that owner. Editor heading focus is the fallback when saving disables the triggering command.

For `DestructiveConfirmationDialog`, return the mutation Promise from `onConfirm` and guard submission synchronously in the workflow. `pending` also covers externally owned work; all dismissal is locked by default until completion. Set `cancelWhilePending` only when `onCancel` actually aborts that operation. Pass a stable `targetId`, scoped `error` and an available `restoreFocusFallbackRef` when the trigger can disappear or become disabled. Catch failures in the workflow, keep the reviewed same-target draft for explicit retry, and clear owned errors when opening a fresh review. Existing void handlers remain compatible; they must pass pending state or adopt the Promise contract to cover their entire request.

The optional `details` ReactNode is for caller-owned impact facts, such as Audio deletion references. Render those facts once inside the review. Pending owners must remove navigable links before shell capture navigation; the shared scoped error is hidden while pending so its correction links cannot navigate during a retry. Destructive failures remain persistent in the review and must not also become timed command toasts. Effects retains its existing REGENERATE requirement; Timers retains its existing untyped source/credential reviews and consequence copy.

Settings and Diagnostics ordinary controls use direct Mantine Button, TextInput, NativeSelect and Checkbox. Settings retains native `details/summary` so Audio, Overlay, server and backup drafts and polling remain continuously mounted; Automation alone retains its existing expanded-only lifetime. Shared SectionHeading supplies compatible section presentation. Port and desktop opacity use TextInput with native number attributes and their unchanged Number/valueAsNumber conversions, including blank/NaN handling. Backup's TextInput type=file retains the existing File/ChangeEvent/reset owner. NativeSelect retains device IDs, missing-device options and unavailable/fieldset safeguards. Audio's heading remains owned for deletion fallback focus; the accepted deletion review is unchanged.

Settings forwards Audio/Overlay navigation-save failures as typed ActionableManagementError results to the active dirty-navigation dialog. Children suppress duplicate timed failures during that navigation save, retaining drafts and ordinary command/rebind validation. Their imperative `save()` returns true or a typed `{saved:false,error}` failure; ordinary per-route saves retain their boolean contracts. Diagnostics' Mantine controls preserve its accepted tab, filter, sort, selected evidence and refresh owners. Evidence rows use direct UnstyledButton with semantic multicolumn/status presentation and no nested interactive controls; correction/download links remain native anchors. Technical JSON blocks stay isolated LTR inside an RTL workspace.

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
