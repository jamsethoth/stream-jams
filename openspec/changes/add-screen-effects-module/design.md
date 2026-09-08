## Context

The app has one alert-specific queue/coordinator, normalized event sources, explicit audio routes and a registry/composition service. The two preceding slices introduce a shared visual recipient and routed soundtracks. This design builds on those contracts; see the [approved product design](../../../docs/superpowers/specs/2026-09-07-screen-effects-design.md).

## Goals / Non-Goals

Execution details: [Screen Effects and merged operations implementation plan](../../../docs/superpowers/plans/2026-09-08-screen-effects-module.md). The baseline has external-event contracts but no live custom Streamer.bot subscription workflow; task S3-3 implements explicit configuration in the existing provider setup before those triggers can run. Bindings do not change subscriptions automatically.

**Goals:** Trusted local reward-triggered media; sequential effects concurrent with Alerts; independent visual/audio targets; merged authoritative operations with correctly scoped controls.

**Non-goals:** Marketplace, viewer uploads, remote fetch, arbitrary code, new simultaneous providers, preemption, overlapping effects, general animation/composition editing, video-shoutout/music implementation, or cloud/cross-platform delivery.

## Decisions

### Focused module instead of another alert set

Create `packages/core/src/screen-effects/` for validated documents, matching, variant resolution and a typed repository boundary; `apps/server/src/modules/screen-effects/` implements persistence/orchestration. Register `screen-effects` in the existing module registry with module/unified/desktop visual support. Store module settings and effect/variant records transactionally with asset and route references. Do not overload Alerts or make selection of an effect set replace the active alert set.

Each variant has one optional image/GIF/video visual and one optional explicit sound; at least one usable media source is required. Video may also provide enabled soundtrack audio. Reuse validated layout/style/animation primitives, local asset IDs and existing MIME rules. Use a Landscape logical canvas uniformly fitted to fixed output profiles and desktop. A variant owns duration and item-wide audio outputs; the effect owns enabled/name/description/category, triggers, priority and cooldown. Default duration is 10 seconds, allowed 1–120 seconds; priority defaults to 0. Default/weighted variants have stable IDs and positive bounded integer weights. A disabled or empty/invalid definition cannot admit live work.

### Reuse event boundaries and fan out once

Subscribe module matching to already validated normalized events. A Twitch reward match includes broadcaster plus reward ID; missing/deleted catalog selections remain visible as unresolved rather than rebound by name. For configured Streamer.bot custom events use exact source/type matching against its configured subscription boundary. Convert only allowlisted summary fields and effect identity into a typed trigger; payload text cannot select file paths, routes or arbitrary commands. Retain the existing single active provider; event setup links to existing management workflows instead of creating a new bot connection.

Use a separate dedupe/cooldown namespace per module. Apply dedupe, matching, cooldown and capacity checks before selecting/snapshotting a variant. One provider event can trigger one matched effect per configured binding and an Alert independently. Reject duplicate bindings within an effect; when different enabled effects intentionally bind the same event, enqueue them deterministically by priority then stable effect ID. No automatic Twitch reward creation, redemption fulfillment, cancellation or refund is added; local rejection reasons are visible to the operator.

### Independent queue owners with a small common adapter

Do not put Screen Effects into `PlaybackQueueItem.alerts` as fabricated alerts. Keep each module's canonical content and queue, and expose a narrow operations adapter: snapshot, targeted skip/remove/replay, clear pending, and module pause. Reuse tested priority/FIFO and bounded history mechanics where practical without rewriting all alert matching. Effects have one current item, at most 100 pending and 25 recent; queue overflow rejects the newest attempted admission and does not evict active/pending work. Retain active/pending queues as in-memory runtime state; restart does not replay surprises.

Snapshot selected variant content, visual choices, audio switches, volumes, route IDs, duration and priority at admission. At occurrence start resolve current bindings for those stable route IDs. Replay copies the snapshot with a new occurrence ID, keeps the original variant, obeys capacity/safety, and does not rerun automatic provider dedupe or choose a new variant. Deleted/missing assets or routes fail closed with a clear result.

Create a server-level playback operations service to own global safety persistence and project module snapshots. Serialize safety changes through the existing config-write path; persistence failure changes no queue/player. Effective pause is global pause OR module pause OR DND's existing advancement hold. Preserve current Alerts intake semantics during DND rather than adopting the mockup's simplified drop behavior. Current items finish; pending work waits. Module pauses survive restart; runtime occurrences do not.

### Module-qualified ownership all the way to outputs

Existing device player support already tracks an active map. Preserve that capability and use globally unique occurrence IDs with module ownership rather than inventing one player per module. Remove any coordinator assumption that there is only one globally current batch. Normal stop/remove/completion is occurrence-scoped across browser, desktop and device destinations. Shared-host failure can stop every affected batch; fail and release those obligations explicitly while healthy visual destinations continue.

Visual composition membership is independent of browser-audio membership. Hiding a module visually in a unified source must not silently mute its selected Browser Source audio. One module-specific OBS source plus a unified source can still create audible duplication if both are active; retain setup guidance instead of promising cross-browser deduplication without a recipient-election policy.

### Merged Operator is a projection, not a scheduler

Extend `apps/web/src/operator/OperatorApp.tsx` and its typed API, keeping `/operator` separate from editing. Show all active items, pending rows sorted by enqueue time/sequence and recent rows sorted by completion time/sequence. Every row carries module, occurrence, sanitized trigger summary, status and that module's actual pending position. Server ordering is authoritative. A single chronological list never determines inter-module playback order.

Commands include `moduleId` and `occurrenceId`, with optional observed revision for compound edits. A skip against a no-longer-current occurrence returns a conflict and fresh snapshot, never skips its replacement. Remove/replay validate owner and state. Clear pending names the module/count and uses an impact-aware confirmation. Global mute/pause/DND cover both modules; per-module pause and clear remain separate. Keep the existing alert-only API compatible through an Alerts adapter until its consumers migrate.

### Management stays in context

Add module inventory/editor routes for Screen Effects, a compact module Browser sources section, trigger setup links and bounded explicit tests. Reuse asset picker, draft/save/undo patterns and the shared media-audio controls from slice 2. Named device routes remain in Audio settings. The mockup's Shared audio page and management navigation inside Operator are illustrative, not new navigation requirements.

## Risks / Trade-offs

- Shared player teardown can affect both modules → report every failed destination, preserve other recipient types, never hide that blast radius.
- Two independent queues can be loud together → visible current module rows, authoritative mute and independent source volumes; no unrequested ducking/mixer.
- Multiple modules reference a route/asset → transactionally check all owners before deletion and include module-qualified impact lists.
- Deferred dependencies could drift → before implementation rebase and validate these deltas against both merged foundation specs; preserve the routed-video Operator scenarios.

## Migration Plan

Create typed effect/variant/binding/reference persistence and include it in backup/restore validation. Preserve existing alert routes/documents and safety values. New Screen Effects module/surface rows start disabled/hidden at the bottom; import restores definitions disabled with unresolved device/display bindings requiring review. Add no automatic event-provider/subscription switches. Keep pre-upgrade backups for rollback instead of in-place schema downgrade.

## Open Questions

No product decision blocks planning. Implementation is dependency-gated on the two foundation slices and their packaged acceptance evidence; artifact completeness alone does not satisfy those gates.
