# Alert Audio Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Default to one agent; delegate only with applicable authorization. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every visible explicit audio layer in an alert to one shared selection of Browser Source and named local devices, including device-only playback while management is hidden.

**Architecture:** Resolve canonical audio once before visual-profile expansion. The server queue coordinates both browser recipients and an injected desktop audio sink; a dedicated hidden Electron renderer owns media elements and device sinks. Named routes persist in SQLite while hardware bindings are excluded from portable exports.

**Tech Stack:** Existing TypeScript/Zod, Node/Fastify, SQLite repositories, React/Vite, Vitest, Storybook and Playwright, plus the implemented Electron desktop runtime. No native audio driver or new UI library.

**Spec:** [Proposal](../../../openspec/changes/add-alert-audio-routing/proposal.md), [design](../../../openspec/changes/add-alert-audio-routing/design.md), and all five [capability deltas](../../../openspec/changes/add-alert-audio-routing/specs). The OpenSpec [tasks](../../../openspec/changes/add-alert-audio-routing/tasks.md) are the authoritative completion ledger. Dependency: implemented and verified [desktop foundation](2026-09-03-windows-desktop-tray-runtime.md), not merely its apply-ready artifacts.

## Global Constraints

- Every visible explicit audio layer SHALL inherit that selection and retain its layer volume.
- The system SHALL NOT expose per-layer routing overrides or a special combined-output enum.
- Device playback SHALL NOT require a connected or visually ready Browser Source profile.
- The system SHALL fail closed for unavailable, disconnected or rejected device sinks.
- Browser-speech and Speaker.bot routing SHALL remain unchanged. The separate video-shoutout module SHALL NOT be altered by this policy.
- Defaults: Browser Source true; deviceRouteIds empty. Explicitly empty output selection means silence for explicit audio only.
- Preview never dispatches configured live device routes. Send test uses real downstream delivery and selected-document semantics, not sibling matching.
- Keep existing strict TypeScript/ESM boundaries, management authentication/CSRF/origin/rate-limit controls, OS keyring, and protected overlay assets.
- Playback loading deadline: 5 seconds; stop acknowledgement: 2 seconds; completion watchdog: alert duration plus 5 seconds; worker ownership lease: 10 seconds, refreshed every 2 seconds.
- No installer/updater, OBS automation, extra Browser Sources, TTS routing, video extraction, native audio driver, automatic default output, DSP or sample-accurate synchronization.
- Real-device checks use isolated data and explicit permission to emit sound; never reveal secret live overlay URLs or mutate the user's OBS setup without approval.

## File And Responsibility Map

Paths are repository-relative and resolve from the execution checkout. New files are explicitly identified; co-locate their unit tests.

| Area | Files | Responsibility |
| --- | --- | --- |
| Audio contracts | new `packages/core/src/audio/{types,schemas,audio-output-route-repository,resolve-audio-destinations}.ts`; existing core `index.ts`, `management/contracts.ts` | Outputs, routes, device batches/results, validation and destination resolution |
| Canonical playback | new `packages/core/src/audio/resolve-alert-audio.ts`; existing `alerts/alert-resolver.ts`, `playback/{types,schemas,playback-queue}.ts` | One audio record per chosen document, audio-only admission and replay |
| Persistence/API | new `apps/server/src/modules/audio/{audio-output-service,sqlite-audio-output-route-repository,desktop-audio-sink}.ts`, `apps/server/src/http/routes/audio-outputs.ts`, next `modules/db/migrations/019-audio-output-routes.ts` if 019 remains free | Route CRUD/reference integrity, device bridge and protected actions |
| Runtime | existing `apps/server/src/modules/playback/playback-coordinator.ts`, `modules/alerts/{alert-editor-service,alert-set-management-service,sqlite-alert-editor-document-repository}.ts`, `runtime/runtime-composition.ts`, `http/routes/management-ui.ts` | Shared test/live dispatch, async completion and host injection |
| Desktop audio | new `apps/desktop/src/audio/{audio-window,audio-preload,audio-ipc,player,start-bound-audio}.ts`, `audio/player.html`; existing desktop main/worker/supervisor/Forge config | Isolated persistent player, media lifecycle, permissions and generations |
| Management/overlay | new `apps/web/src/management/settings/AudioOutputsPanel.tsx`, `apps/web/src/management/alerts/editor/AlertAudioOutputs.tsx`, `apps/web/src/management/audio/audio-api.ts`; existing SettingsPanel, AlertEditorPage/editor-state, AlertSetsPage, management API, DiagnosticsPanel, OverlaySurface | Named routes, alert selection, device-aware tests and silent alert videos |
| Backup/tests/docs | existing backup service/snapshot repository/maintenance gate and tests; new `tests/desktop/audio-routing.spec.ts`, `tests/e2e/management-audio-routing.spec.ts`; runbook and implementation evidence | Portable metadata, exact rollback, UI and actual-device proof |

Re-evaluate only the migration number after fetching the execution base. Keep its name/DDL purpose unchanged and update all references if renumbered. Follow the repository database-schema skill when updating generated schema documentation during implementation.

## Shared Interfaces

Define these in core audio types/schemas during Task 2; adapters consume them without importing Electron. `ResolvedAlertAudio` is stored with the queue item, but device IDs exist only in runtime dispatch and management device status.

```ts
export interface AlertAudioOutputs {
  readonly browserSource: boolean;
  readonly deviceRouteIds: readonly string[];
}
export interface AudioOutputRoute {
  readonly id: string;
  readonly name: string;
  readonly deviceId: string | null;
  readonly deviceLabel: string | null;
}
export interface ResolvedAudioLayer {
  readonly layerId: string;
  readonly assetId: string;
  readonly volume: number;
}
export interface ResolvedAlertAudio {
  readonly documentId: string;
  readonly durationMs: number;
  readonly outputs: AlertAudioOutputs;
  readonly layers: readonly ResolvedAudioLayer[];
}
export interface AudioDestination {
  readonly deviceId: string;
  readonly routeIds: readonly string[];
}
export interface DeviceAudioBatch {
  readonly playbackId: string;
  readonly documentId: string;
  readonly durationMs: number;
  readonly muted: boolean;
  readonly layers: readonly ResolvedAudioLayer[];
  readonly destinations: readonly AudioDestination[];
}
export interface DeviceAudioResult {
  readonly failedRouteIds: readonly string[];
}
export interface AudioPlaybackSink {
  play(batch: DeviceAudioBatch): Promise<DeviceAudioResult>;
  stop(playbackId: string): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  close(): Promise<void>;
}
```

`play` settles at terminal completion, not merely on start. Failure must retain route-specific safe diagnostic details in the service; `failedRouteIds` permits coordinator aggregation. `stop` resolves only when silence is established or the owned renderer has been destroyed. Cancellation by occurrence is permanent so a delayed start cannot revive skipped audio. Desktop wire schemas add request ID, renderer generation and bounded asset byte payloads; these transport-only fields are not persisted in queue snapshots.

## Task 1: Prove packaged output-device capability

**OpenSpec tasks:** 1.1-1.4. Files: desktop audio window/preload/player, `tests/desktop/audio-routing.spec.ts`; create `docs/verification/alert-audio-routing.md` only when recording actual implementation evidence.

**Interfaces:** New browser-compatible `BoundAudioElement` in `start-bound-audio.ts` has `volume: number`, `muted: boolean`, `setSinkId(id: string): Promise<void>`, `play(): Promise<void>`, and `pause(): void`. Export `startBoundAudio(element, deviceId, volume, muted, isCurrent: () => boolean): Promise<void>`; no playback before sink success/current-occurrence check.

- [ ] Fetch current remote and verify desktop implementation, runtime subpath, packaged executable, isolated preload and lifecycle tests actually exist. Branch from current origin/main with the approved worktree workflow. Commit the routing spec before or with implementation; do not mark this dependency satisfied from OpenSpec artifact status.
- [ ] Add and run this failing test at `apps/desktop/src/audio/start-bound-audio.test.ts`:

```ts
import { expect, it, vi } from "vitest";
import { startBoundAudio } from "./start-bound-audio.js";

it("never plays on the default device after sink selection fails", async () => {
  const element = {
    volume: 1, muted: false,
    setSinkId: vi.fn(async () => { throw new Error("missing device"); }),
    play: vi.fn(async () => {}), pause: vi.fn()
  };
  await expect(startBoundAudio(element, "headphones", 0.4, false, () => true)).rejects.toThrow("missing device");
  expect(element.play).not.toHaveBeenCalled();
});
```

Run: `corepack.cmd pnpm exec vitest run apps/desktop/src/audio/start-bound-audio.test.ts`.

- [ ] Implement sink-first ordering, then add cancellation-after-sink-resolution and initial-mute regressions:

```ts
export async function startBoundAudio(
  element: BoundAudioElement, deviceId: string, volume: number,
  muted: boolean, isCurrent: () => boolean
): Promise<void> {
  element.muted = muted;
  element.volume = volume;
  await element.setSinkId(deviceId);
  if (!isCurrent()) return;
  await element.play();
}
```

Production player must reapply the latest authoritative mute immediately before play after an async sink wait; Task 4 tests changes while this promise is pending.

- [ ] Register an allowlisted bundled-player origin `stream-jams-audio://player/`, a dedicated persistent session, both speaker-selection permission handlers, isolated preload, hidden window and disabled background throttling. Use the official [protocol API](https://www.electronjs.org/docs/latest/api/protocol); no arbitrary path resolution or CSP bypass. Reject microphone/camera requests, unknown origins/subframes and default/communications device aliases.
- [ ] Package and manually verify two real outputs independently and together using a tiny fixture, without mic permission or an interactive playback prompt. Repeat while management is hidden, after restart, and after unplug/replug. Record Electron version, endpoint labels (no secret URLs), results and gaps. If this fails, stop here and request a backend decision; do not implement a native alternative or grant microphone permission. Only after passing, commit the bounded player boundary and continue.

## Task 2: Contracts, named routes and referential persistence

**OpenSpec tasks:** 2.1-2.5. Files: core audio/contracts, server route repository/service/HTTP route, migration/database registry and tests, alert-save reference validation.

**Interfaces:** `AudioOutputRouteRepository` exposes synchronous `list(): readonly AudioOutputRoute[]`, `findById(id: string): AudioOutputRoute | null`, `save(route: AudioOutputRoute): void`, and `delete(id: string): void` for transaction-scoped use. `AudioOutputService` owns async device enumeration and HTTP command validation; database checks/mutations happen synchronously inside `runInTransaction`, never across an await. `resolveAudioDestinations(routeIds, routes, availableDeviceIds)` returns `{ destinations: readonly AudioDestination[]; unavailableRouteIds: readonly string[] }`.

- [ ] Add a failing `packages/core/src/audio/schemas.test.ts`:

```ts
import { expect, it } from "vitest";
import { alertAudioOutputsSchema } from "./schemas.js";

it("distinguishes absent defaults from intentionally silent output", () => {
  expect(alertAudioOutputsSchema.parse(undefined)).toEqual({ browserSource: true, deviceRouteIds: [] });
  expect(alertAudioOutputsSchema.parse({ browserSource: false, deviceRouteIds: [] }))
    .toEqual({ browserSource: false, deviceRouteIds: [] });
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/audio/schemas.test.ts`, then implement:

```ts
export const alertAudioOutputsSchema = z.object({
  browserSource: z.boolean(),
  deviceRouteIds: z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length)
}).default({ browserSource: true, deviceRouteIds: [] });
```

Add it to editor documents, defaults/create/copy/duplicate/variation/re-theme paths. Test absent old fields, multiple routes, duplicate IDs, invalid IDs and independence between sibling variations. Preserve existing disabled/review safeguards.

- [ ] Add the next migration with `audio_output_routes(id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, device_id TEXT, device_label TEXT)` and a check that device binding fields are both null or both populated. Validate trimmed nonempty names in service/schema; treat name identity using SQLite NOCASE semantics and display stable route IDs where names alone would be ambiguous. Add migration/repository restart tests; register with existing database migrations. Do not mutate existing migration files.
- [ ] Implement transaction-scoped save-reference validation and referenced-route deletion rejection. Prevent deletion/save races, including backup restore. Test create/rename/bind/unbind, missing-ID save, reference-conflict 409 and rollback preserving prior records. Device binding occurs only to an enumerated explicit output; saving an unrelated alert while its bound device is absent preserves the route reference.
- [ ] Implement the authenticated `/audio/routes` GET/POST, `/audio/routes/:routeId` PATCH/DELETE, `/audio/devices` GET, `/audio/status` GET and `/audio/routes/:routeId/test` POST. Existing management hooks enforce CSRF, origin/rate limits. Return capability/unavailable states without falling back; return safe cause/next-step/reference errors. Tests must prove rejected requests never touch the audio sink. Run core audio, server audio, HTTP route, database and editor-save tests plus typecheck; commit this slice.

## Task 3: Canonical audio and audio-only queue admission

**OpenSpec tasks:** 3.1-3.4. Files: core resolver/playback entries, server coordinator and editor test normalization.

Execution checkpoint (September 6): OpenSpec tasks 3.1–3.4 are complete locally; see [verification](../../verification/alert-audio-routing-canonical-queue.md). The canonical helper lives with the core audio contracts. Minimal server-side sink completion/cancellation was pulled forward from task 4 to verify real occurrence-start binding snapshots. Production desktop transport and full safety acceptance remain task 4; destination-aware editor test dispatch remains task 5. Commit/publication has not been requested, and the OpenSpec task list remains the authoritative completion ledger.

**Interfaces:** `resolveAlertAudio(document: AlertEditorDocument): ResolvedAlertAudio | null` normalizes visible audio without checking browser connectivity or choosing siblings; live caller enforces matching/enabled state, while explicit selected-document tests retain their existing ability to test drafts. Add `audio: readonly ResolvedAlertAudio[]` to queue items/schemas and optional `audio` to `EnqueuePlaybackItemInput` for compatible callers (normalized to empty).

- [ ] In existing `packages/core/src/playback/playback-queue.test.ts`, add this failing case using its existing `createQueue`, `MutableClock` and `createCheerEvent` helpers:

```ts
it("admits audio-only work and gives replay a new occurrence", () => {
  const queue = createQueue(new MutableClock("2026-09-03T12:00:00.000Z"));
  const audio = [{ documentId: "alert-a", durationMs: 1000,
    outputs: { browserSource: false, deviceRouteIds: ["route-a"] },
    layers: [{ layerId: "sound-a", assetId: "asset-a", volume: 1 }] }];
  const first = queue.enqueue({ sourceEvent: createCheerEvent(), alerts: [], audio });
  expect(first.current?.audio).toEqual(audio);
  const firstId = first.current!.id;
  queue.completeCurrent();
  const replay = queue.replayRecent(firstId);
  expect(replay.current?.id).not.toBe(firstId);
  expect(replay.current?.audio).toEqual(audio);
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/playback/playback-queue.test.ts`, then change queue admission/serialization/replay together:

```ts
const audio = input.audio ?? [];
if (input.alerts.length === 0 && audio.length === 0) return this.getSnapshot();
// Store a defensive copy of audio with the queue item and include it in
// snapshot schema/serialization and replayRecent's new enqueue call.
```

- [ ] Build `resolveAlertAudio` from the chosen editor document before `targets.flatMap`. Cover multiple profiles, legacy visual paths, two layers sharing an asset, hidden layers, layer volumes, disabled alerts and selected-variation identity. Include device batches only when there are selected device routes; browser audio remains in existing overlay instructions only when its flag is enabled. Never put device IDs in overlay payloads or use a visual profile to deduplicate device audio.
- [ ] Extend `resolveAudioDestinations` tests for same-device aliases, distinct devices, missing IDs and no default fallback. Snapshot route bindings at occurrence start. Preserve content/route IDs across replay while resolving current bindings; no current occurrence retargeting after save/rebind. Run core alerts/playback/audio and server coordinator tests plus typecheck; commit.

## Task 4: Player transport, completion and safety controls

Execution checkpoint (September 7, 2026): OpenSpec tasks 4.1–4.6 are implemented and verified locally. The testable media engine lives in `apps/desktop/src/audio/device-audio-player.ts` with its matching test file; `player.ts` is the browser/IPC entrypoint. Production transport shares one absolute startup deadline across stages. See [desktop safety verification](../../verification/alert-audio-routing-desktop-safety.md) for tests, reviewed fixes and the silent packaged result. The detailed steps below remain the original implementation recipe; the OpenSpec task list is authoritative for completion. No commit/publication or final physical-device/OBS acceptance is implied.

**OpenSpec tasks:** 4.1-4.6. Files: desktop player/IPC/window, server desktop-audio-sink/coordinator/composition, safety API and tests.

**Interfaces:** Implement the shared `AudioPlaybackSink` through a validated worker/main bridge. `AudioOutputService` supplies current bindings/status; the sink resolves authorized asset IDs server-side, not renderer-supplied paths. Add renderer generation/request ID to every wire event. `play` returns terminal route results and `stop` establishes silence before resolving.

- [ ] Add a focused failing test in `apps/desktop/src/audio/player.test.ts` for stopping while sink selection is pending. Use a manually controlled promise and an injected element factory: start a batch, call stop, resolve sink selection, and assert `play` was never called. Also assert a mute update during the same wait is applied before any subsequent play. Run `corepack.cmd pnpm exec vitest run apps/desktop/src/audio/player.test.ts` before wiring callbacks.
- [ ] Implement cancellation by immutable occurrence keys and generation, not asset ID. Re-check cancellation and read current mute immediately before play:

```ts
await element.setSinkId(destination.deviceId);
if (cancelled.has(playbackId) || generation !== activeGeneration) return;
element.muted = currentMuted;
await element.play();
```

Define `cancelled: Set<string>`, `activeGeneration: number`, and `currentMuted: boolean` in the player lifecycle; prune occurrence tombstones only after all pending starts settle, and clear generation state on renderer destruction. Track every element and Blob URL for pause/removal/revocation on all terminal paths. Enforce current asset byte limits and per-batch asset deduplication; no unbounded cache.

- [ ] Register coordinator pending tokens before calling `sink.play`. Settle every success, rejection, disconnect, crash and watchdog path. Browser and device tokens are independent; one failure must not clear healthy tokens. Add deterministic coordinator tests for synchronous/async completion, zero browsers, two profiles/one device dispatch, one failed recipient, loading deadline, duration timeout and late old-generation acknowledgement.
- [ ] Extend skip to await local stop before queue advancement/delivery; after 2 seconds without acknowledgement, main destroys only the owned audio renderer, then resolves stop. Add a regression proving the next `play` happens after old `pause` or renderer destruction. Shutdown cancels without starting the next queued item. Apply persisted safety state before first/recreated player use; failure to persist a safety change must not apply it to one path only. Preserve current pause/DND and external-TTS rules.
- [ ] Handle devicechange with explicit-ID reconciliation and warnings; never select default on loss. Fail pending work on renderer crash, allow one future-only recreation, and require explicit retry after another crash. Service exit/IPC close stops the player; a 2-second worker lease refresh with a 10-second expiry is the bounded backstop. Test no stale replay, lease expiry, generation change, restored global mute, and renderer cleanup while management remains hidden.
- [ ] Run core/server playback, desktop audio, playback HTTP and existing TTS tests; run typecheck and packaged smoke. Commit only when queue and player safety agree.

## Task 5: Device-aware management, tests and silent alert video

Execution checkpoint (September 7): OpenSpec tasks 5.1–5.5 are complete locally. Settings, editor/history/live-impact and destination-aware Send test are integrated, and alert videos are visual-only without moving TTS or video-shoutout audio. The original recipe below remains historical; the OpenSpec task list is the authoritative completion ledger. See [authoring and acceptance verification](../../verification/alert-audio-routing-authoring-acceptance.md) for review fixes, automated gate evidence and manual boundaries. Commit/publication remains unrequested.

**OpenSpec tasks:** 5.1-5.5. Read the frontend skill and routed UX/style documents before editing; relevant UX sections are Save And Auto-Save, Confirmation Pattern, Browser Sources, Alert Editor, Preview And Send Test, Diagnostics, and Settings And Backup.

**Interfaces:** `AlertAudioOutputs` UI component receives `{ value: AlertAudioOutputs; routes: readonly AudioOutputRoute[]; onChange(value: AlertAudioOutputs): void }` with an aliased import for the identically named core type. `AudioOutputsPanel` uses `audio-api.ts` for validated CRUD/status/test responses. Extend `AlertEditorTestRequest.targetProfileId` to allow null for explicit device-only tests; browser delivery is omitted for null. Extend test results with delivered/unavailable destination summaries without removing the reference ID/test marker.

- [ ] Add and run a failing editor-state regression for changing outputs and Undo/Redo, using the current editor-state fixtures. Add a component regression asserting one Browser Source checkbox plus named-route controls, with no per-layer destination field. Run `corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor`.
- [ ] Implement a controlled alert-level update; preserve selections for unavailable routes:

```ts
const deviceRouteIds = checked
  ? [...value.deviceRouteIds, routeId]
  : value.deviceRouteIds.filter((id) => id !== routeId);
onChange({ ...value, deviceRouteIds });
```

Here `checked` is the named-route checkbox value and `routeId` is its stable route ID; `value`/`onChange` are the component props. Feed this through existing editor-state history and save validation rather than persisting from the control. Include outputs in live-impact detection and show affected route names.

- [ ] Build the route manager with create/rename/bind/delete, explicit one-second test, safe failures, missing/rebind states and desktop-unavailable explanation. Bind changes require explicit save/impact confirmation; device dropdown changes alone must never play. Add real-component stories for loaded/empty/loading/error/unavailable/deletion-conflict/test-muted states. Include native labels, focus and screen-reader status tests.
- [ ] Refactor server/editor/inventory Send test to use canonical audio plus destination-specific availability. Keep selected draft/saved document and existing Include audio/Include TTS defaults. Test device-only with targetProfileId null, unavailable/invalid visual profile plus healthy device, browser-only disconnected rejection, partial success summaries, no deliverable content, includeAudio false and preview isolation. Preserve same Browser Source URLs, readiness telemetry and autoplay recovery. Preview must not invoke `/audio` test or live routing APIs.
- [ ] Force mute for alert videos in canvas/preview/OverlaySurface, including legacy video visuals, without muting other module players. Add video-containing alert upgrade warnings and tests that audio/TTS layers remain independent. Add `tests/e2e/management-audio-routing.spec.ts` for route assignment/save/reload/undo/preview/test; reuse typed mock boundaries for deterministic CI and real service integration where available. Run relevant web/server tests, Storybook gates, Playwright and typecheck; commit.

## Task 6: Backup, diagnostics and real-output acceptance

Final execution checkpoint (September 7): OpenSpec tasks 6.1–6.5 are complete locally (29/29 routing tasks overall). Existing SQL portable projection was reused; no duplicate `toPortableAudioRoute` helper was needed. Archive/rebind/rollback and real runtime restore-activity tests, the runbook and migration-derived schema documentation are complete. The numbered manual checklist and all separately readiness-gated assisted checks have user acceptance; the unchanged silent packaged lifecycle test passed again at sign-off. See the [scenario reconciliation and acceptance matrix](../../verification/alert-audio-routing-authoring-acceptance.md) for measured results and retained harness/shutdown observations. The original steps below remain the implementation recipe; OpenSpec tasks are the authoritative completion ledger. No external process investigation, publication, archive or main-spec synchronization was performed.

**OpenSpec tasks:** 6.1-6.5. Files: existing backup snapshot/service/maintenance gate and tests, route Diagnostics integration, runbook, schema documentation and actual evidence record.

**Interfaces:** Add `toPortableAudioRoute(route: AudioOutputRoute): AudioOutputRoute` in the audio service module; snapshot export uses it, operational restore-point capture does not. Restore clears bindings and validates assignment references before mutation. Device playback contributes to the existing runtime-maintenance gate.

- [ ] Add this failing regression in `apps/server/src/modules/audio/audio-output-service.test.ts` and run that focused file:

```ts
it("exports identity without exporting or mutating a local binding", () => {
  const local = { id: "private", name: "Headphones", deviceId: "endpoint-a", deviceLabel: "USB headset" };
  expect(toPortableAudioRoute(local)).toEqual({ ...local, deviceId: null, deviceLabel: null });
  expect(local.deviceId).toBe("endpoint-a");
});
```

Import `toPortableAudioRoute` from the module under test alongside the file's normal Vitest imports.

- [ ] Implement the explicit portable projection and add the table to backup mapping/order/reference validation and local-only allowlist:

```ts
export function toPortableAudioRoute(route: AudioOutputRoute): AudioOutputRoute {
  return { ...route, deviceId: null, deviceLabel: null };
}
```

- [ ] Test full archive round trip, orphan-reference preflight rejection, schema drift, old incompatible archive rejection, safety-backup failure, and forced restore rollback retaining exact prior device bindings. Test restore blocked by device-only and route-test playback, including a start/restore race. Ensure route tests acquire the existing runtime activity gate and release it on every outcome. Restore result names routes requiring rebind; never auto-fallback.
- [ ] Add safe per-route diagnostics with cause/next step/reference, and operator links to correction UI. Keep hardware bindings out of overlay payloads and portable exports; never put tokens or secret URLs in stories, logs or evidence. Update runbook with Browser Source-only, device-only, combined, disconnected-device, video migration and restore instructions; explain OBS capture/monitoring and latency limits.
- [ ] Run all gates below and manually verify the packaged app with OBS and two endpoints. Verify each output mode, multiple layers/same-asset layers, two profiles without duplicated device playback, hidden management, app restart, device loss/rebind, mute/skip/replay, player crash and Quit. Check actual output capture, not merely a resolved `play()` promise. Record hardware-dependent gaps honestly. Commit the verified in-scope result; publication remains a separate request.

## Required Gates And Hardware Matrix

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
corepack.cmd pnpm desktop:package
corepack.cmd pnpm test:desktop
openspec.cmd validate add-alert-audio-routing --strict
```

Rebuild/restart owned services, wait for health and verify the changed UI against that build. CI doubles verify routing/queue contracts; actual device and OBS checks verify sound reaches the intended outputs. Neither substitutes for the other. Do not change OBS capture settings or install virtual drivers without separate authorization.

| Requirement group | Execution task |
| --- | --- |
| Desktop availability, permission/sink gate, hidden lifetime | 1, 4 |
| Alert outputs/defaults/variation inheritance | 2, 3, 5 |
| Named route integrity and protected APIs | 2, 5 |
| No per-profile duplication, audio-only/replay | 3, 4 |
| Timers, cancellation, crash/reconnect, mute/skip/DND | 4 |
| Preview versus Send test and video/TTS boundaries | 5 |
| Portable route metadata, exact rollback, restore activity gate | 6 |
| Diagnostics, real-device/OBS evidence and documentation | 6 |

The two change packages add distinct backup requirements, so this change must preserve the desktop preference requirement when eventually synchronizing specs. Do not archive either change or mark runtime acceptance complete merely because the planning documents validate.
