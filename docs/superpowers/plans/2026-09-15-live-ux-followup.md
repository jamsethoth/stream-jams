# Live UX Follow-up Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user has selected a GPT-5.6 Sol subagent at medium reasoning for execution; the parent performs the final review.

**Goal:** Close the remaining live-app audit findings: long Settings, detached tray checkbox, technical labels and unexplained speech units, and misleading Home setup completion.

**Architecture:** Preserve existing management components, typed clients, save boundaries, and runtime safeguards. Use native disclosures and presentation formatting; compute any additional alert configuration summary in the management service, using existing saved-document and validation boundaries. No persistence migration or playback behavior change.

**Tech Stack:** Existing React, TypeScript, CSS, Zod contracts, Fastify, Vitest, Storybook, and Playwright. No new dependencies.

**Spec:** `docs/verification/ux-audit-integration.md`, its remaining-live-audit section, and the scoped OpenSpec change created in Task 1.

## Global constraints

- Work in the existing worktree on `codex/integrate-ux-audit-corrections`, starting at `49f28e1`. Preserve both merged UX branches. Do not create another branch or worktree.
- This is an approved local implementation. Do not publish, open a PR, merge main, or alter the user's running app on port 39187.
- Follow `docs/ai/frontend-agent-guide.md` and its routed UX/accessibility/token guidance. Record applicable sections and the MVP boundary in verification notes.
- Retain management authorization, dirty-navigation guards, individual save actions, backup preflight/RESTORE safeguards, alert/provider activation confirmations, and transparent production overlays.
- A configuration summary is not evidence of provider connection, browser-source connection, or successful delivery. Never label it "playback ready".
- Do not change IDs, filters, wire values, matching, queueing, output routing, provider behavior, or the meaning of profile review.
- Use disposable runtime storage for browser acceptance. Explicitly pass a verified temporary config/home, an available non-production port, and isolated secrets/environment. Fail if setup is missing; never fall back to the user profile. Do not send tests or output to real devices/providers.

## Evidence and design rationale

The live packaged app at port 39187 predates this branch. Its audit found Settings approximately 2,977px tall with three outputs; advanced and restore fields were always expanded. The tray checkbox was detached above its text. Assets showed `Channel_point_redemption`, output layers showed `screen-effects`, reward conditions exposed IDs, and speech controls showed Volume 1 and rates 0.5/2 without units. Home reported four of four setup steps complete even while an enabled alert had both visual profiles needing review.

Use [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) to keep common actions and important status visible; [usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) for understandable language and accurate status; and [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) plus [WCAG 2.2](https://www.w3.org/TR/WCAG22/) for labels, keyboard operation, and narrow layouts. These sources were researched before the live audit. Component-only observations are not production acceptance.

## Task 1: Specify and simplify Settings

**Files:** Create `openspec/changes/simplify-live-management-ux/` proposal/design/tasks and relevant spec deltas. Modify `apps/web/src/management/settings/SettingsPanel.tsx`, `DesktopSettingsPanel.tsx`, their CSS, tests/stories, and the existing audio-output/overlay-surface panels only as needed.

- [x] Read the real components, current settings tests, and frontend guidance; document exact UX sections and create the OpenSpec artifacts before implementation.
- [x] Add focused regression coverage for advanced sections initially collapsed, section opening by keyboard, preserving edits across collapse/reopen, backup deep-link opening, and valid-preflight-only restore confirmation.
- [x] Keep Appearance and desktop behavior easily accessible. Group server/storage maintenance under native `details` with named summaries. Put audio-output and overlay editing behind clear disclosures with meaningful visible summaries (counts/state); keep errors and required attention discoverable. Preserve mounted form state and existing save boundaries.

```tsx
<details className="settings-page__section">
  <summary>Server settings</summary>
  {/* Existing controlled form and its Save server settings action. */}
</details>
```

- [x] Show restore confirmation and regeneration controls only after a valid preflight. Keep preflight blockers/errors and the file-selection path clear. Opening a `#backup-restore` deep link must expose the target disclosure.
- [x] Give Close window to tray an explicit inline checkbox-label class, with the checkbox adjacent to its text at desktop and 390px widths; leave help text below the row.
- [x] Update affected stories and tests, run focused settings tests, and record the deliverable in the OpenSpec task checklist.

## Task 2: Make terminology and speech units readable

**Files:** `apps/web/src/management/assets/AssetManager.tsx`, `settings/OverlaySurfacesPanel.tsx`, `providers/ProviderPage.tsx`, `alerts/alert-event-groups.ts`, `alerts/AlertSetsPage.tsx`, existing typed reward-catalog helper, and affected tests/stories.

- [x] Cover event labels containing underscores, known/unknown module labels, and reward-catalog success/unavailable cases. Reuse existing event catalog labels; use a small shared presentation helper only where genuinely reused.
- [x] Render “Channel point redemption” and “Screen Effects” while retaining original option values and IDs. Unknown values get readable delimiter normalization rather than being lost.
- [x] Use the existing typed local reward catalog to display known reward titles in condition summaries. Load once per relevant page/context, never once per row. If unavailable or missing, show “Unavailable reward” with its ID in secondary details so users can still diagnose it. Do not hide or rewrite stored conditions.
- [x] Label speech numeric inputs `Volume (0–1)`, `Minimum rate (×)`, and `Maximum rate (×)` with associated guidance: “1 = 100% volume; 0 = silent” and “1× is normal speed; 0.5× is half speed; 2× is double speed.” Preserve normalized values and existing validation.

```tsx
<span>Volume (0–1)</span>
// Existing input retains min={0}, max={1}, step={0.1} and safety.volume.
// Associate the explanatory text using aria-describedby.
```

- [x] Update accessible-name expectations, tests and stories; verify saving values still uses the unchanged typed payload.

## Task 3: Separate Home setup from alert configuration

**Files:** `packages/core/src/management/contracts.ts`, `apps/server/src/modules/providers/management-ui-service.ts`, `apps/web/src/management/home/HomePanel.tsx` (confirm actual path), corresponding contract/service/HTTP tests, Home tests/stories and typed fixtures.

- [x] Inspect saved alert documents, enabled variants, intended target profiles, active-set validation, and existing editor readiness semantics. Do not use the inventory's aggregate review flag alone: it includes unused profiles.
- [x] Add a narrow read-only typed Home summary for enabled alert configuration requiring attention. Reuse `getSet`, `getAlertEditorDocument`, and existing validation results in the server; React only renders the result. No client per-row HTTP calls or new readiness engine.
- [x] Distinguish setup completion from “Alert configuration” and state its scope plainly. Show actionable affected alert names and editor links. A usable intended profile must not be blocked by an unused Vertical profile. Device-only routes must not be called broken solely for missing visual profiles; if readiness cannot be established, say review is needed rather than inventing success.
- [x] Exclude disabled alerts and disabled child variants/parents as appropriate. Preserve no-active-set and zero-enabled states. Missing documents or read failures must yield unavailable/attention status, never an all-clear. Keep existing provider/connection problems visible and explain that delivery requires the existing test/output workflow.
- [x] Add regression scenarios: setup complete plus enabled unreviewed alert; one valid intended profile with unused unreviewed profile; disabled alert; no active set; unknown document; existing provider/output issue. Verify Home loading issues no mutation or test-send call.
- [x] Update core/service/HTTP fixtures and Home stories, run focused server/web/contract checks.

## Task 4: Validate the rebuilt full app and record acceptance

**Files:** Extend `tests/e2e/full-app-visual-ux.spec.ts` or add a similarly isolated follow-up suite. Create `docs/verification/live-ux-followup.md`. Update this plan/OpenSpec tasks accurately.

- [x] Add real served-app coverage using disposable storage for Settings disclosure and tray alignment, friendly labels/units, and the Home attention state. Inspect desktop and 390px layouts and keyboard disclosure behavior. Use production components/routes; explicitly identify mocked provider boundaries.
- [x] Run lint, typecheck, full Vitest (one worker), supplemental tests, production build, Storybook build and interaction/accessibility tests, Playwright with reuse disabled, and strict OpenSpec validation.

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm exec vitest run --reporter=dot --maxWorkers=1
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
$env:CI='1'
corepack.cmd pnpm test:e2e
openspec.cmd validate simplify-live-management-ux --strict
```

- [x] Diagnose failures before rerunning. Record exact commands, counts and environment gaps; never call a failed suite green. Verify the final rebuilt UI, not the old packaged app or Storybook alone.
- [x] Self-review the complete diff against all four findings and safeguards. Parent reviews implementation and evidence; resolve material issues. Commit the scoped changes with a human-readable summary and per-file change list. Leave the branch local and report final HEAD and clean/dirty status.
