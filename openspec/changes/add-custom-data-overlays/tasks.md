## 1. Preparation

- [ ] 1.1 Fetch remote state, confirm this slice is still unimplemented, and branch from `origin/main`. Approval of this proposal does not authorize the later slices.
- [ ] 1.2 Read the frontend routing documents, inspect the Music layout editor, snapping, asset picker and Operator timer controls, and record an editor fit assessment before adding any dependency.
- [ ] 1.3 Write a requirement-to-test trace covering every scenario in this change.

## 2. Values, goals and groups

- [ ] 2.1 Add browser-compatible core schemas for integer and text values, goals, reset groups and shared limits. Test safe-integer bounds, text length, name uniqueness and fixed kinds.
- [ ] 2.2 Implement goal projections for fixed-target and saved-baseline modes, and goal restart. Test decrease, zero, completion, over-target and restart after completion.
- [ ] 2.3 Add typed SQLite repositories and migrations with foreign keys for values, goals, groups and Operator pins. Test restart persistence, reference-safe deletion, rename, and transactional group reset.
- [ ] 2.4 Add a framework-independent value service for set (revision-guarded), add, subtract, reset and group reset. Test stale set, concurrent increments and overflow.

## 3. Management

- [ ] 3.1 Add thin management APIs for value, goal, group, pin and canvas CRUD with existing auth, CSRF and maintenance guards. Test unauthorized requests, referenced deletes and invalid kinds.
- [ ] 3.2 Add the Data page: create and edit values, goals and groups, choose Operator pins, and show current content read-only with references. Add Storybook states.

## 4. Operator

- [ ] 4.1 Add Operator APIs for value commands, group reset and canvas visibility through the existing Operator boundary. Test authorization, conflicts and maintenance.
- [ ] 4.2 Add the Operator Data section with +1, −1, set, confirmed reset, group reset and canvas show/hide. Keep failed input, and fit 540 x 960. Add stories with interaction and accessibility checks.

## 5. Canvases and output

- [ ] 5.1 Register the disabled-by-default `data-overlays` module, and persist canvases, elements and output assignments with bounds and layer order.
- [ ] 5.2 Implement core formatting and the shared text, image, shape and progress renderers. Test plain-text rendering, overflow, missing bindings and stale policy.
- [ ] 5.3 Build the canvas list and editor with layer controls, pointer, keyboard and numeric positioning, resize, styling, binding picker and explicit save. Add empty, loading, error and populated stories.
- [ ] 5.4 Add the isolated preview sample store and simulation controls. Verify that live values and outputs never change.
- [ ] 5.5 Publish scoped projections to module-specific, unified browser and private desktop surfaces. Test the snapshot and subscription race, stale-frame discard, reconnect, output scope and preservation of other modules' media.

## 6. Backup

- [ ] 6.1 Extend versioned backup and restore with all data overlay sections. Test the round trip, invalid references, disabled restored canvases and failed-restore preservation.

## 7. Verification and handoff

- [ ] 7.1 Add disposable-service Playwright acceptance for two canvases sharing a counter, Operator controls, group reset, preview isolation and reference-safe deletion.
- [ ] 7.2 Run lint, typecheck, tests, build, Storybook interaction and accessibility, Playwright and strict OpenSpec validation.
- [ ] 7.3 Rebuild and restart the services, wait for health, and verify the author, Operator and display workflow live. Record OBS browser-source and Windows desktop acceptance separately from the automated results.
- [ ] 7.4 Sync canonical specs, update runbook and UX notes, and update BL-055 to reflect the remaining slices.
