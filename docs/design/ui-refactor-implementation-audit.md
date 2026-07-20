# UI Refactor Implementation Audit

This audit maps every approved high-fidelity board to production UI, automated evidence, and the MVP boundary in `ui-refactor-mvp-ux-spec.md`. It is the durable implementation-status companion to the visual review guide.

Status: **21 of 21 approved boards are represented by production workflows.** Deferred extensions remain in the existing MVP backlog; no approved board is left without implementation or an explicit boundary.

## Board Coverage

| Approved board | Production implementation | Automated evidence | MVP boundary |
| --- | --- | --- | --- |
| Hi-Fi - Home | `HomePanel` derives readiness, active-set state, actionable problems, and correction links. | `HomePanel.test.tsx`; `HomePanel.stories.tsx`; management Playwright setup flow. | Live queue and moderation remain in the future operator console. |
| Hi-Fi - Event Source Setup | `ProviderPage` keeps one setup wizard open through validation and registers only after success. | `ProviderPages.test.tsx`; `ProviderPages.stories.tsx`. | Resumable setup drafts are backlog. |
| Hi-Fi - Alert Sets Overview | `AlertSetsPage` provides selected/active set context, inventory, activation impact, validation, starter review, and browser sources. | `AlertSetsPage.test.tsx`; `AlertSetsPage.stories.tsx`; `management-alerts.spec.ts`. | Multiple active sets and bulk operations are backlog. |
| Hi-Fi - Alert Editor Landscape | `AlertEditorPage` provides focused routing, alert search/tree, a fit-by-default canvas, layer controls, profile geometry, preview, save, and revert. | `AlertEditorPage.test.tsx`; `editor-state.test.ts`; `ReadyLandscape` and `ActiveSpeakerBotTts` stories; `management-alerts.spec.ts`. | Preset animation is MVP; timeline/keyframe editing is backlog. |
| Hi-Fi - Alert Editor Vertical | The same editor switches to the fixed vertical profile and exposes disabled/needs-review state independently. | `VerticalNeedsReview` story; editor profile assertions in `AlertEditorPage.test.tsx`. | Custom profiles and automatic cross-profile layout sync are backlog. |
| Hi-Fi - Alert Editor Send Test Blocked | Send-test failures use dismissible transient error toasts with cause, next step, reference context, and a diagnostics link; unreviewed profiles disable dispatch. | `DeliveryFailure` story; send-test assertions in `AlertEditorPage.test.tsx`; server editor-service tests. | Full provider-event simulation across all enabled flows is backlog. |
| Hi-Fi - Assets Library | `AssetManager` provides search, type/usage/tag filters, preview, metadata editing, and safe actions. | `AssetManager.test.tsx`; `AssetManager.stories.tsx`. | Bulk actions and asset version history are backlog. |
| Hi-Fi - Asset Detail Usage | Asset detail lists stable-ID usages and deep-links to exact set/event/alert/profile editor context. | Contextual usage-link assertion in `AssetManager.test.tsx`; deep-link Playwright coverage. | Multi-select usage operations are backlog. |
| Hi-Fi - Asset Picker Upload | `AssetPicker` selects compatible assets or validates, tags, registers, and selects an upload without leaving the editor. | `AssetPicker.test.tsx`; `AssetPicker.stories.tsx`. | User-created template libraries are backlog. |
| Hi-Fi - Event Sources List Detail | Event sources show separate connection/intake state, detail, validation, and activation impact. | `ProviderPages.test.tsx`; `ConfiguredEventSources` and `ActivationWarning` stories. | Multiple active providers per capability are backlog. |
| Hi-Fi - TTS Provider Setup | Speaker.bot uses its own capability-specific validation-before-registration wizard. | Provider registration tests; provider setup Storybook states; live provider validation and voice test. | Setup drafts and multiple active TTS providers are backlog. |
| Hi-Fi - TTS Provider Detail Safety | Provider detail owns voice test, default voice, volume/rate limits, max length, and usage context. | TTS safety assertions in `ProviderPages.test.tsx` and `ManagementApp.test.tsx`; `ConfiguredTtsProvider` story. | Alert-level voice override and future filtering controls are backlog. |
| Hi-Fi - Diagnostics Problems | `DiagnosticsPanel` groups active problems and preserves correction routes and reference IDs. | `DiagnosticsPanel.test.tsx`; `ActiveProblems`/`NoProblems` stories; `management.spec.ts`. | Live operator attention handling remains a separate future surface. |
| Hi-Fi - Diagnostics Events | Diagnostics exposes normalized event filtering, sorting, detail, affected alerts, and correction links. | Event-detail test and story; diagnostics Playwright correction flow. | Full event replay/simulation is backlog. |
| Hi-Fi - Diagnostics Raw Logs Failure Detail | Raw logs expose sanitized source-shaped evidence, copy, export, and visible export/download failures. | Raw-log and export-failure tests/stories; redaction service tests. | Unredacted secret-bearing payload display/export is intentionally excluded. |
| Hi-Fi - Settings Overview | `SettingsPanel` owns theme, local server, data/log/version information, local maintenance, and backup/restore. | `SettingsPanel.test.tsx`; `Overview` story; settings Playwright flow. | Moving data, editing the retention policy, updates, and command palette are backlog. |
| Hi-Fi - Backup Export | Settings exports one bounded, checksummed config/assets archive and states secret exclusions. | Backup service tests; Settings export test/story; Playwright export flow. | Cloud backup/sync is backlog. |
| Hi-Fi - Restore Backup | Restore preflights impact, blocks live activity, requires confirmation, creates a safety backup, regenerates URLs, and reports reconnect steps. | Restore unit/integration tests; Settings restore tests/stories; Playwright restore flow. | Merge import and preserving route keys are backlog. |
| Hi-Fi - Dirty Navigation Guard | `DirtyNavigationProvider` guards route changes with save/discard/cancel and carries active-output impact in its summary. | `ManagementApp.test.tsx`; `AlertEditorPage.test.tsx`; `DirtyNavigationGuard` story. | Broad domain auto-save and version history are backlog. |
| Hi-Fi - Active Set Save Warning | Saving output-affecting edits to an enabled alert in the active set requires an explicit warning naming event and profiles. | Active-save assertion in `AlertEditorPage.test.tsx`; `ActiveSetSaveWarning` story. | Disabled-alert or cosmetic-only edits do not trigger the warning. |
| Hi-Fi - Destructive Confirmation | Connected browser-source route-key regeneration requires typed confirmation and states consequence/recovery. | `AlertSetsPage.test.tsx`; `ManagementFoundation.test.tsx`; regeneration stories and Playwright flow. | Preserving route keys during restore is backlog. |

## Cross-Workflow Deep Links

The regression suite preserves these correction paths:

- Home readiness actions to provider setup and selected alert-set context.
- Asset usage to the focused editor with set, event, and target-profile query context.
- Focused editor route parsing/formatting without label-derived IDs.
- Diagnostics problems/events to the exact correction screen with reference context.
- Browser-source readiness actions to the selected alert set's `#browser-sources` section.

## Verified Closure - 2026-07-20

The closed MVP specifications, active completion changes, approved UX decisions, and production implementation were compared again after the live pass. Historical concepts were treated as intentional replacements: alert collections are exposed as alert sets with exactly one active set, and alert tests reuse the connected target-profile output instead of requiring a second browser source. Timeline/keyframe editing, custom profiles, multiple active sets, and other recorded backlog work remain outside the MVP boundary.

Final automated evidence passed:

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm build-storybook`.
- `pnpm test`: 133 files and 878 tests.
- `pnpm test:storybook:ci`: 12 suites and 106 tests.
- `pnpm test:e2e`: 20 Chromium tests.
- Strict OpenSpec validation for `refactor-management-ui-ux` and `add-speakerbot-tts-provider`, plus `git diff --check`.

The rebuilt production service passed its health check and live workflows. The Speaker.bot connection and direct voice test were confirmed before app-level validation. Home reported 4 of 4 setup items complete. A temporary Speaker.bot-enabled variation saved without remaining dirty, queued to the connected Landscape output, rendered and cleared in the browser-source overlay, and was deleted afterward. The editor exposed its larger-screen requirement at 390 px. Diagnostics had no active problem. Settings opened the data folder, applied log retention, and reported a backup-ready summary after schema migration 12 revoked an unsupported legacy output key and backup validation accepted nullable TTS configuration.

## Historical Baseline

`penpot-current-state.md` and `penpot-current-state.json` describe the pre-refactor capture used to establish the baseline. They are intentionally retained as historical evidence. The high-fidelity board manifest and this audit describe the approved and implemented refactor state.
