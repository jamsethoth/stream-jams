# Alert Playback Operator Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Execution status (2026-07-23):** Implemented and verified. The completed checklist in `openspec/changes/add-alert-playback-operator-controls/tasks.md` is authoritative; unchecked boxes below preserve the original implementation sequence and are not pending work.

**Goal:** Deliver BL-001 as a focused `/operator` console whose pause, mute, do-not-disturb, skip, and replay controls truthfully affect persisted runtime state and live browser-source playback.

**Architecture:** Keep the existing `DefaultPlaybackQueue`, protected playback HTTP routes, management session client, and authorized overlay WebSocket. Add playback safety flags to validated app config, complete skip and mute through two messages on the existing overlay socket, dispatch remote TTS only when an item becomes current, and mount a small React operator shell that polls the authoritative snapshot while visible.

**Tech Stack:** TypeScript 6 strict mode, Fastify, React 19, Zod, existing app-config and management-session infrastructure, Vitest, Testing Library, Storybook 10, Playwright.

## Implementation Baseline

- Base implementation work on current `origin/main` after confirming `add-alert-playback-operator-controls` remains the BL-001 OpenSpec change and passes strict validation.
- The current queue snapshot already contains `current`, `queued`, `recent`, `paused`, `muted`, and `doNotDisturb`.
- The current protected routes already expose snapshot, pause/resume, mute/unmute, skip, replay, and do-not-disturb commands.
- The current overlay socket already authenticates browser sources and carries normalized playback instructions and playback reports.
- Verified gaps to close:
  - `skipCurrent()` advances the queue without removing the old instruction from connected overlays.
  - `mute()` changes only the snapshot flag; audio, video, browser speech, and reconnecting overlays do not consume it.
  - Remote TTS is dispatched during event enqueue, before pause, do-not-disturb, mute, and queue ordering decide when the item starts.

```text
Management                        Operator                         Browser source
    |                                |                                  |
    | Open /operator                |                                  |
    |------------------------------->|                                  |
    |                                | GET/POST protected /playback      |
    |                                |---------------------> Coordinator |
    |                                |                      |             |
    |                                |                      | config      |
    |                                |                      | write first |
    |                                |                      |             |
    |                                |                      +------------>| existing WS:
    |                                |                      |             | audio-state / stop
    |                                |<---------------------| snapshot    |
```

## Fixed Decisions And Non-Goals

- Use `/operator` as a top-level shell without management editing navigation.
- Let each operator tab obtain its own ephemeral session through the existing management-session bootstrap; never copy bearer/CSRF values through the URL, `localStorage`, or cross-window messaging.
- Reuse `GET /playback` and existing protected commands; do not add a state WebSocket.
- Reuse the existing overlay WebSocket; do not add an operator socket, provider-control socket, or parallel auth scheme.
- Persist only `paused`, `muted`, and `doNotDisturb`; queue and recent items remain in memory.
- Persist a safety change before mutating the queue or broadcasting it. A failed write leaves runtime state unchanged.
- Skip sends stop for every current instruction before advancing and delivering the next item.
- Mute immediately affects HTML audio, embedded video audio, and browser speech. An item that starts muted does not trigger remote TTS and does not begin speaking late if later unmuted.
- Speech already accepted by an external TTS provider cannot be recalled by BL-001.
- Keep intake controls, queue clearing, event history, raw provider payloads, live moderation, alert editing, remote/LAN access, and full queue persistence out of scope.
- Add no dependency, database migration, general-purpose polling library, generic state machine, or duplicate management API facade.
- Keep operator copy in the current English-only UI convention and isolate it in the operator component; do not introduce an i18n framework in this slice.

## Contracts To Add Or Extend

### Core playback safety state

```ts
export interface PlaybackSafetyState {
  readonly paused: boolean;
  readonly muted: boolean;
  readonly doNotDisturb: boolean;
}

export const defaultPlaybackSafetyState: PlaybackSafetyState = {
  paused: false,
  muted: false,
  doNotDisturb: false
};

export interface PlaybackQueueSnapshot extends PlaybackSafetyState {
  readonly current: PlaybackQueueItem | null;
  readonly queued: readonly PlaybackQueueItem[];
  readonly recent: readonly PlaybackQueueItem[];
}
```

`AppConfig.playback` uses the same shape. `appConfigSchema` defaults the whole field for older files, while `appConfigUpdateSchema` accepts a partial playback patch. `DefaultPlaybackQueue` accepts `initialSafetyState?: PlaybackSafetyState` and copies the three booleans.

### Existing overlay socket messages

Server-to-client additions:

```ts
type OverlayPlaybackControlMessage =
  | { readonly type: "overlay.playback.audio-state"; readonly muted: boolean }
  | { readonly type: "overlay.playback.stop"; readonly instructionIds: readonly string[] };

export interface OverlayPlaybackInstructionSink {
  deliverPlaybackInstruction(instruction: OverlayInstruction):
    | { readonly deliveredClientIds: readonly string[] }
    | void;
  setPlaybackMuted(muted: boolean): void;
  stopPlaybackInstructions(instructionIds: readonly string[]): void;
}
```

`OverlayGateway` retains `playbackMuted`, sends audio state immediately after `overlay.connected`, broadcasts changed audio state, and broadcasts a deduplicated non-empty stop list. All authorized clients may receive stop; each renderer removes only IDs it currently owns.

### Coordinator persistence boundary

```ts
export interface PlaybackCoordinatorDependencies {
  // existing dependencies remain
  readonly persistPlaybackSafetyState?: (
    patch: Partial<PlaybackSafetyState>
  ) => Promise<PlaybackSafetyState>;
}
```

The runtime supplies a callback backed by `configStore.updateConfig({ playback: patch })`. Safety methods become asynchronous; queue completion, skip, replay, and playback reports remain synchronous.

```ts
pause(): Promise<PlaybackQueueSnapshot>;
resume(): Promise<PlaybackQueueSnapshot>;
mute(): Promise<PlaybackQueueSnapshot>;
unmute(): Promise<PlaybackQueueSnapshot>;
setDoNotDisturb(enabled: boolean): Promise<PlaybackQueueSnapshot>;
```

### Focused operator API

```ts
export interface PlaybackApi {
  getSnapshot(): Promise<PlaybackQueueSnapshot>;
  pause(): Promise<PlaybackQueueSnapshot>;
  resume(): Promise<PlaybackQueueSnapshot>;
  mute(): Promise<PlaybackQueueSnapshot>;
  unmute(): Promise<PlaybackQueueSnapshot>;
  setDoNotDisturb(enabled: boolean): Promise<PlaybackQueueSnapshot>;
  skip(): Promise<PlaybackQueueSnapshot>;
  replay(itemId: string): Promise<PlaybackQueueSnapshot>;
}
```

The factory wraps `createManagementHttpClient()` and parses every response with `playbackQueueSnapshotSchema`. It does not extend the already broad `ManagementApi` interface.

## Task 1: Add Durable Playback Safety Configuration

**Files:**
- Modify: `packages/core/src/playback/types.ts`
- Modify: `packages/core/src/playback/schemas.ts`
- Modify: `packages/core/src/playback/playback-queue.ts`
- Modify: `packages/core/src/playback/playback-queue.test.ts`
- Modify: `packages/core/src/config/types.ts`
- Modify: `packages/core/src/config/schemas.ts`
- Modify: `packages/core/src/config/schemas.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/server/src/config/default-config.ts`
- Modify: `apps/server/src/config/default-config.test.ts`
- Modify: `apps/server/src/config/file-config-store.ts`
- Modify: `apps/server/src/config/file-config-store.test.ts`
- Modify typed `AppConfig` fixtures in server tests found by `rg "satisfies AppConfig|: AppConfig" apps/server`

**Produces:** One shared safety-state contract, backward-compatible config parsing, partial config updates, and queue construction from restored flags.

- [ ] Write failing schema tests proving a legacy config without `playback` parses to all false, each boolean is required when the object is present, non-booleans fail, and partial playback update patches parse.
- [ ] Write failing queue tests proving restored pause prevents a queued item from starting, restored DND prevents start, restored mute appears in snapshots, and subsequent queue control methods still work.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/config/schemas.test.ts packages/core/src/playback/playback-queue.test.ts apps/server/src/config/default-config.test.ts apps/server/src/config/file-config-store.test.ts
```

Expected: the new assertions fail because playback config and queue initialization do not exist.

- [ ] Add `PlaybackSafetyState`, `defaultPlaybackSafetyState`, and `playbackSafetyStateSchema`; make `PlaybackQueueSnapshot` extend the state and export the additions from `packages/core/src/index.ts`.
- [ ] Extend `AppConfig` and `AppConfigUpdate`. Default the whole playback object in `appConfigSchema`; make only update fields partial.

```ts
export const playbackSafetyStateSchema = z.object({
  paused: z.boolean(),
  muted: z.boolean(),
  doNotDisturb: z.boolean()
});

export const appConfigSchema = z.object({
  server: appServerConfigSchema,
  storage: appStorageConfigSchema,
  logging: logSettingsSchema.default(defaultLogSettings),
  playback: playbackSafetyStateSchema.default(defaultPlaybackSafetyState)
});
```

- [ ] Add `playback` to the default config and merge it in `FileConfigStore.updateConfig` with the same shallow-per-section pattern used for server, storage, and logging.
- [ ] Pass a defensive copy of `initialSafetyState` into the queue's three internal flags; do not retain the caller object or add queue-item persistence.
- [ ] Update every typed `AppConfig` test fixture with `playback: defaultPlaybackSafetyState` or a case-specific state. Do not loosen types with casts.
- [ ] Re-run the focused command; expect pass.
- [ ] Commit during implementation as `feat(playback): persist safety state`.

## Task 2: Make Mute And Stop Authoritative On The Existing Overlay Socket

**Files:**
- Modify: `apps/server/src/websocket/overlay-gateway.ts`
- Modify: `apps/server/src/websocket/overlay-gateway.test.ts`
- Modify: `apps/web/src/overlay/overlay-client.ts`
- Modify: `apps/web/src/overlay/overlay-client.test.ts`
- Modify: `apps/web/src/overlay/OverlayApp.tsx`
- Modify: `apps/web/src/overlay/OverlayApp.test.tsx`
- Modify: `apps/web/src/overlay/OverlayApp.lifecycle.test.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.test.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.stories.tsx`

**Produces:** Two server-to-overlay messages, reconnect-safe mute, targeted instruction removal, and renderer-level audio suppression.

- [ ] Write failing gateway tests proving registration sends `overlay.connected` followed by the current audio state, `setPlaybackMuted` broadcasts to connected clients and updates later registrations, and `stopPlaybackInstructions` deduplicates IDs and sends nothing for an empty list.
- [ ] Write failing parser tests accepting only a boolean audio state and a non-empty array of non-empty string IDs. Malformed messages must be ignored rather than clear a healthy overlay.
- [ ] Write failing `OverlayApp` tests proving it waits for initial audio state before rendering fetched/playback composition, removes all targeted instructions without sending completed/failed reports, and resets safely on transport failure/reconnect.
- [ ] Write failing surface tests proving:
  - `<audio>` and `<video>` receive the `muted` property.
  - browser speech does not start while muted.
  - changing to muted cancels active browser speech.
  - changing back to unmuted does not restart speech for an already-mounted instruction.
  - later instructions may speak after unmute.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/websocket/overlay-gateway.test.ts apps/web/src/overlay/overlay-client.test.ts apps/web/src/overlay/OverlayApp.test.tsx apps/web/src/overlay/OverlayApp.lifecycle.test.tsx apps/web/src/overlay/components/OverlaySurface.test.tsx
```

Expected: new protocol, removal, and mute assertions fail.

- [ ] Add `initialPlaybackMuted?: boolean` to `OverlayGatewayDependencies`, `#playbackMuted`, and these minimal methods:

```ts
setPlaybackMuted(muted: boolean): void;
stopPlaybackInstructions(instructionIds: readonly string[]): void;
```

- [ ] Keep the messages in the gateway's existing private message union and existing `sendGatewayMessage` path. Do not create a shared transport package for two local message shapes.
- [ ] Extend `OverlayClientMessage` with `audio-state` and `stop` variants while parsing the wire names above.
- [ ] Track `muted: boolean | null` in `OverlayApp`. A null value renders the transparent root so reconnect cannot briefly play unmuted media. A stop message removes every matching ID with one `Set`-based pass and emits no renderer report.

```ts
function removeInstructions(
  composition: OverlayComposition | null,
  instructionIds: readonly string[]
): OverlayComposition | null {
  const stopped = new Set(instructionIds);
  // Preserve module ordering; filter only matching normalized instructions.
}
```

- [ ] Add required `muted` to `OverlaySurfaceProps`; wire it to audio/video and guard the browser-speech effect. Cancellation is local browser behavior and must not be reported as instruction failure.
- [ ] Give each mounted instruction a `speechConsideredRef`. On its first speech effect, mark it considered whether muted or unmuted; speak only when unmuted. A later mute calls `speechSynthesis.cancel()`, while a later unmute cannot start that same instruction late.
- [ ] Update every production story to supply explicit muted/unmuted args and add one muted playback story.
- [ ] Re-run the focused command; expect pass.
- [ ] Commit during implementation as `feat(overlay): apply playback stop and mute`.

## Task 3: Correct Coordinator Skip, Safety Persistence, And Remote TTS Timing

**Files:**
- Modify: `apps/server/src/modules/playback/playback-coordinator.ts`
- Modify: `apps/server/src/modules/playback/playback-coordinator.test.ts`
- Modify: `apps/server/src/http/routes/playback.ts`
- Modify: `apps/server/src/http/routes/playback.test.ts`

**Produces:** Write-before-apply safety actions, stop-before-next skip ordering, and one remote-TTS decision when each queue item actually becomes current.

- [ ] Add failing coordinator tests for each safety command: persistence receives the exact patch before the queue mutation; rejection returns no changed runtime state; mute broadcasts only after persistence; unmute restores only future audio behavior.
- [ ] Add a failing ordered-call test proving skip obtains every `current.alerts[].overlayInstruction.id`, calls `stopPlaybackInstructions(ids)`, then calls `queue.skipCurrent()`, then delivers the next instruction.
- [ ] Add failing remote-TTS tests proving:
  - a queued item behind pause or DND does not dispatch until it becomes current;
  - an item that starts muted never dispatches, including after later unmute;
  - a future item after unmute dispatches once;
  - replay dispatches when the replayed item becomes current;
  - no overlay clients does not prevent remote dispatch for a current item;
  - a missing/failing remote provider records the existing safe diagnostic and does not reject or stop visual playback;
  - muting after external dispatch does not claim or attempt recall.
- [ ] Update route tests so async safety methods are awaited, rejected persistence reaches the safe server error handler, auth/rate limiting still run first, and transition logging happens only after successful state change.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/playback/playback-coordinator.test.ts apps/server/src/http/routes/playback.test.ts
```

Expected: ordering, persistence, and delivery-time TTS assertions fail.

- [ ] Add the optional persistence callback with an in-memory fallback for isolated tests. Each safety method awaits it before touching the queue. After successful mute/unmute, broadcast the queue's returned authoritative `muted` value.

```ts
async mute(): Promise<PlaybackQueueSnapshot> {
  await this.#persistPlaybackSafetyState({ muted: true });
  const snapshot = this.#queue.mute();
  this.#overlayPlaybackSink?.setPlaybackMuted(snapshot.muted);
  return snapshot;
}
```

- [ ] In `skipCurrent`, capture the current instruction IDs and send stop before queue mutation. Empty current remains a no-op and sends no stop.
- [ ] Remove enqueue-time `await this.#dispatchRemoteTts(resolvedAlerts)`.
- [ ] Add a current-item dispatch guard separate from overlay completion tracking. Invoke it inside each `#deliverCurrent` loop iteration before overlay delivery; mark the item as considered before starting the async dispatch so re-entrant calls cannot duplicate it.

```ts
if (snapshot.current.id !== this.#lastRemoteTtsItemId) {
  this.#lastRemoteTtsItemId = snapshot.current.id;
  if (!snapshot.muted) {
    void this.#dispatchRemoteTts(snapshot.current.alerts);
  }
}
```

- [ ] Make `#dispatchRemoteTts` internally total: provider absence and provider rejection both record the existing redacted diagnostic and resolve. Never leave an unhandled promise rejection.
- [ ] Await only safety methods in route handlers; retain synchronous skip/replay and existing validation/not-found behavior.
- [ ] Re-run the focused command; expect pass.
- [ ] Commit during implementation as `fix(playback): make operator controls truthful`.

## Task 4: Compose Restored State And Preserve Configuration Backups

**Files:**
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.test.ts`
- Modify: `apps/server/src/server/start-server.test.ts`
- Modify typed config fixtures in:
  - `apps/server/src/config/server-config-service.test.ts`
  - `apps/server/src/http/routes/config.test.ts`
  - `apps/server/src/modules/diagnostics/log-config-service.test.ts`

**Produces:** One restored state shared by queue and gateway, runtime-backed persistence callback, and backup/restore coverage.

- [ ] Write failing runtime smoke tests proving restored pause/DND are visible before intake can start playback, restored mute initializes both queue and gateway, a successful route mutation writes config, and a failed write changes neither runtime nor broadcast messages.
- [ ] Write failing backup tests proving export includes playback safety state, restore validates and applies it, and older backup config without the field restores all false. Preserve the existing rule that storage paths remain target-owned.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/runtime/runtime-composition.smoke.test.ts apps/server/src/modules/backup/configuration-backup-service.test.ts apps/server/src/server/start-server.test.ts
```

Expected: restored state and backup assertions fail.

- [ ] Initialize both runtime objects from the already-read `initialConfig.playback`:

```ts
const overlayGateway = new OverlayGateway({
  // existing dependencies
  initialPlaybackMuted: initialConfig.playback.muted
});

const playbackQueue = new DefaultPlaybackQueue({
  generateId: generatePlaybackQueueItemId,
  initialSafetyState: initialConfig.playback
});
```

- [ ] Supply the coordinator callback as the only config-store knowledge in playback code:

```ts
persistPlaybackSafetyState: async (patch) =>
  (await configStore.updateConfig({ playback: patch })).playback
```

- [ ] Add `playback` to backup restoration alongside server/logging. Do not restore the backup's storage paths and do not invent a backup format version for an additive defaulted field.
- [ ] Update strict typed fixtures rather than using `as AppConfig`.
- [ ] Re-run the focused command; expect pass.
- [ ] Commit during implementation as `feat(runtime): restore playback protections`.

## Task 5: Add A Focused Typed Operator Client And Actionable Errors

**Files:**
- Create: `apps/web/src/operator/playback-api.ts`
- Create: `apps/web/src/operator/playback-api.test.ts`
- Modify: `apps/web/src/management/http-errors.ts`
- Modify: `apps/web/src/management/management-http-client.ts`
- Modify: `apps/web/src/management/management-http-client.test.ts`

**Produces:** A small playback-only API that uses the existing management session/CSRF transport, validates all server responses, and retains error code/reference metadata for Diagnostics links.

- [ ] Add failing API tests for exact methods, paths, bodies, schema parsing, malformed snapshots, 401 session refresh inherited from the HTTP client, replay 404, and safety persistence 500. Prove the factory uses that bootstrap without URL or browser-storage token transfer.
- [ ] Add failing management-client tests proving an HTTP error remains an `Error` with the existing human-readable message and also exposes optional `code` and `referenceId` without leaking the response body.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/operator/playback-api.test.ts apps/web/src/management/management-http-client.test.ts
```

Expected: the operator module and structured safe error do not exist.

- [ ] Add `ManagementHttpError extends Error` and a structured error reader while retaining `readHttpError` formatting for existing callers. The HTTP client throws `ManagementHttpError`; current `toThrow` behavior remains unchanged.

```ts
export class ManagementHttpError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly referenceId: string | null
  ) {
    super(message);
    this.name = "ManagementHttpError";
  }
}
```

- [ ] Implement `createHttpPlaybackApi` over one injected/default `ManagementHttpClient`. Parse every result with `playbackQueueSnapshotSchema.parse`; never cast unknown JSON to the snapshot type.
- [ ] Use the existing paths exactly: `/playback`, `/playback/pause`, `/playback/resume`, `/playback/mute`, `/playback/unmute`, `/playback/skip`, `/playback/replay`, and `/playback/do-not-disturb`.
- [ ] Re-run the focused command; expect pass.
- [ ] Commit during implementation as `feat(operator): add typed playback client`.

## Task 6: Build The Operator Shell And Polling Experience

**Files:**
- Create: `apps/web/src/operator/OperatorApp.tsx`
- Create: `apps/web/src/operator/OperatorApp.test.tsx`
- Create: `apps/web/src/operator/OperatorApp.stories.tsx`
- Create: `apps/web/src/operator/operator.css`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/server/src/http/routes/web-shell.ts`
- Modify: `apps/server/src/http/routes/web-shell.test.ts`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.tsx`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.stories.tsx`
- Modify: `apps/web/src/management/ManagementApp.test.tsx`
- Modify: `apps/web/src/App.css`

**Produces:** A separate responsive operator surface, bounded visible-tab polling, direct accessible controls, and one management link.

```text
+---------------------------------------------------------------+
| Stream Jams / Operator       Playback active | local only     |
+---------------------------------------------------------------+
| [Pause] [Mute] [DND off]          status/command announcement |
+---------------------+----------------------+------------------+
| Now playing         | Queue                | Recent           |
| Follow - Alex       | 1. Raid - River      | Cheer - Sam      |
| 2 alerts | P10      | 2. Sub - Jo          | [Replay]         |
| [Skip]              |                      |                  |
+---------------------+----------------------+------------------+

Narrow: header -> persistent status -> controls -> now -> queue -> recent
```

- [ ] Add failing web-shell tests proving `GET /operator` serves the production management asset shell while overlay routes retain transparent overlay HTML and existing redirects remain unchanged.
- [ ] Add failing management tests proving `Open operator console` links to `/operator`, opens a new tab with `rel="noreferrer"`, and does not enter the management client-side router.
- [ ] Add failing operator tests for:
  - initial loading, initial error/retry, idle, populated, and stale states;
  - current item, ordered queue, and recent item rendering;
  - pause/resume, mute/unmute, DND on/off, skip, and replay using returned snapshots immediately;
  - one pending command at a time and no duplicate action;
  - a poll started before a command cannot overwrite the command response;
  - polling pauses while hidden, refreshes immediately when visible, and backs off 2s/4s/8s/15s after later failures;
  - last snapshot remains visible and gets a stale label after refresh failure;
  - focus remains on the activated control and status/failure text is announced;
  - a `ManagementHttpError.referenceId` produces `/manage/diagnostics?reference=<encoded>` and other actionable failures link to `/manage/diagnostics` or `/manage/modules/alerts`.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/http/routes/web-shell.test.ts apps/web/src/management/ManagementApp.test.tsx apps/web/src/operator/OperatorApp.test.tsx
```

Expected: route, link, polling, and operator assertions fail.

- [ ] Register `/operator` with `renderer.renderManagementShell()`; reuse the built asset shell rather than adding a renderer method. In `main.tsx`, dispatch exact `/operator` before the management fallback and toggle `operator-shell`, `management-shell`, and `overlay-shell` body classes explicitly.

```tsx
const operatorRoute = window.location.pathname === "/operator";
const overlayRoute = window.location.pathname.startsWith("/overlay/");

{overlayRoute ? <OverlayApp /> : operatorRoute ? <OperatorApp /> : <App />}
```

- [ ] Implement polling inside `OperatorApp` with refs for timer, request generation, disposed state, and command-in-flight state. Use a 2-second success interval and 15-second maximum backoff. Clear timers on unmount/hidden; on visible, refresh immediately.
- [ ] Before a command, increment the request generation and clear the poll timer. Apply only that command response, announce the result, then schedule normal polling. Ignore any earlier poll response whose captured generation no longer matches.
- [ ] Render only allowlisted fields from `PlaybackQueueItem`: formatted event type, actor display name, alert count, priority, status, enqueued/started/completed times. Do not render message, metadata, provider JSON, IDs by default, or alert text.
- [ ] Use existing design tokens, button/focus styles, `StatusBadge`, and `ManagementErrorBanner` where their current props fit. Keep the operator layout local; do not add a generic shell component.
- [ ] Desktop layout: persistent header/status, global controls, now-playing card, queue, recent. At the existing narrow breakpoint, use one column with full-width controls and no horizontal page scroll.
- [ ] Use semantic headings/lists, native buttons, `aria-pressed` for DND, one polite status region, one alert region, visible focus, and no required animation. The browser's existing document language/direction remains authoritative.
- [ ] Add Storybook states: `Idle`, `ActiveQueue`, `Paused`, `Muted`, `DoNotDisturb`, `StaleSnapshot`, `InitialFailure`, and `CommandFailure`. Use production `OperatorApp` with a small story-local `PlaybackApi` fake; do not create a second component.
- [ ] Re-run the focused command; expect pass.
- [ ] Commit during implementation as `feat(operator): add playback console`.

## Task 7: Cover Browser Workflows And Live Playback Ordering

**Files:**
- Create: `tests/e2e/operator.spec.ts`
- Modify if needed for shared fixtures only: `tests/e2e/overlay-playback.spec.ts`

**Produces:** Browser-level evidence for route separation, controls, stale handling, accessibility, and skip/mute behavior observable at the app boundaries.

- [ ] Add Playwright route-backed tests that open management, activate `Open operator console`, and prove the new page is `/operator` without management navigation.
- [ ] Mock session plus protected playback endpoints and prove each reversible command uses CSRF, applies its returned snapshot immediately, skip changes now-playing, and replay adds the known recent item.
- [ ] Use a deferred `GET /playback` response to prove an older poll cannot overwrite a newer command result.
- [ ] Prove a failed later poll keeps the last rows, exposes stale status plus a Diagnostics link, and resumes after visibility restoration.
- [ ] Add an accessibility scan and keyboard-only control pass for active and failure states.
- [ ] Retain real stop-before-next and immediate renderer mute assertions in coordinator/gateway/overlay unit integration tests; do not build a second full WebSocket harness solely for Playwright.
- [ ] Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm exec playwright test tests/e2e/operator.spec.ts tests/e2e/overlay-playback.spec.ts
```

Expected: pass after Tasks 1-6.

- [ ] Run Storybook gates:

```powershell
corepack.cmd pnpm build-storybook
corepack.cmd pnpm test:storybook:ci
```

Expected: all operator and changed overlay stories render without accessibility or console failures.

- [ ] Commit during implementation as `test(operator): cover live playback controls`.

## Task 8: Reconcile, Verify, And Hand Off BL-001

**Files:**
- Modify: `openspec/changes/add-alert-playback-operator-controls/tasks.md`
- Modify only if implementation reveals verified contract drift:
  - `openspec/changes/add-alert-playback-operator-controls/design.md`
  - `openspec/changes/add-alert-playback-operator-controls/specs/alert-playback-operator-controls/spec.md`
- Modify after implementation/spec synchronization: `docs/backlog.md`

**Produces:** A strictly validated, live-verified, independently reviewable BL-001 slice with canonical backlog state reconciled.

- [ ] Search the final diff for every OpenSpec requirement and map it to a test. Specifically verify persistence failure, reconnect mute state, stop-before-next ordering, muted remote-TTS suppression, external-TTS recall boundary, hidden-tab polling, stale snapshot, authentication, redaction, keyboard focus, and status announcements.
- [ ] Run all repository gates from the root:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm build-storybook
corepack.cmd pnpm test:storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate add-alert-playback-operator-controls --strict
```

Expected: every command exits 0 with no skipped or weakened in-scope test.

- [ ] Rebuild and restart the affected local service, wait for the health route, and reload both management and `/operator` against the new build.
- [ ] Live-check: management link; empty/operator queue; pause and restart restoration; browser-source mute and reconnect; future remote-TTS suppression while muted; DND; skip without old/new overlap; replay; failed persistence; stale refresh; Diagnostics deep-link. State explicitly that already-speaking external TTS is not recalled.
- [ ] Use `stream-jams-frontend-review` for an independent frontend review of the final production UI, Storybook states, responsive behavior, a11y, redaction, and overlay failure behavior. Resolve in-scope findings and rerun affected gates.
- [ ] Mark all OpenSpec tasks complete only after evidence exists. Sync/archive the OpenSpec change through the repo's normal completion workflow, then remove BL-001 from `docs/backlog.md`; do not remove the backlog row while implementation or spec synchronization remains incomplete.
- [ ] Commit final reconciliation during implementation as `docs(operator): complete BL-001`.

## Migration, Rollout, And Rollback

- This change has no SQLite migration and no persisted queue-item migration.
- Existing config files and backups without `playback` parse as all false. The next successful config write serializes the field through the normal file-store path.
- Existing overlay browser sources update with the web bundle and continue using their current route keys/socket URLs. Unknown pre-update server messages are ignored by older clients during a rolling local restart; restart server and web together for live verification.
- Roll out locally with safety flags initially inherited from config, prominently visible in `/operator`. No feature flag is needed because the route is local-only and the old protected playback routes remain the control boundary.
- Rollback removes `/operator` and the two message handlers. Additive playback config may remain on disk and is ignored by older builds that parse only their known schema behavior; before relying on rollback, verify the target version's object strictness. Queue and recent history remain ephemeral in both directions.
- No remote TTS recall claim is made in UI, docs, or tests. Muting guarantees suppression only before a new external trigger is handed off.

## File-Level Review Checklist

- Core: one safety-state type/schema/default; no duplicate booleans or weakened parsing.
- Config: older-file default, partial updates, atomic file-store behavior, backup restore, no storage-path regression.
- Coordinator: persist-before-apply, stop-before-next, delivery-time TTS once per current item, no unhandled provider failure.
- Gateway/client: same authorization/socket, audio state on every connection, targeted stop only, malformed messages ignored.
- Overlay: transparent until mute state known, immediate media/speech mute, no false completion on stop, reduced/no motion unchanged.
- Operator: same session/CSRF, parsed snapshots, visible-only bounded polling, command response wins races, redacted allowlist, complete states, keyboard/focus/status behavior.
- Product: no management playback page, intake control, queue clear, raw metadata, remote access, new dependency, or premature full operator transport.
