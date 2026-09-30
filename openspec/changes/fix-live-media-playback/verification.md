# Live media playback repair verification

## Incident scope

September 29 evening, from the first retained live event at 19:58:53 America/Toronto. The requested 19:45–19:58 interval was absent from retained logs. The inventory contains 32 ERROR entries and two management-session WARN entries. Nine desktop occurrence failures were each logged at two boundaries; those 18 entries are not 18 independent failures. Private evidence and asset metadata remain in uncommitted `artifacts/log-analysis-2026-09-29/`.

| Bucket | Execution and repair | Regression coverage |
| --- | --- | --- |
| 13 browser seek failures: five effects, eight vertical alerts | Asset GET returned only full 200 representations; cold Chromium media had no seekable range. Both authorized asset paths now support byte ranges. Normal synchronized playback now prepares actual elements and commits a shared future start without seeking. | Management/module/unified ranges, 206/416, HEAD, authorization, malformed/unsupported fallback; actual Chromium HTTP seeks; zero-position prepare/start without seeking. |
| Nine desktop occurrences, 18 error entries | OverlaySurface → app → controller → active IPC reply discarded the cause. The original failure envelope now survives. Preparation previously meant only Blob URLs existed; it now waits for decoded media in retained DOM elements. | Exact failure reference/stage/exception, transparency, duplicate callbacks, slow preparation, same-node start, cancellation, byte-resolver/runtime forwarding, subsequent occurrence. |
| Missing selected local audio evidence | Source creation, binding, metadata/decode/play and device disappearance became route IDs alone; resolved failure results could be ignored. Bounded detailed failures now cross renderer/host/worker/sink into logs. Actual device media prepares before shared start. | Per-layer/per-route failures, 64-detail bound, complete route accounting, explicit destinations only, healthy recipients, mute, cancellation, IPC generations, rejected/hanging play, next clip. |
| Slow startup and lost content | The first repair reproduced a 5.048-second clip whose successful seeks took 168–174 ms and breached the old 150 ms cutoff. The approved fix replaces that normal playback policy with readiness then shared start from zero at normal speed. Actual onset anchors completion and fades to preserve the tail. | Preparation longer than clip duration; one future timestamp; delayed play retains its full duration and nonzero tail gain; no seeking/rate changes; independent failures. |
| Repeated output failure | Desktop hosts formerly exhausted a one-recreation budget and required manual retry. Subsequent requests now wait for automatic recreation with cancellable bounded backoff: immediate first retry, then 1/2/4/5 seconds. | Repeated crashes, recovery waits, close/disable/ownership loss, preserved mute/configuration, persistent timer restoration, no interrupted clip replay. |
| One Twitch keepalive timeout | Existing watchdog recovery was correct. | Timeout → reconnect → welcome → new notification; transient error clears. |
| Two management session expiry warnings | Existing one-time renewal was correct. | Successful renewal and bounded rejection after a replacement session is unauthorized. |

## Approved behavior

Alerts and Screen Effects prepare browser-source, desktop-overlay and selected-device audio recipients before choosing one start epoch. Preparation is bounded per recipient; failed/disconnected recipients cannot indefinitely hold healthy ones. Stop, skip, disable and close release preparation and prevent late callbacks from starting abandoned content. Prepared media elements are retained for playback.

Fresh media starts at zero at normal speed. Playback duration and volume envelopes follow actual onset, with separate bounded startup/completion watchdogs. Approximate simultaneous start is sufficient; frame-perfect synchronization is not claimed. Reconnect snapshots exclude transient alerts/effects, so recovered outputs receive subsequent content without seeking into or replaying interrupted clips.

Audio remains limited to module-configured destinations: no OS-default fallback, extra destination or local/browser duplication. Production settings, the installed executable and the live service were not changed.

## Verification

- Full unit suite: **2,434 tests across 276 files passed**, plus **23 script tests**. Subsequent diagnostic-boundary changes passed all **54 affected unit tests**.
- Repository typecheck, ESLint (excluding private forensic scripts), error-provenance check and production build passed.
- Storybook build and **263 checks across 26 suites passed** with stable source/build outputs.
- Real runtime integration verifies readiness before common start, persisted mute, desktop deferred-preparation forwarding, and empty reconnect snapshots for transient content.
- Independent review found nominal-end truncation and early fade-out after delayed start. Both were corrected with regressions for complete intervals and envelopes.
- Strict validation passed for the change and all **36 canonical specifications**; canonical requirements reflect the approved behavior.
- Final rebuilt browser suite: **63/63 passed** with tracing enabled. Invalid-instruction diagnostics and metadata-only decode classification were repaired with regressions; obsolete seek-based failure fixtures now exercise real-media play rejection and readiness timeout without seeking. The earlier Timer bootstrap failure did not recur in its traced focused run or the final full run; no Timer behavior or assertions were changed.

## Real incident-asset replay

The rebuilt HTTP asset route and readiness helper were exercised in isolated Chromium with paired muted video/audio elements for **all 26 incident videos**. All 26 prepared at position zero, retained normal playback rate, and started without seek assignments or seeking events. Maximum preparation time was 229.5 ms. Observed playing-event onset skew was at most 0.4 ms in this run; this same-browser laboratory measurement is not an OBS/Electron or physical-output guarantee.

The previously failing snowball.webm completed naturally on both elements at media position **5.048 seconds**. Other videos were sampled after startup rather than all played to natural completion. New private evidence: `verify-prepared-built.mjs` and `prepared-built-media-verification.json`; previous seek-based results remain intact.

## Evidence limits

The initiating causes of the nine historical desktop occurrences and missing local sound cannot be reconstructed because the former implementation discarded their original failures. The changes repair that evidence loss and demonstrated execution defects; historical crashes or hardware faults are not asserted as proven.

Physical selected-device listening and packaged Electron/OBS simultaneous-output acceptance were not performed. The real-asset replay verifies the built helper, HTTP transport and Chromium media engine. UI/protocol behavior is covered separately by integration, browser and Storybook tests. Installed-app deployment remains a separate action.

## Diagnostic completeness follow-up

Five additional gaps were repaired after the initial PR:

- Watchdog expiry now records a timed-out outcome, pending browser counts and bounded identities, plus desktop/audio pending state before cleanup. Alert queue history uses skipped rather than completed; Screen Effects records failed.
- Started media is observed for sustained lack of currentTime progress. A two-second stall produces one failure; configured-duration completion checks progress. Natural end, configured duration, stall and intentional cancellation remain distinct. Loop wrap and short buffering are covered, with no seeking or rate adjustment.
- Bounded terminal timing evidence crosses browser and desktop IPC into logs. Selected-device audio retains separate per-layer/destination timing, including a regression with one device starting 170 ms later. Route identity uses scalar metadata so it survives log allowlisting. Desktop duration groups report the latest observed layer onset on that output.
- WebSocket send causes, bounded sanitized close details, and subsequent reconnection are retained without duplicate failure reports or overlay credentials.
- Corrupt JSONL records no longer block valid records. Raw logs include a coverage warning; debug exports include skippedCorruptRecords separately from limit truncation. Corrupt raw text is never copied.

The real-browser regression starts and decodes a real video, pauses progress, verifies one transparent stall failure with timing evidence, then verifies successful subsequent playback. No new visible overlay or management controls were added; existing Storybook overlay states and the new browser workflow cover the behavior. Physical device/OBS timing limits above still apply.

Follow-up gates: 2,462 unit tests across 278 files plus 23 script tests; 64 rebuilt browser tests; 263 Storybook checks across 26 suites; typecheck, lint, error-provenance check, production/Storybook builds, and strict change/all-36-spec validation passed. The initial broad unit run found an obsolete exact-event expectation, which was updated to assert the new diagnostics and passed in the full rerun. The new browser fixture now waits for the loaded module before sending playback, avoiding a bootstrap race.
