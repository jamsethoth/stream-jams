## 0. OpenSpec And Baseline Guard

- [x] 0.1 Create the `refactor-management-ui-ux` proposal, design, and capability delta specs.
- [x] 0.2 Reference the approved UX spec, decision log, Penpot state, review guide, and high-fidelity board manifest.
- [x] 0.3 Record the 0-9 implementation slices and keep the operator console design-only.
- [x] 0.4 Run strict OpenSpec validation and confirm Slice 0 changes no production code.

## 1. Domain And API Contracts

- [x] 1.1 Audit current alert, provider, output, asset, diagnostics, and settings models and define required persistence migrations.
- [x] 1.2 Add core schemas and domain rules for alert sets, provider/event identity, variations, target profiles, validation, output state, sample payloads, editor documents, and asset usage.
- [x] 1.3 Add server view models and mappings for Home, provider setup/detail, alert sets/editor, assets, diagnostics, and backup/restore summaries.
- [x] 1.4 Extend existing management and alert API clients with the new typed contracts instead of adding a parallel client.
- [x] 1.5 Add schema, mapping, repository, and route regression tests and run typecheck for touched packages.

## 2. App Shell Routing And Design Foundation

- [x] 2.1 Replace component-local management tabs with a tested local route parser/formatter for the approved information architecture.
- [x] 2.2 Build the sidebar shell, nested Modules navigation, breadcrumbs, page headers, status badges, and temporary legacy route adapters.
- [x] 2.3 Add tokenized System/Dark/Light themes, comfortable density, reduced-motion behavior, and responsive canvas limits.
- [x] 2.4 Add shared error, destructive-confirmation, masked-secret, and dirty-navigation patterns with keyboard and accessibility coverage.
- [x] 2.5 Add Storybook and management-app tests for shell, routes, nested navigation, errors, confirmations, and dirty navigation.

## 3. Home And Provider Setup

- [x] 3.1 Replace Dashboard with setup-focused Home derived from provider, starter-set, output, and actionable-problem state.
- [x] 3.2 Build Event sources list/detail and validated add-source wizard with distinct usage and live runtime status.
- [x] 3.3 Build TTS providers list/detail and setup wizard with voice test, usage links, and provider-owned safety controls.
- [x] 3.4 Enforce one active provider per capability and show alert-impact blockers or warnings before activation.
- [x] 3.5 Add first-run, partial, configured, validation-failure, and activation-impact tests and Storybook states.
- [x] 3.6 Replace redundant event-source connection/intake/runtime columns with `Usage` and transient `Live status`, including inactive and runtime-failure states.
- [x] 3.7 Poll event-source live status every five seconds and project source-referenced runtime failures into selected-provider detail with a filtered Diagnostics link.

## 4. Alert Sets And Browser Sources

- [x] 4.1 Replace the default Alerts surface with selected/active alert-set overview, set switching, validation, inventory, and starter-review actions.
- [x] 4.2 Implement distinct save and activation flows with one active set, blockers, warnings, and live-impact summaries.
- [x] 4.3 Move browser-source output management into Alerts and show landscape/vertical state, last connection, and test targets.
- [x] 4.4 Reuse existing route-key APIs with masked display, reveal/copy feedback, and connection-aware regeneration confirmation.
- [x] 4.5 Add alert-set, starter, validation, copy-failure, output, and route-key tests and Storybook states.

## 5. Assets Library And Picker

- [x] 5.1 Extend asset persistence and APIs with normalized tags, health, searchable metadata, and usage summaries.
- [x] 5.2 Rebuild Assets as a searchable/filterable table with preview/detail, usage deep links, tags, health, and unused filtering.
- [x] 5.3 Add guarded global replacement and deletion flows that report affected alert/profile usages.
- [x] 5.4 Add an editor asset picker with compatible filtering, search, existing selection, and validated inline registration.
- [x] 5.5 Add asset schema/API, table/detail, picker, upload-failure, replacement, and deletion tests and Storybook states.

## 6. Focused Alert Editor MVP

- [x] 6.1 Add the focused alert-editor route and shell with breadcrumb, selected-set tree search, alert switching, toolbar, canvas, and inspector.
- [x] 6.2 Implement Text, Image, Video/GIF, Audio, TTS, and only-needed Shape layers with ordering, visibility, selection, and exact inspector fields.
- [x] 6.3 Implement landscape/vertical layout, per-profile enablement/review, safe-area guides, zoom, grid/edge/center snapping, and reset behavior.
- [x] 6.4 Implement undo/redo, explicit save, revert, and the shared dirty guard across alert, set, profile, and route switches.
- [x] 6.5 Implement built-in/session sample payloads, always-available canvas Preview, connected-output Send test, target selection, and blocked state.
- [x] 6.6 Add editor domain, interaction, accessibility, Storybook, and Playwright coverage for all approved editor states.

## 7. Diagnostics

- [x] 7.1 Add typed Problems, normalized Events, and redacted Raw logs API/view contracts with reference IDs and correction targets.
- [x] 7.2 Build Problems grouping, Events table/detail, and Raw logs detail with session filters, sorting, and reference-ID search.
- [x] 7.3 Add provider, alert, asset, output, and settings correction deep links that preserve diagnostic context.
- [x] 7.4 Preserve sanitized diagnostics/debug exports and add sanitized copy plus visible export-failure handling.
- [x] 7.5 Add redaction, search, deep-link, export, UI, Storybook, and Playwright coverage for approved diagnostics states.
- [x] 7.6 Add `Copy error JSON` for the selected sanitized Diagnostics problem with visible clipboard success and failure states.

## 8. Settings Backup And Restore

- [x] 8.1 Reframe Settings around preferences, local data/log maintenance, versions, route-key maintenance, diagnostics, and backup/restore.
- [x] 8.2 Implement versioned `.streamjams-backup` export with configuration, all user assets, checksums, and non-secret provider metadata.
- [x] 8.3 Implement preflight archive/schema/checksum/asset validation and a detailed restore impact summary.
- [x] 8.4 Block restore during live activity, create a safety backup, apply transactionally, regenerate route keys by default, and report reconnect steps.
- [x] 8.5 Add export secret-exclusion, validation, safety-backup, live-block, transaction, UI, Storybook, and Playwright coverage.

## 9. Cleanup And Regression Pass

- [x] 9.1 Remove obsolete Dashboard, Twitch, Overlays, and Playback top-level navigation, panels, and temporary adapters.
- [x] 9.2 Keep runtime operator controls out of management except correction links and future operator-route entry points.
- [x] 9.3 Update repo UX docs, screenshots/manifests, Storybook navigation, and affected tests to match implemented behavior.
- [x] 9.4 Add deep-link regressions for Home actions, asset usages, alert editor context, diagnostics corrections, and browser-source outputs.
- [x] 9.5 Audit every approved high-fidelity workflow against implementation or an explicit backlog item.
- [x] 9.6 Run lint, typecheck, unit tests, build, applicable Storybook tests, and applicable Playwright tests.
