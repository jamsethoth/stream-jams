# Screen Effects and Merged Operations Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` inline, task by task. Use `superpowers:subagent-driven-development` only when the user chooses delegation. Steps use checkboxes; commit checkpoints require authorization.

**Goal:** Add local Screen Effect authoring and event-triggered sequential playback, concurrent with Alerts, with shared desktop/OBS/audio delivery and merged operational controls.

**Architecture:** Screen Effects owns typed definitions, admission, snapshots, and one queue/coordinator. Existing event ingestion fans out to independent module consumers. A narrow operations service projects queue-owner state and owns durable global safety; it does not replace either scheduler. Reuse the two delivered foundation contracts for visuals and media audio.

**Tech Stack:** Existing TypeScript/Zod core, Fastify/SQLite repositories, React management/Operator, Electron visual/audio hosts, Vitest/Storybook/Playwright. No marketplace, plugin loader, external media service, or second provider connection.

**Spec:** [Product design](../specs/2026-09-07-screen-effects-design.md), [change design](../../../openspec/changes/add-screen-effects-module/design.md), [effect scenarios](../../../openspec/changes/add-screen-effects-module/specs/screen-effects/spec.md), [operations scenarios](../../../openspec/changes/add-screen-effects-module/specs/multi-module-playback-operations/spec.md), [Operator delta](../../../openspec/changes/add-screen-effects-module/specs/alert-playback-operator-controls/spec.md), [route-reference delta](../../../openspec/changes/add-screen-effects-module/specs/alert-audio-routing/spec.md), [OpenSpec tasks](../../../openspec/changes/add-screen-effects-module/tasks.md).

## Global constraints

All [execution-index constraints](2026-09-08-screen-effects-implementation.md#global-constraints) apply. Before implementation, both foundation slices must be implemented, specs synced, accepted on the packaged runtime, and present in current remote `main`. Keep `/operator` separate from management. Screen Effects has one current occurrence; Alerts may play simultaneously. Priority is descending/FIFO ties/nonpreemptive. Default duration 10 seconds, range 1–120 seconds, priority 0, 100 pending and 25 recent. No persisted runtime backlog/restart replay. Definitions start disabled; new surface rows start hidden at the bottom. No automatic reward creation/redemption action, provider switch, or subscription expansion from effect bindings.

## Ownership and dependencies

| Area | Ownership |
| --- | --- |
| `packages/core/src/screen-effects/` | Validated definitions, matching, weighted choice, immutable occurrence snapshots, independent queue |
| `apps/server/src/modules/screen-effects/` | Persistence, admission orchestration, recipient delivery and completion |
| `packages/core/src/playback/operations.ts` | Narrow module-qualified operations contracts and merged projection |
| `apps/server/src/modules/playback/playback-operations-service.ts` | Queue-owner routing and serialized authoritative safety |
| Existing Streamer.bot provider files | Explicit configured subscriptions and trusted accepted-event adapter; no second connection |
| `apps/web/src/management/screen-effects/` | Inventory/editor, explicit preview/test, contextual trigger/output setup |
| Existing `apps/web/src/operator/` | Multiple current rows and merged pending/recent state, no authoring navigation |

`PlaybackTiming`, `DesktopOverlayTransport`, `SurfaceConfiguration`, `MediaAudioCandidate`, `resolveMediaAudioSources`, and `VideoAudioSettings` are consumed exactly as delivered by [slice 1](2026-09-08-shared-desktop-overlay-surface.md) and [slice 2](2026-09-08-routed-video-audio-controls.md). Do not fork those helpers in the effects module.

### S3-1: Define effect documents and deterministic variant snapshots

**Files**

- Create: `packages/core/src/screen-effects/types.ts`, `schemas.ts`, `schemas.test.ts`, `variant-resolver.ts`, `variant-resolver.test.ts`.
- Modify: `packages/core/src/index.ts`.

**Interfaces**

```ts
export type EffectBinding =
  | { id: string; kind: "twitch-reward"; broadcasterId: string; rewardId: string }
  | { id: string; kind: "streamerbot-event"; providerId: string; sourceKey: string; eventType: string };
export type EffectVisual =
  | { mediaType: "image" | "gif"; assetId: string; layout: OverlayElementLayout }
  | ({ mediaType: "video"; assetId: string; layout: OverlayElementLayout } & VideoAudioSettings);
export interface EffectVariant {
  id: string; name: string; kind: "default" | "weighted"; enabled: boolean; weight: number;
  visual: EffectVisual | null;
  sound: { assetId: string; volume: number } | null;
  animation: OverlayPresetAnimationInstruction | null;
  durationMs: number;
  outputs: AlertAudioOutputs;
  visualOutputs: { browserSource: boolean; desktop: boolean };
}
export interface ScreenEffectDocument {
  schemaVersion: 1; id: string; name: string; enabled: boolean;
  description: string | null; category: string | null;
  priority: number; cooldownSeconds: number;
  bindings: EffectBinding[]; variants: EffectVariant[];
}
export function chooseWeightedVariant(
  variants: readonly { id: string; weight: number }[], random: number
): string;
export interface EffectContentSnapshot {
  effectId: string; effectName: string; variant: EffectVariant; priority: number;
}
export function resolveEffectContent(document: ScreenEffectDocument, random: number): EffectContentSnapshot;
```

The referenced layout, animation, and output types are existing core contracts. Schema validation reuses their bounded primitives. Implementation limits: name 1–120 characters, description at most 2,000, category at most 80, 1–50 variants, 0–100 bindings, integer weights 1–10,000, cooldown 0–86,400 seconds, priority a safe integer. These are proposed local validation bounds, not competitor limits. Require one enabled default variant. Choose among enabled weighted variants when any exist; otherwise select the default. IDs are stable storage-safe values; reject duplicate IDs and duplicate canonical binding identities inside an effect.

- [ ] Write schema cases for disabled creation, valid audio-only content, invalid empty content, and independent video/sound controls. Add the weighted boundary regression:

```ts
import { expect, it } from "vitest";
import { chooseWeightedVariant } from "./variant-resolver.js";
it("uses stable weighted boundaries without selecting twice", () => {
  const variants = [{ id: "a", weight: 2 }, { id: "b", weight: 3 }];
  expect(chooseWeightedVariant(variants, 0)).toBe("a");
  expect(chooseWeightedVariant(variants, 0.4)).toBe("b");
  expect(chooseWeightedVariant(variants, 0.999)).toBe("b");
  expect(() => chooseWeightedVariant(variants, 1)).toThrow();
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/screen-effects`; expect missing implementation/exports before adding code.
- [ ] Implement strict document/media schemas, canonical binding keys, disabled creation, and weighted choice. Validate random values in `[0,1)` and total bounded positive weights; walk variants in saved order, subtracting weights from `random * total` until the cursor is below the current weight. Select once, then `structuredClone` the chosen variant and priority/name. Do not include mutable definition references, resolved device IDs, credentials, or provider payloads in the snapshot.

```ts
let cursor = random * totalWeight;
for (const variant of variants) {
  if (cursor < variant.weight) return variant.id;
  cursor -= variant.weight;
}
throw new Error("Variant weights failed validated selection");
```

`totalWeight` is the sum of validated weights in `chooseWeightedVariant`; empty candidates and invalid totals throw before this loop. `resolveEffectContent` chooses enabled weighted candidates or the single enabled default, looks up the selected ID, then clones it. Sound-only variants are valid; a variant with no visual and no explicit sound is invalid regardless of output selections.

- [ ] Test constructor defaults, no-output drafts, bounded layouts/animations, separate sound preserving the video toggle, deep-copy isolation after an edit, disabled weighted candidates, default fallback, and duplicate binding rejection. Run the focused suite and `corepack.cmd pnpm typecheck`; expect pass. Prepare the core document checkpoint.

### S3-2: Persist definitions and protect asset/route/restore boundaries

**Files**

- Create: `packages/core/src/screen-effects/repository.ts`, `apps/server/src/modules/screen-effects/sqlite-effect-repository.ts`, its `.test.ts`, `apps/server/src/modules/db/migrations/022-screen-effects.ts` for the planned serial baseline; renumber to the next unused migration after dependency rebase.
- Modify: `apps/server/src/modules/db/database.ts`, `apps/server/src/modules/assets/asset-library-service.ts`, its `.test.ts`, `apps/server/src/modules/audio/sqlite-audio-output-route-repository.ts`, its `.test.ts`, `audio-output-service.ts`, its `.test.ts` in that audio directory.
- Modify: `packages/core/src/audio/types.ts`, `packages/core/src/management/contracts.ts`, `apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.ts`, its `.test.ts`, `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`, its `.test.ts`, `configuration-backup-service.ts`, its `.test.ts` in that backup directory, `apps/server/src/runtime/runtime-composition.ts`.

**Interfaces**

```ts
export interface ScreenEffectRepository {
  list(): Promise<ScreenEffectDocument[]>;
  find(id: string): Promise<ScreenEffectDocument | null>;
  save(document: ScreenEffectDocument): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface ModuleMediaReference {
  moduleId: string; ownerId: string; ownerName: string; variantId: string | null;
}
export function sanitizeRestoredEffect(document: ScreenEffectDocument): ScreenEffectDocument;
```

Retain the existing Alert route-reference response fields for compatible callers, and add a module-qualified owners collection to route/asset impact responses. The new owners collection uses `ModuleMediaReference`; do not rename all existing Alert public fields gratuitously.

- [ ] Add a repository test using `createInMemoryStreamJamsDatabase()` from `apps/server/src/modules/db/database.ts`: save a minimal audio-only definition referencing a seeded asset/route, close/reopen a temporary DB, verify the exact definition, and assert route deletion is rejected until its effect reference is removed. Add fault injection inside the save transaction proving no partial variant/binding/reference rows survive.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/screen-effects/sqlite-effect-repository.test.ts`; expect missing repository/schema before implementation.
- [ ] Create `screen_effects` metadata rows, `screen_effect_variants` with typed validated document JSON and asset foreign-key columns, `screen_effect_bindings` with unique `(effect_id, canonical_identity)`, `screen_effect_audio_routes` with `(variant_id, route_id)` foreign keys, and `module_playback_settings` with durable module pause/cooldown values. Use stable variant IDs, explicit positions, cascading deletion only for child definition rows, and restrictive asset/route references. Validate and replace one complete effect inside a narrow transaction; no SQLite access from React/core.
- [ ] Make reference checks and deletion one transaction on the same database connection. Cover current Alert JSON route references and the new effect reference tables, including a concurrent Alert/effect save versus route/asset deletion. Reject removal with a module-qualified impact list; do not unlink media silently. Queued snapshots are transient, so revalidate asset availability on dispatch/replay as well.
- [ ] Extend backup table allowlists, schema validation, restore ordering, and rollback. Restore definitions disabled; preserve saved bindings as configuration but mark unavailable provider/reward/subscription/device choices unresolved until reviewed. Reuse foundation display/device unbinding. Do not export or restore current/pending/recent work for automatic playback. Keep legacy backup input accepted through explicit migration/default handling.

```ts
export function sanitizeRestoredEffect(document: ScreenEffectDocument): ScreenEffectDocument {
  return { ...structuredClone(document), enabled: false };
}
```

- [ ] Add failed-restore rollback and legacy/current archive tests. The runtime maintenance check must aggregate both queues before replace/restore; complete its concrete `QueueOwner` integration in S3-6 before accepting this task's restore gate. Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/screen-effects apps/server/src/modules/assets apps/server/src/modules/audio apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.test.ts apps/server/src/modules/backup` and `corepack.cmd pnpm typecheck`. Prepare the persistence/reference checkpoint; explicitly leave the aggregate-runtime acceptance open until S3-6.

### S3-3: Connect trusted Twitch and explicitly configured Streamer.bot triggers

**Files**

- Create: `packages/core/src/screen-effects/trigger-matcher.ts`, its `.test.ts`, `apps/server/src/modules/screen-effects/effect-trigger-adapter.ts`, its `.test.ts`.
- Modify: `apps/server/src/modules/events/event-pipeline.ts`, its `.test.ts`, `event-ingestion-service.ts`, its `.test.ts` in that events directory, `apps/server/src/modules/streamerbot/streamerbot-runtime-service.ts`, its `.test.ts`, `streamerbot-event-normalizer.ts`, its `.test.ts` in that Streamer.bot directory.
- Modify: `packages/core/src/management/contracts.ts`, its `.test.ts`, `apps/server/src/modules/providers/provider-management-service.ts`, its `.test.ts`, `provider-management-adapters.ts`, its `.test.ts`, `apps/server/src/runtime/runtime-composition.ts`, `apps/web/src/management/providers/EventSourcesPage.tsx`, `ProviderPage.tsx`, `ProviderPages.test.tsx`, `ProviderPages.stories.tsx`.
- Create: `apps/server/src/http/routes/streamerbot-subscriptions.ts`, its `.test.ts`, `tests/e2e/streamerbot-effect-subscriptions.spec.ts`; register in `apps/server/src/app.ts`.

**Interfaces**

```ts
export type EffectTrigger =
  | { kind: "twitch-reward"; eventId: string; occurredAt: string;
      broadcasterId: string; rewardId: string; summary: string }
  | { kind: "streamerbot-event"; eventId: string; occurredAt: string;
      providerId: string; sourceKey: string; eventType: string; summary: string };
export function matchesEffectBinding(binding: EffectBinding, trigger: EffectTrigger): boolean;
export interface EffectTriggerSink { handleTriggers(triggers: readonly EffectTrigger[]): Promise<void> }
```

Extend Streamer.bot's non-secret configuration with `externalSubscriptions: StreamerBotSubscriptionSelection[]`, default empty on legacy input, plus an explicit association to the existing verified Twitch catalog broadcaster when reward matching needs it. These fields belong only to Streamer.bot configuration, not Speaker.bot's shared WebSocket schema. Existing `getEvents()` and `subscribe()` client methods supply the catalog/transport; the current runtime does not already offer a live external-event sink. `handleTriggers` accepts the bounded matching facets of one upstream event, all sharing the same event ID. This avoids losing a configured source/type match when that same Streamer.bot envelope also normalizes to a Twitch reward.

- [ ] Write exact-identity tests, including renamed reward summaries and wrong source/provider:

```ts
import { expect, it } from "vitest";
import { matchesEffectBinding } from "./trigger-matcher.js";
it("matches channel and reward IDs, not the display summary", () => {
  const binding = { id: "b", kind: "twitch-reward" as const, broadcasterId: "100", rewardId: "reward-1" };
  const trigger = { kind: "twitch-reward" as const, eventId: "e", occurredAt: "2026-09-08T12:00:00Z",
    broadcasterId: "100", rewardId: "reward-1", summary: "Renamed reward" };
  expect(matchesEffectBinding(binding, trigger)).toBe(true);
  expect(matchesEffectBinding(binding, { ...trigger, broadcasterId: "200" })).toBe(false);
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/screen-effects/trigger-matcher.test.ts apps/server/src/modules/streamerbot/streamerbot-runtime-service.test.ts apps/server/src/modules/events`; expect new custom subscription/fan-out cases to fail.
- [ ] Implement trusted trigger adapters. For direct Twitch, bind the normalized reward event to the authenticated broadcaster/subscription context already checked at ingestion. For Streamer.bot rewards, use the explicitly associated verified catalog broadcaster for that provider; if unavailable, expose unresolved status and do not guess from the actor, reward title, or raw metadata. Preserve `NormalizedStreamEvent.providerId: "twitch"` and `ingestProvider` semantics; do not add custom envelopes to that Twitch-only union. Only the trusted adapter produces `EffectTrigger`.
- [ ] Add protected subscription catalog/update routes under `/providers/:providerId/streamerbot-subscriptions`; reuse management authorization, origin/CSRF, rate limits, and provider ownership checks. Only the active Streamer.bot connection can apply subscriptions. Read advertised source/type values through `getEvents`, validate complete explicitly selected subsets, and store them through provider configuration. Retain existing supported Twitch subscriptions and union the explicit custom selections without duplicate requests. Connection or catalog failure leaves a visible unavailable configuration; never silently subscribe to everything.
- [ ] Expose the explicit selection in the existing event-source setup, with Save and live-impact confirmation. A binding may refer only to configured selections and must show unresolved when its source/type disappears. Changing an effect never writes provider configuration. Test legacy empty selection, wrong provider, vanished catalog values, failed persistence/apply, auth rejection, and no subscription change while editing an effect.
- [ ] Validate custom envelopes only inside the configured source/type boundary; adapt existing `ExternalStreamEvent` schema to a sanitized trigger. Copy only bounded human-readable summary fields (maximum 256 characters, control characters removed) and stable IDs. Discard payload-selected media IDs, paths, URLs, commands, device routes, and executable content. If an upstream envelope lacks a stable event ID, derive identity from the validated transport envelope's existing message identity; if neither exists, reject with a diagnostic instead of deduping by reward title.
- [ ] Fan out once from accepted ingestion to Alert and effect sinks with independent error results. Collect a normalized reward facet and an explicitly subscribed source/type facet from the same envelope before one `handleTriggers` call; do not call module dedupe separately for each facet. Retain ingress dedupe; add module-scoped admission dedupe in S3-4. Log event receipt once and module outcomes separately. An effect matching/queue failure does not stop Alert processing or switch providers. Keep the maintenance intake gate around both normalized and external paths. Test one envelope matching different effects by both binding kinds without suppressing either or admitting the same effect twice. Run the focused suites, `corepack.cmd pnpm typecheck`, and `corepack.cmd pnpm exec playwright test tests/e2e/streamerbot-effect-subscriptions.spec.ts`; expect pass. Prepare the event-boundary checkpoint.

### S3-4: Implement bounded admission and one nonpreemptive effect queue

**Files**

- Create: `packages/core/src/screen-effects/effect-queue.ts`, its `.test.ts`, `apps/server/src/modules/screen-effects/effect-admission-service.ts`, its `.test.ts`.
- Consume: existing core dedupe/cooldown primitives, `ScreenEffectRepository`, trigger matching, and variant resolution.

**Interfaces**

```ts
export interface EffectOccurrence {
  id: string; moduleId: "screen-effects"; trigger: EffectTrigger | null;
  content: EffectContentSnapshot; enqueuedAtMs: number; sequence: number;
  startedAtMs: number | null; completedAtMs: number | null;
  status: "queued" | "playing" | "completed" | "skipped" | "failed";
}
export interface EffectQueueSnapshot {
  current: EffectOccurrence | null; queued: EffectOccurrence[]; recent: EffectOccurrence[];
  modulePaused: boolean;
}
export interface EffectQueue {
  enqueue(item: EffectOccurrence): "queued" | "full";
  snapshot(): EffectQueueSnapshot;
  advance(safety: PlaybackSafetyState): EffectOccurrence | null;
  complete(occurrenceId: string, status: "completed" | "skipped" | "failed", nowMs: number): boolean;
  remove(occurrenceId: string): boolean;
  clearPending(): number;
  setModulePaused(paused: boolean): void;
}
export function comparePendingEffects(a: EffectOccurrence, b: EffectOccurrence): number;
```

Implement `DefaultEffectQueue implements EffectQueue`; its constructor receives `{ maxPending: number, recentLimit: number, modulePaused: boolean }`, defaulting to 100, 25, and false. Use fake clocks and explicit IDs/sequences in tests. Queue mechanics never generate random variants or resolve devices. `EffectAdmissionService.handleTriggers(triggers: readonly EffectTrigger[]): Promise<void>` validates one shared upstream event ID, loads enabled definitions, matches any supplied facet, and deduplicates matched effect IDs. It orders candidates by priority then stable effect ID, checks dedupe/cooldowns/capacity, snapshots once, and enqueues. Store the deterministic first matched binding's trigger as the occurrence summary. Test/Replay use separate explicit entry points with the same safety/capacity rules.

- [ ] Add the queue regression before implementing:

```ts
import { expect, it } from "vitest";
import { comparePendingEffects } from "./effect-queue.js";
it("orders pending work by priority then FIFO, without a global order", () => {
  const base = { id: "base", moduleId: "screen-effects" as const, trigger: null,
    content: { effectId: "fx", effectName: "Neutral", priority: 0,
      variant: { id: "v", name: "Default", kind: "default" as const, enabled: true, weight: 1,
        visual: null, sound: { assetId: "tone", volume: 0.1 }, animation: null, durationMs: 10000,
        outputs: { browserSource: false, deviceRouteIds: [] }, visualOutputs: { browserSource: false, desktop: false } } },
    enqueuedAtMs: 1000, sequence: 1, startedAtMs: null, completedAtMs: null, status: "queued" as const };
  const later = { ...base, id: "later", sequence: 2 };
  const high = { ...later, id: "high", content: { ...base.content, priority: 5 } };
  expect([later, high, base].sort(comparePendingEffects).map(item => item.id)).toEqual(["high", "base", "later"]);
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/screen-effects/effect-queue.test.ts apps/server/src/modules/screen-effects/effect-admission-service.test.ts`; expect missing queue/admission behavior.
- [ ] Implement comparator `b.content.priority - a.content.priority || a.sequence - b.sequence`; validate safe priority values and use relational comparison if subtraction could exceed safe integer bounds. Admit only if a pending slot is available; never evict or preempt the current item. `advance` returns nothing while current exists or global pause/DND/module pause holds. Mute does not hold visual scheduling. Audio-only or no-currently-available-output occurrences settle deterministically instead of wedging the queue.
- [ ] Apply dedupe in a `screen-effects` namespace, not the Alert namespace. Reserve a per-event admission attempt before async work so concurrent redelivery cannot race; process intentional multiple matched effects deterministically. Commit cooldowns only after that effect is admitted; rejection must not consume cooldown. Bound dedupe memory with the existing tested retention mechanism. Log rejected/failed attempts without automatic provider reward actions.
- [ ] Clone the chosen content/audio switches/volumes/route IDs/duration at admission. Later edits do not change queued work. Replay retrieves the exact recent snapshot, uses a new globally unique occurrence ID and enqueue sequence, rechecks referenced assets/routes, and obtains fresh device bindings at dispatch; it never calls weighted selection again. Reject expired recent IDs. Start each runtime with empty current/pending/recent state, restoring only definitions and safety/module settings.
- [ ] Test cap 100/101, no cooldown on full/rejected, redelivery races, one event reaching both modules, priority nonpreemption, equal-priority FIFO, all pause combinations, recent trimming at 25, skipped/failed completion, stale complete ID, no-output settlement, edits after admission, replay without reroll, and restart emptiness. Run the focused suites and `corepack.cmd pnpm typecheck`; expect pass. Prepare the queue/admission checkpoint.

### S3-5: Register the module and deliver occurrence-scoped output

**Files**

- Create: `packages/core/src/screen-effects/module-definition.ts`, `apps/server/src/modules/screen-effects/effect-playback-coordinator.ts`, its `.test.ts`.
- Modify: `packages/core/src/overlay-modules/module-registry.ts`, its `.test.ts`, `apps/server/src/runtime/runtime-composition.ts`, `apps/server/src/modules/playback/playback-coordinator.ts`, its `.test.ts`, `apps/server/src/websocket/overlay-gateway.ts`, its `.test.ts`.
- Modify: foundation `apps/server/src/modules/overlay-surfaces/desktop-visual-sink.ts`, its `.test.ts`, `apps/server/src/modules/audio/desktop-audio-sink.ts`, its `.test.ts`, `apps/desktop/src/audio/audio-host.ts`, its `.test.ts`, `apps/desktop/src/audio/device-audio-player.test.ts`.

**Interfaces**

- `EffectPlaybackCoordinator.getSnapshot(): EffectQueueSnapshot`, `.startNext(): Promise<void>`, `.skip(occurrenceId: string): Promise<boolean>`, `.close(): Promise<void>`; consume `EffectQueue`, shared safety, existing overlay gateway, `DesktopOverlayTransport`, and audio sink.
- `effectOccurrenceKey(moduleId: string, occurrenceId: string): string` produces a collision-safe transport playback ID using `JSON.stringify([moduleId, occurrenceId])`; define it in the new coordinator module and use the same identity for stop and result routing.
- Normalized visual/audio instructions retain original logical layer IDs and share one `PlaybackTiming`. Device audio resolution happens once per occurrence, independently of visual surfaces/profile count.

- [ ] Add concurrent coordinator/audio tests: hold one Alert device batch active, start an effect batch, skip the effect, and assert only its transport key is stopped and the Alert continues. Add the key regression:

```ts
import { expect, it } from "vitest";
import { effectOccurrenceKey } from "./effect-playback-coordinator.js";
it("does not collide with another module's local occurrence ID", () => {
  expect(effectOccurrenceKey("alerts", "same")).not.toBe(effectOccurrenceKey("screen-effects", "same"));
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/screen-effects/effect-playback-coordinator.test.ts apps/desktop/src/audio/audio-host.test.ts`; expect new module delivery/isolation cases to fail.
- [ ] Register `screen-effects` with module/unified/desktop capability and disabled/hidden-bottom defaults. Reuse existing purpose-scoped module browser-source setup and fixed profiles; no desktop URL/credential. Replace runtime composition's Alert-only lookup with a module-ID-to-runtime map; keep Alert profile eligibility and module-specific output behavior unchanged.
- [ ] Resolve one visual and at most two audio sources (explicit sound plus enabled video soundtrack) from the immutable snapshot. Uniformly fit the Landscape canvas to each output; apply only bounded existing animation values. Visual browser/desktop selections filter visual recipients, while item audio outputs filter audio recipients. Unified visual visibility never suppresses selected Browser Source audio. A module-specific plus unified browser source can still duplicate browser audio; retain explicit setup warnings rather than inventing cross-browser election.
- [ ] Collect recipient obligations before sending, bind one common start/end epoch, and settle browser, desktop, and device audio independently. Use module-qualified transport IDs for both queues where necessary; preserve existing legacy Alert API item IDs externally. Normal skip/completion stops only that occurrence. The shared desktop host may fail all desktop batches; the shared audio host may fail all audio batches on crash/2-second stop-timeout destruction. Notify every affected coordinator and leave healthy other recipient types running until normal completion/watchdog.
- [ ] Add tests for desktop-only, OBS-only, visual-only, audio-only, combined, hidden/reordered surfaces, multi-profile single device batch, missing monitor/device, prepare cancellation, stale generations, browser disconnect, host destruction with two active batches, and duration-plus-5-second expiry. Repeated close/late callbacks cannot advance a successor twice or replay interrupted work. Run focused coordinator/gateway/audio/foundation tests and `corepack.cmd pnpm typecheck`; expect pass. Prepare the module-delivery checkpoint.

### S3-6: Add merged authoritative operations and centralize safety

**Files**

- Create: `packages/core/src/playback/operations.ts`, its `.test.ts`, `apps/server/src/modules/playback/playback-operations-service.ts`, its `.test.ts`, `apps/server/src/http/routes/playback-operations.ts`, its `.test.ts`.
- Modify: `packages/core/src/index.ts`, `packages/core/src/config/types.ts`, `schemas.ts`, existing serialized safety configuration code in `apps/server/src/config/file-config-store.ts` only as needed, `apps/server/src/modules/playback/playback-coordinator.ts`, its `.test.ts`, `apps/server/src/runtime/runtime-composition.ts`, `apps/server/src/http/routes/playback.ts`, its `.test.ts`, `apps/server/src/app.ts`.
- Modify: `apps/web/src/operator/playback-api.ts`, its `.test.ts`, `OperatorApp.tsx`, its `.test.tsx` and `.stories.tsx` in that operator directory.
- Create: `tests/e2e/multi-module-operator.spec.ts`.

**Interfaces**

```ts
export interface OperationRow {
  moduleId: string; occurrenceId: string; name: string; summary: string;
  status: "queued" | "playing" | "completed" | "skipped" | "failed";
  enqueuedAtMs: number; completedAtMs: number | null; sequence: number;
  moduleQueuePosition: number | null;
}
export interface OwnerOperationsSnapshot {
  moduleId: string; paused: boolean; current: OperationRow | null;
  queued: OperationRow[]; recent: OperationRow[];
}
export interface QueueOwner {
  readonly moduleId: string;
  snapshot(): OwnerOperationsSnapshot;
  skip(occurrenceId: string): Promise<boolean>;
  remove(occurrenceId: string): Promise<boolean>;
  replay(occurrenceId: string): Promise<boolean>;
  clearPending(): Promise<number>;
  setPaused(paused: boolean): Promise<void>;
}
export interface MergedOperationsSnapshot extends PlaybackSafetyState {
  revision: number; owners: { moduleId: string; paused: boolean }[];
  current: OperationRow[]; queued: OperationRow[]; recent: OperationRow[];
}
export function mergeOperations(
  owners: readonly OwnerOperationsSnapshot[], safety: PlaybackSafetyState, revision: number
): MergedOperationsSnapshot;
```

Server operations routes: `GET /playback/operations`; `POST /playback/operations/:moduleId/:occurrenceId/skip|remove|replay`; `POST /playback/operations/:moduleId/clear` with `{ expectedPendingCount, observedRevision }`; `POST /playback/operations/:moduleId/pause` with `{ paused }`. Reuse existing global pause/resume/mute/unmute/DND routes through the shared service. Return conflict plus fresh snapshot for stale/wrong-state actions, not success against a replacement occurrence. Reject unknown module IDs before dispatch.

- [ ] Add this merged projection regression and targeted-action race tests:

```ts
import { expect, it } from "vitest";
import { mergeOperations } from "./operations.js";
it("keeps actual module positions while displaying enqueue chronology", () => {
  const early = { moduleId: "screen-effects", occurrenceId: "e", name: "Effect", summary: "Manual",
    status: "queued" as const, enqueuedAtMs: 1000, completedAtMs: null, sequence: 1, moduleQueuePosition: 2 };
  const late = { ...early, occurrenceId: "priority", enqueuedAtMs: 2000, sequence: 2, moduleQueuePosition: 1 };
  const result = mergeOperations([{ moduleId: "screen-effects", paused: false, current: null,
    queued: [late, early], recent: [] }], { paused: false, muted: false, doNotDisturb: false }, 1);
  expect(result.queued.map(row => [row.occurrenceId, row.moduleQueuePosition])).toEqual([["e", 2], ["priority", 1]]);
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/playback/operations.test.ts apps/server/src/modules/playback/playback-operations-service.test.ts apps/server/src/http/routes/playback-operations.test.ts`; expect missing projection/service/routes.
- [ ] Implement one adapter per existing queue, not a replacement scheduler. Normalize Alert ISO timestamps to epoch numbers at the adapter. Current rows use stable module ordering; pending rows use enqueue time then module ID/sequence/occurrence ID; recent rows use completion time descending with stable ties. Preserve each module's actual pending positions. Bound the merged response by underlying queue/history bounds; do not expose raw event payloads or media credentials.
- [ ] Move the existing serialized durable global safety mutation into the operations service and route both module coordinators plus tray/legacy APIs through it. Persist before publishing the new authoritative snapshot; failed persistence leaves prior state and queues unchanged. Initialize global and module safety before starting event intake/output. Global resume does not clear module pause. DND accepts admitted events but holds advancement; global pause lets current items finish. Mute applies to both browser and device audio, not visuals. Hardware failure is reported separately from persistence atomicity; do not claim a transaction spans Electron/OBS.
- [ ] Implement occurrence-qualified commands against owner state in one synchronous decision before async stopping. A stale skip returns conflict and the replacement remains playing; remove validates queued state; replay validates bounded recent state and reuses snapshots; clear only removes that module's pending work and rejects changed impact counts/revisions. Preserve the legacy Alert-only API adapter while its consumers migrate, without letting it bypass shared global safety.
- [ ] Replace runtime maintenance's Alert-only checks with aggregate `current.length > 0` and summed queued counts from queue owners before backup restore/reload. Reload configurations/safety through both owners without replaying interrupted content. Finish S3-2's restore gate with a test that an active or queued effect alone blocks replacement just as Alerts already do.
- [ ] Extend `OperatorApp` with multiple current rows, merged pending/recent rows, module badges/positions, per-row qualified controls, per-module pause/clear, and global safety controls. Retain last-known state on errors with stale labeling, visibility-aware polling, stable focus after removal, accessible status announcements, and no management editing navigation. Clear confirmation names module/count; do not show the merged list as global playback order.
- [ ] Add production stories for simultaneous current items, interleaved positions, stale skip conflict, empty/loading/error, paused module/global resume, and keyboard controls. Test auth/CSRF/origin/rate limits, wrong owner, expired IDs, failed persistence, no accidental Alert skip, and two concurrent source audio mute. Run focused core/server/Operator tests, `corepack.cmd pnpm typecheck`, and `corepack.cmd pnpm exec playwright test tests/e2e/multi-module-operator.spec.ts`; expect pass. Prepare the operations/safety checkpoint.

### S3-7: Build contextual inventory/editor and explicit bounded testing

**Files**

- Create: `apps/server/src/modules/screen-effects/effect-management-service.ts`, its `.test.ts`, `apps/server/src/http/routes/screen-effects.ts`, its `.test.ts`.
- Create: `apps/web/src/management/screen-effects/screen-effects-api.ts`, its `.test.ts`, `ScreenEffectsPage.tsx`, its `.test.tsx` and `.stories.tsx`, `ScreenEffectEditor.tsx`, its `.test.tsx` and `.stories.tsx`, `effect-editor-state.ts`, its `.test.ts`, `screen-effects.css` in that directory.
- Modify: `apps/server/src/app.ts`, `apps/server/src/runtime/runtime-composition.ts`, `apps/web/src/management/ManagementApp.tsx`, its `.test.tsx` and `.stories.tsx`, existing shared asset/output UI only where a reusable prop is needed.
- Create: `tests/e2e/screen-effects.spec.ts`.

**Interfaces**

- Protected routes: `GET/POST /screen-effects`, `GET/PUT/DELETE /screen-effects/:effectId`; explicit `POST /screen-effects/:effectId/test` accepts `{ variantId, confirmLiveImpact: true }` and returns the admitted module/occurrence identity or a structured rejection. Save accepts complete versioned documents; never accept payload-selected filesystem paths or commands.
- `updateEffectVariant(document: ScreenEffectDocument, variantId: string, update: (variant: EffectVariant) => EffectVariant): ScreenEffectDocument` in `effect-editor-state.ts`, reused by undoable local editor actions.
- Explicit local Preview renders a bounded draft without provider events and is silent by default. Live Test names all enabled destinations, uses the saved exact selected variant (no random reroll), and follows admission/capability/safety/capacity rules. Disabled effects cannot run live Test until enabled; preview may inspect a disabled draft without live output.

- [ ] Write source independence and draft tests, along with server auth/invalid-document cases. A self-contained shared-control anchor:

```tsx
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaAudioControls } from "../audio/MediaAudioControls.js";
it("uses the same explicit soundtrack control for an effect", () => {
  const onChange = vi.fn();
  render(<MediaAudioControls value={{ playEmbeddedAudio: false, audioVolume: 0.3 }}
    hasSeparateAudio onChange={onChange} />);
  expect(screen.getByRole("checkbox", { name: "Play embedded audio" })).not.toBeChecked();
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run apps/web/src/management/screen-effects apps/server/src/http/routes/screen-effects.test.ts`; expect the new editor/routes workflow tests to fail before implementation, even though the reused audio-control anchor already passes.
- [ ] Build the inventory with create/copy/edit/enable/delete, safe effect labels, compact Browser sources, and trigger status links. Create initially opens a local disabled draft; persist only after its first valid media selection and explicit Save, rather than saving an invalid empty definition. Build a focused one-visual/one-sound variant editor with default/weighted variants, duration, priority/cooldown, bounded layout/animation, saved local asset picker, visual destinations, and existing item-wide audio outputs. New videos use `createVideoAudioSettings()`; adding a separate sound cannot change that switch. No general composition tool or new Shared audio navigation.
- [ ] Implement immutable draft updates and bounded Undo/Redo using the existing editor pattern; save only on explicit user action, retain draft on failed save, and confirm live impact for enabled effects. Route/device references are validated server-side at save and again at dispatch. Show missing/deleted rewards, missing configured subscriptions, disconnected displays/devices, no destinations, and unsupported media distinctly. Mere selection or slider changes must not emit sound, event subscriptions, or live tests.

```ts
return { ...document, variants: document.variants.map(variant =>
  variant.id === variantId ? update(variant) : variant) };
```

This is the immutable update inside `updateEffectVariant`; reject an unknown variant ID before returning so failed actions do not create misleading history entries. Validate the resulting draft at save, while showing field-level draft errors locally.

- [ ] Implement explicit Preview/Test confirmation showing OBS, desktop, and selected audio route names. Preview stays local and bounded, with no live audio by default; Test uses the real queue with `operatorTest` marking and rejects disabled/invalid/fully unavailable work visibly. Under pause/DND it may be admitted but held, matching the existing queue intake contract; explain that state instead of bypassing safety. No automatic subscription/reward creation, redemption completion, refunds, or commands.
- [ ] Add production stories for new disabled effect, audio-only, video plus sound, weighted variants, missing trigger, no outputs, failed save, and neutral live-test confirmation. Playwright covers create/save/reload/copy/enable, explicit preview/test, event-to-queue via isolated validated fixtures, no-output behavior, snapshot replay, surface order, and failed save without live mutation. Run focused server/editor tests, `corepack.cmd pnpm typecheck`, and `corepack.cmd pnpm exec playwright test tests/e2e/screen-effects.spec.ts`; expect pass. Prepare the authoring checkpoint.

### S3-8: Verify concurrency, physical outputs, recovery, and final handoff

**Files**

- Create: `tests/desktop/screen-effects.spec.ts`, `docs/verification/screen-effects.md`.
- Modify: `tests/e2e/screen-effects.spec.ts`, `tests/e2e/multi-module-operator.spec.ts`, `docs/product-plan.md`, `docs/backlog.md`, `docs/mvp-runbook.md`.
- Update implementation evidence/checkmarks in `openspec/changes/add-screen-effects-module/tasks.md` only when each corresponding gate is satisfied.

- [ ] Run the [shared verification commands](2026-09-08-screen-effects-implementation.md#shared-verification-ledger) and `openspec.cmd validate add-screen-effects-module --strict`. Revalidate the overlapping Alert/Operator deltas against both delivered foundations; retain all inherited soundtrack/mute scenarios. Record actual gate outcomes and classify any failures without weakening tests.
- [ ] Rebuild/restart the authorized runtime, verify health, reload management, and follow create → save → enable → explicit test → Operator → OBS/desktop with neutral media. Verify Twitch reward and configured Streamer.bot fixtures independently under the single-active-provider model; do not mutate live channel rewards for QA.
- [ ] Run a simultaneous Alert/effect with Browser Source audio and explicit physical routes. Skip effect while Alert continues, then reverse. Verify no overlap between two effects, priority/FIFO pending behavior, chronological merged positions, stale skip rejection, scoped clear/pause, global pause/resume/mute/DND, exact-snapshot replay after editing, and no duplicate device soundtrack across visual surfaces.
- [ ] Test missing monitor/device, disappeared asset/route, browser disconnect, unsupported/trackless/oversized soundtrack, renderer/service crash, late acknowledgements, shared-host destruction affecting both modules, healthy visual continuation, management hidden, restart-empty queues, restore while effect-only work exists, disabled imported definitions, and bounded native Quit. Use the existing ownership-safe Windows harness; do not weaken unrelated process-exit tests.
- [ ] Record physical display/input/audio and OBS evidence separately from synthetic sinks and UI tests. Include the configured provider/subscription boundaries without secrets or raw payloads. Reconcile each scenario below with test names/evidence. Sync only completed specs and update product/runbook/backlog; retain marketplace, cross-platform/cloud/injection/distribution and unrelated modules as deferred. Hand off the local slice; publish or merge only with separate authorization.

## Coverage map

| Normative requirement | Implementation/verification tasks |
| --- | --- |
| Operators Author Local Screen Effects | S3-1, S3-2, S3-7 |
| Variants Resolve Coordinated Trusted Media | S3-1, S3-4, S3-5, S3-7 |
| Effect Triggers Use Existing Event Sources | S3-3, S3-4, S3-7 |
| Effect Admission Is Deduplicated And Bounded | S3-3, S3-4, S3-8 |
| Screen Effects Playback Is Sequential And Independent | S3-4, S3-5, S3-8 |
| Occurrences Snapshot Their Selected Variant | S3-1, S3-4, S3-8 |
| Effect Operations Preserve Local Safety Boundaries | S3-2, S3-5, S3-6, S3-7, S3-8 |
| Operator Merges Views Without Merging Schedulers | S3-6, S3-8 |
| Commands Target The Owning Module And Occurrence | S3-5, S3-6, S3-8 |
| Global Safety Is Authoritative Across Queue Owners | S3-4, S3-6, S3-8 |
| Concurrent Media Ownership Is Occurrence Scoped | S3-5, S3-6, S3-8 |
| Merged Operations Retain Security And Accessibility | S3-6, S3-7 |
| Playback Operations Use A Separate Operator Surface | S3-6 |
| Operator Surface Shows Authoritative Playback State | S3-6 |
| Existing Playback Controls Are Directly Operable | S3-5, S3-6, S3-8 |
| Named Routes Bind Explicit Local Devices | S3-2, S3-5, S3-7, S3-8 |

OpenSpec task groups: `1.1–1.2 → index entry gates`; `2.1–2.2 → S3-1`; `2.3–2.5 → S3-2`; `3.1 → S3-3`; `3.2–3.4 → S3-4`; `4.1–4.5 → S3-5`; `5.1–5.4 → S3-6`; `6.1–6.4 → S3-7/S3-8`; `7.1–7.3 → S3-8`. Passing automation alone does not satisfy physical output acceptance.
