## 1. Prerequisite Gate

- [ ] 1.1 Fetch `origin/main` and verify `refactor-management-ui-ux`, `improve-management-ui-ux-audit-followups`, and `add-normalized-twitch-event-types` are complete, validated, and present before implementation starts.
- [ ] 1.2 Reconcile current condition operators, normalized event field definitions, selector semantics, editor documents, sibling projections, samples, and Event inspector against this proposal.

## 2. Priority Groups And Relative Chance

- [ ] 2.1 Add failing core tests for grouping existing numeric priorities, stable group ordering, deterministic normalization after reorder, moving a variation between groups, and preserving unchanged priorities.
- [ ] 2.2 Implement pure priority-group projection and normalization helpers over the existing optional integer priority contract.
- [ ] 2.3 Add failing chance tests for highest eligible group filtering, positive weights, one candidate, multiple candidates, disabled or non-matching variants, and default fallback.
- [ ] 2.4 Implement sample-specific relative-chance projection without changing production weighted selection or consuming random values for explanation.

## 3. Typed Condition Authoring

- [ ] 3.1 Add one exhaustive normalized condition-field catalog defining event applicability, value kind, approved operators, bounds or options, and summary formatting.
- [ ] 3.2 Add failing catalog and evaluator tests for every normalized event type, equals/includes/min/max/range controls, invalid ranges, unsupported fields, and raw metadata exclusion.
- [ ] 3.3 Extend management projections only where required to provide sibling variation context and pure sample evaluation to the web app.

## 4. Focused Editor Experience

- [ ] 4.1 Add failing editor tests for ordered priority groups, moving groups and variations, relative-chance copy, typed condition controls, summaries, sample eligibility, fallback, and shared rule-impact warnings.
- [ ] 4.2 Replace raw priority and condition value fields with the grouped and typed controls while preserving explicit save, dirty navigation, undo/redo, validation, and live-impact confirmation.
- [ ] 4.3 Add production-component Storybook states for one candidate, weighted candidates, no-match fallback, invalid range, shared rule edit, expanded-event conditions, and stale or failed save.
- [ ] 4.4 Add Playwright coverage for creating variations, grouping priorities, setting relative chance and a range condition, validating sample selection, saving, reloading, and sending a test.

## 5. Verification

- [ ] 5.1 Run focused core selector/evaluator, management service, editor, Storybook, and Playwright tests, then repository lint, typecheck, full tests, build, and required frontend gates.
- [ ] 5.2 Reconcile every requirement against code and tests, run `openspec.cmd validate improve-alert-variation-authoring --strict`, and complete an independent frontend review.
- [ ] 5.3 Rebuild and restart affected services, wait for health, reload the editor, and verify priority groups, chance calculations, typed conditions, sample explanations, saved test, and live weighted selection evidence.
