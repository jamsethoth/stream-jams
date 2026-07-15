# Stream Jams UI Refactor Implementation Plan

Status: approved for implementation.

This plan implements the approved MVP UX in `docs/design/ui-refactor-mvp-ux-spec.md` and the synced high-fidelity boards under `docs/design/hifi-concept-boards/`.

## Current State

- The management UI is currently a tab-state app in `apps/web/src/management/ManagementApp.tsx`.
- Current nav still includes old surfaces: `Dashboard`, `Twitch`, `Overlays`, `Playback`, `TTS`, `Settings`, `Alerts`, and `Assets`.
- Existing backend/API pieces already cover alerts, assets, diagnostics, Twitch auth/status, TTS tests, playback, overlay output keys, and settings, but the view models do not yet match the approved alert-set/editor/provider UX.
- OpenSpec currently has no active UI-refactor change. Before implementation, create a dedicated OpenSpec change from this plan.

## Implementation Rules

- Backend/domain contracts first when a screen needs state the UI cannot honestly fake.
- Keep the operator console design-only for this refactor.
- Do not add a router library at the start. Use a small local route model around `window.history` and URL paths/search params. Reconsider only if route nesting, blocking, or tests become worse than the dependency.
- Do not adopt Tailwind, MUI, or Carbon React for this refactor.
- Add Storybook coverage for every production screen/panel state changed by a slice.
- Keep every slice reviewable on its own branch/PR.

## Slice 0: OpenSpec And Baseline Guard

Goal: turn this approved design baseline into an implementation change record before code starts.

Work:

- Create OpenSpec change `refactor-management-ui-ux`.
- Reference the approved spec, decision log, Penpot state, review guide, and high-fidelity board manifest.
- Add task list matching this plan.
- Mark operator console as design-only/non-goal.

Acceptance:

- `openspec.cmd validate refactor-management-ui-ux --strict` passes.
- No production code changes in this slice unless OpenSpec tooling requires metadata.

## Slice 1: Domain And API Contracts

Goal: define the view contracts the UI needs before rebuilding screens.

Work:

- Add core/domain types for alert sets, provider kind, event type, variation, target profile, validation result, alert output state, sample payload, and asset usage summary.
- Add server/view models for:
  - Home setup summary.
  - Event source providers and active provider impact.
  - TTS provider detail and safety settings.
  - Alert set overview, validation summary, inventory rows, and browser-source output status.
  - Alert editor document, layer model, target-profile layout, sample payloads, preview/test response.
  - Asset usage/detail rows and picker search.
  - Diagnostics Problems/Events/Raw logs tabs.
  - Settings backup/export/restore summaries.
- Extend existing management API client rather than inventing a parallel client layer.

Acceptance:

- Unit tests cover schema validation and mapping for new contracts.
- Existing alert/assets/diagnostics/TTS routes still pass.
- `pnpm typecheck` passes for touched packages.

## Slice 2: App Shell, Routing, And Design Foundation

Goal: replace tab shell with the approved management shell without rebuilding all pages at once.

Work:

- Replace `ManagementTabId` with a route model matching:
  - `Home`
  - `Event sources`
  - `TTS providers`
  - `Modules > Alerts`
  - `Assets`
  - `Diagnostics`
  - `Settings`
- Add breadcrumbs, page header, status badges, confirmation pattern, inline/page error pattern, and masked-secret/route-key display primitive.
- Add theme tokens for System/Dark/Light and base density rules using CSS variables.
- Keep old panels temporarily mounted behind route adapters where needed.
- Add route blocking hook for dirty domain/editor state.

Acceptance:

- Current major panels remain reachable through the new shell or explicit temporary adapter route.
- Keyboard navigation and selected nav state work.
- Storybook covers shell default, nested modules, error banner, destructive confirmation, and dirty navigation guard.
- Management app tests cover route selection and dirty navigation guard.

## Slice 3: Home And Provider Setup

Goal: implement setup-focused Home and provider pages.

Work:

- Replace `DashboardPanel` with `HomePanel`.
- Derive checklist state from provider validation, default alert-set review, and browser-source output state.
- Reframe `TwitchPanel` into `EventSourcesPage` with registered provider list/detail and add-source wizard.
- Reframe `TtsPanel` into `TtsProvidersPage` with setup wizard, provider detail, voice test, and safety controls.
- Keep one active provider per capability.
- Add activation impact warnings based on active alert-set/provider kind matches.

Acceptance:

- Home never shows raw logs or live moderation queue.
- Provider setup does not register until validation succeeds.
- Failed validation shows summary, next step, retry action, and reference ID when available.
- Storybook covers first-run, partially configured, configured, provider validation failure, and activation warning states.

## Slice 4: Alert Sets And Browser Sources

Goal: make `Modules > Alerts` default to active alert set overview.

Work:

- Replace current `AlertConfigurationPanel` default surface with alert sets overview.
- Add selected set switcher, activation state, validation summary, alert inventory, and browser-source output section.
- Keep output URLs inside Alerts, not top-level `Overlays`.
- Mask route keys by default, with reveal/copy feedback.
- Add typed route-key regeneration confirmation when a client is connected or recently connected.
- Add starter default set review actions.

Acceptance:

- One active alert set is enforced.
- Active-set save warnings show affected event/profile/output impact.
- Blockers prevent activation; warnings allow confirmation.
- Existing overlay output key routes are reused.
- Storybook covers active set, inactive valid set, blockers, warnings, starter review, copy failure, and key regeneration.

## Slice 5: Assets Library And Picker

Goal: implement global asset review plus inline picker workflow.

Work:

- Rebuild `AssetManager` as searchable/filterable asset table with preview/detail panel.
- Add usage links by set/event/alert/profile.
- Add tags to asset metadata and APIs.
- Add asset picker drawer/dialog usable by alert editor layer flows.
- Add inline upload validation and display-name/tag entry.
- Add replacement/delete safeguards.

Acceptance:

- Assets page supports preview, filters, tags, usage links, unused filter, and safe delete/replace flow.
- Picker can select existing asset or upload/register a new asset without leaving editor context.
- Upload errors include allowed types/size and next step.
- Storybook covers empty, populated, filtered, detail, upload failure, in-use replacement warning, and picker states.

## Slice 6: Focused Alert Editor MVP

Goal: build the distinct focused editor route.

Work:

- Add `/modules/alerts/editor/:alertId` route in the local route model.
- Implement focused shell with breadcrumb/header, alert tree/search, target profile switch, canvas, toolbar, and right inspector.
- Implement MVP layer types: text, image, video/GIF, audio, TTS, and shape only if needed.
- Implement per-profile geometry, safe-area guides, zoom controls, grid/center/edge snapping, exact inspector fields, layer visibility, ordering, undo/redo, and dirty guard.
- Implement built-in sample payload selector, canvas preview, send-test target menu, and blocked send-test state when no output is connected.
- Keep timeline/keyframes, multi-select, layer groups, masks, custom HTML/CSS/JS, and persisted custom samples out of MVP.

Acceptance:

- Editor can switch alerts and profiles without losing unsaved edits silently.
- Save persists one alert/variation and touched target-profile layouts.
- Disabled/unreviewed vertical profile is editable but not live until enabled/reviewed.
- `Preview` works without connected provider/output.
- `Send test` uses actual playback/overlay path and blocks clearly when no output client is connected.
- Storybook covers landscape, vertical disabled/needs-review, dirty guard, no selection, selected layer, Event tab samples, and send-test blocked.

## Slice 7: Diagnostics

Goal: replace diagnostics grid with the approved Problems/Events/Raw logs workflow.

Work:

- Add Problems, Events, and Raw logs tabs.
- Add reference-ID search and session-only filters/sort.
- Add grouped active problems by severity/area.
- Add normalized events table and selected event detail.
- Add redacted raw logs with `Copy sanitized event`.
- Keep diagnostics export and debug export, but present them as sanitized support bundles.
- Add correction deep links to provider, alert, asset, output, or settings surfaces.

Acceptance:

- No active failure is silently hidden.
- Raw logs redact secrets, tokens, route keys, and auth fields before display/copy/export.
- Reference IDs can be searched.
- Storybook covers active problems, no problems, event detail, raw log detail, and export failure.

## Slice 8: Settings, Backup, And Restore

Goal: move global app concerns into Settings and add backup/restore MVP.

Work:

- Reframe Settings around preferences, data folder, log retention, version/schema, backup/export, restore, route-key maintenance, and diagnostics export links.
- Keep moderation settings only if still in MVP scope; otherwise move to backlog/operator-safety follow-up.
- Add `.streamjams-backup` export with manifest, config JSON, assets, checksums, app/schema version, and provider metadata without secrets.
- Add restore validation, summary, safety backup, blocked-live-intake state, route-key regeneration default, and reconnect warnings.

Acceptance:

- Export excludes provider credentials, route keys, tokens, and secrets.
- Restore is disabled until validation succeeds.
- Restore creates safety backup before replacing data.
- Restore blocks during live intake/playback.
- Storybook covers settings overview, export ready, restore validation, live-blocked restore, safety backup failure, and route-key warning.

## Slice 9: Cleanup And Regression Pass

Goal: remove obsolete surfaces and harden the completed refactor.

Work:

- Remove or archive old top-level `Dashboard`, `Twitch`, `Overlays`, and `Playback` management tabs.
- Keep playback/operator runtime controls out of management unless they are correction links or future operator route entry points.
- Update docs, screenshots, Storybook navigation, and tests.
- Add route/deep-link regression tests for Home next actions, asset usage links, alert editor links, diagnostics correction links, and output links.
- Run full validation.

Acceptance:

- Navigation matches approved IA.
- Old top-level pages no longer appear in management nav.
- All high-fidelity board workflows have implementation coverage or an explicit deferred/backlog entry.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and applicable Storybook/Playwright gates pass or have a documented blocker.

## Recommended First PR

Start with Slice 0 plus the smallest part of Slice 1 needed to prove the new contracts. Do not start with CSS-only visual work.

Reason: the approved UI depends on real alert set/provider/output/validation state. Building the shell first is useful only after the data contracts are stable enough to avoid throwaway mock wiring.

## Backlog Kept Out Of MVP

- Operator console implementation.
- Multiple active providers.
- Multiple active alert sets.
- Custom target profiles.
- Timeline/keyframe editor.
- User-created template library.
- Bulk operations implementation.
- Asset version history.
- Cloud backup/sync.
- Global command palette.
- Full OBS-aware readiness.
