# Screen Effects Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for inline execution, task by task. Use `superpowers:subagent-driven-development` only if the user chooses delegated execution. Steps use checkboxes; planning does not authorize implementation, commits, publication, or merging.

**Goal:** Deliver reward-triggered local media to OBS and a reusable Windows desktop overlay, with user-selected audio devices and merged operations.

**Architecture:** Three independently reviewable slices extend the existing desktop host, media-audio pipeline, and module registry. Screen Effects owns a sequential queue; Alerts retains its independent queue. Shared surfaces compose visuals, shared audio adapters route sources, and Operator merges state without becoming a scheduler.

**Tech Stack:** Existing pnpm TypeScript workspace, framework-independent core, Fastify/SQLite service, React/Vite management and overlay renderers, Electron desktop host, Vitest/Storybook/Playwright. Use the versions in the checked-out manifests; add no decoder, driver, or framework dependency by default.

**Spec:** [Approved product design](../specs/2026-09-07-screen-effects-design.md). This document is the execution index; the three linked plans contain file ownership, interfaces, regression anchors, implementation steps, and acceptance gates.

## Global constraints

- Windows and local-first. Marketplace, cloud delivery, cross-platform desktop support, graphics injection, exclusive-full-screen guarantees, arbitrary code, viewer uploads, and remote media fetching are excluded.
- One opt-in desktop window, one explicitly selected monitor, one shared Landscape `1920 × 1080` canvas. A missing monitor fails closed. Retain `app.disableHardwareAcceleration()` unless a separate backend decision is approved.
- Desktop and unified OBS each own independent topmost-first module layers. New modules are hidden at the bottom. Surface visibility and ordering do not own audio routing or scheduling.
- Audio controls belong inside each Alert/effect editor. Outputs remain `{ browserSource: boolean, deviceRouteIds: string[] }`; no top-level Shared audio page, global mixer, or per-layer destinations.
- New videos enable embedded audio by default; legacy saved Alert videos remain silent. Separate sound never changes the video toggle. Visual video elements themselves remain muted.
- One current Screen Effect, concurrent with an independently current Alert. Defaults: 10-second duration, range 1–120 seconds, priority 0, 100 pending effects, 25 recent occurrences per module.
- Global pause/mute/DND are durable and authoritative; module pause is separate. Preserve DND's existing intake acceptance and queue-advancement hold. Never silently discard held events.
- Ordinary skip/completion is occurrence-scoped. Shared audio-host destruction is an explicitly reported multi-occurrence failure, not an isolated skip.
- No automatic test on asset/device selection. Use neutral fixtures and explicit, bounded tests. Do not open secret browser-source URLs, disturb the user's runtime, or delete live QA data without authorization.
- Planning leaves every implementation checkbox unchecked. Commit checkpoints below are future checkpoints requiring authorization; publishing and merging require separate authorization.

## Baseline and delivery order

Inspected baseline: `61642ae6dbfacbb51809ab26c737ccff92b60a42`, on `codex/plan-screen-effects`. The merged desktop/audio implementation is present. SQLite's latest migration is `019-audio-output-routes.ts`; the current backup archive envelope is version 2. These are execution anchors, not promises that remote main will remain unchanged.

| Order | Independently deliverable slice | Entry gate | Exit evidence |
| --- | --- | --- | --- |
| 1 | [Shared desktop overlay surface](2026-09-08-shared-desktop-overlay-surface.md) | Current merged desktop runtime; slice unimplemented | Alerts on real desktop and OBS, layering/settings persistence, input/focus and shutdown evidence |
| 2 | [Routed video audio controls](2026-09-08-routed-video-audio-controls.md) | Current merged audio routing; can run without slice 1, but do one slice at a time | Legacy silence, new toggle persistence, decoder/timing gate, explicit physical audio destinations |
| 3 | [Screen Effects and merged operations](2026-09-08-screen-effects-module.md) | Both foundations implemented, specs synced, acceptance recorded, and present in remote `main` | Event-to-output flow, concurrent Alerts/effects, qualified operations, restore and failure isolation |

Slices 1 and 2 are technically independent; serial delivery avoids overlapping composition/audio changes in this worktree. Do not start slice 3 merely because foundation proposals or code drafts exist. Rebase its overlapping Alert/Operator delta requirements against the delivered foundations without dropping inherited scenarios.

## Repository findings that shape implementation

1. `apps/desktop` has no React dependency. Build the desktop visual renderer as a dedicated `apps/web` entry that reuses `OverlaySurface.tsx`; stage its static output with the desktop package. Keep Electron window/preload/IPC in `apps/desktop` and avoid cross-package source imports or a second React dependency graph.
2. Alert editor documents currently have no document-level version field. Slice 2 introduces the first explicit `schemaVersion: 1`, with a separate compatibility adapter for previously unversioned documents. Do not treat a parsing default of `true` as a migration.
3. `ExternalStreamEvent` and subscription-selection schemas exist, but `StreamerBotRuntimeService` currently subscribes only to supported Twitch events and ignores unsupported envelopes. Slice 3 must implement explicit custom subscription configuration in the existing provider workflow, validate against `GetEvents`, and then connect the accepted external-event path. Effect bindings must not expand subscriptions automatically.
4. `NormalizedStreamEvent` does not carry a trustworthy broadcaster ID. Resolve that identity at the trusted provider/ingestion boundary and carry it in a typed trigger context. Missing identity remains unresolved; do not match reward titles or arbitrary metadata.
5. Runtime composition and backup maintenance checks currently read only the Alert queue. Slice 3 must aggregate queue owners for output snapshots and restore safety, not just change the Operator screen.
6. A video asset may be valid for visuals up to 100 MiB while exceeding the existing audio transport's 25 MiB per-asset cap. Report the soundtrack destination failure distinctly; do not expand the audio limit or reject otherwise valid independent visuals implicitly.

## Execution workflow

- [ ] Before each slice, read `AGENTS.md`, its OpenSpec proposal/design/all delta specs, and the linked detailed plan. Use `openspec-apply-change` and the required implementation/testing skills. For frontend work, follow `.agents/skills/stream-jams-frontend-change/SKILL.md` and `docs/ai/frontend-agent-guide.md`; read the schema skill before migration/schema documentation work.
- [ ] Fetch current remote state with the required network authorization, inspect status and ownership, confirm the slice is still unimplemented, and use an isolated `codex/` branch from current `origin/main`. Preserve this planning work; do not reset, switch over dirty overlapping files, or create another branch implicitly if ownership is unclear.
- [ ] Keep a committed slice-specific implementation spec before or with code when commits are authorized. Use one agent by default. Each task follows red test → minimal implementation → focused green test → typecheck → checkpoint.
- [ ] Build `@stream-jams/core` before focused server/web tests in a fresh worktree: `corepack.cmd pnpm --filter @stream-jams/core build`. A Vitest pass is not a typecheck.
- [ ] Run each slice's final gates and inspect actual results. Diagnose a failure before retrying; after two failures on one route, narrow the check. Classify regression, test defect, and environment failures without weakening tests or calling a stalled collection a pass.
- [ ] Rebuild/restart only the authorized affected runtime, verify PID/path/port ownership and health, reload the UI, and exercise the changed workflow against the new build. Keep synthetic/automated evidence distinct from physical-device, OBS, and Windows acceptance.
- [ ] Reconcile every OpenSpec scenario with tests or recorded manual evidence. Update implementation checkboxes only for work actually completed. Update product/runbook/backlog after implementation and spec sync. Do not archive, publish, or merge by inference.

## Shared verification ledger

Each slice creates its named `docs/verification/` report during implementation. Record commit/build identity; exact commands and exit outcomes; Windows/OBS versions and display/audio configuration; neutral fixture provenance/checksum; measured timing; tested failure cases; and incomplete gates with their cause. Never put route keys, copied browser-source URLs, credentials, or private provider payloads in reports.

Run the full slice gates from the repo root, not as a claim that they already pass:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm build-storybook
corepack.cmd pnpm test:storybook:ci
corepack.cmd pnpm test:e2e
corepack.cmd pnpm test:desktop
corepack.cmd pnpm desktop:package
```

The plans intentionally put native transparency/codec feasibility before broad UI work. If a gate requires removing the hardware-acceleration workaround, adding extraction/decoding dependencies, changing device routing guarantees, or injecting into games, stop for a scoped decision. Do not substitute unit tests for that decision.

## Planned completion boundaries

- Slice 1 does not claim Screen Effects exists or that video soundtracks are routable.
- Slice 2 does not claim desktop support if slice 1 has not passed its gate, and leaves TTS/video-shoutout behavior unchanged.
- Slice 3 is complete only when both actual outputs and concurrent module controls pass their own acceptance gates.
- None of these plans authorize release distribution, marketplace work, a music module, or changes to other streaming applications.
