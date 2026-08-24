## 1. Prerequisite And Contract Reconciliation

- [x] 1.1 Fetch `origin/main` and verify `improve-alert-variation-authoring` is complete, strictly validated, and present before implementation begins.
- [x] 1.2 Reconcile its final condition/priority summary exports plus current `AlertInventoryRow`, `alertStarterTemplates`, validation issues, Alert Sets filters, focused-editor navigation, mutation responses, and responsive requirements against this design.

## 2. Pure Event Hierarchy And Filtering

- [x] 2.1 Add failing management-contract and service tests for inventory-only unknown event strings plus saved conditions, weight, and priority defaults/population while canonical creation, persistence, editor, and runtime boundaries remain unchanged.
- [x] 2.2 Additively expand `AlertInventoryRow` and existing set-detail assembly without adding an endpoint, nested transport model, migration, or runtime matcher change.
- [x] 2.3 Add failing `alert-event-groups` tests for canonical order, multiple defaults, attached variations, empty events, unknown events, orphan retention, counts, enabled totals, and worst validation status.
- [x] 2.4 Implement `buildAlertEventGroups` over the existing catalog, rows, and issues without adding a management API or persisted group model.
- [x] 2.5 Add failing filter tests for event/default/variation matches, owning-default retention, status/profile filters, matching-versus-total counts, no-match state, and manual disclosure restoration inputs.
- [x] 2.6 Implement `filterAlertEventGroups` and the smallest shared summary helpers by reusing `formatAlertConditionSummary` and `buildAlertPriorityGroups`, and describe saved weight without calculating another playback probability.

## 3. Alert Sets Event Disclosures

- [ ] 3.1 Add failing Alert Sets tests for disclosure semantics, initial non-empty expansion, known empty-event Add alert, unknown-event display without Add, group counts/status, no event toggle, every existing row action, mutation focus restoration, loading/error/empty/no-match states, and filter-state restoration.
- [ ] 3.2 Replace the flat inventory table with event sections that use the pure projections, existing mutation/dialog callbacks, native disclosure controls, and stable row IDs; successful global and event-scoped creation stays on Alert Sets and restores row focus.
- [ ] 3.3 Update Alert Sets styles and stories for multiple defaults, conditional variations, empty and unknown events, collapsed validation summaries, filtering, narrow stacked rows, request failure, and creation failure using existing tokens and components.

## 4. Focused Editor Event Navigation

- [ ] 4.1 Add failing focused-editor tests for grouped navigation, selected-event forced expansion, route identity, search context, empty/unknown events, disclosure keyboard behavior, unsaved row switching, and disclosure toggling without a dirty-navigation prompt.
- [ ] 4.2 Replace the flat navigation map with event disclosures derived from the shared projections while preserving current selection, copy-design choices, route switching, and the supported larger-screen requirement.
- [ ] 4.3 Update focused-editor stories and `management-alerts` Playwright coverage for grouped selection, variation parent context, filter clearing, create/duplicate/delete focus, set switching, and unsupported narrow viewport behavior.

## 5. Verification And Rollout

- [ ] 5.1 Run focused hierarchy, Alert Sets, editor, Storybook, and management-alerts Playwright tests, then repository lint, typecheck, full tests, build, and required frontend gates without weakening coverage.
- [ ] 5.2 Reconcile every requirement against code and tests, run `openspec.cmd validate group-alerts-by-event-type --strict`, and complete an independent frontend review.
- [ ] 5.3 Rebuild and restart affected local services, wait for health, reload Alert Sets and the focused editor, and verify populated, empty, unknown, filtered, keyboard, mutation-focus, landscape, and vertical workflows against the new build.
