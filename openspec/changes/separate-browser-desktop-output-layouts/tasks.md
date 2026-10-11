# Implementation ledger

Detailed scope, file owners, interfaces, test cases, delivery graph and gates: [agent implementation plan](../../../docs/superpowers/plans/2026-10-10-browser-desktop-output-layouts.md).

Specification approved 2026-10-10; implementation is authorized and in progress. These checkboxes are the authoritative progress ledger. A slice completes only with the evidence required by its plan section. Default delivery order is S01 through S11; dependencies below define the permissible alternatives.

## 1. S01 — Explicit desktop composition capability (no dependencies)

- [x] 1.1 Refresh baseline/worktree, record environment and baseline evidence, and verify scope is still unimplemented.
- [x] 1.2 Test desktop membership independently of public unified support, including saved rows and restart reconciliation.
- [x] 1.3 Add explicit registry desktop capability and replace inferred membership without retiring public outputs.
- [x] 1.4 Run focused checks, record interfaces/evidence and commit the behavior-preserving prerequisite.

## 2. S02 — Typed manual bus events (no dependencies)

- [x] 2.1 Add bounded manual event/action schemas and tests for truthful provenance, simulated identity, duplicate versus deliberate repeat, and existing journal compatibility.
- [x] 2.2 Implement trusted-channel submission service, selector extraction, independent outcomes and existing replay/retention behavior without expanding provider registration types.
- [x] 2.3 Reject forged identity/recipients, invalid payloads and permission escalation before journaling; update diagnostics and any required storage migration.
- [x] 2.4 Run bus/schema/diagnostics checks and commit the frozen service/action/receipt interfaces.

## 3. S03 — Alert and Effect manual dispatch (depends on S02)

- [x] 3.1 Test explicit sends publish/admit once while local previews never publish and invalid drafts never journal.
- [x] 3.2 Adapt draft/saved Alert and Effect tests to bus consumers, preserving profile/device eligibility, confirmations, audio/TTS inclusion and ordinary safety/admission.
- [x] 3.3 Verify source simulations fan out normally, targeted tests remain targeted, and failure of one consumer does not suppress others.
- [x] 3.4 Apply transparent ordinary-output audio failure handling to manual events while preserving local preview activation.
- [x] 3.5 Add stories/E2E, rebuild and verify disposable ordinary browser/private desktop delivery; record checks and commit.

## 4. S04 — Durable video bus admission (depends on S02)

- [x] 4.1 Add persistent crash/redelivery, duplicate provider publication, pending-versus-admitted and scoped authorization tests.
- [x] 4.2 Couple video admission with checkpoint or durable unique receipt; keep network metadata lookup outside the transaction.
- [x] 4.3 Route ordinary management/automation requests through the bus and shared intake while preserving limits, autoplay policies and guarded commands.
- [x] 4.4 Preserve legacy isolated test adapter until S09 and implement bounded truthful submission outcomes without automatic retry.
- [x] 4.5 Run Videos/routes/automation checks, record evidence and commit.

## 5. S05 — Canvas and trusted recipient foundation (depends on S01)

- [x] 5.1 Test empty/disabled metadata, old response rejection, reconnect/runtime revision reset and rejection of public desktop selection.
- [x] 5.2 Add trusted recipient kind and validated versioned canvas metadata with atomic config/projection refresh and saved-revision caching.
- [x] 5.3 Add fixed CSS-pixel content mode while retaining scene mode and existing module defaults.
- [x] 5.4 Display authoritative source dimensions and verify renderer lifecycle, Storybook and bundle boundaries; record checks and commit.

## 6. S06 — Music compact content output (depends on S05)

- [x] 6.1 Test stable full/compact/hidden/long-text/artwork envelopes, shared anchor, deterministic shadow insets and CSS isolation.
- [x] 6.2 Implement pure Music geometry and browser projection while preserving desktop placement, provider epoch and media authorization.
- [x] 6.3 Update source/placement copy and stories; verify both profiles, idle reconnect and unchanged browser rendering after desktop moves.
- [x] 6.4 Run affected checks and rebuilt live workflow, record evidence and commit.

## 7. S07 — Timer appearance and migration (depends on S05)

- [ ] 7.1 Capture old rendering fixtures and test fractional slots, both orientations/profiles, overflow and scene-edge fitting.
- [ ] 7.2 Add typed profile appearance/placement, pure upgrader, transactional DB migration and matching legacy/new backup handling.
- [ ] 7.3 Implement stable stack/overflow geometry and rendering without changing timer runtime, recovery or command semantics.
- [ ] 7.4 Add bounded appearance editor controls, independent drafts/save/reset and representative production stories with keyboard/error tests.
- [ ] 7.5 Verify browser placement independence, migration/restore and timer/automation regressions; rebuild, record evidence and commit.

## 8. S08 — Video content geometry (depends on S05)

- [ ] 8.1 Test fixed picture/caption/notice envelopes and preservation of old desktop geometry across content states.
- [ ] 8.2 Add separated content/desktop layout, pure upgrader, DB migration and backup validation using existing picture aspect-fit calculation.
- [ ] 8.3 Update trusted projection and placement editor; verify geometry saves do not restart players or reconnect mirrors.
- [ ] 8.4 Add stories/E2E for content dimensions, invalid placement and restore; run checks, record evidence and commit.

## 9. S09 — Videos single queue cutover (depends on S04 and S08)

- [ ] 9.1 Test transactional legacy live/test migration, held test items, preserved history/order/IDs, conflict preflight and rollback.
- [ ] 9.2 Consolidate queue/run/player/mirror ownership and invalidate stale receivers/revisions without autoplay or releasing migration holds through Play all.
- [ ] 9.3 Remove purpose selection from new contracts/UI/mappings; preserve live route spellings and reject legacy test callers with guidance.
- [ ] 9.4 Retire Videos test keys/routes/media and prevent their regeneration; update desktop IPC, Operator, clients and examples atomically.
- [ ] 9.5 Verify selected audio, fallback playback, guarded reports and S04 crash dedupe after migration; run browser/desktop checks and commit the complete cutover.

## 10. S10 — Remaining public output retirement (depends on S01, S03, S06, S07 and S09)

- [ ] 10.1 Add complete shell/composition/WebSocket/media/artwork authorization matrix for retired, ordinary, wrong-profile and private recipients.
- [ ] 10.2 Remove remaining test/unified inventory/key operations/Settings controls, revoke keys and remove only public unified surfaces without breaking desktop composition.
- [ ] 10.3 Normalize legacy output/surface metadata before restore validation/key generation; preserve ordinary compatibility and local-versus-portable desktop binding rules.
- [ ] 10.4 Test repeated import/restart, socket/lease retirement, invalid records and failed restore rollback without queue/timer restart.
- [ ] 10.5 Update source dimensions/migration guidance and production smoke coverage; verify dynamic Alerts/Effects and cross-module timing/audio independence.
- [ ] 10.6 Run security/backup/routes/UI and rebuilt browser checks; record evidence and commit the atomic retirement.

## 11. S11 — Integrated acceptance and delivery (depends on S10 and all preceding slices)

- [ ] 11.1 Complete the five-module/profile/recipient/manual-event/upgrade/restore acceptance matrix using disposable state.
- [ ] 11.2 Record comparable baseline/candidate performance and compact-viewport measurements, including workload/environment and any unresolved regressions.
- [ ] 11.3 Verify no extra primary/encoder, per-frame geometry, provider churn or unbounded memory; report native OBS/desktop acceptance separately and block unperformed required gates explicitly.
- [ ] 11.4 Run final applicable lint/typecheck/unit/build/Storybook/Playwright/OpenSpec gates and classify any failures accurately.
- [ ] 11.5 Complete one independent whole-change review under repository reviewer instructions, resolve findings and rerun affected checks.
- [ ] 11.6 Reconcile all requirements, sync completed canonical specs, update setup/API documentation and remove BL-068 only after implementation/spec sync; retain explicit evidence and any delivery blockers.
