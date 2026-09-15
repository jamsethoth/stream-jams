# UX Audit Corrections Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan sequentially. Follow repository instructions and the frontend-change skill. Do not delegate by default.

**Goal:** Reduce ambiguity and repeated decisions in alert setup, editing, testing, and the management home page.

**Architecture:** Reuse current React pages, typed API clients, editor draft state, and existing validation contracts. Keep changes frontend-only unless verified evidence demonstrates that a required readiness fact is unavailable; report that limitation before expanding contracts. Preserve the distinct Alerts and Screen Effects runtime models.

**Tech stack:** Existing React/TypeScript, pnpm, Vitest, Storybook, and Playwright versions from repository manifests.

**Spec:** The correction decisions and acceptance criteria below, together with `docs/design/ui-refactor-mvp-ux-spec.md`, `docs/ui-guidelines.md`, and the applicable durable OpenSpec capabilities. Create the matching OpenSpec delta before implementation; this document alone is not an apply-ready OpenSpec change.

## Authorization and boundaries

The user requested correction planning for six source-audit findings and handoff to a GPT-5.6 Sol medium task. Execute the local corrections and validation in the new task. Do not push, create a PR, merge, change live configuration, trigger production output, or stop an existing user service without separate authorization. Local slice commits are permitted by the repository workflow. Do not add dependencies, redesign navigation, introduce bulk operations, or implement unrelated backlog features.

The audit was source-based: no dependencies were installed in the originating worktree and no rendered walkthrough was completed. Storybook checks are useful component evidence but are not full-app reproduction or acceptance because shell sizing, routing, fixture volume, API/media mocks, connection state, and build identity can differ. Confirm each retained correction in an isolated full application built from the current worktree, using real management/operator routing and a disposable local data store with representative synthetic data. Record source, Storybook, and full-app evidence separately, and record any finding already resolved, fixture-only, or contradicted by full-app behavior rather than forcing a product change.

The standalone editor scrolling observation is withdrawn as a confirmed product defect because the production focused shell constrains its height. Missing Storybook video assets, unmocked desktop-settings session calls, and echo-only safety-preview mocks are fixture limitations, not established runtime defects. Do not change production behavior solely to compensate for those fixture limitations.

## Task 1: Establish the implementation baseline and specification

- [ ] Confirm the new task is in a Windows worktree for `C:\dev\projects\stream-jams`; inspect status and preserve existing changes. Fetch current remote state and use a `codex/` branch from `origin/main` as repository instructions require.
- [ ] Read the frontend-change skill, frontend agent guide, UX specification, tokens, overlay error guidance, and applicable AGENTS.md instructions.
- [ ] Inspect active OpenSpec changes for overlap. Create `simplify-management-ux-workflows` using the OpenSpec proposal workflow, covering only these six corrections. Relevant existing capabilities include `management-ui-ux`, `alert-configuration-management`, and `screen-effects`; inspect their exact requirements before writing deltas.
- [ ] Reconcile changed preview labels, profile switching, testing labels, Home ordering, and row actions with existing UX requirements. Keep explicit Save and live-impact confirmation requirements. Create proposal, design, delta specs, and unchecked implementation tasks, then strict-validate. Commit the slice-specific specification before or with implementation.
- [ ] Install existing locked dependencies if needed. Build core if required by web imports. Use Storybook for component coverage, then start the built full application on a verified unused loopback port with a disposable config and data store. Do not attach test actions to the user's live service.
- [ ] Capture source, Storybook, and full-app observations separately for alert inventory, the two-profile editor, Home incomplete/complete/blocked states, and Screen Effects testing. Record the baseline/build identity. Do not capture secrets, route keys, personal data, or real browser-source URLs.

## Task 2: Make preview and test actions describe their actual behavior

**Files:** `apps/web/src/management/alerts/AlertSetsPage.tsx`, `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`, `apps/web/src/management/screen-effects/ScreenEffectEditor.tsx`, their existing tests/stories, and `tests/e2e/management-alerts.spec.ts` / `tests/e2e/screen-effects.spec.ts`.

**Decisions:**

- Inventory preview remains a text-only sample. Rename its button and accessible name to **Sample message**, and the dialog heading/description to explain that it is sample text, not the rendered design. Do not build another rendering surface.
- Editor local preview remains **Preview**, with concise persistent help identifying it as local and governed by the existing preview audio/TTS options. Do not incorrectly label it silent.
- Alert editor delivery action becomes **Test draft**. Alert inventory delivery becomes **Test saved**. Screen Effects delivery becomes **Test saved…**, retaining its explicit live-output confirmation.
- Show a compact test summary beside the relevant action or profile chooser: draft/saved input, selected browser profile(s), selected device destinations, and included audio/TTS where the existing contract exposes them. Use human-readable names, never route keys or secret URLs. Keep unavailable destinations and correction actions visible.
- Preserve each module's delivery contract, including Screen Effects saved-variant semantics, alert draft semantics, one-target shortcut, multiple-profile selection, TTS behavior, and existing live confirmations. Wording alignment must not silently align different runtime behavior.

**Acceptance:**

- [ ] Tests assert distinct accessible names and text-only sample semantics; opening Sample message does not send a test or play media.
- [ ] Tests verify inventory sends saved configuration and editor sends current draft; labels and summaries agree with requests.
- [ ] Verify zero/one/multiple browser targets, device-only audio, unavailable outputs, and TTS unavailable states using existing fixture boundaries.
- [ ] Confirm Screen Effects still lists destinations and requires confirmation before queueing the saved variant.
- [ ] Update production-component stories and affected browser assertions. Verify keyboard opening/closing and focus restoration.

## Task 3: Preserve the shared draft while switching layout profiles

**Files:** `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`, `editor-state.ts` only if necessary, corresponding tests/stories, and `tests/e2e/management-alerts.spec.ts`.

**Decision:** Landscape/Vertical selection changes view state, not document ownership. Retain the existing document containing both profile layouts, unsaved matching/content changes, priority edits, and undo/redo history. Remove the profile-switch-only Save/Discard interruption and its obsolete state/handlers if no longer used. Do not autosave. Save remains one explicit operation for the draft. Revert restores the saved document. Leaving the alert/editor still invokes the dirty navigation guard. Preserve profile-specific zoom/pan and stop/reset transient preview through existing behavior where needed.

**Acceptance:**

- [ ] Edit Landscape, switch to Vertical without a modal, edit Vertical, return to Landscape, and verify both edits remain and Unsaved stays visible.
- [ ] Save persists both profiles; reloading retains them. Revert discards both unsaved profile changes consistently.
- [ ] Verify shared text edits, priority changes, undo/redo, theme application/review history, and copy-layout replacement safeguards across switching.
- [ ] Switching to a disabled/unreviewed profile never enables or marks it reviewed. Leaving for another alert or management route still warns, including after a failed save.
- [ ] Replace tests that intentionally asserted the old profile-switch warning with the above behavior; retain unrelated dirty-navigation tests.

## Task 4: Explain readiness in one compact place

**Files:** `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`, existing editor state/view helpers if suitable, corresponding tests/stories, and `tests/e2e/management-alerts.spec.ts`.

**Decision:** Add one compact **Live readiness** summary in the editor near its existing status area. Replace redundant status presentation where possible; do not add another always-expanded dashboard. Use current draft and saved set facts, with explicit Unsaved context. Explain the combined prerequisites: active set, alert enabled, at least one intended reviewed/enabled profile, and known validation blockers. Distinguish configuration readiness from connected outputs and real delivery evidence. A disconnected output is not proof that configuration is disabled.

Show one primary next correction action, ordered as: known blockers, intended profile review, intended profile enablement, alert enablement, then set activation. A set-activation action navigates to the existing activation flow and respects dirty navigation; it never bypasses impact checks. Optional disabled profiles do not block readiness or require review. Keep explicit Mark reviewed separate from enablement; do not silently mark reviewed, activate, or save. Reuse existing validation facts and controls rather than duplicate business rules. If essential facts are missing, show the limited status honestly instead of guessing.

**Acceptance:**

- [ ] Cover inactive set, disabled alert, intended profile needs review, reviewed-but-disabled profile, validation blocker, configured-ready, and unsaved-ready draft.
- [ ] A valid Landscape profile plus disabled/unreviewed Vertical can be configuration-ready.
- [ ] The correction action focuses/opens the relevant existing control, with visible focus and keyboard operation.
- [ ] Unknown/stale readiness evidence never produces an authoritative green live-delivery claim.
- [ ] Existing activation, save-impact, review, and output security safeguards remain intact.

## Task 5: Prioritize actionable Home content

**Files:** `apps/web/src/management/home/HomePanel.tsx`, its existing tests/stories or create matching colocated files if absent, relevant Home styling, and `tests/e2e/management.spec.ts`.

**Decision:** Move Needs attention ahead of setup and active-set content. Show incomplete setup rows first in existing order with a clearly identified next action. Put completed setup rows in a native disclosure labeled **Completed setup (N)**, initially collapsed; when everything is complete, show the concise completion summary and active-set information without the expanded checklist. Do not duplicate full errors in a new summary. Keep existing correction links, loading/error states, and complete data available.

**Acceptance:**

- [ ] Blocked Home exposes problems before routine setup content; mixed completion shows outstanding rows first.
- [ ] All-complete Home retains a visible readiness summary and accessible disclosure for completed steps.
- [ ] Empty, load-failure, and no-active-set states still have actionable copy.
- [ ] Expanding/collapsing uses keyboard-accessible native behavior and causes no configuration writes.

## Task 6: Reduce alert-row action clutter

**Files:** `apps/web/src/management/alerts/AlertSetsPage.tsx`, `alert-sets-page.css`, corresponding tests/stories, and `tests/e2e/management-alerts.spec.ts`.

**Decision:** Keep **Edit**, **Test saved**, and **Enable/Disable** inline. Place **Sample message** and **Add variation** in the existing More disclosure consistently across widths, alongside Duplicate/Reset/Delete. Preserve accessible per-alert labels, default-only variation eligibility, busy states, test profile choice, and destructive confirmations. Remove obsolete wide/narrow duplicates and CSS only where unused. Do not introduce a custom menu library or bulk selection.

**Acceptance:**

- [ ] Each secondary action is available exactly once in the active accessibility tree at desktop and narrow widths.
- [ ] Keyboard users can reach and invoke More actions; focus returns correctly after dialogs and mutation flows.
- [ ] Inline tests with multiple profiles remain understandable and fit the row; long names and validation summaries wrap without hiding actions.
- [ ] Default and variation rows retain the correct actions and disabled states.

## Task 7: Reconcile and validate the complete workflow

- [ ] Run focused regression tests after each behavioral slice, then affected package typechecks. Do not add tests solely to mirror text substitutions; reuse/update assertions in meaningful workflow tests.
- [ ] Run repository frontend gates: `corepack.cmd pnpm lint`, `corepack.cmd pnpm typecheck`, `corepack.cmd pnpm test`, `corepack.cmd pnpm build`, `corepack.cmd pnpm --filter @stream-jams/web build-storybook`, `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci`, and applicable Playwright tests with `corepack.cmd pnpm test:e2e`. Diagnose failures before rerunning and report environmental gaps accurately.
- [ ] Rebuild/restart only owned isolated services, wait for health, and verify the rebuilt full-app workflow against a disposable local store: Home next action → edit alert → review intended profile → switch/edit layouts → preview → review test destinations → save → return to inventory. Do not confirm an output-producing action merely for QA.
- [ ] Verify desktop and narrow management views, long names, empty/error/blocked states, keyboard navigation, focus restoration, and no secret exposure. Preserve the existing editor small-screen boundary; mobile canvas redesign is out of scope.
- [ ] Update UX documentation to match the intentional changes and synchronize OpenSpec requirements through the matching workflow. Strict-validate the change and only complete tasks supported by evidence.
- [ ] Report each of the six findings as corrected, already resolved, fixture-only, contradicted, or blocked with evidence; distinguish source inspection, Storybook checks, and full-app validation. Stop before external publication.
