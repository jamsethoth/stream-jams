# Automatic Local Output Rebinding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in, exact-name recovery for changed audio-device and desktop-display IDs, while preserving fail-closed playback and correcting the oversized Live TTS checkbox.

**Architecture:** A small core matcher returns none, one, or ambiguous exact label matches. `AudioOutputService` and `SurfaceSettingsService` own domain-specific compare-before-write reconciliation, persist a replacement ID before applying it, and expose typed session state to management UI; runtime composition invokes both at startup. Existing route and surface repositories remain the persistence boundaries, with schema migration 026 adding the audio opt-in and compatible JSON defaults adding the display label and opt-in.

**Tech Stack:** TypeScript 6, Zod, Node `node:sqlite`, Fastify, React 19, Vitest, Testing Library, Storybook, Playwright, Electron.

**Spec:** `docs/superpowers/specs/2026-09-26-automatic-local-output-rebinding-design.md`

## Global Constraints

- Automatic matching is opt-in per audio route and separately for the desktop display; every existing and new binding defaults off.
- Match labels with exact, case-sensitive equality and accept only one current candidate; zero and multiple matches remain unavailable.
- Never fall back to default or communications audio aliases, Browser Source, the primary display, coordinates, bounds, scale factor, enumeration order, or fuzzy labels.
- Persist the replacement ID before applying or reporting it ready; a failed write leaves the old binding authoritative.
- Playback already being admitted or played keeps its original binding snapshot; automatic repair applies only to later occurrences and never replays interrupted content.
- The server derives trusted labels from current desktop inventories; browser requests cannot author endpoint labels.
- Portable backups clear machine-local IDs, labels, and automatic-follow consent.
- The Live TTS correction reuses `alert-editor-inspector__check`, renders the native checkbox at `16px` by `16px`, and changes no TTS behavior.
- Add no dependency and no native Windows bridge.

## Review Focus

- Two connected endpoints with the same exact label must remain ambiguous and unavailable, with no enumeration-order tie break; Task 2 and both service tasks pin this.
- A manual rebind or deletion completed while enumeration is pending must win over stale automatic reconciliation; Tasks 3 and 4 pin compare-before-write behavior.
- Legacy route rows and desktop JSON without new fields must parse as opt-out without rewriting the chosen ID; Task 2 pins migration and compatibility.
- Export and restore must not reactivate automatic matching on a different machine; Task 5 pins portable projections and validation.
- A persistence or host-apply failure must never create an ephemeral replacement binding; Tasks 3 and 4 separately pin durable-before-use and failure reporting.

---

### Task 1: OpenSpec change and normative deltas

**Files:**
- Create: `openspec/changes/add-automatic-local-output-rebinding/.openspec.yaml`
- Create: `openspec/changes/add-automatic-local-output-rebinding/proposal.md`
- Create: `openspec/changes/add-automatic-local-output-rebinding/design.md`
- Create: `openspec/changes/add-automatic-local-output-rebinding/tasks.md`
- Create: `openspec/changes/add-automatic-local-output-rebinding/specs/alert-audio-routing/spec.md`
- Create: `openspec/changes/add-automatic-local-output-rebinding/specs/shared-overlay-surfaces/spec.md`
- Create: `openspec/changes/add-automatic-local-output-rebinding/specs/configuration-backup-restore/spec.md`

**Interfaces:**
- Consumes: the approved design spec and current canonical OpenSpec requirements.
- Produces: strict-validating delta requirements and a task ledger matching Tasks 2–8 below.

- [ ] **Step 1: Create the change artifacts**

Write proposal, design, delta specs, and tasks for per-route and per-display opt-in, exact unique matching, durable-before-use updates, future-occurrence-only recovery, portable unbinding, and the existing-spec-only Live TTS correction.

- [ ] **Step 2: Validate the change before implementation**

Run: `openspec.cmd validate add-automatic-local-output-rebinding --strict --json`

Expected: exit `0`, every requirement and scenario valid, no placeholder or missing-artifact findings.

- [ ] **Step 3: Commit**

```bash
git add openspec/changes/add-automatic-local-output-rebinding
git commit -m "docs: specify automatic output rebinding"
```

### Task 2: Matching contracts, compatibility defaults, and persistence

**Files:**
- Create: `packages/core/src/local-outputs/exact-label-match.ts`
- Create: `packages/core/src/local-outputs/exact-label-match.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/audio/types.ts`
- Modify: `packages/core/src/audio/schemas.ts`
- Modify: `packages/core/src/audio/schemas.test.ts`
- Modify: `packages/core/src/audio/audio-output-route-repository.ts`
- Modify: `packages/core/src/overlay-modules/surface-configuration.ts`
- Modify: `packages/core/src/overlay-modules/surface-configuration.test.ts`
- Modify: `packages/core/src/overlays/desktop-overlay-status.ts`
- Modify: `packages/core/src/overlays/desktop-overlay-status.test.ts`
- Create: `apps/server/src/modules/db/migrations/026-automatic-output-rebinding.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`
- Modify: `apps/server/src/modules/audio/sqlite-audio-output-route-repository.ts`
- Modify: `apps/server/src/modules/audio/sqlite-audio-output-route-repository.test.ts`
- Modify: `apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.ts`
- Modify: `apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.test.ts`

**Interfaces:**
- Consumes: existing `AudioOutputDevice`, `SelectedDesktopDisplay`, `AudioOutputRoute`, and `SurfaceConfiguration` contracts.
- Produces: `findExactUniqueLabelMatch<T extends { readonly label: string }>(candidates: readonly T[], savedLabel: string): { kind: "none" } | { kind: "one"; value: T } | { kind: "ambiguous"; count: number }`; `AutomaticBindingState = "not-needed" | "disabled" | "no-match" | "ambiguous" | "rebound"`; `AudioOutputRoute.autoFollowDeviceName`; desktop `displayLabel` and `autoFollowDisplayName`; `surfaceConfigurationUpdateSchema` and its inferred input type.

- [ ] **Step 1: Write failing matcher and schema tests**

Add tests proving exact case-sensitive one-match success, zero match, two identical-label ambiguity, unchanged-ID handling by callers, audio defaults of `autoFollowDeviceName: false`, legacy desktop defaults of `displayLabel: null` and `autoFollowDisplayName: false`, rejection of opt-in without a trusted label, and a desktop update payload that omits `displayLabel`.

- [ ] **Step 2: Run the core tests and confirm failure**

Run: `corepack.cmd pnpm exec vitest run packages/core/src/local-outputs/exact-label-match.test.ts packages/core/src/audio/schemas.test.ts packages/core/src/overlay-modules/surface-configuration.test.ts packages/core/src/overlays/desktop-overlay-status.test.ts`

Expected: FAIL because the matcher and new fields/schemas do not exist.

- [ ] **Step 3: Implement the matcher and typed contracts**

Add the exact signature above, export it from `packages/core/src/index.ts`, extend audio route create/patch/status schemas, and split trusted persisted `surfaceConfigurationSchema` from browser-facing `surfaceConfigurationUpdateSchema`. Permit legacy `displayId` with a null label only when auto-follow is false; require ID and label when persisted auto-follow is true.

- [ ] **Step 4: Write failing database and repository tests**

Add migration-history assertions for `026-automatic-output-rebinding`; prove an existing route migrates to `auto_follow_device_name = 0`; prove repository round trips true/false; prove legacy surface JSON is normalized in memory without losing ID, opacity, or layers.

- [ ] **Step 5: Run persistence tests and confirm failure**

Run: `corepack.cmd pnpm exec vitest run apps/server/src/modules/db/database.test.ts apps/server/src/modules/audio/sqlite-audio-output-route-repository.test.ts apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.test.ts`

Expected: FAIL on the absent migration column and new contract fields.

- [ ] **Step 6: Implement migration 026 and repository mappings**

Add `auto_follow_device_name INTEGER NOT NULL DEFAULT 0 CHECK (auto_follow_device_name IN (0, 1))`, register migration 026, map booleans in audio reads/upserts, and ensure newly created default desktop configuration writes `displayLabel: null` and `autoFollowDisplayName: false`.

- [ ] **Step 7: Run focused core and persistence tests**

Run the commands from Steps 2 and 5.

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src apps/server/src/modules/db apps/server/src/modules/audio/sqlite-audio-output-route-repository.ts apps/server/src/modules/audio/sqlite-audio-output-route-repository.test.ts apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.ts apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.test.ts
git commit -m "feat: persist automatic output matching"
```

### Task 3: Audio-route reconciliation and startup recovery

**Files:**
- Modify: `apps/server/src/modules/audio/audio-output-service.ts`
- Modify: `apps/server/src/modules/audio/audio-output-service.test.ts`
- Modify: `apps/server/src/http/routes/audio-outputs.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.test.ts`

**Interfaces:**
- Consumes: `findExactUniqueLabelMatch`, `AutomaticBindingState`, `AudioOutputRoute.autoFollowDeviceName`, repository `save()`, and the existing configuration mutation gate.
- Produces: `AudioOutputService.reconcileBindings(): Promise<void>`; route status `automaticBindingState`; startup recovery before subsequent playback; session-scoped rebound/ambiguity state cleared by manual route mutation or restart.

- [ ] **Step 1: Write failing service tests for exact reconciliation**

Cover opted-out missing, opted-in unique match, case mismatch, zero match, duplicate-label ambiguity, enumeration failure, unbinding forcing opt-out, checkbox-only patching, and successful persistence changing only `deviceId` while preserving route ID/name/label.

- [ ] **Step 2: Write failing concurrency and durability tests**

Pause `listOutputDevices()`, then manually rebind and separately delete the route before enumeration resolves; assert stale reconciliation neither overwrites nor resurrects it. Make repository save fail and assert the old ID remains in status/playback. Assert the occurrence whose discovery triggered reconciliation uses its original snapshot and only the next occurrence uses the committed replacement.

- [ ] **Step 3: Run the audio service tests and confirm failure**

Run: `corepack.cmd pnpm exec vitest run apps/server/src/modules/audio/audio-output-service.test.ts`

Expected: FAIL because reconciliation and automatic binding state are absent.

- [ ] **Step 4: Implement audio reconciliation**

Implement `reconcileBindings()` plus a private compare-before-write helper. `getStatus()` and device discovery during `preparePlayback()` may attempt reconciliation, but `preparePlayback()` must resolve the current occurrence from the route snapshot captured before asynchronous enumeration. Clear session state on create/update/delete; unbinding writes `autoFollowDeviceName: false`.

- [ ] **Step 5: Add route and runtime startup tests**

Extend HTTP tests for accepted boolean create/patch fields and typed status. Extend runtime composition restart coverage with old ID `old-device`, saved label `Headphones`, current unique ID `new-device`, and assert the database contains `new-device` before the first later playback; also cover startup persistence failure without fallback.

- [ ] **Step 6: Wire and verify startup reconciliation**

After constructing `AudioOutputService`, call `await audioOutputService.reconcileBindings()` when a desktop host exists. Sanitize/log failures through the existing runtime logger and continue startup with the saved route unavailable.

Run: `corepack.cmd pnpm exec vitest run apps/server/src/modules/audio/audio-output-service.test.ts apps/server/src/http/routes/audio-outputs.test.ts apps/server/src/runtime/runtime-composition.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/audio apps/server/src/http/routes/audio-outputs.test.ts apps/server/src/runtime/runtime-composition.ts apps/server/src/runtime/runtime-composition.test.ts
git commit -m "feat: reconcile opted-in audio routes"
```

### Task 4: Desktop-display reconciliation and startup recovery

**Files:**
- Modify: `apps/server/src/modules/overlay-surfaces/surface-settings-service.ts`
- Modify: `apps/server/src/modules/overlay-surfaces/surface-settings-service.test.ts`
- Modify: `apps/server/src/http/routes/overlay-surfaces.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.test.ts`
- Modify: `apps/desktop/src/overlay/overlay-host.test.ts`

**Interfaces:**
- Consumes: `surfaceConfigurationUpdateSchema`, `findExactUniqueLabelMatch`, trusted `DesktopOverlayStatus.displays`, `AutomaticBindingState`, and `DesktopVisualSink.configure()`.
- Produces: `SurfaceSettingsService.initializeDesktop(): Promise<void>` and `reconcileDesktopBinding(): Promise<void>`; `SurfaceSettingsView.desktopBindingState`; server-derived `displayLabel`; persisted-before-configure startup behavior.

- [ ] **Step 1: Write failing save-contract tests**

Prove the service derives `displayLabel` from the current ID, rejects a browser-supplied label, requires a current display before enabling auto-follow, preserves a valid binding when merely disabling the overlay, and clears label/opt-in when selection is cleared.

- [ ] **Step 2: Write failing reconciliation tests**

Cover opt-out, legacy null-label, exact unique changed-ID recovery, case mismatch, zero match, duplicate `VG27A` ambiguity, unavailable host, enumeration failure, save failure, configure failure after a successful save, and a concurrent manual save winning over delayed reconciliation. Assert interrupted content is not replayed and recovery applies only to later work.

- [ ] **Step 3: Run service tests and confirm failure**

Run: `corepack.cmd pnpm exec vitest run apps/server/src/modules/overlay-surfaces/surface-settings-service.test.ts apps/server/src/http/routes/overlay-surfaces.test.ts apps/desktop/src/overlay/overlay-host.test.ts`

Expected: FAIL because trusted labels and reconciliation do not exist.

- [ ] **Step 4: Implement trusted save and reconciliation**

Parse browser input with `surfaceConfigurationUpdateSchema`, resolve the selected current display, and build the persisted `SurfaceConfiguration` with its trusted label. In reconciliation, snapshot the saved binding, enumerate, require one exact match, re-read inside `runMutation`, persist only if ID/label/opt-in still match the snapshot, then configure the committed surface. Store only session-scoped binding state.

- [ ] **Step 5: Reorder runtime initialization**

Construct `SurfaceSettingsService` before the existing desktop startup configuration block. Replace direct startup `desktopVisualSink.configure(surface)` with `initializeDesktop()`, which attempts reconciliation first and then configures the currently committed surface; log sanitized failure and keep other outputs available.

- [ ] **Step 6: Add runtime restart tests and verify**

Persist `{ displayId: "old", displayLabel: "VG27A", autoFollowDisplayName: true }`, enumerate unique `{ id: "new", label: "VG27A" }`, restart composition, and assert repository save precedes host configure with `new`. Add ambiguous and failed-write cases that retain `old` and never configure `new`.

Run: `corepack.cmd pnpm exec vitest run apps/server/src/modules/overlay-surfaces/surface-settings-service.test.ts apps/server/src/http/routes/overlay-surfaces.test.ts apps/server/src/runtime/runtime-composition.test.ts apps/desktop/src/overlay/overlay-host.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/overlay-surfaces apps/server/src/http/routes/overlay-surfaces.test.ts apps/server/src/runtime/runtime-composition.ts apps/server/src/runtime/runtime-composition.test.ts apps/desktop/src/overlay/overlay-host.test.ts
git commit -m "feat: reconcile opted-in desktop displays"
```

### Task 5: Portable backup and legacy restore safety

**Files:**
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.test.ts`

**Interfaces:**
- Consumes: migration-026 route column and extended desktop `SurfaceConfiguration`.
- Produces: portable audio rows with null device fields and `auto_follow_device_name = 0`; portable desktop JSON with disabled output, null ID/label, and `autoFollowDisplayName: false`; schema-26 restore compatibility with schemas 19–25.

- [ ] **Step 1: Write failing portable projection tests**

Seed opted-in bound audio and desktop records, export, and assert all machine-local IDs/labels and both consent flags are cleared. Mutate an archive to retain either consent flag and assert preflight rejects it.

- [ ] **Step 2: Write failing legacy restore tests**

Restore schema-25 data without the audio column and with legacy desktop JSON; assert audio and desktop automatic-follow values default false, the desktop remains disabled/unbound, and non-binding settings survive.

- [ ] **Step 3: Run backup tests and confirm failure**

Run: `corepack.cmd pnpm exec vitest run apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts apps/server/src/modules/backup/configuration-backup-service.test.ts`

Expected: FAIL on missing projected columns/defaults and schema-26 compatibility.

- [ ] **Step 4: Implement portable projection and restore compatibility**

Add the route column to the table definition/select/validation, clear the desktop label and consent in `portableSurfaceRow()`, validate all local bindings as inert, and extend `isSupportedLegacySchema(26, archiveSchemaVersion)` to `19..25` without weakening existing checks.

- [ ] **Step 5: Run backup and database tests**

Run: `corepack.cmd pnpm exec vitest run apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts apps/server/src/modules/backup/configuration-backup-service.test.ts apps/server/src/modules/db/database.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/backup
git commit -m "fix: keep portable output bindings inert"
```

### Task 6: Audio and desktop management controls

**Files:**
- Modify: `apps/web/src/management/audio/audio-api.ts`
- Modify: `apps/web/src/management/audio/audio-api.test.ts`
- Modify: `apps/web/src/management/audio/AudioOutputsPanel.tsx`
- Modify: `apps/web/src/management/audio/AudioOutputsPanel.test.tsx`
- Modify: `apps/web/src/management/audio/AudioOutputsPanel.stories.tsx`
- Modify: `apps/web/src/management/audio/audio-outputs-panel.css`
- Modify: `apps/web/src/management/settings/overlay-surfaces-api.ts`
- Modify: `apps/web/src/management/settings/overlay-surfaces-api.test.ts`
- Modify: `apps/web/src/management/settings/OverlaySurfacesPanel.tsx`
- Modify: `apps/web/src/management/settings/OverlaySurfacesPanel.test.tsx`
- Modify: `apps/web/src/management/settings/OverlaySurfacesPanel.stories.tsx`
- Modify: `apps/web/src/management/settings/overlay-surfaces-panel.css`

**Interfaces:**
- Consumes: route/surface opt-in fields, `automaticBindingState`, trusted-label update schema, and existing toast/dirty-form foundations.
- Produces: per-route `Automatically follow this exact device name`; desktop `Automatically follow this exact display name`; exact-match explanatory copy; disabled legacy state; rebound and ambiguity feedback.

- [ ] **Step 1: Write failing API and component tests**

Assert boolean fields round trip; checkbox-only edits become dirty and save; the new-route checkbox defaults off and remains disabled until a device is selected; unbound saved routes and legacy null-label displays disable opt-in; manual selections update the local display label but API payload strips it; save/revert work; no-match and ambiguous states retain missing selections; rebound state shows a success toast without opaque IDs.

- [ ] **Step 2: Run frontend tests and confirm failure**

Run: `corepack.cmd pnpm exec vitest run apps/web/src/management/audio/audio-api.test.ts apps/web/src/management/audio/AudioOutputsPanel.test.tsx apps/web/src/management/settings/overlay-surfaces-api.test.ts apps/web/src/management/settings/OverlaySurfacesPanel.test.tsx`

Expected: FAIL because fields, controls, and copy are absent.

- [ ] **Step 3: Implement audio route drafts and control**

Extend `RouteDraft` and the new-route draft with saved/current auto-follow values, include them in dirty detection, create/patch payloads, fallback status, and state descriptions. Use the existing compact native checkbox style and disable it when the route has no saved or newly selected label.

- [ ] **Step 4: Implement desktop draft and control**

When a current display is selected, store its current label in the local draft for validation; clearing selection clears label and consent. Convert the draft through `surfaceConfigurationUpdateSchema` before HTTP save so `displayLabel` is never browser-authored. Render the checkbox, legacy guidance, exact ambiguity guidance, and session rebound notice.

- [ ] **Step 5: Extend Storybook scenarios**

Add or update stories for opted-out missing, opted-in no-match, duplicate-label ambiguity, rebound success, and legacy display-without-label. Keep existing loading, CLI unavailable, save failure, and ready stories passing with explicit new defaults.

- [ ] **Step 6: Run frontend unit and Storybook gates**

Run: `corepack.cmd pnpm exec vitest run apps/web/src/management/audio/audio-api.test.ts apps/web/src/management/audio/AudioOutputsPanel.test.tsx apps/web/src/management/settings/overlay-surfaces-api.test.ts apps/web/src/management/settings/OverlaySurfacesPanel.test.tsx`

Run: `corepack.cmd pnpm --filter @stream-jams/web build-storybook`

Run: `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci`

Expected: PASS with no accessibility or console failures.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/management/audio apps/web/src/management/settings
git commit -m "feat: add automatic output matching controls"
```

### Task 7: Live TTS compact-checkbox regression

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- Modify: `tests/e2e/management-alerts.spec.ts`

**Interfaces:**
- Consumes: existing `.alert-editor-inspector__check` CSS and current Live TTS accessible name/provider behavior.
- Produces: Live TTS label using the established compact checkbox hook; browser assertion of `16px` width and height.

- [ ] **Step 1: Write the failing component regression**

In the active-provider test, expand `Live TTS`, get `Enable TTS for this alert`, and assert its closest label has class `alert-editor-inspector__check`; retain checked, visible, and provider-copy assertions.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx -t "uses the active TTS provider"`

Expected: FAIL because the label lacks the compact class.

- [ ] **Step 3: Apply the one-line production fix**

Add `className="alert-editor-inspector__check"` to the existing Live TTS label. Do not add CSS or alter element order, accessible naming, disabled logic, provider selection, dirty state, preview, or routing.

- [ ] **Step 4: Add rendered-size coverage**

Extend the existing Playwright Live TTS flow to open the disclosure and assert `getBoundingClientRect()` reports `width: 16` and `height: 16`. Add the same compact-class interaction assertion to `ActiveSpeakerBotTts` Storybook coverage.

- [ ] **Step 5: Run focused component and browser checks**

Run: `corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx -t "TTS"`

Run: `corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts --grep "authors TTS"`

Expected: PASS; the checkbox is `16px` by `16px` and behavior is unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/management/alerts/editor/AlertEditorPage.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx tests/e2e/management-alerts.spec.ts
git commit -m "fix: normalize the Live TTS checkbox"
```

### Task 8: Cross-layer acceptance and rebuilt Windows verification

**Files:**
- Modify: `tests/e2e/management-audio-routing.spec.ts`
- Modify: `tests/e2e/management-settings.spec.ts`
- Modify: `tests/desktop/audio-routing.spec.ts`
- Modify: `tests/desktop/overlay-host.spec.ts`
- Modify: `openspec/changes/add-automatic-local-output-rebinding/tasks.md`
- Create: `docs/verification/automatic-local-output-rebinding.md`

**Interfaces:**
- Consumes: all completed contracts, services, UI, migration, and packaged desktop adapters.
- Produces: browser and packaged acceptance evidence, strict OpenSpec completion, and a checked task ledger.

- [ ] **Step 1: Add browser acceptance tests**

Mock old IDs with current unique same-label endpoints, opt each checkbox in, save, reload status with rebound state, and assert ready output plus durable new IDs. Add duplicate-label cases for audio and desktop that remain missing and show actionable no-fallback guidance.

- [ ] **Step 2: Add desktop transport acceptance tests**

Exercise the real audio/overlay worker boundaries with synthetic enumeration changes and assert server-authoritative saved IDs are used only after restart/reconciliation. Retain hardware-tagged physical playback as opt-in; do not require it for deterministic CI.

- [ ] **Step 3: Run affected package gates**

Run: `corepack.cmd pnpm lint`

Run: `corepack.cmd pnpm typecheck`

Run: `corepack.cmd pnpm test`

Run: `corepack.cmd pnpm --filter @stream-jams/web build-storybook`

Run: `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci`

Run: `corepack.cmd pnpm test:e2e`

Run: `corepack.cmd pnpm test:desktop`

Expected: every command exits `0`; classify and report any unrelated environment failure rather than calling the suite green.

- [ ] **Step 4: Validate OpenSpec and the diff**

Run: `openspec.cmd validate add-automatic-local-output-rebinding --strict --json`

Run: `openspec.cmd validate --all --strict --json`

Run: `git diff --check origin/main...HEAD`

Expected: strict validation passes for the change and full registry, and diff check prints nothing.

- [ ] **Step 5: Rebuild and verify the live packaged workflow**

Run: `corepack.cmd pnpm desktop:package`

Launch the rebuilt app with the user's existing data only after verifying ownership of the current Stream Jams process and database. Confirm `/health` returns `200`; manually select/save each current route and display once where legacy labels are absent; enable opt-in; restart; verify ready audio/display states and the compact Live TTS checkbox. Do not force ID churn on the user's real devices—use automated synthetic coverage for changed-ID proof.

- [ ] **Step 6: Record evidence and complete tasks**

Write commands, counts, packaged artifact path, live observations, and any intentional hardware skips to `docs/verification/automatic-local-output-rebinding.md`. Check OpenSpec tasks only after their evidence exists.

- [ ] **Step 7: Commit**

```bash
git add tests apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx openspec/changes/add-automatic-local-output-rebinding/tasks.md docs/verification/automatic-local-output-rebinding.md
git commit -m "test: verify automatic output rebinding"
```
