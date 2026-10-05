## Context

Alert profile configuration belongs to `AlertEditorDocument.targetProfiles`, and runtime alert resolution already consumes that document. `alert_set_metadata` nevertheless stores Landscape/Vertical enabled and review fields, `AlertSetOverview` exposes them, and management UI combines them with the saved document. The two copies can disagree. Browser-source URL readiness and connection telemetry add a third, unrelated state that currently also filters saved-test targets.

The change crosses core contracts, server aggregation, SQLite migration, portable backup/restore, and management UI. Existing alert documents must remain authoritative and must not be rewritten from stale set metadata.

## Goals / Non-Goals

**Goals:**

- Make each saved alert document the only source of target-profile enablement and review state.
- Expose read-only, document-derived profile usage for set/Home summaries.
- Activate a set only when at least one enabled alert has an enabled, reviewed profile and no relevant blocker prevents it.
- Keep output setup and listener telemetry independent from alert configuration and target selection.
- Preserve current alert documents through database migration and legacy backup restore.

**Non-Goals:**

- Changing per-alert Landscape/Vertical editing or review controls.
- Changing matching, playback composition, route keys, or desktop/browser recipient selection.
- Adding custom profiles, multiple active sets, or new output types.
- Performing the separate repository-wide exception/logging audit.

## Decisions

### Replace set profile state with derived usage

`AlertSetOverview` will expose `profileUsage` entries with a profile ID and counts derived from saved alert documents: enabled alerts, playable alerts, blockers, and warnings. A playable alert is an enabled saved alert whose profile is enabled and reviewed. This makes summaries useful without creating a second writable state.

Retaining `targetProfiles` with renamed semantics was rejected because existing callers would continue to imply independent profile state. Removing all profile summary data was rejected because activation impact and Home still need a concise account of affected outputs.

### Evaluate activation from playable documents and relevant issues

The server will bulk-read documents while building set overviews. Activation uses `profileUsage`: at least one playable alert is required, and global issues plus issues for profiles used by enabled alerts are relevant. Disabled document profiles do not block activation.

Existing alerts without a persisted editor document retain the editor service's compatibility-materialization behavior. The bulk read remains the normal path; only missing IDs use the compatibility fallback. Review rollups count enabled saved profiles, so disabled profiles neither block activation nor make a set's summary change when details are loaded.

Using alert-rule metadata as the source was rejected because it is compatibility metadata and cannot represent per-profile review independently. Treating Browser Source connections as activation evidence was rejected because output connectivity is transient and desktop output may be available independently.

### Select saved-test profiles only from the saved alert

The inventory Test saved menu will include profiles where the saved document says `enabled` and `ready`. It will not intersect those profiles with set metadata or current browser connections. The delivery API remains responsible for reporting which browser, desktop, or audio recipients accepted or rejected playback.

### Rebuild only the set metadata table

A forward SQLite migration will rebuild `alert_set_metadata` with `set_id`, `starter`, and `starter_review_state`. It will not update `alert_editor_documents`. Repository reads and writes will use only retained columns.

Current backups will export only retained columns. Restore validation will tolerate the four obsolete columns on otherwise compatible legacy configuration data and ignore them while restoring authoritative alert documents. Compatibility tests will prove that per-alert enabled/review values survive unchanged.

## Risks / Trade-offs

- [Risk] Bulk document hydration increases list-set work. -> Mitigation: use the existing `findMany` repository method once for all alert and variation document IDs.
- [Risk] Missing legacy documents could make usage ambiguous. -> Mitigation: retain existing document materialization/fallback behavior and classify unavailable state as non-playable rather than inventing profile state.
- [Risk] A legacy backup contains contradictory set and document profile values. -> Mitigation: explicitly prefer the alert document and test that obsolete set columns cannot overwrite it.
- [Risk] Contract churn touches many fixtures. -> Mitigation: update typed fixtures and use schema/typecheck coverage to find every consumer.

## Migration Plan

1. Apply the new SQLite migration transactionally, copying only retained set metadata columns and preserving foreign-key behavior.
2. Deploy repository and contract changes that no longer read or write obsolete columns.
3. Export backups with the new table shape while accepting compatible legacy rows during restore.
4. Rollback requires restoring a pre-migration database backup; the removed columns contain no authoritative data and are not reconstructed from alert documents.

## Open Questions

None. The approved behavior defines alert documents as authoritative and output connectivity as independent.
