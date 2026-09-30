## Context

The incident report in `artifacts/log-analysis-2026-09-29/report.md` identifies the existing paths to repair. The user authorized fixes and regression tests, with audio restricted to module-selected devices. The approved synchronization policy prepares participating outputs first, then schedules a shared near-future start from the beginning at normal speed. Approximate simultaneous start is sufficient. UX sections: Assets, Diagnostics, browser-source outputs and overlay error presentation.

## Goals / Non-Goals

**Goals:** seekable authorized HTTP assets; original failure evidence through desktop IPC and device results; actual media readiness before coordinated startup; automatic target recovery for subsequent content; real browser and focused failure-path regressions.

**Non-Goals:** additional audio routes, fallback devices, frame-perfect synchronization, catch-up seeks, playback-rate corrections, durable clip replay or group pause/resume after crashes, modifying live user settings, or replacing the installed executable. An occurrence interrupted by a crash may be lost.

## Decisions

- Use a small shared HTTP response helper for existing buffer-backed asset reads. Support one valid byte range; ignore unsupported/malformed range syntax and If-Range without a matching validator by returning the complete representation. Return 416 for valid unsatisfiable ranges. HEAD returns full representation headers without a body and ignores Range. Preserve all prehandlers.
- Forward the existing overlay failure envelope through the private renderer's started reply. Media failures do not imply host failure. Do not recreate healthy renderers merely because an occurrence fails.
- Add bounded optional per-layer/route failures to device playback results. Keep failed route IDs as the authoritative compatibility field, preserve exceptions at the player boundary, propagate results through IPC and log them in the server sink. Healthy routes continue. Screen Effects also reports unavailable routes and fulfilled failed-route results.
- Introduce a bounded, cancellable preparation phase in browser, desktop visual and selected-device audio paths. Readiness means actual media elements can begin playback, not merely that bytes or metadata exist. Keep those same elements for playback. After participating recipients are ready or have failed/disconnected, the coordinator selects one near-future start timestamp. Actual playback onset anchors media duration and fades; separate bounded watchdogs release stalled obligations. Preparation and small startup delays do not consume clip content.
- Start fresh media at zero and normal speed; do not seek to elapsed wall time or reject slightly late startup. Do not join/replay transient occurrences from reconnect snapshots. Failed recipients release their preparation obligation and resources, allowing healthy recipients and later occurrences to proceed. Stop/disable/close prevents late preparation callbacks from starting abandoned work.
- Recover owned renderer hosts automatically with bounded retry delay; requests during recovery wait rather than requiring manual retry. Do not replay the interrupted occurrence or repeatedly recreate healthy hosts for individual media errors. Browser connections retain bounded reconnect and rebuild their state for subsequent content.
- Add or verify watchdog-reconnection and unauthorized-session renewal regressions; fix only demonstrated defects. Record remaining historical unknowns explicitly.

## Risks / Trade-offs

- Browser engines differ: verify actual HTTP seeks against the rebuilt service; preserve physical OBS/Electron acceptance limits.
- Diagnostics cross process boundaries: schemas stay strict, bounded and redacted by existing exception transport/logger.
- Additional failure payloads: cap detail count; keep complete route-ID accounting.
- Memory usage: range response uses the already bounded asset store behavior; streaming redesign is outside this repair.

## Migration Plan

No storage migration or settings change. Build all packages together because their private IPC contracts evolve together. Rollback is the previous build. Production installation remains a separate user action.

## Open Questions

The historical initiating causes of the nine desktop failures and missing local audio were not retained. Regressions cover demonstrated preparation defects and all identified failure-result paths; new diagnostics allow future incidents to be attributed without changing selected destinations.

## Diagnostic completeness follow-up

Watchdog expiry records pending recipient counts and bounded identities before cleanup mutates them; Alerts uses the existing skipped history state rather than claiming successful completion. Browser and selected-device media observe currentTime progress with a two-second sustained-stall window. Loop wrap counts as progress; normal end, configured duration, cancellation and stall remain distinct. This observer never seeks, reroutes, or changes playback speed.

Terminal playback reports carry bounded preparation duration and scheduled/observed onset. Selected-device audio records each layer/destination separately (maximum 64 entries); desktop groups report the latest observed layer onset on that physical output. Unknown onset remains absent. Runtime logs retain scalar route identity and validated timings, without per-frame logging or raw device names.

Transport sends retain sanitized exceptions, close events retain bounded code/reason, and reconnection is recorded; retirement deduplicates failure reports. Log reading isolates malformed JSON/record shapes, exposes skipped-record count and a synthetic coverage warning without reproducing corrupt content, and distinguishes corruption from requested-limit truncation.
