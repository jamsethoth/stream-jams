# Shared Desktop Overlay Surface Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` inline, task by task. Use `superpowers:subagent-driven-development` only when the user chooses delegation. Steps use checkboxes; commit checkpoints require authorization.

**Goal:** Add one reusable, opt-in Windows visual surface and independent module layering for desktop and unified OBS, demonstrated with existing Alerts.

**Architecture:** The desktop main process owns a private visual window and validated IPC adapter; the service owns composition, configuration, and occurrence obligations. A dedicated web build entry reuses `OverlaySurface` without management credentials. Surface order and visibility are separate from module enablement and audio ownership.

**Tech Stack:** Existing Electron, React/Vite, TypeScript/Zod, Fastify/SQLite, Vitest, Storybook, and Playwright; no new rendering framework.

**Spec:** [Product design](../specs/2026-09-07-screen-effects-design.md), [change design](../../../openspec/changes/add-shared-desktop-overlay-surface/design.md), [normative scenarios](../../../openspec/changes/add-shared-desktop-overlay-surface/specs/shared-overlay-surfaces/spec.md), [OpenSpec tasks](../../../openspec/changes/add-shared-desktop-overlay-surface/tasks.md).

## Global constraints

All [execution-index constraints](2026-09-08-screen-effects-implementation.md#global-constraints) apply. In particular: Windows only; one explicitly bound monitor; first-use disabled; transparent/frameless/click-through/non-focusable/topmost/no taskbar; no exclusive-full-screen guarantee; retain hardware acceleration disabled; Landscape `1920 × 1080` uniform fit; no copyable desktop URL; desktop has no audio/TTS authority. Ownership expires within 10 seconds; occurrence watchdog is duration plus 5 seconds; one automatic renderer recreation, then explicit Retry, with no interrupted replay.

## File ownership and integration seams

| Area | Responsibility |
| --- | --- |
| `packages/core/src/overlay-modules/surface-configuration.ts` | Surface schemas, complete-order validation, registry reconciliation, repository interface |
| `packages/core/src/overlays/desktop-visual-transport.ts` | Private visual batch/recipient contracts and strict schemas |
| `packages/core/src/overlays/playback-timing.ts` | Occurrence timing and late-recipient offset calculation; reused by routed audio |
| `apps/server/src/modules/overlay-surfaces/` | SQLite configuration and service-side desktop delivery adapter |
| `apps/desktop/src/overlay/` | Native window policy, preload, host, worker transport; no React imports |
| `apps/web/src/desktop-overlay/` | Production visual renderer entry; no Node/Electron imports |
| `apps/web/src/overlay/components/OverlaySurface.tsx` | Existing media renderer with stable module-level stacking |
| `apps/web/src/management/settings/OverlaySurfacesPanel.tsx` | Explicit surface settings and capability diagnostics |

Paths identified as **Create** below are proposed files, not claims that those files already exist. Export new public core contracts through `packages/core/src/index.ts`. Keep all server/desktop NodeNext relative imports explicitly suffixed `.js`.

### S1-1: Prove the Windows window policy before broad implementation

Checkpoint September 9: the isolated native gate passed; see [evidence and scope boundaries](../../verification/shared-desktop-overlay.md). Production service-loss/lease/recovery acceptance remains in S1-3/S1-6. Earlier failed-motion observations are retained, not claimed resolved.

**Files**

- Create: `apps/desktop/src/overlay/overlay-window-policy.ts`, `apps/desktop/src/overlay/overlay-window-policy.test.ts`, `apps/desktop/src/overlay/overlay-window.ts`.
- Create: `tests/fixtures/create-media-fixtures.ts`, `tests/desktop/overlay-window.spec.ts`, `docs/verification/shared-desktop-overlay.md`.
- Modify: `apps/desktop/src/main.ts`, `tests/desktop/windows-lifecycle.spec.ts` only for owned overlay lifetime.

**Interfaces**

- Produce `overlayWindowPolicy`: immutable native constructor options; its implementation includes `transparent: true`, `frame: false`, `focusable: false`, `skipTaskbar: true`, `show: false`.
- Produce `SelectedDisplay = { id: string; bounds: { x: number; y: number; width: number; height: number }; scaleFactor: number }` and `selectBoundDisplay(displays: readonly SelectedDisplay[], selectedId: string | null): SelectedDisplay | null`.
- Produce test-only `recordNeutralClip(page: Page, options: { width: number; height: number; durationMs: number; withAudio: boolean }): Promise<Uint8Array>` in the fixture utility. `Page` is Playwright's existing type; no production dependency is added.

- [ ] Write this policy regression and absent/changed-ID cases:

```ts
import { expect, it } from "vitest";
import { overlayWindowPolicy, selectBoundDisplay } from "./overlay-window-policy.js";

it("never substitutes the primary display for a missing binding", () => {
  const primary = { id: "1", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
  expect(selectBoundDisplay([primary], "2")).toBeNull();
  expect(overlayWindowPolicy).toMatchObject({
    transparent: true, frame: false, focusable: false, skipTaskbar: true, show: false
  });
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run apps/desktop/src/overlay/overlay-window-policy.test.ts`; expect failure from the new module/export before implementation.
- [ ] Implement exact-ID selection, then the Electron adapter. Apply `setIgnoreMouseEvents(true)`, non-focusable always-on-top behavior, explicit selected display bounds, and `showInactive()` only after content is ready. Do not create the production window before opt-in. Register/remove display listeners with window lifetime. Preserve the existing acceleration workaround and native exit assertions.

```ts
export function selectBoundDisplay(
  displays: readonly SelectedDisplay[], selectedId: string | null
): SelectedDisplay | null {
  return displays.find(display => display.id === selectedId) ?? null;
}
```

- [ ] Implement `recordNeutralClip` using Playwright Chromium's `canvas.captureStream(30)` and `MediaRecorder`: draw a neutral moving square over a transparent canvas; clear each frame; bound recording to the requested duration; collect Blob bytes; stop every stream track and animation callback. For audio fixtures, connect a low-gain oscillator through a `MediaStreamAudioDestinationNode` and pulse it with the visible marker. Try only browser-reported supported WebM recording MIME types; record the actual MIME and fail if none is supported. Generate 1080p/1440p probe media in the test output directory, not the user's library. Verify decoded transparency rather than assuming recorded alpha survives.
- [ ] Re-run the focused policy test and `corepack.cmd pnpm typecheck`; expect pass. Add packaged Playwright assertions that the overlay is not focusable/taskbar-visible and management can hide without destroying it. Record manual mouse/keyboard pass-through, mixed-DPI bounds, transparency, moving-video smoothness, and bounded Quit in the verification report. Retain failed/incomplete measurements as gate failures.
- [ ] Stop before S1-2 if this backend cannot meet the native gate. Otherwise prepare a scoped checkpoint for the policy/probe and its evidence; commit only when authorized.

### S1-2: Persist independent surface rows and preserve migrations

Checkpoint September 9: implementation and focused validation are recorded in the [verification report](../../verification/shared-desktop-overlay.md#s1-2-persistence-checkpoint--september-9). Recipient identity is defined in `overlays/visual-recipient.ts` for reuse by the later transport; do not duplicate that type in S1-3. Runtime repository injection and Settings activation remain later steps.

**Files**

- Create: `packages/core/src/overlay-modules/surface-configuration.ts`, `packages/core/src/overlay-modules/surface-configuration.test.ts`.
- Create: `apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.ts`, `apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.test.ts`.
- Create: `apps/server/src/modules/db/migrations/020-overlay-surfaces.ts` at the inspected baseline; reassign the next unused number after rebasing, never overwrite a delivered migration.
- Modify: `packages/core/src/index.ts`, `apps/server/src/modules/db/database.ts`, `packages/core/src/overlay-modules/overlay-composition-service.ts`, its `.test.ts`, `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`, its `.test.ts`, `apps/server/src/modules/backup/configuration-backup-service.test.ts`.

**Interfaces**

```ts
export type SurfaceLayer = { moduleId: string; visible: boolean };
export type SurfaceConfiguration =
  | { id: string; kind: "desktop"; enabled: boolean; displayId: string | null;
      opacity: number; layers: SurfaceLayer[] }
  | { id: string; kind: "unified-browser"; overlayId: string; layers: SurfaceLayer[] };
export interface SurfaceRepository {
  list(): Promise<SurfaceConfiguration[]>;
  save(configuration: SurfaceConfiguration): Promise<void>;
}
export function reconcileSurfaceLayers(
  saved: readonly SurfaceLayer[], registeredIds: readonly string[]
): SurfaceLayer[];
export function validateSurfaceOrder(
  proposed: readonly SurfaceLayer[], registeredIds: readonly string[]
): void;
```

`validateSurfaceOrder` rejects missing, repeated, or unregistered IDs; reconciliation handles registry discovery separately. Reconciliation retains known rows' relative order, removes unregistered IDs, and appends new registered IDs hidden. Desktop ID is `desktop:primary`; unified surface IDs derive from the stable unified output ID, never its secret route key.

- [ ] Write the reconciliation regression, schema cases for `opacity` outside `[0,1]`, and complete-order/duplicate rejection:

```ts
import { expect, it } from "vitest";
import { reconcileSurfaceLayers, validateSurfaceOrder } from "./surface-configuration.js";
it("adds registered modules hidden at the bottom", () => {
  expect(reconcileSurfaceLayers([{ moduleId: "alerts", visible: true }], ["alerts", "screen-effects"]))
    .toEqual([{ moduleId: "alerts", visible: true }, { moduleId: "screen-effects", visible: false }]);
  expect(() => validateSurfaceOrder([{ moduleId: "alerts", visible: true }], ["alerts", "screen-effects"]))
    .toThrow();
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/overlay-modules/surface-configuration.test.ts`; expect missing exports or failing reconciliation before implementation.
- [ ] Implement strict discriminated schemas, then transactional `overlay_surfaces` persistence (`id`, `kind`, `configuration_json`, `updated_at`). Keep desktop disabled/unbound by default. Derive existing unified membership and actual old paint order from current output configuration; convert bottom-first paint order to topmost-first rows explicitly. Do not use new hidden defaults to blank an existing output. Global module disable still wins; module-only outputs bypass surface preferences.

```ts
const known = new Set(registeredIds);
const retained = saved.filter(row => known.has(row.moduleId));
const retainedIds = new Set(retained.map(row => row.moduleId));
const appended = registeredIds.filter(id => !retainedIds.has(id))
  .map(moduleId => ({ moduleId, visible: false }));
return [...retained, ...appended];
```

- [ ] Extend backup table enumeration, validation, restore order, and rollback. Legacy archives without surface rows get migrated defaults. Export/import desktop configuration disabled with `displayId: null`; retain opacity and layer preferences. Include no renderer generation, clients, lease, pending work, or credentials. Preserve archive envelope version 2 unless its wire shape changes; the SQLite schema version advances through migrations. Add failed-save and failed-restore assertions proving all prior rows remain intact.
- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/overlay-modules apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.test.ts apps/server/src/modules/backup` and `corepack.cmd pnpm typecheck`; expect focused suites and strict types to pass. Prepare the persistence/compatibility checkpoint; do not mark this slice complete.

### S1-3: Add a private, bounded desktop visual host

September 9 source checkpoint: timing, strict visual-only transport, host/preload/private session, asset resolver, worker/supervisor leases and production wiring are implemented. Worker `start()` resolves on completion, not admission. Connection generations and occurrence keys reject stale acknowledgements; worker, host and renderer enforce bounded admission and lifetimes. S1-4/S1-5 renderer, recipient and Settings integration are also implemented. Automated workspace/browser/Storybook evidence and remaining packaged native/physical acceptance gates are recorded in `docs/verification/shared-desktop-overlay.md`; source integration is not yet full native product acceptance.

**Files**

- Create: `packages/core/src/overlays/playback-timing.ts`, its `.test.ts`, `packages/core/src/overlays/desktop-visual-transport.ts`, its `.test.ts`.
- Create: `apps/desktop/src/overlay/overlay-ipc.ts`, `overlay-preload.cts`, `overlay-host.ts`, `overlay-host.test.ts`, `worker-overlay-client.ts`, `worker-overlay-client.test.ts` in that directory.
- Modify: `apps/desktop/src/overlay/overlay-window.ts`, `apps/desktop/src/desktop-ipc.ts`, `apps/desktop/src/service-worker.ts`, `apps/desktop/src/service-supervisor.ts`, its `.test.ts`, `apps/desktop/src/main.ts`, `apps/desktop/build-audio.mjs`, `packages/core/src/index.ts`.

**Interfaces**

```ts
export interface PlaybackTiming { startsAtEpochMs: number; endsAtEpochMs: number }
export function playbackOffsetMs(timing: PlaybackTiming, nowEpochMs: number): number | null;
export interface VisualRecipientKey {
  surfaceId: string; moduleId: string; occurrenceId: string; generation: number;
}
export interface DesktopVisualBatch {
  key: VisualRecipientKey;
  timing: PlaybackTiming;
  instructions: readonly OverlayInstruction[];
  assets: readonly { assetId: string; mimeType: string; bytes: Uint8Array }[];
}
export interface DesktopOverlayTransport {
  configure(config: Extract<SurfaceConfiguration, { kind: "desktop" }>): Promise<void>;
  prepare(batch: DesktopVisualBatch): Promise<"ready" | "unavailable">;
  start(key: VisualRecipientKey): Promise<void>;
  stop(key: VisualRecipientKey): Promise<void>;
  retry(): Promise<void>;
  close(): Promise<void>;
}
```

`OverlayInstruction` is the existing core type, but the desktop boundary schema rejects non-null `audio` or `tts`; it also verifies every instruction's module identity and permitted visual/text/shape fields. `playbackOffsetMs` returns `null` at/after the end, otherwise `max(0, now - start)`; recipients wait until start if it is in the future. Validate finite integer epochs and `0 < end - start <= 120000`.

- [ ] Write the timing and strict-boundary regressions before the transport:

```ts
import { expect, it } from "vitest";
import { playbackOffsetMs } from "./playback-timing.js";
it("late attachment cannot restart or extend an occurrence", () => {
  const timing = { startsAtEpochMs: 1000, endsAtEpochMs: 11000 };
  expect(playbackOffsetMs(timing, 4000)).toBe(3000);
  expect(playbackOffsetMs(timing, 11000)).toBeNull();
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/overlays/playback-timing.test.ts packages/core/src/overlays/desktop-visual-transport.test.ts`; expect missing timing/transport exports or rejected expected cases.
- [ ] Add discriminated `prepare/start/stop/complete/error/ready` messages with recipient key and request ID, plus worker-generation envelopes analogous to existing audio IPC. Reject unknown fields, stale worker/renderer generations, wrong owned sender, non-top frames, and messages after disposal. Add an `overlay-lease` heartbeat every 2 seconds and invalidate ownership after 10 seconds. Bound pending maps to admitted occurrences; settle and delete every entry/timer on stop, completion, loss, or deadline.
- [ ] Use a separate nonpersistent session and `stream-jams-overlay` secure custom protocol. Serve only exact staged renderer paths from an allowlist; deny navigation/popups/webviews and all permissions. Set sandbox/context isolation on, Node integration off, background throttling off. Preload exposes only typed receive/ack operations via `contextBridge`, not arbitrary IPC or file access. Extend the existing preload bundling script with an explicit overlay entry, leaving audio entry names/output intact.
- [ ] Validate asset IDs against the batch, read only owned asset-store files, and reject remote URLs or supplied paths. Reuse visual per-asset policy (image 10 MiB, GIF 25 MiB, video 100 MiB), with a proposed 128 MiB in-flight desktop transfer budget; release the budget when bytes are discarded. Reject only the unavailable desktop obligation when the budget is exceeded. Verify checksums/MIME/size after bounded reads, create renderer-local Blob URLs, and revoke on settlement. Do not send management/OBS credentials.
- [ ] Implement the host's single automatic recreation and explicit Retry. Crash, missing display, ownership loss, or Quit hides/destroys the surface and settles all affected desktop batches. Recovery accepts future work only; interrupted batches are not resent. Add fake-clock tests at 9,999/10,000 ms, late acks after recreation, twice-failed recreation, cancel-during-prepare, and idempotent close.
- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/overlays apps/desktop/src/overlay apps/desktop/src/service-supervisor.test.ts` plus `corepack.cmd pnpm typecheck`; expect pass. Prepare a transport/security checkpoint with no claims of OBS integration yet.

### S1-4: Deliver Alerts to a first-class desktop recipient and reuse rendering

**Files**

- Create: `apps/server/src/modules/overlay-surfaces/desktop-visual-sink.ts`, its `.test.ts`, `packages/core/src/overlays/visual-recipient-ledger.ts`, its `.test.ts`.
- Create: `apps/web/desktop-overlay.html`, `apps/web/vite.desktop-overlay.config.ts`, `apps/web/src/desktop-overlay/main.tsx`, `DesktopOverlayApp.tsx`, `DesktopOverlayApp.test.tsx`, `desktop-overlay-api.ts` in that directory.
- Modify: `apps/web/package.json`, `scripts/stage-desktop.mjs`, `apps/server/src/modules/playback/playback-coordinator.ts`, its `.test.ts`, `apps/server/src/runtime/runtime-composition.ts`, `apps/server/src/websocket/overlay-gateway.ts`, its `.test.ts`, `packages/core/src/overlays/types.ts`, `packages/core/src/overlay-modules/types.ts`, their boundary schemas, `apps/web/src/overlay/components/OverlaySurface.tsx`, its `.test.tsx` and `.stories.tsx`.

**Interfaces**

- Consume `DesktopOverlayTransport`, `DesktopVisualBatch`, `PlaybackTiming`, and `SurfaceConfiguration` from S1-2/S1-3.
- Produce `VisualRecipientLedger.add(key: VisualRecipientKey): void`, `.settle(key: VisualRecipientKey): boolean`, `.pending(occurrenceId: string): number`. Duplicate add/settle is idempotent; stale generation cannot settle a new key.
- Extend module snapshot with optional `surfaceLayer: { visible: boolean; zIndex: number }`; absence preserves module-only output behavior. Do not set module `enabled: false` solely to hide its visuals.
- Extend normalized visual instructions with `timing?: PlaybackTiming` for compatibility; new desktop batches always have timing. Audio consumes this same timing contract in slice 2.

- [ ] Write the recipient regression and Alert coordinator tests proving desktop-only delivery without an OBS client:

```ts
import { expect, it } from "vitest";
import { VisualRecipientLedger } from "./visual-recipient-ledger.js";
it("ignores completion from a destroyed renderer", () => {
  const ledger = new VisualRecipientLedger();
  const key = { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "o1", generation: 2 };
  ledger.add(key);
  expect(ledger.settle({ ...key, generation: 1 })).toBe(false);
  expect(ledger.pending("o1")).toBe(1);
  expect(ledger.settle(key)).toBe(true);
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/overlays/visual-recipient-ledger.test.ts apps/server/src/modules/playback/playback-coordinator.test.ts`; expect the new recipient cases to fail before integration.
- [ ] Add a desktop target independently of browser client enumeration. Require the active Alert set and enabled/reviewed Landscape profile; never manufacture a connected OBS client or enable an unreviewed profile. Resolve the occurrence once, collect recipient obligations before dispatch to avoid synchronous-ack races, and settle desktop independently from browser/device audio. Finish when obligations settle or the duration-plus-5-second watchdog expires. CLI composition supplies an unavailable transport, not a mock ready desktop.
- [ ] Build the web renderer through a separate Vite config with React's existing dependency ownership, `base: "./"`, and output `apps/web/dist-desktop-overlay`. Add this build to web's build script after its normal build; stage its output under desktop's private resources after the workspace build. Assert packaged references are relative and self-contained. Do not serve the management application in the overlay or import web source directly into the desktop TypeScript project.
- [ ] Render stable module wrappers and stable occurrence keys. Map top row to largest outer z-index, put `isolation: isolate` on each positioned module wrapper, and keep module audio nodes outside visual visibility filtering. Use `visibility`/visual projection independently of audio instruction lifetime. Reordering changes styling only. Hidden-to-visible video seeks to the shared offset before display; if seeking fails or the occurrence has expired, remain transparent. Images/GIFs have no soundtrack; do not claim frame-accurate GIF seeking.

```tsx
<div key={moduleSnapshot.moduleId} style={{ position: "absolute", inset: 0,
  isolation: "isolate", zIndex: moduleSnapshot.surfaceLayer?.zIndex ?? 0 }}>
  <div style={{ visibility: moduleSnapshot.surfaceLayer?.visible === false ? "hidden" : "visible" }}>
    {visualChildren}
  </div>
  {audioChildren}
</div>
```

Here `visualChildren` and `audioChildren` are local arrays built by the existing normalized instruction renderer: visuals/text/shapes in the former, existing audio/TTS in the latter. The desktop schema permits only the former. Preserve one completion owner per instruction when splitting its presentation; do not duplicate completion callbacks.

- [ ] Add renderer tests retaining the same video DOM node on reorder, containing a module's huge internal z-index, preserving browser audio on hide, late seek on re-show, and transparent malformed/missing-asset failure. Add exact packaged resource/sender tests. Run `corepack.cmd pnpm exec vitest run packages/core/src/overlays apps/server/src/modules/overlay-surfaces apps/server/src/modules/playback apps/web/src/overlay apps/web/src/desktop-overlay` and `corepack.cmd pnpm typecheck`; expect pass. Prepare the first-class delivery checkpoint.

### S1-5: Expose explicit surface settings with production UI coverage

**Files**

- Create: `apps/server/src/http/routes/overlay-surfaces.ts`, its `.test.ts`; `apps/web/src/management/settings/overlay-surfaces-api.ts`, its `.test.ts`; `OverlaySurfacesPanel.tsx`, its `.test.tsx` and `.stories.tsx` in that settings directory.
- Modify: `apps/server/src/app.ts`, `apps/server/src/runtime/runtime-composition.ts`, `apps/web/src/management/settings/SettingsPanel.tsx`, its `.test.tsx`, `apps/web/src/management/management-api.ts`, `tests/e2e/settings.spec.ts`.
- Create: `tests/e2e/overlay-surfaces.spec.ts`.

**Interfaces**

- `GET /overlay-surfaces` → `{ surfaces: SurfaceConfiguration[], desktop: { available: boolean, displays: SelectedDisplay[], state: "disabled" | "ready" | "unavailable" | "failed", message: string | null } }`.
- `PUT /overlay-surfaces/:surfaceId` accepts a complete validated `SurfaceConfiguration`; route ID must equal body ID. `POST /overlay-surfaces/desktop/retry` performs explicit recovery, never a playback test. Use the repository's current root-level route convention, not a new `/api` prefix.
- `OverlaySurfacesPanel` receives `load(): Promise<SurfaceSettingsView>` and `save(value: SurfaceConfiguration): Promise<SurfaceSettingsView>`; `SurfaceSettingsView` is the GET response type above. Follow the existing management client error/CSRF conventions.

- [ ] Add a server test that an unknown module or duplicate row returns validation failure without persistence. Add a component test for keyboard order and separate drafts. A minimal UI regression anchor:

```ts
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverlaySurfacesPanel } from "./OverlaySurfacesPanel.js";
it("does not save or open the HUD while choosing a display", async () => {
  const view = { surfaces: [{ id: "desktop:primary", kind: "desktop" as const,
    enabled: false, displayId: null, opacity: 1, layers: [] }],
    desktop: { available: true, displays: [{ id: "1", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }],
      state: "disabled" as const, message: null } };
  const save = vi.fn(async () => view);
  render(<OverlaySurfacesPanel load={async () => view} save={save} />);
  await userEvent.selectOptions(await screen.findByLabelText("Display"), "1");
  expect(save).not.toHaveBeenCalled();
});
```

- [ ] Run `corepack.cmd pnpm exec vitest run apps/web/src/management/settings/OverlaySurfacesPanel.test.tsx apps/server/src/http/routes/overlay-surfaces.test.ts`; expect new UI/route tests to fail.
- [ ] Implement thin protected routes with existing management auth/CSRF/origin/rate-limit policy. Revalidate selected display at apply time; a disconnected stale selection cannot start a fallback display. Persist before applying; on host application failure retain saved intent with an actionable failed/unavailable state. Invalid or failed persistence leaves both saved settings and host unchanged.
- [ ] Add Settings sections for desktop enable/display/opacity and independent desktop/unified layer lists, keyboard Up/Down buttons, visibility switches, explicit Save, dirty-state protection, loading/empty/CLI/missing-monitor/error states. Keep module Browser sources in module context. Provide neutral stories for overlapping layers and unavailable states; no real route keys or device IDs. Reuse current token/layout patterns and follow the frontend guide's accessibility gates.
- [ ] Add Playwright save/reload/order/opacity persistence, failed-save draft retention, missing display, and no implicit test workflows. Run `corepack.cmd pnpm exec vitest run apps/web/src/management/settings apps/server/src/http/routes/overlay-surfaces.test.ts`, `corepack.cmd pnpm typecheck`, and `corepack.cmd pnpm exec playwright test tests/e2e/overlay-surfaces.spec.ts`. Expect pass, then prepare the Settings checkpoint.

### S1-6: Complete release gates and scenario reconciliation

**Files**

- Modify: `docs/verification/shared-desktop-overlay.md`, `tests/desktop/overlay-window.spec.ts`, `tests/desktop/windows-lifecycle.spec.ts`, `docs/product-plan.md`, `docs/backlog.md`, `docs/mvp-runbook.md`.
- Track completion in `openspec/changes/add-shared-desktop-overlay-surface/tasks.md` only after evidence exists.

- [ ] Run the [shared verification commands](2026-09-08-screen-effects-implementation.md#shared-verification-ledger) and `openspec.cmd validate add-shared-desktop-overlay-surface --strict`. Capture actual exit/results and diagnose failures; do not conflate focused tests with full-suite success.
- [ ] Rebuild/restart only the authorized runtime, check health and reload. Using neutral media, verify Alerts on desktop with no OBS connected, Alerts on both, independent layer changes, separate audio continuing when a visual is hidden, and no playback on settings selection. With approval to open the actual source, verify OBS alpha and module-specific source behavior.
- [ ] Repeat selected-display loss/rebind, two displays/mixed DPI, management hidden, renderer crash twice/Retry, service loss, and Quit with native process-exit evidence. Include 1080p/1440p smoothness and focus/input evidence from S1-1. A true exclusive-full-screen game obscuring the window is a documented limitation, not permission to add injection.
- [ ] Reconcile the matrix below with test names and manual evidence links in the verification report. Update setup copy with windowed/borderless and explicit monitor requirements. Sync completed specs and update backlog status through the approved workflow; do not claim the downstream module is built. Prepare final local handoff; publish/merge only if separately requested.

## Coverage map

| Normative requirement | Implementation/verification tasks |
| --- | --- |
| Desktop Is A Shared Visual Recipient | S1-2, S1-3, S1-4, S1-6 |
| Desktop Window Never Intercepts Normal Input | S1-1, S1-3, S1-6 |
| Desktop Display Selection Fails Closed | S1-1, S1-2, S1-3, S1-5, S1-6 |
| Each Shared Surface Owns Ordered Module Layers | S1-2, S1-4, S1-5 |
| Surface Visibility Does Not Own Audio Or Queues | S1-4, S1-6 |
| Desktop Recipient Failures Are Bounded | S1-3, S1-4, S1-6 |
| Shared Surface Configuration Preserves Security And UX | S1-2, S1-3, S1-5 |
| Windows Feasibility Is Demonstrated Before Delivery | S1-1, S1-6 |

OpenSpec task groups: `1.1–1.3 → S1-1 + index entry gates`; `2.1–2.4 → S1-2`; `3.1–3.2,3.4,3.6 → S1-3`; `3.3,3.5 → S1-4`; `4.1–4.4 → S1-5/S1-6`; `5.1–5.3 → S1-6`. No acceptance checkbox is satisfied by this plan alone.
