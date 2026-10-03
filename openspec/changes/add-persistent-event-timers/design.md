## Context

Definitions persist in SQLite; active runs live in TimerRuntimeCoordinator. Normalized events reach EventPipeline after bounded in-memory duplicate checks. The user approved keeping those delivery guarantees.

## Goals / Non-Goals

Support retained timers, event-driven controls, and manual corrections without introducing a general automation engine, durable event inbox, or hosted infrastructure.

## Decisions

- Store paused recovery snapshots separately from definitions. Checkpoint running time every second and on each transition; save exact remaining time on graceful close. Restore paused without replaying start cues. A hard crash recovers the last successful checkpoint, with up to one checkpoint interval of extra time under normal scheduling.
- Keep event rules on timer definitions as validated JSON. Filter normalized events by ingestion source, type, optional reward ID and subscription tier. Apply rules in saved order; fixed durations or quantity units support cheers and gift counts. Subs and resubs count as one occurrence rather than multiplying by subscription months.
- Existing intake deduplication remains authoritative; no stronger exactly-once promise. Timer event actions use the existing runtime commands and isolate failures from unrelated alert/effect admission with diagnostics.
- Manual adjustments use a strict authenticated management endpoint; the limited automation bearer remains unchanged. Set/add/subtract preserve active status. Zero completes with the existing end cue and hold. Idle manual set creates a paused run; idle add/subtract do nothing.
- Event adjustment idle behavior defaults to ignore, with start or paused alternatives based on saved duration. Completed holds count as inactive for adjustments. Start remains idempotent; restart replaces the run.
- Management owns saved event rules; Operator owns quick runtime correction. Applicable UX sections: Product Surfaces, Visual Foundation, Save And Auto-Save, Error Handling, Accessibility. This is an approved post-MVP timer extension; cloud delivery stays deferred.

## Risks / Trade-offs

- Crash checkpoint timing is bounded by successful writes and scheduler availability; never claim exact crash-time retention.
- Restore reacquires media without audible cues and preserves the saved run presentation; unavailable media must not erase retained time.
- Event quantity and arithmetic are validated and bounded to safe durations; updates cancel and reschedule deadlines to prevent stale completion callbacks.

## Migration Plan

Add a recovery table with cascading timer foreign keys and a default-empty rules JSON column. Old definitions remain valid. Configuration backups include definitions and event rules but exclude retained runtime state, preserving their existing portable configuration scope. No destructive downgrade migration.

## Open Questions

None; defaults above resolve routine implementation choices within the approved scope.
