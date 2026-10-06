# Execution ledger — docs/superpowers/plans/2026-10-05-architecture-audit-repairs.md

Baseline: b1f5058. Branch: codex/architecture-audit-repairs.

Ruling: Preserve the audited error-repair baseline on a dedicated stacked branch. No merge or publication is requested.
Pre-flight: Task 1 provides neutral ports for task 2; task 3 provides shared wire types for task 7; tasks 5/6 share runtime imports; tasks 1/8 share playback imports. No interface conflict found.
Ruling: Existing worktree is isolated and is reused; no additional checkout or implementation agents are needed.

All ten implementation tasks and final verification are complete. A1–A7 and S1–S5 are repaired on this branch.
- Task 1: 149 affected tests and strict typecheck passed after moved-import fixes.
- Task 2: missing-mute regression observed red, then 118 affected tests passed.
- Tasks 3–5: malformed response/missing repository regressions observed red; 106 response/provider/timer tests passed. Added SQLite rollback/reissue tests pass.
- Tasks 6–8: 298 Music/playback/admission/editor tests passed.
- Task 9: 11 production snapping/template characterization tests passed before unused helper removal.
- Tasks 7/9/10: 243 editor/dialog/boundary tests passed; subsequent compile-only fixture mismatches corrected.

Ruling: Extract Music's production output coalescer unchanged into a small module used by composition; transfer unused sink tests onto that real algorithm and retain lifecycle/ownership coverage.
Ruling: ScreenEffectEditor passes its API to AssetPicker, requiring updateAssetMetadata/getAssetChangeImpact/deleteAsset. Include these transitive dependencies rather than restoring assertions.
Ruling: revealCreatedAlert consumes Pick<AlertInventoryRow, id/setId/eventType>; its wire eventType is string, unlike the plan's too-narrow StreamEventType.
Ruling: Pure moves/removals use retained/transferred characterization coverage; new behavior uses observed red-to-green tests.

Ruling: The error-taxonomy baseline is not an ancestor of the fetched origin/main (merge-base exit 1). Keep the explicitly documented stacked branch so those completed repairs remain present.
Ruling: Deliver these related repairs as one integrated implementation commit after the separate planning/spec commit. Playback, Music, credential wiring and response fixtures share files; the table below preserves per-finding review and evidence rather than splitting those files into temporary inconsistent contracts.

## Finding reconciliation

| Finding | Implemented result | Evidence |
| --- | --- | --- |
| A1 | Core owns settings and diagnostics response schemas; domain clients parse unknown JSON; corrupt-record count is required and export extension/raw payloads are preserved. | Core diagnostics contract tests; management/settings/diagnostics client tests; full browser settings/export acceptance. |
| A2 | Configured browser sinks and desktop transports require mute operations; malformed browser sinks fail at construction; absent whole outputs remain valid. | Missing-capability and partial-failure tests; retained module/global mute tests; rebuilt browser safety and Electron module-mute acceptance. |
| A3 | Provider services consume a neutral repository port; SQLite implements it. | Checked complete substitute plus retained SQLite/provider integration tests. |
| A4 | Timer policy consumes a verifier-only typed repository; SQL and atomic rotation/revocation belong to SQLite. | Injected write failure, rollback trigger, first-created/rotation/revocation/reissue tests. |
| A5 | Music factories require an explicit private paired artwork capability or null. | Missing/wrong-pair type contracts; active-provider/generation ownership tests; existing Pear and security acceptance. |
| A6 | Playback ports and module occurrence identity have neutral ownership. | Exact identity characterization and retained admission/release/shutdown tests; old sibling ownership imports removed. |
| A7 | Screen Effect editor declares its direct and AssetPicker dependencies, with optional duration repair. | Checked fixtures, provider/context/editor tests, Storybook and rebuilt browser effects acceptance. |
| S1 | Removed unused Music sink/drainer; production composition uses the extracted bounded output queue. | Real browser/desktop lifecycle delivery tests, bounded/failing recipients, pending includeTest upgrade, shutdown and generation replacement. |
| S2 | Three server callers share one exact duration-candidate projection. | Missing/null/order/label tests; retained caller-specific fallback/maximum duration tests. |
| S3 | Deleted unused snapping/version wrappers; real snapping and private media schema validation remain. | Transferred snapping boundary tests, wrong-version schema tests and packaged private audio boundary acceptance. |
| S4 | Nullable create/variation state owns its draft/error; shared local reveal sequence preserves focus. | Alert Sets creation/variation/duplicate/failure/focus tests; cancel/reopen regression and browser management-alerts acceptance. |
| S5 | Alert editor text/TTS instructions use the existing core-backed preview renderer. | Own-property/non-data/missing/HTML preview characterization and rebuilt alert editor acceptance. |

## Integrated verification

- Lint and error-provenance passed; the final artwork type test and desktop fixture also passed focused lint.
- Strict workspace typecheck passed after all source and test changes.
- Repository build and Storybook build passed.
- Storybook: 38 suites, 335 tests passed.
- Browser acceptance against rebuilt disposable services: 103 tests passed.
- Packaged desktop Music, isolated real Electron module-mute recovery, and packaged private audio boundary: three tests passed.
- Full unit suite passed: 361 files, 3,209 Vitest tests and 117 Node script tests; zero failures or skips. The subsequently added artwork capability type-contract test also passed focused execution and strict typecheck. An earlier run captured an in-progress browser Music test draft and failed two tests; those corrected cases pass in the final run.
- One independent review found a Music validation gap; both requested lifecycle and includeTest upgrade cases were added and pass. No actionable production correctness findings were reported.
- OpenSpec delta and synced architecture-maintenance-contracts specification pass strict validation.

Failure classification: the first desktop Music attempt lacked a packaged executable; packaging resolved this environment prerequisite. Desktop mute recovery exposed a fixture defect: it never refreshed AudioHost's ten-second service lease, so the real host correctly shut down during recovery. The isolated fixture now provides the service heartbeat and clears it on quit; production behavior and assertions are unchanged. SQLite rollback fixtures initially used verifiers shorter than the existing database constraint; valid hashed fixture values repaired those tests.

Acceptance limit: native media playback was silent. Physical audibility, game pixels and hardware output routing are not claimed; normal profiles and device configuration were not changed.
