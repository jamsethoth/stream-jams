## 1. Desktop Dependency And Device Capability Gate

- [ ] 1.1 Verify current origin/main, approved execution worktree and implemented desktop prerequisite; retain and commit this slice's spec before or with implementation.
- [ ] 1.2 Add the isolated hidden audio renderer, stable app-owned origin, output-only permission handlers and sink-first regression test.
- [ ] 1.3 Prove two-device independent/combined playback, autoplay without mic access, hide/restart and device-loss behavior in the packaged app with isolated data and approved audio tests.
- [ ] 1.4 Record actual capability evidence; stop for a backend decision if it fails without adding fallback destinations or a native driver.

## 2. Outputs, Named Routes And Persistence

- [ ] 2.1 Add validated alert outputs, route/device/playback contracts and compatible Browser Source-only defaults.
- [ ] 2.2 Preserve outputs through create/variation/duplicate/re-theme and add invalid/duplicate/reference regression tests.
- [ ] 2.3 Add the next SQLite route migration/repository and transaction-scoped reference integrity, including deletion-versus-save races.
- [ ] 2.4 Add protected route CRUD, device/status and explicit route-test APIs with authentication/CSRF/origin/rate-limit/fail-closed tests.
- [ ] 2.5 Verify same-device alias deduplication, explicit binding, missing-device preservation and CLI-unavailable behavior.

## 3. Canonical Resolution And Queue

- [ ] 3.1 Resolve visible audio once per selected document before visual-target expansion and respect the Browser Source flag on profile and legacy paths.
- [ ] 3.2 Add canonical audio to queue contracts, audio-only admission, defensive snapshots and replay with new occurrence IDs.
- [ ] 3.3 Snapshot current bindings at playback start without redirecting active occurrences; preserve distinct layers sharing one asset.
- [ ] 3.4 Test no-OBS delivery, multiple profiles, hidden layers, selected-variation identity, replay and missing routes.

## 4. Desktop Playback And Safety

- [ ] 4.1 Add validated worker/main/preload transport, bounded asset bytes, generation IDs and sink-first media playback with complete resource cleanup.
- [ ] 4.2 Track browser/device completion independently with register-before-dispatch, loading/duration watchdogs and stale-ack rejection.
- [ ] 4.3 Extend authoritative mute, pause/DND semantics, skip-before-next-delivery and shutdown without queue advancement; preserve TTS safety behavior.
- [ ] 4.4 Test cancellation/mute during pending sink selection, stop acknowledgement timeout and renderer destruction before next playback.
- [ ] 4.5 Handle missing/disconnected devices, one bounded player recreation, explicit retry, service-loss lease and no stale replay/fallback.
- [ ] 4.6 Run core/server/desktop playback and existing TTS regressions plus packaged smoke/typecheck.

## 5. Authoring And Test UX

- [ ] 5.1 Add named-route Settings UI with explicit binding/test actions and loaded/empty/loading/error/unavailable/conflict stories.
- [ ] 5.2 Add alert-wide output controls to draft/undo/redo/save/live-impact flows without per-layer overrides or dropped missing routes.
- [ ] 5.3 Make editor/inventory Send test destination-aware, support null-profile device-only tests, preserve inclusion toggles and isolate Preview.
- [ ] 5.4 Make only alert video layers silent across preview/test/live including legacy visuals, and add actionable migration guidance without changing TTS/video-shoutout routing.
- [ ] 5.5 Add focused UI/server tests, Storybook accessibility/interactions and Playwright route-management/test coverage; run affected gates.

## 6. Backup, Diagnostics And Final Acceptance

- [ ] 6.1 Export route identity/assignments without local bindings; extend snapshot table/reference/schema-drift checks and preserve exact bindings in rollback.
- [ ] 6.2 Block restore during device/route-test playback, including races; test orphan references, failed restore and explicit archive compatibility.
- [ ] 6.3 Add safe route diagnostics/operator correction links, rebind summaries and runbook/schema documentation for routing/video/OBS-capture limits.
- [ ] 6.4 Verify actual packaged audio on two endpoints and OBS for all output modes, multiple profiles/layers, background operation, reconnect, safety controls and full Quit; record evidence/gaps.
- [ ] 6.5 Reconcile every scenario, run lint/typecheck/tests/build/Storybook/Playwright/desktop/OpenSpec gates and verify the rebuilt live workflow before marking implementation complete.
