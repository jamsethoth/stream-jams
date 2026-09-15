# Visual UX Audit Corrections Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans sequentially. Follow repository instructions and the frontend-change skill; default to one agent.

**Goal:** Correct six visually verified usability problems in the operator, navigation, alert inventory, Screen Effects controls, and asset filters.
**Architecture:** Reuse production React components, shared modal behavior, existing filter models, and design tokens. Preserve API contracts and playback semantics; no new dependencies or server changes.
**Tech stack:** Existing TypeScript, React, pnpm, Vitest, Storybook, and Playwright versions in manifests.
**Spec:** Correction decisions and acceptance criteria below; reconcile with docs/design/ui-refactor-mvp-ux-spec.md and current OpenSpec capabilities before implementation.

## Scope and authorization

The user requested planning and handoff of these corrections to GPT-5.6 Sol medium. The receiving task should implement and validate local corrections. Follow the required slice specification/commit workflow. Do not push, publish, create a PR, merge, change production settings, trigger real output, or stop user services. This is a separate follow-up to docs/superpowers/plans/2026-09-15-ux-audit-corrections.md; do not implement that earlier plan again.

Six findings come from representative visual checks across all 22 Storybook groups, with desktop 1440x1000, tablet 1024x768, and phone 390x844 checks. This does not mean all 225 scenarios passed. Exclude the standalone editor scrolling observation: the real focused shell constrains height and a production scrolling defect was not verified. Missing media, incomplete settings mocks, and echo-only safety preview fixtures are audit limitations, not demonstrated product bugs.

## Baseline and shared constraints

- [ ] Confirm Windows worktree, status, current branch, and current remote state; follow repository requirements to branch from origin/main. Preserve others' edits.
- [ ] Read applicable AGENTS.md, frontend-change skill, frontend-agent-guide, UX spec, UI guidelines, tokens, and overlay error rules. Inspect active OpenSpec work and the earlier correction plan for overlap, especially AlertSetsPage and ScreenEffectEditor. Do not cherry-pick or merge unrelated work silently.
- [ ] Reproduce each finding against current fixture-backed components. If already resolved, record evidence and omit its change.
- [ ] Create a scoped OpenSpec change named simplify-visual-management-and-operator-ux with proposal, design, delta specs and tasks for these six decisions. Use actual existing capability names after inspection. Strict-validate and commit the slice spec before or with implementation.
- [ ] Keep module identity, counts, stale/revision guards, explicit live-action confirmations, permissions, routes, selection state, and dirty-navigation behavior intact.
- [ ] Use isolated fixtures and an unused loopback port. Existing audit Storybook at 6016 belongs to the source worktree; never claim it verifies the new worktree build.

## Task 1 — Repair operator confirmation keyboard behavior (P2)

**Files:** apps/web/src/operator/OperatorApp.tsx, OperatorApp.test.tsx, OperatorApp.stories.tsx; shared apps/web/src/management/foundation/ModalSurface.tsx (reuse; modify only if a demonstrated shared defect requires it); tests/e2e/operator.spec.ts and multi-module-operator.spec.ts.

**Evidence:** Inline role=dialog at OperatorApp.tsx around line 245 leaves focus on Clear pending. Tab reaches another module's Pause button; Escape does not close; Cancel leaves focus on body.

**Decision:** Render the existing confirmation content through ModalSurface. Store the invoking control for restoration; use the established shared modal initial-focus convention, preferring Cancel for this destructive action. Preserve api.clear(moduleId, count, revision), module-specific text, busy state, and failure recovery.

- [ ] Add a focused regression opening Clear pending by keyboard; assert focus enters the dialog, Tab/Shift+Tab remain inside, Escape and Cancel dismiss without an API call, and focus returns to the trigger.
- [ ] Implement shared modal integration using its actual current props and lifecycle rather than a second focus-trap implementation.
- [ ] Verify confirmation calls the clear API once with the selected module/count/revision; a stale snapshot or rejected command shows actionable error and does not clear the other module or current playback.
- [ ] Check trigger disappearance/disablement after refresh: restore to a stable relevant heading if the trigger cannot receive focus. Preserve disabled dismiss behavior during an in-flight request if required by the shared contract.
- [ ] Update the populated two-module story and run focused tests plus a real-browser keyboard check.

## Task 2 — Prioritize current playback (P2)

**Files:** apps/web/src/operator/OperatorApp.tsx, operator styles located through existing class definitions, OperatorApp.stories.tsx, OperatorApp.test.tsx, tests/e2e/operator.spec.ts and multi-module-operator.spec.ts.

**Evidence:** Two large module cards precede playback. At 390x844, Now playing starts around y=950.

**Decision:** Keep connection/stale/error notices and global safety controls at the top. Place Now playing immediately after these controls and before module queue controls. Compact module rows using existing spacing/button tokens; pending item details follow module controls. Keep both simultaneously playing modules clearly labeled and preserve independently scoped Skip.

- [ ] Reorder sections and compact excess spacing without changing API calls, list identity, focus announcements, or queue ordering.
- [ ] In the healthy populated 390x844 fixture, the Now playing heading and first actionable Skip must be visible without page scrolling. At 1440x1000, both current cards should be visible with no horizontal overflow. Safety/error notices may legitimately push content down.
- [ ] Verify zero/one/two current items, long names, disconnected/stale state, global pause/mute/DND, individually paused modules, and pending queues remain intelligible.
- [ ] Add a browser geometry assertion for the healthy phone fixture and retain semantic tests proving each Skip targets its own item/module. Recheck keyboard order after the reorder.

## Task 3 — Hide unused event catalog entries by default (P2)

**Files:** apps/web/src/management/alerts/AlertSetsPage.tsx and tests/stories; apps/web/src/management/alerts/editor/AlertEditorPage.tsx and tests/stories; current inventory/event-group helpers; tests/e2e/management-alerts.spec.ts.

**Evidence:** Five sample alerts occupy four of twenty displayed event groups; sixteen empty groups repeat zero counts and Valid. Editor navigation also lists unused event groups.

**Decision:** Default both inventory and editor navigation to event types with configured alerts, including disabled or invalid alerts. Provide a visible Show unused event types checkbox/toggle, off initially. The Add alert flow retains the complete catalog. Derive presence from the unfiltered configured inventory so a text filter is not mistaken for an unused event type; apply search/filter semantics after the visibility decision. Do not hide configuration warnings.

- [ ] Add scenarios for mixed configured/unused groups, disabled-only configured groups, invalid configured alerts, a completely empty set, and search with no matches.
- [ ] Filter display groups only; do not alter matching, validation, selection, persisted data, group counts, or event-type availability.
- [ ] Empty sets show a concise create-alert action plus access to unused event types. A no-match search explains that filters can be cleared.
- [ ] Show unused reveals the full catalog; toggling back never discards editor drafts or changes the selected alert. Keep the selected configured group discoverable.
- [ ] Preserve group order and warning badges. Verify creation in a formerly unused group makes it visible in the default view.
- [ ] Coordinate with earlier inventory action/summary corrections by adapting current markup, not restoring old rows.

## Task 4 — Compact mobile management navigation (P2)

**Files:** apps/web/src/management/navigation/ManagementNavigation.tsx and tests/stories; apps/web/src/App.css; management shell component discovered through ManagementNavigation imports; tests/e2e/management.spec.ts.

**Evidence:** At phone width navigation consumes about 300px; wrapping separates Settings and hides the Modules grouping.

**Decision:** At the existing compact navigation breakpoint, show a short Stream Jams/current-section header and a Navigation button. The button expands an inline navigation list using existing links, with Modules and its children visibly grouped. Use aria-expanded/aria-controls and a real button. Desktop sidebar remains unchanged. Prefer a disclosure over a new drawer/modal system.

- [ ] Implement collapsed initial mobile navigation and preserve all current destinations, hrefs, aria-current, and route guards.
- [ ] Expanded navigation uses a single readable ordered column; close after successful navigation. A canceled dirty-navigation prompt must retain route and navigation context.
- [ ] Escape closes the disclosure and restores focus to its button. Do not trap focus for an inline disclosure; ensure hidden links are not keyboard reachable.
- [ ] At 390x844 the collapsed header should fit within roughly 120px, all labels remain readable, and page content has no horizontal overflow. Verify 700px/breakpoint neighbors, 1024x768, and desktop.
- [ ] Add mobile keyboard/navigation coverage, including opening the current child route directly, navigating to Settings, and canceling a dirty route transition. Verify desktop hierarchy remains intact.

## Task 5 — Align Screen Effects binary controls (P3)

**Files:** apps/web/src/management/screen-effects/ScreenEffectEditor.tsx, screen-effects.css, corresponding stories; shared MediaAudioControls.tsx located through imports and its current consumers.

**Evidence:** OBS Browser Source/Desktop overlay labels around lines 385–386 use generic grid labels, placing checkboxes on separate lines from their text.

**Decision:** Reuse the existing screen-effects-check inline layout for output toggles. Ensure embedded media audio toggles receive an equivalent scoped inline layout without changing other form labels or every input globally.

- [ ] Apply the existing checkbox class or an existing shared checkbox primitive to affected controls; preserve label associations and native checkbox behavior.
- [ ] Inspect shared media-audio consumers before adjusting shared markup. Use caller-scoped styling if a shared change would affect unrelated pages.
- [ ] Visually verify desktop and 390px layouts, long labels, focus indication, disabled state, and checked/unchecked states. Clicking text toggles only its associated checkbox.
- [ ] Update representative stories. Run existing affected component tests and typecheck; no new snapshot or CSS-mirroring test is needed for a class-only correction.

## Task 6 — Collapse secondary asset filters (P3)

**Files:** apps/web/src/management/assets/AssetManager.tsx, AssetManager.test.tsx, AssetManager.stories.tsx, related existing asset styles, tests/e2e/management-assets.spec.ts.

**Evidence:** Desktop forces the entire filter disclosure open around line 269: seven fields plus tags precede a small inventory.

**Decision:** Keep Search and Type visible on every viewport. Place Usage, Health, Module, Set, Event, and tags inside a More filters disclosure, initially collapsed on desktop and mobile. Keep current filter values when closing; show an active secondary-filter count and a Clear filters action. Count each non-default secondary field once and each selected tag once; Search and Type are excluded from that count.

- [ ] Preserve the current typed filtering model and option dependencies; change presentation only.
- [ ] Remove obsolete viewport-controlled forced-open state/listeners only if no remaining behavior needs them. Reuse native details/summary where suitable.
- [ ] Verify applying a secondary filter updates results/count, closing retains it, reopening restores controls, and clearing resets results and count using existing reset semantics.
- [ ] Verify dependent Module/Set/Event options retain existing invalid-selection handling, tag combinations, empty results, loading/errors, and asset selection/detail behavior.
- [ ] Add behavior regressions for hidden active filters and reset; update desktop/mobile stories and asset browser coverage.

## Final validation and delivery

- [ ] Run focused affected tests after each slice. Use corepack.cmd pnpm exec vitest run with explicit affected file paths and --maxWorkers=1 on this Windows host if needed.
- [ ] Run the frontend skill's required lint, typecheck, tests, web build, build-storybook and test-storybook:ci commands. Run applicable Playwright management, assets, alerts, Screen Effects, operator and multi-module operator specs using the repository fixture setup.
- [ ] Rebuild/restart only task-owned verification services, wait for health, reload the new build, and repeat corrected workflows at 390x844, 1024x768 and 1440x1000. Check light/dark styles and keyboard behavior; preserve editor small-screen guard.
- [ ] Strict-validate OpenSpec and reconcile completed requirements with implementation/tests. Classify failures honestly and retain required gates; do not call fixture failures or stalled runs green.
- [ ] Capture sanitized before/after evidence outside the repository and report each finding's outcome, checks, limitations, and any skipped-as-already-fixed item. No publication or merge.

## Existing audit evidence

Source workspace: C:/Users/James/.codex/worktrees/1254/stream-jams.
Images: C:/Users/James/.codex/visualizations/2026/09/15/01a0a5da-5be8-7732-9f0a-fd1343b7208d/
- operator-desktop.png and operator-mobile.png
- management-mobile.png
- alert-inventory-desktop.png
- screen-effect-editor.png

These fixtures support the findings but are not acceptance evidence for the corrected build.


