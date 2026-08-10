## 1. Prerequisite Gate

- [x] 1.1 Fetch `origin/main` and verify `refactor-management-ui-ux`, `improve-management-ui-ux-audit-followups`, and `add-normalized-twitch-event-types` are complete, validated, and present before implementation starts.
- [x] 1.2 Reconcile current condition operators, normalized event field definitions, selector semantics, editor documents, sibling projections, samples, and Event inspector against this proposal.

## 2. Priority Groups And Relative Chance

- [ ] 2.1 Add failing core tests for grouping existing numeric priorities, stable group ordering, deterministic normalization after reorder, moving a variation between groups, preserving unchanged priorities, and explaining a legacy default-priority tie.
- [ ] 2.2 Implement pure priority-group projection and normalization helpers over the existing optional integer priority contract that emit no assignments for unchanged groups and normalize every conditional sibling only after an explicit group order or membership change.
- [x] 2.3 Add failing chance tests for highest eligible group filtering, positive weights, one candidate, multiple candidates, disabled or non-matching variants, default fallback, and a legacy default-priority tie.
- [x] 2.4 Implement `projectAlertVariationSelection` as the shared pure resolver projection for eligibility, highest priority, and total weight; use it for live resolution and sample explanation while keeping random consumption only in live weighted choice.

## 3. Typed Condition Authoring

- [x] 3.1 Add one exhaustive normalized condition-field catalog defining event applicability, value kind, approved operators, bounds or options, and summary formatting.
- [ ] 3.2 Add failing catalog, evaluator, and server-boundary tests for every normalized event type, equals/includes/min/max/range controls, invalid ranges, unchanged unsupported saved conditions, rejection of new or modified unsupported conditions, and raw metadata exclusion.
- [ ] 3.3 Implement core `validateAuthoredAlertConditions` catalog validation and enforce it in `AlertEditorService.saveDocument` by comparing candidate rule and variation conditions with their current saved conditions; allow unchanged unsupported conditions to round-trip or be removed, reject new, modified, or duplicated unsupported conditions, and complete this validation before any persistence mutation or transaction.
- [x] 3.4 Add the focused authenticated `GET /management/alerts/:alertId/editor/variation-context` projection required to provide sibling variation context and pure sample evaluation to the web app without expanding general inventory or editor-document responses.

## 4. Focused Editor Experience

- [ ] 4.1 Add failing editor and save-boundary tests for ordered priority groups, moving groups and variations, relative-chance copy, typed condition controls, summaries, sample eligibility, fallback, shared rule-impact warnings, complete sibling assignments, invalid or partial assignments, atomic assignment validation before mutation, and rollback.
- [ ] 4.2 Replace raw priority and condition value fields with the grouped and typed controls, and extend the existing editor save request with complete sibling-priority assignments validated as one atomic set at the server boundary and applied in one whole-rule transaction with the selected document while preserving explicit save, dirty navigation, undo/redo, validation, and live-impact confirmation.
- [ ] 4.3 Add production-component Storybook states for one candidate, weighted candidates, no-match fallback, invalid range, shared rule edit, expanded-event conditions, and stale or failed save.
- [ ] 4.4 Add Playwright coverage for creating variations, grouping priorities, setting relative chance and a range condition, validating the non-enqueuing sample explanation, saving, reloading, and confirming Preview and Send test still target the selected alert.

## 5. Verification

- [ ] 5.1 Run focused core selector/evaluator, management service, editor, Storybook, and Playwright tests, then repository lint, typecheck, full tests, build, and required frontend gates.
- [ ] 5.2 Reconcile every requirement against code and tests, run `openspec.cmd validate improve-alert-variation-authoring --strict`, and complete an independent frontend review.
- [ ] 5.3 Rebuild and restart affected services, wait for health, reload the editor, and verify priority groups, chance calculations, typed conditions, sample explanations, saved test, and live weighted selection evidence.
