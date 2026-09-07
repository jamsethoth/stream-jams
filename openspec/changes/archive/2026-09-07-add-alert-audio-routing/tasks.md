## 1. Desktop Dependency And Device Capability Gate

- [x] 1.1 Verify current origin/main, approved execution worktree and implemented desktop prerequisite; retain and commit this slice's spec before or with implementation.
- [x] 1.2 Add the isolated hidden audio renderer, stable app-owned origin, output-only permission handlers and sink-first regression test.
- [x] 1.3 Prove two-device independent/combined playback, autoplay without mic access, hide/restart and device-loss behavior in the packaged app with isolated data and approved audio tests.
- [x] 1.4 Record actual capability evidence; stop for a backend decision if it fails without adding fallback destinations or a native driver.

Execution note (September 5 local / September 6 UTC): the user moved BL-044's external process/resource investigation to a separate conversation and instructed this work to continue assuming it will be resolved later. Do not continue that investigation here or treat root-cause attribution as a prerequisite. Earlier packaged tests established permission/isolation/background behavior and five unchanged playback/restart passes; independent System/SFX and combined delivery were confirmed with native measurements and Wave Link meters. Two subsequent physical XLR Dock removal/reconnect runs retained healthy SFX playback, recovered the original binding for fresh audio, and shut down normally. The user confirmed continued SFX meter activity and the recovery tone on the repeat. The initial packaged capability gate is accepted; see `docs/verification/alert-audio-routing.md`. This does not complete production routing/safety or final OBS acceptance, fix BL-044, or change the native shutdown deadline. Task 4 must account for loss detectable through enumeration without an observed `devicechange` event, and for the disconnected fixture's delayed natural completion.

## 2. Outputs, Named Routes And Persistence

- [x] 2.1 Add validated alert outputs, route/device/playback contracts and compatible Browser Source-only defaults.
- [x] 2.2 Preserve outputs through create/variation/duplicate/re-theme and add invalid/duplicate/reference regression tests.
- [x] 2.3 Add the next SQLite route migration/repository and transaction-scoped reference integrity, including deletion-versus-save races.
- [x] 2.4 Add protected route CRUD, device/status and explicit route-test APIs with authentication/CSRF/origin/rate-limit/fail-closed tests.
- [x] 2.5 Verify same-device alias deduplication, explicit binding, missing-device preservation and CLI-unavailable behavior.

Task 2 implementation note: the server accepts an injected `AudioDeviceHost`; the production worker/main/player adapter remains task 4. Until that adapter is supplied, device capability truthfully reports unavailable. Route-test API tests use a silent fake host and do not replace packaged one-second playback acceptance. The migration-required portable route mapping, reference preflight and exact rollback preservation were pulled forward from task 6; restore setup reporting and active production playback blocking remain open. See [foundation verification](../../../../docs/verification/alert-audio-routing-foundation.md). This is local work only, not a feature-release, commit or publication claim.

## 3. Canonical Resolution And Queue

- [x] 3.1 Resolve visible audio once per selected document before visual-target expansion and respect the Browser Source flag on profile and legacy paths.
- [x] 3.2 Add canonical audio to queue contracts, audio-only admission, defensive snapshots and replay with new occurrence IDs.
- [x] 3.3 Snapshot current bindings at playback start without redirecting active occurrences; preserve distinct layers sharing one asset.
- [x] 3.4 Test no-OBS delivery, multiple profiles, hidden layers, selected-variation identity, replay and missing routes.

Task 3 implementation note: canonical audio, defensive queue/replay content, and synchronous-at-start binding snapshots are implemented and verified with an injected silent backend. Minimal server-side completion, mute, stop-before-skip and shutdown cancellation were pulled forward to support that start boundary; task 4 remains open for the actual Electron adapter, transport, watchdogs, acknowledgement generations and packaged safety acceptance. A pending-intake shutdown guard also prevents new admission after Close; this does not address BL-044. See [canonical queue verification](../../../../docs/verification/alert-audio-routing-canonical-queue.md). Progress is 13/29 tasks; this is not full-feature or publication acceptance.

## 4. Desktop Playback And Safety

- [x] 4.1 Add validated worker/main/preload transport, bounded asset bytes, generation IDs and sink-first media playback with complete resource cleanup.
- [x] 4.2 Track browser/device completion independently with register-before-dispatch, loading/duration watchdogs and stale-ack rejection.
- [x] 4.3 Extend authoritative mute, pause/DND semantics, skip-before-next-delivery and shutdown without queue advancement; preserve TTS safety behavior.
- [x] 4.4 Test cancellation/mute during pending sink selection, stop acknowledgement timeout and renderer destruction before next playback.
- [x] 4.5 Handle missing/disconnected devices, one bounded player recreation, explicit retry, service-loss lease and no stale replay/fallback.
- [x] 4.6 Run core/server/desktop playback and existing TTS regressions plus packaged smoke/typecheck.

Task 4 implementation note: the production desktop transport/player and safety boundaries are implemented. Shared absolute startup deadlines prevent per-stage timeout resets; restored mute reaches the desktop backend before runtime reload completes. The final affected core/server/desktop batch passed 188 tests, and the final packaged smoke exercised real byte delivery at forced zero volume with the original native shutdown deadline. One independent review has no remaining significant findings after fixes. See [desktop safety verification](../../../../docs/verification/alert-audio-routing-desktop-safety.md). Progress is 19/29 tasks; authoring, restore/activity guards and final physical-device/OBS acceptance remain open. No audible test, publication or BL-044 investigation was performed.

## 5. Authoring And Test UX

- [x] 5.1 Add named-route Settings UI with explicit binding/test actions and loaded/empty/loading/error/unavailable/conflict stories.
- [x] 5.2 Add alert-wide output controls to draft/undo/redo/save/live-impact flows without per-layer overrides or dropped missing routes.
- [x] 5.3 Make editor/inventory Send test destination-aware, support null-profile device-only tests, preserve inclusion toggles and isolate Preview.
- [x] 5.4 Make only alert video layers silent across preview/test/live including legacy visuals, and add actionable migration guidance without changing TTS/video-shoutout routing.
- [x] 5.5 Add focused UI/server tests, Storybook accessibility/interactions and Playwright route-management/test coverage; run affected gates.

Task 5 implementation note (September 7): named routes and alert-wide controls are integrated with explicit save/test, dirty navigation, history and named live impact. Content/eligibility and shared-rule sibling impacts are confirmed, including when no visual profile is ready. One independent review's three P2 findings were corrected with regression tests. Full unit, browser E2E and Storybook interaction/accessibility gates passed. See [authoring and acceptance verification](../../../../docs/verification/alert-audio-routing-authoring-acceptance.md) for exact results, fixture corrections and limitations.

## 6. Backup, Diagnostics And Final Acceptance

- [x] 6.1 Export route identity/assignments without local bindings; extend snapshot table/reference/schema-drift checks and preserve exact bindings in rollback.
- [x] 6.2 Block restore during device/route-test playback, including races; test orphan references, failed restore and explicit archive compatibility.
- [x] 6.3 Add safe route diagnostics/operator correction links, rebind summaries and runbook/schema documentation for routing/video/OBS-capture limits.
- [x] 6.4 Verify actual packaged audio on two endpoints and OBS for all output modes, multiple profiles/layers, background operation, reconnect, safety controls and full Quit; record evidence/gaps.
- [x] 6.5 Reconcile every scenario, run lint/typecheck/tests/build/Storybook/Playwright/desktop/OpenSpec gates and verify the rebuilt live workflow before marking implementation complete.

Task 6 checkpoint: portable restore/rebind reporting, exact rollback, real runtime activity guards and safe Diagnostics links are implemented and tested. The executable schema explorer reflects 19 migrations and 20 tables. Progress is 27/29 tasks. Tasks 6.4 and final sign-off in 6.5 remain open for the integrated user-assisted physical-device/OBS matrix; prior capability tests and forced-zero-volume packaged playback are not substitutes. The acceptance record retains transient test-runner/native-close observations without claiming BL-044 fixed. No audible acceptance, commit, publication, archive or main-spec sync was performed.

September 7 manual sign-off update: the user subsequently reported "all manual tests passed", accepting the numbered checklist through saved close-to-tray opt-out and X-to-quit, then explicitly clarified that the assisted checks were not performed. The earlier shutdown observation remains documented without attributing or declaring its cause fixed. Tasks 6.4/6.5 stay open pending assisted single-event multi-profile, audio-player crash and service-loss acceptance, followed by final reconciliation. See the updated [acceptance record](../../../../docs/verification/alert-audio-routing-authoring-acceptance.md#numbered-manual-checklist-sign-off). No implementation behavior, test deadline, application setting or external process was changed by this update.

Subsequent assisted acceptance: the repeated single-event multi-profile check passed both measured behavior and the user's explicit meter/audibility confirmation. Player-crash and service-loss acceptance remain open, as do tasks 6.4/6.5. Each further audible/fault step requires an explanation, an individual ready signal, execution, then the user's observation; no chained unconfirmed checks. See [assisted multi-profile acceptance](../../../../docs/verification/alert-audio-routing-authoring-acceptance.md#assisted-multi-profile-acceptance).

Latest assisted checkpoint: player-crash cutoff/no spontaneous replay and fresh playback on the automatically recreated player now have measured and explicit user acceptance. Only service-loss acceptance and final reconciliation remain before closing tasks 6.4/6.5. Service-loss preparation is silent and its injection awaits a separate ready signal.

Final September 7 sign-off: all numbered manual checks and the separately readiness-gated multi-profile, crash/cutoff/fresh-recovery and service-loss checks now have user acceptance. The unchanged silent packaged lifecycle test passed again after an extra diagnostic cleanup helper's unavailable exit-code assertion; that helper failure and prior shutdown observations remain documented, not reclassified as passing or fixed. The five delta-spec scopes are reconciled against the implementation, recorded full gates and current physical/assisted evidence. Progress is 29/29. All test app processes are stopped, original QA data is preserved, and BL-044 remains separately deferred. See [final acceptance](../../../../docs/verification/alert-audio-routing-authoring-acceptance.md#assisted-service-loss-acceptance-and-final-sign-off). No publication, archive or main-spec synchronization was performed.
