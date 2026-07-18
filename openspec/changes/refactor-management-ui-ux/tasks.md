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
- [x] 4.3 Move browser-source output management into Alerts and show landscape/vertical live state, configuration readiness, and listener telemetry.
- [x] 4.4 Reuse existing route-key APIs with masked display, reveal/copy feedback, and connection-aware regeneration confirmation.
- [x] 4.5 Add alert-set, starter, validation, copy-failure, output, and route-key tests and Storybook states.
- [x] 4.6 Narrow the alert browser-source contract and server mapping to one live output per target profile while preserving test playback through that output.
- [x] 4.7 Remove separate test-source cards and copy from the Alerts UI, stories, and browser regressions.
- [x] 4.8 Replace listener-derived primary browser-source badges with readiness and selected-set profile state, retaining listener details as secondary telemetry.
- [x] 4.9 Poll selected-set browser-source telemetry every five seconds, surface stale refresh failures, and update unit, Storybook, Playwright, and UX documentation coverage.
- [x] 4.10 Add failing component and Playwright regressions for the compact browser-source band, expandable alert-set hierarchy, inline set/alert actions, and validation rollups.
- [x] 4.11 Replace the selected-set overview/detail columns with a full-width expandable alert-set list and compact module-level browser-source band.
- [x] 4.12 Add inline saved-alert Test with explicit profile choice, existing test-delivery APIs, visible success reference IDs, and actionable failure reporting.
- [x] 4.13 Render alert-specific and set-wide validation messages with correction steps in the focused alert editor and update Storybook/UX guidance.
- [x] 4.14 Run focused tests, frontend quality gates, strict OpenSpec validation, production rebuild, and service restart.
- [x] 4.15 Add component regressions for standalone, default-collapsed Browser sources with persistent rollups and deep-link expansion.
- [x] 4.16 Move Browser sources outside the Alert sets region and implement its accessible compact disclosure row.
- [x] 4.17 Update Storybook and Playwright coverage, run frontend quality gates and strict OpenSpec validation, then rebuild and restart the service.
- [x] 4.18 Add failing service, route, management-client, component, and browser regressions for creating an alert in the selected set.
- [x] 4.19 Add the management alert-create command and an `Add alert` dialog that opens the new disabled needs-review alert in the focused editor.
- [x] 4.20 Update Storybook coverage, run frontend and repository quality gates, validate OpenSpec strictly, then rebuild and restart the service.

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
- [x] 6.7 Add failing regressions for default Send test audio/TTS and terminal overlay-instruction cleanup.
- [x] 6.8 Include configured audio/TTS in Send test by default and remove completed or failed instructions from client rendering state.
- [x] 6.9 Run focused and full frontend validation, strict OpenSpec validation, then rebuild and restart the local service.
- [x] 6.10 Add failing regressions for automatic management-session renewal and rejected browser audio playback.
- [x] 6.11 Renew rejected management sessions once and explicitly report browser audio start failures.
- [x] 6.12 Record failed overlay playback as traceable operator diagnostics.
- [x] 6.13 Run focused and full validation, strict OpenSpec validation, then rebuild and restart the local service.

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

## 10. Audited Alert Authoring Gap Closure

- [x] 10.1 Define stable default/variation editor identities, parent linkage, rule controls, variant controls, and service-owned variation ID generation.
- [x] 10.2 Persist and resolve one editor document per default or variation, including migration, backup, transaction, and live-playback coverage.
- [x] 10.3 Add create-variation, duplicate, reset, and delete management commands with explicit live-impact handling.
- [x] 10.4 Complete default and variation authoring in the alert-set inventory and focused editor.

## 11. Audited Focused Editor Gap Closure

- [x] 11.1 Complete target-profile copy, profile-specific canvas view state, guide/background controls, fit/reset controls, and dirty profile switching.
- [x] 11.2 Complete animation timing, sample-payload reset and variable insertion, and local audio/TTS preview controls.
- [x] 11.3 Replace the unsupported narrow-screen editor workspace with an actionable larger-screen requirement.

## 12. Audited Settings Gap Closure

- [x] 12.1 Add explicit local data-folder and retained-log maintenance actions with failure diagnostics.

## 13. Audited Speaker.bot Runtime Gap Closure

- [x] 13.1 Route configured live alert TTS through the active Speaker.bot provider while keeping voice and safety controls provider-owned.
- [x] 13.2 Keep editor Preview local-only and prevent duplicate Speaker.bot triggers across target profiles.

## 14. Completion Truth

- [ ] 14.1 Re-audit closed MVP specs, run all required validation, rebuild and restart affected services, and update completion evidence only after live verification.
