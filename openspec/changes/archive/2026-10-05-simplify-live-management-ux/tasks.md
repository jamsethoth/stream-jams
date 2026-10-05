## 1. Specification And Baseline

- [x] 1.1 Confirm the live findings, applicable MVP UX sections, boundaries, and exact production component and typed API paths
- [x] 1.2 Create proposal, design, delta specifications, and implementation tasks before production edits
- [x] 1.3 Strict-validate the scoped OpenSpec change before implementation

## 2. Settings Progressive Disclosure

- [x] 2.1 Add failing tests for collapsed advanced sections, keyboard opening, mounted edit preservation, backup deep linking, valid-preflight gating, and tray checkbox labeling
- [x] 2.2 Implement native Settings disclosures, visible summaries, attention discovery, restore gating, and aligned desktop tray labeling
- [x] 2.3 Update Settings, desktop, audio-output, and overlay-surface stories and focused tests

## 3. Readable Labels And Speech Units

- [x] 3.1 Add failing tests for delimited event labels, known and unknown module labels, reward catalog success and unavailable states, and numeric speech guidance
- [x] 3.2 Implement presentation-only label formatting and one conditional typed reward-catalog load per page context
- [x] 3.3 Implement explicit Browser Speech units and associated guidance while preserving typed save payloads
- [x] 3.4 Update affected asset, provider, output, and alert stories and focused tests

## 4. Home Alert Configuration Attention

- [x] 4.1 Add failing core, service, HTTP, and Home tests for enabled default and variation rows, intended profiles, device-only routes, disabled alerts, missing documents, no active set, zero enabled alerts, and existing setup problems
- [x] 4.2 Add the narrow typed management summary and conservative server derivation using existing saved documents and validation results
- [x] 4.3 Render a separate Alert configuration section with actionable names and editor links and update typed fixtures and stories

## 5. Served-App Acceptance And Documentation

- [x] 5.1 Add isolated served-app Playwright coverage at desktop and 390px widths for disclosures, tray alignment, readable labels and units, and Home attention
- [x] 5.2 Verify keyboard interaction and production components against explicit disposable storage, isolated secrets/environment, and a non-production port
- [x] 5.3 Create `docs/verification/live-ux-followup.md` with UX sections, MVP boundary, mocked provider boundaries, exact commands, counts, artifacts, and limitations

## 6. Full Verification And Handoff

- [x] 6.1 Run lint, typecheck, full one-worker Vitest, supplemental Node tests, production build, Storybook build and tests, Playwright with reuse disabled, and strict OpenSpec validation
- [x] 6.2 Self-review all four findings and safeguards, update this checklist accurately, and resolve material review findings
- [x] 6.3 Commit the scoped local change with a human-readable summary and per-file change list; report final HEAD and worktree status without publishing

## 7. PR 108 Review Corrections

- [x] 7.1 Add failing regressions for enabled unavailable desktop surfaces, current draft profile intent, post-save readiness refresh, empty content, device-only audio, mixed output, and stale saved metadata
- [x] 7.2 Correct Settings summary attention and update packaged desktop interactions for the disclosed Audio outputs and Overlay surfaces controls
- [x] 7.3 Reuse a shared configuration-content assessment in Home and the alert editor, using canonical audio resolution and current editor documents
- [x] 7.4 Refresh set facts after a successful alert save without discarding concurrent edits, and keep saved-but-unconfirmed failures explicit
- [x] 7.5 Update stories and verification notes, run focused and full frontend gates, the safe desktop subset, and strict OpenSpec validation (physical output checks remain deferred; see `docs/verification/pr-108-review-corrections.md`)
