# Documentation Map

Use this map to distinguish current behavior, pending work, and historical evidence. Documentation was reconciled against `origin/main` commit `fec768c58a8b27a6921e87ea1ac8d4a346a8c05d` on September 23, 2026; see the [repository audit](audits/2026-09-23-repository-complexity-and-documentation-audit.md) for findings and verification limits.

## Current Sources

| Question | Source |
| --- | --- |
| How do I run or operate the application? | [Runbook](mvp-runbook.md) |
| What product boundaries are intentional? | [Product plan](product-plan.md); its MVP sections describe the first delivery boundary, and later sections describe approved additions |
| What is still pending? | [Canonical backlog](backlog.md), including links to planned OpenSpec changes |
| What implemented behavior is required? | [Canonical OpenSpec capabilities](../openspec/specs); source and tests establish what actually runs when a discrepancy is found |
| What work is being proposed or completed? | [Active OpenSpec changes](../openspec/changes); task completion and archive status are distinct |
| What are the frontend conventions? | [Frontend guide](ai/frontend-agent-guide.md), [UI guidelines](ui-guidelines.md), [design tokens](design-tokens.md), and [UX spec](design/ui-refactor-mvp-ux-spec.md) |
| What versions and checks are authoritative? | [Root manifest](../package.json), package manifests, lockfile, TypeScript configurations, and [CI workflow](../.github/workflows/ci.yml) |
| What was physically or interactively verified? | Dated records under [verification](verification), especially [desktop](verification/windows-desktop-tray-runtime.md), [shared surfaces](verification/shared-desktop-overlay.md), and [Screen Effects](verification/screen-effects.md) |

## Implemented Repository Shape

- `packages/core` owns browser-compatible contracts, schemas, matching, queues, media timing, and shared domain rules; `packages/test-support` owns reusable test helpers.
- `apps/server` owns Fastify, SQLite repositories and migrations, secrets, providers, assets, diagnostics, and runtime composition.
- `apps/web` serves route-based management, `/operator`, browser-source overlays, and the private desktop-overlay renderer.
- `apps/desktop` owns the Electron service process, management window, tray, private audio player, and private desktop overlay. Windows x64 runnable-folder packaging and short-lived verified CI artifacts are implemented.
- Alerts and Screen Effects are registered modules with independent playback queues. Shared surfaces and global safety controls coordinate their outputs without combining their schedulers.
- Screen Effects supports one active set, unified weighted variants, draft variant removal, media-based duration, fades, and percentage media gain. Per-effect cooldown, default/weighted authoring kinds, and Screen Effect animation controls are no longer current authoring features.

Installers, signing, automatic updates, non-Windows desktop delivery, LAN mode, Docker product delivery, and cloud hosting remain outside current delivery. Playwright's Docker test infrastructure is separate from product delivery.

## Active Change Reconciliation

The following six changes have all tasks checked at the audited commit. They remain in the active change directory; this audit synchronizes documentation without moving or archiving their records.

| Change | Canonical spec reconciliation |
| --- | --- |
| `simplify-management-ux-workflows` | Already present; preserved later refinements to alert-row actions |
| `simplify-live-management-ux` | Synced Home/configuration attention, readable labels, progressive Settings disclosure, and restore safety |
| `simplify-visual-management-and-operator-ux` | Synced mobile navigation, event visibility, asset filters, queue confirmation/layout, and inline controls |
| `add-screen-effect-sets` | Synced one-live-set ownership and set/effect/variant navigation |
| `align-screen-effects-presentation` | Synced focused layouts, local preview, unified weights, and event-owned cooldown |
| `add-media-synced-duration-audio-fades` | Synced asset duration, Alert/Effect duration modes, per-source fades, and gain |

Later implemented refinements are also reflected in canonical specs: removal of Screen Effect animation fields in migration 025, draft variant removal in `fec768c`, and holding playback for explicit retry when a local stop acknowledgement fails. Older delta wording must not undo those refinements.

`add-main-branch-changelog` (0/22 tasks) and `add-video-shoutout-overlay-module` (0/23 tasks) are proposals, not implemented features. Neither a root changelog nor a registered `video-shoutout` module exists at the audited commit.

## Historical Records

Dated files under `superpowers/plans`, `superpowers/specs`, `verification`, and `audits`, archived OpenSpec changes, the July MVP review, and design captures preserve the evidence and decisions from their recorded date. Their test counts, host details, old labels, unchecked plan checklists, and pre-implementation descriptions do not establish current status. Do not rerun an old implementation plan solely because its original checklist is unchecked.

Keep historical measurements intact. Correct broken links, add a scope/date clarification when a snapshot appears current, and route current status to canonical specs and the backlog. A successful automated test does not refresh earlier physical-device, OBS, account, or native-shutdown acceptance evidence.
