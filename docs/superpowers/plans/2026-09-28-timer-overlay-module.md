# Timer Overlay Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable, server-authoritative timers that can be controlled from Management, Operator, or a scoped loopback HTTP API and rendered consistently in browser and desktop overlays with optional icons and start/end sounds.

**Architecture:** Persist timer definitions and per-profile stack presentation in SQLite, but keep active generations in an in-memory `TimerRuntimeCoordinator`. Broadcast lifecycle snapshots with absolute deadlines through an additive overlay-module presentation payload, render countdown ticks locally, and synchronize the same payload to the desktop renderer. Keep cue admission separate from visual projection and protect automation routes with one revocable hash-only bearer credential that has timer-only authority.

**Tech Stack:** TypeScript 6, Zod 4, Node 24, Fastify 5, SQLite, React 19, Electron 44, Vitest, Testing Library, Storybook, and Playwright.

**Spec:** `openspec/changes/add-timer-overlay-module/`

## Global Constraints

- A saved timer definition has one stable opaque ID and at most one active generation. Different definitions may run concurrently.
- Durable state includes definitions, icon/cue references, output selections, and Landscape/Vertical stack configuration. Running, paused, and completed generations never persist and never restore.
- Runtime transitions are `idle -> running <-> paused -> completed -> idle`; completion displays `00:00` for exactly 3,000 ms. Stop hides immediately and emits no end cue.
- Start while running or paused is a successful no-op. Pause, resume, and stop are idempotent. Restart always creates a full-duration generation and emits the start cue once. Resume never emits the start cue.
- Active generations use immutable definition and route snapshots. Editing a definition affects the next generation; deleting an active definition returns a conflict.
- The server owns lifecycle transitions and absolute deadlines. Browser and desktop renderers derive display time locally and receive updates only for lifecycle/configuration changes and reconnect snapshots.
- Timer cards use equal dimensions within one bounded profile region. Completed-hold cards sort first, running cards by earliest end time, and paused cards below running by frozen remaining time; stable timer ID breaks ties. Overflow is a `+N more` badge that does not consume a card slot.
- Icons accept only existing image/GIF assets. Start and end cues accept only existing audio assets. Missing icon delivery omits the icon; cue failure is diagnosed but cannot alter timing.
- Visual surface visibility is independent from cue routing. Browser Source and named local-device audio follow existing explicit routing semantics.
- Automation stays loopback-only, rejects requests carrying an `Origin` header, accepts only its dedicated bearer, and exposes only list/state plus start, pause, resume, stop, and restart. It never accepts authoring fields or duration overrides.
- The raw automation bearer is returned only by create/rotate. SQLite stores only a verifier and metadata. Token material is excluded from logs, diagnostics, overlays, browser bundles, screenshots, URLs, and portable backups.
- Production overlays remain transparent and fail closed. Management and Operator surfaces own actionable errors.

## Review Focus

- Confirm generation guards prevent stale completion, audio, or desktop callbacks from changing a replacement run.
- Confirm the new long-lived module presentation path is additive and does not change Alert or Screen Effect playback completion semantics.
- Confirm browser and desktop countdowns use the same authoritative epochs and clean up every local tick/listener.
- Confirm automation authentication cannot cross into management/overlay authority and management/overlay credentials cannot authorize automation routes.
- Confirm every asset/route reference participates in deletion impact and backup validation while active state and credential verifier remain non-portable.
- Confirm all visual states use production components, semantic controls, stable focus, and exact per-profile layout rules.

---

### Task 1: Add timer domain contracts, schemas, and pure projection

**Files:**
- Create: `packages/core/src/timers/types.ts`
- Create: `packages/core/src/timers/schemas.ts`
- Create: `packages/core/src/timers/projection.ts`
- Create: `packages/core/src/timers/projection.test.ts`
- Create: `packages/core/src/timers/schemas.test.ts`
- Create: `packages/core/src/timers/module-definition.ts`
- Modify: `packages/core/src/overlay-modules/types.ts`
- Modify: `packages/core/src/overlay-modules/schemas.ts`
- Modify: `packages/core/src/overlay-modules/module-registry.ts`
- Modify: `packages/core/src/overlay-modules/module-registry.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: existing `OverlayElementLayout`, `OverlayTargetProfileId`, `AlertAudioOutputs`, and overlay-module registry contracts.
- Produces: strict timer definition/runtime/command schemas, pure display ordering/projection, the `timers` module definition, and an additive module presentation union.

- [ ] **Step 1: Add failing schema tests**

Define the public shapes in tests first:

```ts
export interface TimerDefinition {
  readonly id: string;
  readonly label: string;
  readonly durationMs: number;
  readonly iconAssetId: string | null;
  readonly startAudioAssetId: string | null;
  readonly endAudioAssetId: string | null;
  readonly outputs: AlertAudioOutputs;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TimerRunState =
  | { readonly status: "running"; readonly definitionId: string; readonly generation: string; readonly snapshot: TimerDefinitionSnapshot; readonly startedAtEpochMs: number; readonly endsAtEpochMs: number }
  | { readonly status: "paused"; readonly definitionId: string; readonly generation: string; readonly snapshot: TimerDefinitionSnapshot; readonly remainingMs: number }
  | { readonly status: "completed"; readonly definitionId: string; readonly generation: string; readonly snapshot: TimerDefinitionSnapshot; readonly completedAtEpochMs: number; readonly expiresAtEpochMs: number };

export interface TimerCommandResult {
  readonly changed: boolean;
  readonly state: TimerRunState | null;
}
```

Test trimmed/non-empty labels, positive bounded duration, unique route IDs, image/GIF-only icon metadata at the service boundary, audio-only cue metadata at the service boundary, strict unknown-field rejection, all runtime variants, and `M:SS`/`H:MM:SS` formatting boundaries.

- [ ] **Step 2: Run the core tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/timers/schemas.test.ts packages/core/src/timers/projection.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because the timer contracts and projection do not exist.

- [ ] **Step 3: Implement strict timer schemas and module configuration**

Use a schema-bounded configuration with exactly two profiles:

```ts
export interface TimerStackRegion {
  readonly layout: OverlayElementLayout;
  readonly orientation: "vertical" | "horizontal";
  readonly maxVisible: number;
}

export interface TimersOverlayModuleConfig {
  readonly profiles: Readonly<Record<"landscape" | "vertical", TimerStackRegion>>;
}
```

Bound `maxVisible` to `1..12`, keep every layout value within the existing normalized overlay coordinate rules, and register `timersOverlayModuleDefinition` with module/unified outputs and conservative default regions. Keep the module disabled by default so migration alone does not change an existing stream layout.

- [ ] **Step 4: Add the additive presentation contract**

Extend `OverlayModuleSnapshot` without changing existing `instructions` semantics:

```ts
export type OverlayModulePresentation = {
  readonly kind: "timer-stack";
  readonly stack: TimerStackProjection;
};

export interface OverlayModuleSnapshot {
  // existing fields remain
  readonly presentation?: OverlayModulePresentation;
}
```

Add strict schemas for the payload. Validate that every card belongs to the requested profile, IDs are unique, the card count is no greater than `maxVisible`, and `overflowCount` is a non-negative integer.

- [ ] **Step 5: Implement and test pure projection**

Expose:

```ts
export function projectTimerStack(input: {
  readonly nowEpochMs: number;
  readonly region: TimerStackRegion;
  readonly runs: readonly TimerRunState[];
}): TimerStackProjection;

export function formatTimerRemaining(remainingMs: number): string;
```

Test completed cards first at zero, running by earliest `endsAtEpochMs`, paused by `remainingMs`, stable ID ties, both orientations, equal slot layouts, visible capacity, and overflow count. Projection carries full labels; CSS owns one-line ellipsis rather than destructive text truncation.

- [ ] **Step 6: Run focused tests and commit**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/timers packages/core/src/overlay-modules/module-registry.test.ts packages/core/src/overlay-modules/schemas.test.ts --reporter=dot --maxWorkers=1
git add packages/core/src
git commit -m "feat(core): define timer overlay contracts"
```

Expected: all focused tests pass.

### Task 2: Persist timer definitions and validate authoring atomically

**Files:**
- Create: `packages/core/src/timers/repository.ts`
- Create: `apps/server/src/modules/db/migrations/028-timer-overlay-module.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`
- Create: `apps/server/src/modules/timers/sqlite-timer-definition-repository.ts`
- Create: `apps/server/src/modules/timers/sqlite-timer-definition-repository.test.ts`
- Create: `apps/server/src/modules/timers/timer-management-service.ts`
- Create: `apps/server/src/modules/timers/timer-management-service.test.ts`

**Interfaces:**
- Consumes: SQLite transaction helper, asset repository, audio-route repository, and a runtime activity probe.
- Produces: durable timer definitions plus validated CRUD with active-delete protection.

- [ ] **Step 1: Write failing migration and repository tests**

Migration `028-timer-overlay-module` creates:

```sql
timer_definitions(
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK(duration_ms > 0),
  icon_asset_id TEXT NULL REFERENCES asset_metadata(id) ON DELETE RESTRICT,
  start_audio_asset_id TEXT NULL REFERENCES asset_metadata(id) ON DELETE RESTRICT,
  end_audio_asset_id TEXT NULL REFERENCES asset_metadata(id) ON DELETE RESTRICT,
  browser_source INTEGER NOT NULL CHECK(browser_source IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

timer_audio_routes(
  timer_id TEXT NOT NULL REFERENCES timer_definitions(id) ON DELETE CASCADE,
  route_id TEXT NOT NULL REFERENCES audio_output_routes(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK(position >= 0),
  PRIMARY KEY(timer_id, route_id),
  UNIQUE(timer_id, position)
)

timer_automation_credential(
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
  verifier TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rotated_at TEXT NULL,
  revoked_at TEXT NULL
)
```

Prove migration from schema 027, FK enforcement, route ordering, timestamp round-trip, and transaction rollback on child-row failure.

- [ ] **Step 2: Run persistence tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/db/database.test.ts apps/server/src/modules/timers/sqlite-timer-definition-repository.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because migration 028 and the repository are absent.

- [ ] **Step 3: Implement the typed repository**

Expose synchronous methods so reference checks and writes remain in one SQLite transaction:

```ts
export interface TimerDefinitionRepository {
  list(): readonly TimerDefinition[];
  findById(id: string): TimerDefinition | null;
  save(definition: TimerDefinition): TimerDefinition;
  delete(id: string): void;
  findByAssetId(assetId: string): readonly TimerDefinition[];
  findByAudioRouteId(routeId: string): readonly TimerDefinition[];
}
```

Parse every read through the core schema. Save the definition row and ordered route rows in one `BEGIN IMMEDIATE` transaction.

- [ ] **Step 4: Add failing management-service tests**

Test create/update/delete/list/get, generated stable IDs/timestamps, trimmed labels, missing assets/routes, incorrect icon/cue media types, duplicate route IDs, active deletion, and rollback when a referenced record disappears between validation and save.

- [ ] **Step 5: Implement `TimerManagementService`**

Expose:

```ts
export interface TimerActivityProbe { isActive(definitionId: string): boolean; }

export class TimerManagementService {
  listDefinitions(): readonly TimerDefinition[];
  getDefinition(id: string): TimerDefinition;
  createDefinition(input: TimerDefinitionInput): TimerDefinition;
  updateDefinition(id: string, input: TimerDefinitionInput): TimerDefinition;
  deleteDefinition(id: string): void;
}
```

Run validation and persistence through the same configuration-mutation/transaction boundary. Return structured not-found, invalid-reference, incompatible-media, and active-definition conflict errors.

- [ ] **Step 6: Run focused tests and commit**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/db/database.test.ts apps/server/src/modules/timers --reporter=dot --maxWorkers=1
git add packages/core/src/timers apps/server/src/modules/db apps/server/src/modules/timers
git commit -m "feat(server): persist timer definitions"
```

Expected: all focused tests pass.

### Task 3: Implement the server-authoritative runtime and cue boundary

**Files:**
- Create: `apps/server/src/modules/timers/timer-runtime-coordinator.ts`
- Create: `apps/server/src/modules/timers/timer-runtime-coordinator.test.ts`
- Create: `apps/server/src/modules/timers/timer-cue-service.ts`
- Create: `apps/server/src/modules/timers/timer-cue-service.test.ts`
- Modify: `apps/server/src/modules/audio/audio-output-service.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.test.ts`

**Interfaces:**
- Consumes: definitions, existing overlay gateway, `AudioOutputService.preparePlayback`, `AudioPlaybackSink`, current safety/mute state, and injected clock/scheduler.
- Produces: one authoritative in-memory lifecycle, immutable run snapshots, lifecycle subscriptions, module projections, and independent cue delivery.

- [ ] **Step 1: Add failing lifecycle tests with fake time**

Define injected boundaries:

```ts
export interface TimerClock { now(): number; }
export interface TimerScheduler {
  schedule(delayMs: number, callback: () => void): { cancel(): void };
}
export interface TimerCueSink {
  play(input: { readonly cue: "start" | "end"; readonly run: TimerRunState }): Promise<void>;
  stop(generation: string): Promise<void>;
}
```

Test independent concurrent definitions; every valid transition; start/pause/resume/stop idempotency; restart replacement; three-second completion hold; exact end cue once; no pause/resume/stop cue; editing snapshot isolation; stale generation callbacks; long delays chunked below the platform timeout limit; subscription revisions; and `close()` cleanup.

- [ ] **Step 2: Run lifecycle tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/timers/timer-runtime-coordinator.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement `TimerRuntimeCoordinator`**

Expose:

```ts
export class TimerRuntimeCoordinator implements TimerActivityProbe, OverlayModuleRuntime {
  listStates(): readonly TimerRunState[];
  getState(definitionId: string): TimerRunState | null;
  start(definitionId: string): Promise<TimerCommandResult>;
  pause(definitionId: string): Promise<TimerCommandResult>;
  resume(definitionId: string): Promise<TimerCommandResult>;
  stop(definitionId: string): Promise<TimerCommandResult>;
  restart(definitionId: string): Promise<TimerCommandResult>;
  subscribe(listener: (revision: number) => void): () => void;
  getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot>;
  close(): Promise<void>;
}
```

Use monotonic generation IDs and compare them in every scheduled/asynchronous callback. Calculate pause remainder from the server clock, clamp at zero, and publish only state/config transitions. A new coordinator starts with an empty runtime map even when definitions exist.

- [ ] **Step 4: Implement cue normalization and routing**

`TimerCueService.play` builds one generation-scoped browser audio instruction when `browserSource` is selected and one `ResolvedAlertAudio` entry for device routing. Admit the cue once before profile expansion, deduplicate named routes through `AudioOutputService`, use the audio asset's stored duration, and settle browser/device failures independently. Report redacted diagnostics through the runtime logger; never throw a cue failure back into the timer transition.

- [ ] **Step 5: Wire runtime composition and shutdown**

Create the repository, management service, cue service, and coordinator in `runtime-composition.ts`; add `timers` to `overlayModuleRuntimes`; invalidate module/unified WebSocket snapshots on coordinator revision; synchronize desktop presentation changes through the transport added in Task 6; and close the coordinator before audio/desktop transports during shutdown.

- [ ] **Step 6: Prove restart and cue behavior**

Add runtime tests that save definitions, start/pause timers, dispose the runtime, reopen the database, and observe definitions restored with no active states. Prove start/restart/end cue delivery, mute behavior, unavailable device reporting, no duplicate route delivery, and stop cancelling owned cue playback.

- [ ] **Step 7: Run focused tests and commit**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/timers apps/server/src/runtime/runtime-composition.test.ts apps/server/src/modules/audio/audio-output-service.test.ts --reporter=dot --maxWorkers=1
git add apps/server/src/modules/timers apps/server/src/runtime/runtime-composition.ts apps/server/src/runtime/runtime-composition.test.ts apps/server/src/modules/audio/audio-output-service.test.ts
git commit -m "feat(server): run authoritative timers"
```

Expected: all focused tests pass.

### Task 4: Add management timer routes and scoped automation security

**Files:**
- Create: `apps/server/src/modules/timers/timer-automation-credential-service.ts`
- Create: `apps/server/src/modules/timers/timer-automation-credential-service.test.ts`
- Create: `apps/server/src/http/middleware/timer-automation-security.ts`
- Create: `apps/server/src/http/middleware/timer-automation-security.test.ts`
- Create: `apps/server/src/http/routes/timers.ts`
- Create: `apps/server/src/http/routes/timers.test.ts`
- Create: `apps/server/src/http/routes/timer-automation.ts`
- Create: `apps/server/src/http/routes/timer-automation.test.ts`
- Modify: `apps/server/src/http/routes/test-support/route-test-app.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/modules/security/redactor.test.ts`

**Interfaces:**
- Consumes: management security prehandlers, a dedicated rate limiter, definition service, runtime coordinator, and SQLite credential row.
- Produces: protected authoring/control routes and the exact approved loopback automation API.

- [ ] **Step 1: Write failing credential and middleware tests**

Generate 32 random bytes as base64url. Store `sha256:<hex>` only and compare fixed-length decoded digests with `timingSafeEqual`. Test create, rotate, revoke, one active row, raw token returned once, old-token invalidation, malformed bearer rejection, loopback IPv4/IPv6 acceptance, non-loopback rejection, any `Origin` rejection, rate limiting, and redacted error/log serialization.

- [ ] **Step 2: Run security tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/timers/timer-automation-credential-service.test.ts apps/server/src/http/middleware/timer-automation-security.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because the credential service and middleware are absent.

- [ ] **Step 3: Implement credential lifecycle and prehandler**

Expose:

```ts
export interface TimerAutomationCredentialView {
  readonly configured: boolean;
  readonly createdAt: string | null;
  readonly rotatedAt: string | null;
}

export interface TimerAutomationCredentialIssue extends TimerAutomationCredentialView {
  readonly token: string;
}
```

The management-only service implements `status`, `createOrRotate`, and `revoke`. The automation prehandler checks loopback peer, absence of `Origin`, dedicated rate limit, and its own bearer. Do not reuse `createManagementSecurityPreHandler` or overlay authorization.

- [ ] **Step 4: Add failing management route tests**

Cover:

```text
GET    /timers
POST   /timers
GET    /timers/state
GET    /timers/:id
PUT    /timers/:id
DELETE /timers/:id
POST   /timers/:id/start|pause|resume|stop|restart
GET    /timers/automation-credential
POST   /timers/automation-credential/rotate
DELETE /timers/automation-credential
```

Require the existing management session, CSRF, origin, and management rate limit. Test structured 400/404/409 responses, active-delete conflict, `changed` command responses, and raw bearer only on rotate/create.

- [ ] **Step 5: Add failing automation route tests**

Implement only the approved surface:

```text
GET  /automation/timers
POST /automation/timers/:id/start
POST /automation/timers/:id/pause
POST /automation/timers/:id/resume
POST /automation/timers/:id/stop
POST /automation/timers/:id/restart
```

The list response includes allowlisted definition identity/label and resulting runtime state only. Every POST body must be absent or an empty object; reject duration, asset, route, label, or other authoring fields. Test that management sessions and overlay keys fail here and that the automation bearer fails on management/overlay routes.

- [ ] **Step 6: Implement and register both route groups**

Keep handlers thin: parse at the boundary, call the service/coordinator, map known domain errors, and return schemas from core. Add registrars to `createServerApp`, test support, and runtime dependencies.

- [ ] **Step 7: Run focused tests and commit**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/http/routes/timers.test.ts apps/server/src/http/routes/timer-automation.test.ts apps/server/src/http/middleware/timer-automation-security.test.ts apps/server/src/modules/timers/timer-automation-credential-service.test.ts apps/server/src/modules/security/redactor.test.ts --reporter=dot --maxWorkers=1
git add apps/server/src
git commit -m "feat(server): expose timer control APIs"
```

Expected: all focused tests pass.

### Task 5: Render timer stacks in browser overlays

**Files:**
- Create: `apps/web/src/overlay/components/TimerStack.tsx`
- Create: `apps/web/src/overlay/components/TimerStack.test.tsx`
- Create: `apps/web/src/overlay/components/TimerStack.stories.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.test.tsx`
- Modify: `apps/web/src/overlay/OverlayApp.test.tsx`
- Modify: `apps/web/src/overlay/overlay.css`
- Modify: `apps/web/src/stories/story-fixtures.ts`

**Interfaces:**
- Consumes: `OverlayModuleSnapshot.presentation.kind === "timer-stack"`, authoritative epochs, and the existing asset URL resolver.
- Produces: local countdown display with no server-per-second messages and exact layout/overflow behavior.

- [ ] **Step 1: Add failing component tests**

Use fake timers and a supplied `now`/tick hook. Cover running decrement, paused freeze, reconnect at current offset, completed `00:00`, sub-hour/hour formatting, completed/running/paused ordering from the received projection, missing icon fallback, single-line ellipsis, equal card sizes, horizontal/vertical layout, exact capacity, and a non-slot-consuming `+N more` badge.

- [ ] **Step 2: Run component tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/overlay/components/TimerStack.test.tsx apps/web/src/overlay/components/OverlaySurface.test.tsx apps/web/src/overlay/OverlayApp.test.tsx --reporter=dot --maxWorkers=1
```

Expected: FAIL because `TimerStack` and presentation rendering are absent.

- [ ] **Step 3: Implement the renderer**

Render the region using absolute normalized layout and CSS grid/flex orientation. Use one shared local interval while at least one running card is visible, calculate `Math.max(0, endsAtEpochMs - Date.now())`, and clear the interval on snapshot replacement/unmount. Use full label text with CSS `text-overflow: ellipsis`; keep the accessible name untruncated. Image load failure hides only the icon.

- [ ] **Step 4: Integrate with `OverlaySurface`**

Render module presentation beside ordinary instructions within the module layer and respect `surfaceLayer.visible/zIndex`. Invalid presentation yields no DOM and no opaque fallback. It must not emit playback completion events because the server owns timer completion.

- [ ] **Step 5: Add production-component stories**

Create stories for Landscape/Vertical, horizontal/vertical, long labels, concurrent states, overflow, missing icon, and completed hold using tiny files already in `apps/web/public/storybook-assets/`. Add play assertions for names, displayed values, and accessibility.

- [ ] **Step 6: Run focused web and Storybook tests, then commit**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/overlay --reporter=dot --maxWorkers=1
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
git add apps/web/src/overlay apps/web/src/stories
git commit -m "feat(web): render timer overlay stacks"
```

Expected: component and Storybook checks pass.

### Task 6: Synchronize timer presentation to the desktop overlay

**Files:**
- Modify: `packages/core/src/overlays/desktop-visual-transport.ts`
- Modify: `packages/core/src/overlays/desktop-visual-transport.test.ts`
- Modify: `apps/server/src/modules/overlay-surfaces/desktop-visual-asset-resolver.ts`
- Modify: `apps/server/src/modules/overlay-surfaces/desktop-visual-asset-resolver.test.ts`
- Create: `apps/server/src/modules/overlay-surfaces/desktop-module-snapshot-sink.ts`
- Create: `apps/server/src/modules/overlay-surfaces/desktop-module-snapshot-sink.test.ts`
- Modify: `apps/web/src/desktop-overlay/desktop-overlay-controller.ts`
- Modify: `apps/web/src/desktop-overlay/desktop-overlay-controller.test.ts`
- Modify: `apps/web/src/desktop-overlay/DesktopOverlayApp.tsx`
- Modify: `apps/web/src/desktop-overlay/DesktopOverlayApp.test.tsx`
- Modify: `apps/server/src/runtime/runtime-composition.ts`

**Interfaces:**
- Consumes: normalized timer-stack presentation, timer icon assets, and desktop surface layer visibility.
- Produces: an additive persistent-module sync command; existing finite `prepare/start/stop` occurrence commands remain unchanged.

- [ ] **Step 1: Add failing transport schema tests**

Extend the desktop command union with:

```ts
{
  readonly type: "sync-module";
  readonly moduleId: string;
  readonly revision: number;
  readonly presentation: OverlayModulePresentation | null;
  readonly assets: readonly DesktopVisualAsset[];
}
```

Validate timer-only media types, unique referenced assets, no unreferenced bytes, transfer budget, monotonically applied revision, and `presentation: null` clearing the module. Do not retrofit timers into `DesktopVisualBatch` occurrence timing.

- [ ] **Step 2: Run desktop unit tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/overlays/desktop-visual-transport.test.ts apps/web/src/desktop-overlay/desktop-overlay-controller.test.ts apps/web/src/desktop-overlay/DesktopOverlayApp.test.tsx --reporter=dot --maxWorkers=1
```

Expected: FAIL because `sync-module` is not accepted.

- [ ] **Step 3: Implement server-side snapshot preparation**

`DesktopModuleSnapshotSink.sync` checks that the desktop surface is enabled, has a selected display, and contains a visible `timers` layer. Resolve only icon assets referenced by visible cards, omit missing icons while recording a diagnostic, and send null when the module/surface is disabled or has no active cards.

- [ ] **Step 4: Extend controller state without disturbing occurrences**

Add immutable `modulePresentations` to `DesktopOverlaySnapshot`. Apply only a newer revision, create/revoke object URLs transactionally, clear them on reconfigure/retry/close, and leave occurrence completion replies untouched. `DesktopOverlayApp` merges the persistent presentation into the matching composed module and reuses `TimerStack`.

- [ ] **Step 5: Wire timer revisions and prove cross-output agreement**

On timer state/config change, build the Landscape projection and sync it to desktop. Test running/paused/completed updates, stale revisions, missing icons, module layer hidden, renderer retry, and browser/desktop values produced from the same epochs.

- [ ] **Step 6: Run focused tests and commit**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/overlays/desktop-visual-transport.test.ts apps/server/src/modules/overlay-surfaces/desktop-module-snapshot-sink.test.ts apps/server/src/modules/overlay-surfaces/desktop-visual-asset-resolver.test.ts apps/web/src/desktop-overlay --reporter=dot --maxWorkers=1
git add packages/core/src/overlays apps/server/src/modules/overlay-surfaces apps/server/src/runtime/runtime-composition.ts apps/web/src/desktop-overlay
git commit -m "feat(desktop): sync timer overlay state"
```

Expected: all focused tests pass.

### Task 7: Build the Timers management experience

**Files:**
- Create: `apps/web/src/management/timers/timers-api.ts`
- Create: `apps/web/src/management/timers/timers-api.test.ts`
- Create: `apps/web/src/management/timers/TimersPage.tsx`
- Create: `apps/web/src/management/timers/TimersPage.test.tsx`
- Create: `apps/web/src/management/timers/TimersPage.stories.tsx`
- Create: `apps/web/src/management/timers/TimerStackEditor.tsx`
- Create: `apps/web/src/management/timers/TimerStackEditor.test.tsx`
- Create: `apps/web/src/management/timers/timers.css`
- Modify: `apps/web/src/management/routing/management-route.ts`
- Modify: `apps/web/src/management/routing/management-route.test.ts`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.tsx`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.test.tsx`
- Modify: `apps/web/src/management/ManagementApp.tsx`
- Modify: `apps/web/src/management/ManagementApp.test.tsx`
- Modify: `apps/web/src/stories/mock-apis.ts`

**Interfaces:**
- Consumes: management timer routes, shared `AssetPicker`, audio-route API, and module config API.
- Produces: complete reusable definition authoring, manual controls, exact profile previews, and credential lifecycle UI.

- [ ] **Step 1: Add failing typed-client tests**

Define `TimersApi` methods for inventory/state, create/update/delete, start/pause/resume/stop/restart, get/save module config, and credential status/rotate/revoke. Parse every response with core schemas. Keep the raw credential only in the return value of `rotateAutomationCredential`; never place it in module state shared with stories, logs, or persisted browser storage.

- [ ] **Step 2: Add failing route/navigation tests**

Add `modules-timers` at `/manage/modules/timers` as a child of Modules, update parse/format coverage, breadcrumbs, responsive navigation, and direct-load routing.

- [ ] **Step 3: Build list/editor and state-aware controls**

The page lists every definition and edits label, duration, optional icon, optional start/end cues, Browser Source audio, and named route selections. Reuse `AssetPicker` with media filters. Show running/paused/completed state and appropriate controls; disclose that edits affect the next run. Disable delete while active and also handle server conflict. Preserve focus after save/delete/control refreshes and announce state changes/errors semantically.

- [ ] **Step 4: Build profile stack editor and exact preview**

Provide Landscape/Vertical tabs, draggable/resizable bounded region, orientation selection, and `maxVisible`. Use the production `TimerStack` for preview with representative long labels and overflow. Warn when projected card width/height falls below the documented legibility threshold, but allow any schema-valid configuration.

- [ ] **Step 5: Build credential controls**

Show configured/created/rotated metadata, rotate/create, one-time copy field, and revoke confirmation. On navigation or dismissal, discard the raw token from React state. Never include a realistic token in a story or screenshot fixture.

- [ ] **Step 6: Add tests and stories**

Cover loading, empty, create/edit validation, media filtering, route selection, active snapshot disclosure, all controls, active-delete conflict, both profile layouts, drag/resize keyboard alternatives, legibility warning, overflow, credential one-time display/revoke, server errors, focus, and live regions. Stories use production components and tiny checked-in assets.

- [ ] **Step 7: Run focused checks and commit**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/timers apps/web/src/management/routing/management-route.test.ts apps/web/src/management/navigation/ManagementNavigation.test.tsx apps/web/src/management/ManagementApp.test.tsx --reporter=dot --maxWorkers=1
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
git add apps/web/src/management apps/web/src/stories
git commit -m "feat(web): add timer management"
```

Expected: focused tests and Storybook checks pass.

### Task 8: Add active timers to Operator

**Files:**
- Create: `apps/web/src/operator/timers-api.ts`
- Create: `apps/web/src/operator/timers-api.test.ts`
- Modify: `apps/web/src/operator/OperatorApp.tsx`
- Modify: `apps/web/src/operator/OperatorApp.test.tsx`
- Modify: `apps/web/src/operator/OperatorApp.stories.tsx`
- Modify: `apps/web/src/App.css`

**Interfaces:**
- Consumes: management-authenticated timer state/control routes.
- Produces: a distinct active-timers section; timers do not become playback queue owners.

- [ ] **Step 1: Add failing Operator client and component tests**

Test only active running/paused/completed definitions, urgency ordering supplied by the server projection, pause/resume, stop, restart, refresh/reconnect, command conflicts, request failure, stable focus, keyboard access, and status announcements. Idle definitions must not appear.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/operator/timers-api.test.ts apps/web/src/operator/OperatorApp.test.tsx --reporter=dot --maxWorkers=1
```

Expected: FAIL because Operator has no timer client or section.

- [ ] **Step 3: Implement the separate active-timer panel**

Keep the existing playback API and queue controls unchanged. Load timer state alongside the operations snapshot, render completed/running cards before paused cards, reuse display formatting, and poll only at the existing Operator snapshot cadence while ticking visible running values locally. Refresh authoritative state after each command.

- [ ] **Step 4: Add stories and run checks**

Add concurrent, paused, completed, command-error, and empty stories with interactions and accessibility checks.

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/operator --reporter=dot --maxWorkers=1
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
git add apps/web/src/operator apps/web/src/App.css
git commit -m "feat(web): control active timers in operator"
```

Expected: all focused checks pass.

### Task 9: Integrate asset usage, route impact, and portable backup

**Files:**
- Modify: `packages/core/src/assets/types.ts`
- Modify: `packages/core/src/assets/schemas.ts`
- Modify: `packages/core/src/audio/types.ts`
- Modify: `apps/server/src/modules/assets/asset-library-service.ts`
- Modify: `apps/server/src/modules/assets/asset-library-service.test.ts`
- Modify: `apps/server/src/modules/audio/sqlite-audio-output-route-repository.ts`
- Modify: `apps/server/src/modules/audio/sqlite-audio-output-route-repository.test.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.test.ts`
- Modify: `apps/web/src/management/assets/AssetManager.tsx`
- Modify: `apps/web/src/management/assets/AssetManager.test.tsx`
- Modify: `apps/web/src/management/assets/asset-library-utils.ts`

**Interfaces:**
- Consumes: timer definition repository and existing module-owner impact contracts.
- Produces: timer icon/start/end usage, route deletion/rebind safety, and portable timer configuration without active/secret state.

- [ ] **Step 1: Add failing asset and route-impact tests**

Extend `ModuleMediaReference`/asset owner presentation to recognize `moduleId: "timers"` and usage roles `icon`, `start-audio`, and `end-audio`. Test one definition referencing the same asset in multiple roles, compatible replacement checks, timer navigation, guarded deletion, route conflict text, and deterministic owner ordering.

- [ ] **Step 2: Implement usage discovery and navigation**

Inject `TimerDefinitionRepository` into `AssetLibraryService`, merge timer owners with Alert/Screen Effect owners, and update Asset Manager links to `/manage/modules/timers` with the definition selected. Extend audio-route reference queries to `timer_audio_routes`; update error guidance to name Timers.

- [ ] **Step 3: Add failing backup tests**

Add `timer_definitions` and `timer_audio_routes` to the versioned table definition list and schema-drift expectations. Prove export/import round-trips definitions, routes, profile module config, and referenced asset rows. Prove `timer_automation_credential` is absent, active state never appears, successful restore clears the destination credential so automation requires explicit regeneration, restored timers are idle, invalid asset/route references fail preflight, and restore rollback preserves the destination's pre-existing credential row.

- [ ] **Step 4: Implement portable snapshot rules**

Include only definition/config/reference rows. Explicitly list “Timer automation credentials and active timer runs” in secret/runtime exclusions. Validation checks icon/audio media compatibility and route/asset foreign references before replacement. Capture the destination credential as operational rollback state, clear it only after a successful configuration replacement, and restore it if replacement rolls back. The imported profile therefore requires an explicit local create/rotate before automation works.

- [ ] **Step 5: Run focused tests and commit**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/assets/asset-library-service.test.ts apps/server/src/modules/audio/sqlite-audio-output-route-repository.test.ts apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts apps/server/src/modules/backup/configuration-backup-service.test.ts apps/web/src/management/assets/AssetManager.test.tsx --reporter=dot --maxWorkers=1
git add packages/core/src/assets packages/core/src/audio apps/server/src/modules/assets apps/server/src/modules/audio apps/server/src/modules/backup apps/web/src/management/assets
git commit -m "feat: include timers in configuration impact"
```

Expected: all focused tests pass and serialized archives contain neither token nor verifier.

### Task 10: Add end-to-end acceptance, documentation, and release evidence

**Files:**
- Create: `tests/e2e/timers.spec.ts`
- Create: `tests/desktop/timers.spec.ts`
- Modify: `tests/e2e/security-boundaries.spec.ts`
- Modify: `tests/e2e/e2e-helpers.ts`
- Modify: `docs/product-plan.md`
- Modify: `docs/mvp-runbook.md`
- Create: `docs/verification/timer-overlay-module.md`
- Modify: `openspec/changes/add-timer-overlay-module/tasks.md`

**Interfaces:**
- Consumes: the complete feature through real management, browser overlay, automation HTTP, and packaged desktop boundaries.
- Produces: regression coverage, operator documentation, and auditable evidence tied to the OpenSpec checklist.

- [ ] **Step 1: Add management and browser Playwright coverage**

Create a definition; choose icon/start/end cues and explicit outputs; configure Landscape and Vertical regions, orientations, and capacities; save/reload/edit; invoke every manual command; and reject deletion while active. In browser overlays, prove concurrent urgency sorting, paused pinning, completed zero hold, equal boxes, ellipsis, overflow badge, module/unified visibility, late join, and reconnect continuity.

- [ ] **Step 2: Add generic HTTP automation acceptance**

Through the management UI/API, rotate a credential, store it only in the test process, call all six approved automation routes with `Authorization: Bearer`, verify `changed` idempotency, reject browser origin/non-loopback simulation/wrong credential/body overrides, rotate and reject the old token, revoke and reject the current token. Never attach the raw token to traces, snapshots, console output, or verification docs.

- [ ] **Step 3: Add packaged desktop acceptance**

Test browser/desktop agreement from the same deadline, horizontal/vertical rendering where applicable, simultaneous timers, paused/completed states, icon transfer and missing-icon recovery, hidden Timers layer, explicit start/end cue destinations, mute/unavailable output, renderer retry, and bounded Quit with an active long timer.

- [ ] **Step 4: Update current documentation**

Document timer authoring and controls, one-run-per-definition semantics, restart reset, Stream Deck HTTP examples using a placeholder header, credential rotation/revocation, loopback-only behavior, Browser Source/device routing, possible duplicate audible Browser Sources, profile layout/capacity, backup exclusions, and initial non-goals. Do not duplicate implementation version facts from manifests/specs.

- [ ] **Step 5: Run focused and full automated gates**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/timers apps/server/src/modules/timers apps/server/src/http/routes/timers.test.ts apps/server/src/http/routes/timer-automation.test.ts apps/web/src/management/timers apps/web/src/operator apps/web/src/overlay apps/web/src/desktop-overlay --reporter=dot --maxWorkers=1
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
corepack.cmd pnpm test:desktop
git diff --check
openspec.cmd validate add-timer-overlay-module --strict
```

Expected: every relevant gate passes. Classify any failure as regression, test defect, or environment failure; do not call a failing suite green.

- [ ] **Step 6: Rebuild, restart, and verify the live workflow**

Rebuild and restart the affected local service/desktop package, wait for `/health`, reload Management plus module/unified browser overlays, and verify authoring, all transitions, both profiles, overflow, browser/desktop continuity, and cues on real selected outputs. Configure a generic Stream Deck HTTP action with the new bearer and verify start, pause, resume, stop, and restart without exposing the token in evidence.

- [ ] **Step 7: Record evidence and reconcile the specification**

Write exact commands, passing counts, tested profile IDs, anonymous timer IDs, output route labels, packaged artifact identity, live observations, and any environment-only limitations to `docs/verification/timer-overlay-module.md`. Review every requirement in the OpenSpec delta against code/tests/evidence, check only completed tasks, and leave the change ready for user review before any push, PR, merge, or archive action.

- [ ] **Step 8: Commit acceptance and documentation**

```powershell
git add tests docs openspec/changes/add-timer-overlay-module/tasks.md
git commit -m "test: verify timer overlay module"
```
