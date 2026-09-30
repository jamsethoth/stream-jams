## Context

The incident report in `artifacts/log-analysis-2026-09-29/report.md` identifies the existing paths to repair. The user authorized fixes and regression tests, clarified that audio uses only module-selected devices, and has not approved relaxing synchronization. This is a repair to existing flows. UX sections: Assets, Diagnostics, browser-source outputs and overlay error presentation. It stays within implemented local playback scope.

## Goals / Non-Goals

**Goals:** seekable authorized HTTP assets; original playback failure evidence through desktop IPC and device results; bounded media-expiry handling; real browser and focused failure-path regressions.

**Non-Goals:** additional audio routes, fallback devices, relaxed synchronization, replaying expired work, modifying live user settings, or replacing the installed executable.

## Decisions

- Use a small shared HTTP response helper for existing buffer-backed asset reads. Support one valid byte range; ignore unsupported/malformed range syntax and If-Range without a matching validator by returning the complete representation. Return 416 for valid unsatisfiable ranges. HEAD returns full representation headers without a body and ignores Range. Preserve all prehandlers.
- Forward the existing overlay failure envelope through the private renderer's started reply. Media failures do not imply host failure. Do not recreate healthy renderers merely because an occurrence fails.
- Add bounded optional per-layer/route failures to device playback results. Keep failed route IDs as the authoritative compatibility field, preserve exceptions at the player boundary, propagate results through IPC and log them in the server sink. Healthy routes continue. Screen Effects also reports unavailable routes and fulfilled failed-route results.
- Keep the 150 ms target and bounded attempts. Distinguish media whose duration has already elapsed, and capture requested/actual offset and elapsed seek time in preparation exceptions. No impossible beyond-end seek or fallback-to-zero playback.
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
