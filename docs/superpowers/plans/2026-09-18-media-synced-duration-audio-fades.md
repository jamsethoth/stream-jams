# Media-Synchronized Duration and Audio Fades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new Alerts and Screen Effect variants follow the longest attached video or audio by default, preserve explicit custom timing, and provide independent adjustable fade-in and fade-out envelopes for every local audio source.

**Architecture:** Persist media duration during import, resolve one immutable effective duration before queue admission, and carry normalized per-source fade data through the existing browser and device audio transports. Compatibility readers preserve old documents as Custom with fades disabled; editor previews use the same pure duration and envelope calculations as live playback.

**Tech Stack:** TypeScript 6, Zod 4, Node 24, Fastify, SQLite, React 19, Electron 44, `music-metadata@11.15.0`, Vitest, Testing Library, Storybook, and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-18-media-synced-duration-and-audio-fades-design.md`

## Global Constraints

- New Alerts and new Screen Effect variants default to `Match longest media`; existing documents and restored legacy backups default to `Custom`.
- Automatic timing includes visible Alert audio/video layers and a Screen Effect variant's video/sound; it excludes images, GIFs, hidden Alert layers, and TTS.
- Automatic fallback remains 5,000 ms for Alerts and 10,000 ms for Screen Effect variants; playback remains capped at 120,000 ms.
- Duration extraction occurs during import, replacement, or bounded management repair. Live trigger handling performs no filesystem reads or media parsing.
- `music-metadata@11.15.0` is an exact server-only dependency behind a core `MediaMetadataProbe` interface.
- Fade in and fade out are independent linear envelopes, default to 500 ms when enabled, and persist as zero when disabled.
- Runtime proportionally clamps overlapping fades to the effective source length and derives gain from absolute elapsed time.
- TTS fades, nonlinear curves, keyframes, timelines, and cross-layer synchronization controls remain outside scope.
- Keep the implementation stacked on PR #117 until that dependency merges; do not combine or merge the two review scopes implicitly.

---

### Task 1: Create and validate the OpenSpec change

**Files:**
- Create: `openspec/changes/add-media-synced-duration-audio-fades/proposal.md`
- Create: `openspec/changes/add-media-synced-duration-audio-fades/design.md`
- Create: `openspec/changes/add-media-synced-duration-audio-fades/tasks.md`
- Create: `openspec/changes/add-media-synced-duration-audio-fades/verification.md`
- Create: `openspec/changes/add-media-synced-duration-audio-fades/specs/asset-library-management/spec.md`
- Create: `openspec/changes/add-media-synced-duration-audio-fades/specs/alert-configuration-management/spec.md`
- Create: `openspec/changes/add-media-synced-duration-audio-fades/specs/alert-audio-routing/spec.md`
- Create: `openspec/changes/add-media-synced-duration-audio-fades/specs/screen-effects/spec.md`
- Create: `openspec/changes/add-media-synced-duration-audio-fades/specs/routed-video-audio/spec.md`

**Interfaces:**
- Consumes: approved design at `docs/superpowers/specs/2026-09-18-media-synced-duration-and-audio-fades-design.md`.
- Produces: strict-valid requirements and task tracking for every later task.

- [ ] **Step 1: Write the proposal and architecture artifact**

Use change name `add-media-synced-duration-audio-fades`. State the concrete before/after behavior, dependency on PR #117, media-ingestion prerequisite, compatibility policy, server-authoritative resolution, and per-source envelope transport. Link the approved design. Create `verification.md` with empty evidence sections for focused tests, full gates, and live review; fill them only as execution produces evidence.

- [ ] **Step 2: Write exact delta requirements**

Include these normative requirements and scenarios:

```markdown
### Requirement: Persist timed-media duration
The system SHALL extract and persist nullable duration metadata for accepted audio and video assets without parsing media during a live trigger.

#### Scenario: Replacement changes automatic timing
- **WHEN** an operator replaces an in-use timed asset with the same asset ID
- **THEN** the replacement duration SHALL apply to the next admitted automatic-duration playback
- **AND** an occurrence already in progress SHALL keep its original duration snapshot

### Requirement: Resolve object duration from media
The system SHALL support `media` and `custom` duration modes for Alerts and Screen Effect variants.

#### Scenario: Longest eligible asset wins
- **WHEN** an automatic-duration object references multiple eligible timed assets
- **THEN** its effective duration SHALL equal the longest positive stored duration up to 120000 milliseconds

### Requirement: Apply per-source audio fades
The system SHALL carry independent fade-in and fade-out durations through preview, browser, and explicit-device playback.

#### Scenario: Fades overlap on short media
- **WHEN** requested fade durations exceed the effective source playback length
- **THEN** playback SHALL proportionally clamp the envelope
- **AND** gain SHALL remain between zero and the configured source volume
```

- [ ] **Step 3: Write the OpenSpec task checklist**

Mirror Tasks 2 through 10 of this plan. Each checkbox must name its focused tests and validation command so implementation progress is auditable.

- [ ] **Step 4: Strict-validate the change**

Run:

```powershell
openspec.cmd validate add-media-synced-duration-audio-fades --strict
```

Expected: validation succeeds with no errors or warnings.

- [ ] **Step 5: Commit the OpenSpec slice**

```powershell
git add openspec/changes/add-media-synced-duration-audio-fades
git commit -m "docs: specify media timing and audio fades"
```

### Task 2: Persist authoritative asset durations during ingestion

**Files:**
- Modify: `packages/core/src/assets/types.ts`
- Modify: `packages/core/src/assets/schemas.ts`
- Modify: `packages/core/src/assets/media-import-pipeline.ts`
- Modify: `packages/core/src/assets/media-import-pipeline.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/server/src/modules/assets/media-metadata-probe.ts`
- Create: `apps/server/src/modules/assets/media-metadata-probe.test.ts`
- Create: `apps/server/src/modules/db/migrations/024-asset-duration-metadata.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`
- Modify: `apps/server/src/modules/assets/sqlite-asset-repository.ts`
- Modify: `apps/server/src/modules/assets/sqlite-asset-repository.test.ts`
- Modify: `apps/server/src/modules/assets/asset-library-service.ts`
- Modify: `apps/server/src/modules/assets/asset-library-service.test.ts`
- Modify: `apps/server/src/modules/assets/sqlite-asset-library-metadata-repository.test.ts`
- Modify: `apps/server/src/http/routes/assets.test.ts`
- Modify: `apps/server/src/modules/audio/desktop-audio-sink.test.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.test.ts`
- Modify: `apps/server/src/modules/overlay-surfaces/desktop-visual-asset-resolver.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/web/src/management/assets/asset-api.ts`
- Modify: `apps/web/src/management/assets/asset-api.test.ts`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/management/ManagementApp.test.tsx`
- Modify: `apps/web/src/stories/mock-apis.ts`
- Modify: `apps/web/src/stories/story-fixtures.ts`
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: normalized media bytes after validation/transcoding and `AssetRepository`.
- Produces: `AssetRecord.durationMs`, `MediaMetadataProbe.inspect(input)`, migration 024, and real duration values in `AssetLibraryItem`.

- [ ] **Step 1: Add failing asset-record and pipeline tests**

Define and exercise these interfaces in the tests before implementation:

```ts
export interface MediaMetadataProbeInput {
  readonly mediaType: AssetMediaType;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly bytes: Uint8Array;
}

export interface MediaMetadataProbe {
  inspect(input: MediaMetadataProbeInput): Promise<{ readonly durationMs: number | null }>;
}

export interface AssetRecord {
  // existing fields remain unchanged
  readonly durationMs: number | null;
}
```

Test that video/audio calls the probe and persists its duration, images/GIFs persist null without probing, probe rejection persists null, and replacement preserves the asset ID while changing duration.

- [ ] **Step 2: Run the focused core tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/assets/media-import-pipeline.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because `MediaMetadataProbe` and `AssetRecord.durationMs` do not exist.

- [ ] **Step 3: Implement the core probe boundary and pipeline call**

Add `probe` to `DefaultMediaImportPipelineOptions`. Ask it to inspect only `audio` and `video` after transcoding. Convert probe failure to `durationMs: null`; do not reject a validated upload. Parse asset records with the repository's existing positive-integer helper:

```ts
durationMs: positiveIntegerSchema.nullable()
```

- [ ] **Step 4: Install and implement the server parser adapter**

```powershell
corepack.cmd pnpm --filter @stream-jams/server add --save-exact music-metadata@11.15.0
```

Implement `MusicMetadataProbe` with:

```ts
const metadata = await parseBuffer(input.bytes, {
  mimeType: input.mimeType,
  size: input.sizeBytes
}, { duration: true, skipCovers: true });
const milliseconds = metadata.format.duration === undefined
  ? null
  : Math.round(metadata.format.duration * 1000);
return { durationMs: milliseconds !== null && milliseconds > 0 ? milliseconds : null };
```

Test the adapter against `tests/fixtures/media/neutral-with-audio.mp4` and `.webm`, plus invalid bytes returning null through the pipeline boundary.

- [ ] **Step 5: Add migration 024 and repository persistence**

Use this migration shape:

```sql
ALTER TABLE asset_metadata
ADD COLUMN duration_ms INTEGER
CHECK (duration_ms IS NULL OR duration_ms > 0);
```

Update every asset SELECT/INSERT/UPSERT mapper. Database tests must prove an old row migrates to null and a new duration round-trips. Update every typed `AssetRecord` fixture to include `durationMs: null` unless that test specifically exercises timed media.

- [ ] **Step 6: Project stored duration into the asset library**

Replace the current hard-coded `durationMs: null` in `AssetLibraryService.#toItem` with `record.durationMs`. Wire `MusicMetadataProbe` into `DefaultMediaImportPipeline` in runtime composition.

- [ ] **Step 7: Run focused ingestion and persistence tests**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/assets/media-import-pipeline.test.ts apps/server/src/modules/assets/media-metadata-probe.test.ts apps/server/src/modules/assets/sqlite-asset-repository.test.ts apps/server/src/modules/assets/asset-library-service.test.ts apps/server/src/http/routes/assets.test.ts apps/server/src/modules/backup/configuration-backup-service.test.ts apps/server/src/modules/db/database.test.ts --reporter=dot --maxWorkers=1
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit authoritative duration ingestion**

```powershell
git add packages/core/src/assets packages/core/src/index.ts apps/server/src/modules/assets apps/server/src/modules/db apps/server/src/http/routes/assets.test.ts apps/server/src/modules/audio/desktop-audio-sink.test.ts apps/server/src/modules/backup/configuration-backup-service.ts apps/server/src/modules/backup/configuration-backup-service.test.ts apps/server/src/modules/overlay-surfaces/desktop-visual-asset-resolver.test.ts apps/server/src/runtime/runtime-composition.ts apps/server/package.json apps/web/src/management/assets apps/web/src/App.test.tsx apps/web/src/management/ManagementApp.test.tsx apps/web/src/stories pnpm-lock.yaml
git commit -m "feat: persist media asset durations"
```

### Task 3: Add shared duration modes and deterministic resolution

**Files:**
- Create: `packages/core/src/playback/media-duration.ts`
- Create: `packages/core/src/playback/media-duration.test.ts`
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `packages/core/src/management/alert-document-compatibility.ts`
- Modify: `packages/core/src/management/alert-document-compatibility.test.ts`
- Modify: `packages/core/src/screen-effects/types.ts`
- Modify: `packages/core/src/screen-effects/schemas.ts`
- Modify: `packages/core/src/screen-effects/schemas.test.ts`
- Modify: `packages/core/src/screen-effects/authoring.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`

**Interfaces:**
- Consumes: `AssetLibraryItem` or equivalent timed-media descriptors.
- Produces: `PlaybackDurationMode`, `resolveMediaDuration`, `collectAlertDurationAssetIds`, and `collectEffectDurationAssetIds`.

- [ ] **Step 1: Write failing resolver tests**

Define the public types exactly:

```ts
export type PlaybackDurationMode = "media" | "custom";
export interface MediaDurationCandidate {
  readonly assetId: string;
  readonly label: string;
  readonly mediaType: "image" | "gif" | "video" | "audio";
  readonly durationMs: number | null;
  readonly eligible: boolean;
}
export interface MediaDurationResolution {
  readonly durationMs: number;
  readonly contributingAssetIds: readonly string[];
  readonly warning: "fallback" | "truncated" | null;
}
export function resolveMediaDuration(input: {
  readonly mode: PlaybackDurationMode;
  readonly customDurationMs: number;
  readonly fallbackDurationMs: number;
  readonly maximumDurationMs: number;
  readonly candidates: readonly MediaDurationCandidate[];
}): MediaDurationResolution;
```

Cover Custom mode, the longest eligible candidate, tied assets, hidden/ineligible media, null duration fallback, and truncation at 120,000 ms.

- [ ] **Step 2: Run the resolver test and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/playback/media-duration.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure resolver and media-ID collectors**

`collectAlertDurationAssetIds` returns IDs from visible audio and video layers. `collectEffectDurationAssetIds` returns the video visual ID and separate sound ID for one variant. Preserve authoring order while removing duplicates.

- [ ] **Step 4: Extend persisted authoring contracts compatibly**

Add optional `durationMode` beside `durationMs` on `AlertEditorDocument` and `EffectVariant`. All consumers interpret absence as `custom`; this preserves typed legacy fixtures and stored rows without a bulk rewrite. Creation paths explicitly set `media`:

```ts
durationMode: "media",
durationMs: 5_000 // Alert fallback
```

```ts
durationMode: "media",
durationMs: 10_000 // Screen Effect fallback
```

Copied variants preserve the source mode and custom/fallback value.

- [ ] **Step 5: Run focused core contract tests**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/playback/media-duration.test.ts packages/core/src/management/contracts.test.ts packages/core/src/management/alert-document-compatibility.test.ts packages/core/src/screen-effects/schemas.test.ts packages/core/src/screen-effects/authoring.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts --reporter=dot --maxWorkers=1
```

Expected: all focused tests pass, including explicit legacy-to-Custom assertions.

- [ ] **Step 6: Commit duration contracts**

```powershell
git add packages/core/src/playback packages/core/src/management packages/core/src/screen-effects packages/core/src/index.ts apps/server/src/modules/alerts/alert-editor-service.ts apps/server/src/modules/alerts/alert-editor-service.test.ts
git commit -m "feat: add media-synchronized duration mode"
```

### Task 4: Add normalized audio-envelope contracts and gain calculation

**Files:**
- Create: `packages/core/src/audio/audio-envelope.ts`
- Create: `packages/core/src/audio/audio-envelope.test.ts`
- Modify: `packages/core/src/audio/types.ts`
- Modify: `packages/core/src/audio/schemas.ts`
- Modify: `packages/core/src/audio/schemas.test.ts`
- Modify: `packages/core/src/audio/resolve-alert-audio.ts`
- Modify: `packages/core/src/audio/resolve-alert-audio.test.ts`
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/alert-document-compatibility.ts`
- Modify: `packages/core/src/management/alert-document-compatibility.test.ts`
- Modify: `packages/core/src/screen-effects/types.ts`
- Modify: `packages/core/src/screen-effects/schemas.ts`
- Modify: `packages/core/src/screen-effects/schemas.test.ts`
- Modify: `packages/core/src/overlays/types.ts`
- Modify: `packages/core/src/overlays/schemas.ts`
- Modify: `packages/core/src/overlays/schemas.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: authoring fade values, base volume, occurrence elapsed time, and source/object lengths.
- Produces: normalized `AudioEnvelope`, `resolveAudioEnvelope`, and fade fields on `ResolvedAudioLayer` and overlay audio instructions.

- [ ] **Step 1: Write failing envelope tests**

Use these public contracts:

```ts
export interface AudioEnvelope {
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}
export interface ResolvedAudioEnvelope extends AudioEnvelope {
  readonly playbackDurationMs: number;
}
export function resolveAudioEnvelope(input: {
  readonly volume: number;
  readonly elapsedMs: number;
  readonly playbackDurationMs: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly muted: boolean;
}): number;
```

Assert exact gain at start, mid-fade, full-volume region, fade-out midpoint, terminal time, muted time, and proportional overlap clamping.

- [ ] **Step 2: Run the envelope test and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/audio/audio-envelope.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement absolute-time gain resolution**

Clamp elapsed time to `[0, playbackDurationMs]`. When `fadeInMs + fadeOutMs` exceeds playback length, multiply each requested fade by `playbackDurationMs / (fadeInMs + fadeOutMs)`. Return `volume * min(fadeInGain, fadeOutGain)` or zero when muted/terminal.

- [ ] **Step 4: Extend authoring and normalized schemas**

Add optional authoring fields whose absence resolves to zero:

```ts
fadeInMs: z.number().int().min(0).max(120_000).optional(),
fadeOutMs: z.number().int().min(0).max(120_000).optional()
```

Use optional `audioFadeInMs` / `audioFadeOutMs` for video configuration and optional `fadeInMs` / `fadeOutMs` for audio configuration. Resolve absence to zero before adding all three required values to each normalized audio layer:

```ts
fadeInMs: number;
fadeOutMs: number;
playbackDurationMs: number;
```

- [ ] **Step 5: Propagate authoring settings through alert audio resolution**

Extend `resolveAlertAudio` to accept resolved asset durations and the effective object duration. For every source set `playbackDurationMs` to `Math.min(assetDurationMs ?? objectDurationMs, objectDurationMs)`.

- [ ] **Step 6: Run focused envelope and schema tests**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/audio/audio-envelope.test.ts packages/core/src/audio/schemas.test.ts packages/core/src/audio/resolve-alert-audio.test.ts packages/core/src/management/alert-document-compatibility.test.ts packages/core/src/screen-effects/schemas.test.ts packages/core/src/overlays/schemas.test.ts --reporter=dot --maxWorkers=1
```

Expected: all focused tests pass and legacy payloads resolve with zero fades.

- [ ] **Step 7: Commit normalized fade contracts**

```powershell
git add packages/core/src/audio packages/core/src/management packages/core/src/screen-effects packages/core/src/overlays packages/core/src/index.ts
git commit -m "feat: add normalized audio fade envelopes"
```

### Task 5: Add cached duration lookup and bounded legacy repair

**Files:**
- Create: `apps/server/src/modules/assets/asset-duration-catalog.ts`
- Create: `apps/server/src/modules/assets/asset-duration-catalog.test.ts`
- Modify: `apps/server/src/modules/assets/asset-library-service.ts`
- Modify: `apps/server/src/modules/assets/asset-library-service.test.ts`
- Modify: `apps/server/src/http/routes/management-ui.ts`
- Modify: `apps/server/src/http/routes/management-ui.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-api.test.ts`

**Interfaces:**
- Consumes: `AssetRepository`, `LocalAssetStore.readBounded`, and `MediaMetadataProbe`.
- Produces: cached `AssetDurationCatalog.getMany`, invalidation/update hooks, and `POST /management/assets/:assetId/repair-duration`.

- [ ] **Step 1: Write failing catalog and repair tests**

Define:

```ts
export interface AssetDurationCatalog {
  getMany(assetIds: readonly string[]): Promise<ReadonlyMap<string, AssetRecord>>;
  store(record: AssetRecord): void;
  invalidate(assetId: string): void;
}
```

Prove duplicate IDs issue one repository request, warm reads avoid the repository, replacement updates the cached record, deletion invalidates it, and missing IDs remain absent.

- [ ] **Step 2: Run catalog tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/assets/asset-duration-catalog.test.ts apps/server/src/modules/assets/asset-library-service.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because the catalog and repair operation do not exist.

- [ ] **Step 3: Implement cache and asset-service notifications**

Use `AssetRepository.findManyByIds` for cold misses. `registerAsset` and `completeReplacement` call `catalog.store(record)` after persistence; successful deletion calls `catalog.invalidate(assetId)`.

- [ ] **Step 4: Implement bounded legacy repair**

Add `AssetLibraryService.repairDuration(assetId)`. Return immediately for non-timed media or an existing duration. Otherwise call `readBounded(record.storagePath, record.sizeBytes)`, probe the bytes, save the updated record, refresh the catalog, and return the projected item. Probe/read failure returns the unchanged item with null duration; the editor converts that null into the approved fallback warning. The repair operation does not delete or rewrite the file.

- [ ] **Step 5: Add the management endpoint and typed clients**

Add `POST /management/assets/:assetId/repair-duration` in `management-ui.ts`, protected by the existing management origin/session/CSRF boundary. Parse the response with `assetLibraryItemSchema`. Add `repairAssetDuration(assetId)` to the shared `ManagementApi`, which both editors already receive.

- [ ] **Step 6: Run focused cache, route, and client tests**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/assets/asset-duration-catalog.test.ts apps/server/src/modules/assets/asset-library-service.test.ts apps/server/src/http/routes/management-ui.test.ts apps/web/src/management/management-api.test.ts --reporter=dot --maxWorkers=1
```

Expected: all focused tests pass, including a spy proving no repair call occurs in a live-trigger service.

- [ ] **Step 7: Commit catalog and repair flow**

```powershell
git add apps/server/src/modules/assets apps/server/src/http/routes/management-ui.ts apps/server/src/http/routes/management-ui.test.ts apps/server/src/runtime/runtime-composition.ts apps/web/src/management/management-api.ts apps/web/src/management/management-api.test.ts
git commit -m "feat: resolve and repair cached asset durations"
```

### Task 6: Resolve one authoritative duration for Alert and Screen Effect playback

**Files:**
- Modify: `packages/core/src/alerts/alert-resolver.ts`
- Modify: `packages/core/src/alerts/alert-resolver.test.ts`
- Modify: `packages/core/src/screen-effects/variant-resolver.ts`
- Modify: `packages/core/src/screen-effects/variant-resolver.test.ts`
- Modify: `apps/server/src/modules/playback/playback-coordinator.ts`
- Modify: `apps/server/src/modules/playback/playback-coordinator.test.ts`
- Modify: `apps/server/src/modules/screen-effects/effect-admission-service.ts`
- Modify: `apps/server/src/modules/screen-effects/effect-admission-service.test.ts`
- Modify: `apps/server/src/modules/screen-effects/effect-playback-coordinator.ts`
- Modify: `apps/server/src/modules/screen-effects/effect-playback-coordinator.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`

**Interfaces:**
- Consumes: duration catalog, authoring mode, asset references, and pure resolver from Task 3.
- Produces: immutable queue items in which overlay instructions and device audio share one effective object duration.

- [ ] **Step 1: Write failing Alert runtime tests**

Cover an automatic Alert with 2-second audio and 7-second video resolving to 7 seconds; Custom remaining unchanged; fallback and truncation; asset replacement affecting only the next occurrence; and fade source length using `min(asset, object)`.

- [ ] **Step 2: Write failing Screen Effect runtime tests**

Cover independent variants, longest video/sound selection, Custom timing, fallback, browser/device agreement, and an admitted occurrence retaining its duration after catalog replacement.

- [ ] **Step 3: Run focused runtime tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/alerts/alert-resolver.test.ts packages/core/src/screen-effects/variant-resolver.test.ts apps/server/src/modules/playback/playback-coordinator.test.ts apps/server/src/modules/screen-effects/effect-admission-service.test.ts apps/server/src/modules/screen-effects/effect-playback-coordinator.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because runtime still uses saved `durationMs` directly.

- [ ] **Step 4: Resolve duration before queue admission**

Gather asset IDs, call `AssetDurationCatalog.getMany`, construct candidates, and resolve effective duration before creating the immutable alert/effect content snapshot. Do not mutate the persisted authoring document. Pass the resolution into alert/effect resolvers and normalized audio construction.

- [ ] **Step 5: Reuse the same resolution for draft tests and saved tests**

The Alert editor service and Screen Effect saved-test service must repair selected null-duration assets in management context, then calculate the same effective duration as live playback. Include fallback/truncation diagnostics in management responses without exposing storage paths.

- [ ] **Step 6: Update persistence and backup compatibility tests**

Verify current documents round-trip duration mode and fade fields. Verify older snapshots restore as Custom with zero fades, while `asset_metadata.duration_ms` remains nullable and preserved when present.

- [ ] **Step 7: Run focused runtime and backup tests**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/alerts/alert-resolver.test.ts packages/core/src/screen-effects/variant-resolver.test.ts apps/server/src/modules/playback/playback-coordinator.test.ts apps/server/src/modules/screen-effects/effect-admission-service.test.ts apps/server/src/modules/screen-effects/effect-playback-coordinator.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts --reporter=dot --maxWorkers=1
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit server-authoritative playback resolution**

```powershell
git add packages/core/src/alerts packages/core/src/screen-effects apps/server/src/modules/playback apps/server/src/modules/screen-effects apps/server/src/modules/alerts apps/server/src/modules/backup apps/server/src/runtime/runtime-composition.ts
git commit -m "feat: resolve media duration before playback"
```

### Task 7: Apply fades in browser and desktop playback

**Files:**
- Create: `apps/web/src/media/use-media-volume-envelope.ts`
- Create: `apps/web/src/media/use-media-volume-envelope.test.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.test.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.stories.tsx`
- Modify: `apps/desktop/src/audio/device-audio-player.ts`
- Modify: `apps/desktop/src/audio/device-audio-player.test.ts`
- Modify: `apps/desktop/src/audio/start-bound-audio.ts`
- Modify: `apps/desktop/src/audio/start-bound-audio.test.ts`

**Interfaces:**
- Consumes: `ResolvedAudioEnvelope`, occurrence timing, mute state, and pure `resolveAudioEnvelope`.
- Produces: drift-resistant gain updates and cleanup for browser and explicit-device media elements.

- [ ] **Step 1: Write failing browser envelope tests**

Using fake timers and a mutable media element, assert zero volume at start, half gain at 250 ms of a 500 ms fade, configured volume after fade-in, fade-out against source/object cutoff, late-join gain, mute/unmute, and timer cleanup on unmount/skip.

- [ ] **Step 2: Write failing desktop-player tests**

Extend `PlayerMediaElement` test doubles to record volume changes. Use injected `now()` and fake timers to assert the same absolute-time envelope on two devices, cancellation cleanup, generation reset, and no volume above the configured base.

- [ ] **Step 3: Run focused playback tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/media/use-media-volume-envelope.test.tsx apps/web/src/overlay/components/OverlaySurface.test.tsx apps/desktop/src/audio/device-audio-player.test.ts apps/desktop/src/audio/start-bound-audio.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because live players still assign static volume.

- [ ] **Step 4: Implement the browser hook**

Schedule bounded updates while playing and derive each value from `Date.now() - startsAtEpochMs`, not from the prior volume. Apply mute as a final argument to `resolveAudioEnvelope`. Stop scheduling at terminal time and clean every timer/listener in the effect cleanup.

- [ ] **Step 5: Integrate browser overlay audio**

Replace static volume assignment in `OverlaySurface` with the hook. Preserve existing seek-on-late-metadata, playback completion events, transparent failure, and Blob/source cleanup.

- [ ] **Step 6: Integrate desktop device audio**

Store layer envelope data on each `ElementAttempt`. Schedule gain from the shared occurrence clock after the element starts; recalculate after seek/metadata readiness and mute changes. Cancel the schedule inside `cleanupElement` and every occurrence cancellation path.

- [ ] **Step 7: Run focused playback tests**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/media/use-media-volume-envelope.test.tsx apps/web/src/overlay/components/OverlaySurface.test.tsx apps/desktop/src/audio/device-audio-player.test.ts apps/desktop/src/audio/start-bound-audio.test.ts --reporter=dot --maxWorkers=1
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit live fade playback**

```powershell
git add apps/web/src/media apps/web/src/overlay/components apps/desktop/src/audio
git commit -m "feat: play audio fade envelopes"
```

### Task 8: Add automatic timing and fades to the Alert editor

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/editor/editor-state.ts`
- Modify: `apps/web/src/management/alerts/editor/editor-state.test.ts`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`
- Modify: `tests/e2e/management-alerts.spec.ts`

**Interfaces:**
- Consumes: asset-library durations, repair endpoint, pure duration resolver, and browser envelope hook.
- Produces: accessible Alert timing-mode controls, contributing-asset explanation, per-layer fades, and matching preview behavior.

- [ ] **Step 1: Write failing Alert editor tests**

Cover a new Alert defaulting to Match longest media; existing Custom selection; longest visible media explanation; hidden layer exclusion; null-duration repair; fallback and truncation warnings; Custom input enablement; independent fade toggles; 500 ms defaults; undo/revert; and preview volume changes.

- [ ] **Step 2: Run focused editor tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/editor-state.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because the editor exposes only the fixed duration and volume.

- [ ] **Step 3: Load complete timed-asset context**

Replace the current media-type-only map with an asset map containing display name, health, media type, and duration. When automatic mode references a timed asset with null duration, call `repairAssetDuration` once and replace that item in local context.

- [ ] **Step 4: Add Alert duration controls**

In Alert settings, render a labelled radio group or select with `Match longest media` and `Custom`. Automatic mode renders read-only text such as `7.5 seconds · Longest: celebration.mp4`; Custom enables the existing millisecond input. Show fallback and truncation warnings through the existing inline status pattern.

- [ ] **Step 5: Add per-layer fade controls**

For audio layers, bind `fadeInMs` and `fadeOutMs`. For video layers, show audio fades only when embedded audio is enabled and bind `audioFadeInMs` / `audioFadeOutMs`. Checkbox enable writes 500 when the current value is zero; disable writes zero.

- [ ] **Step 6: Apply fades and resolved duration to local preview**

Calculate draft duration from the unsaved document and loaded assets. Use that value for the preview clock and use the shared envelope hook for local audio/video soundtrack elements. Pause, resume, seek, replay, and mute must recompute gain from current elapsed time.

- [ ] **Step 7: Add Storybook and Playwright coverage**

Add stories for automatic longest-media, fallback, Custom, and audio fades. Extend `management-alerts.spec.ts` to select differently sized media, observe automatic duration, switch Custom, enable both fades, preview, save, and reload.

- [ ] **Step 8: Run Alert editor and E2E tests**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/editor-state.test.ts --reporter=dot --maxWorkers=1
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts
```

Expected: focused unit tests and the Alert management E2E suite pass.

- [ ] **Step 9: Commit Alert authoring controls**

```powershell
git add apps/web/src/management/alerts tests/e2e/management-alerts.spec.ts
git commit -m "feat: author alert media timing and fades"
```

### Task 9: Add automatic timing and fades to the Screen Effect editor

**Files:**
- Modify: `apps/web/src/management/screen-effects/ScreenEffectEditor.tsx`
- Modify: `apps/web/src/management/screen-effects/ScreenEffectEditor.test.tsx`
- Modify: `apps/web/src/management/screen-effects/ScreenEffectEditor.stories.tsx`
- Modify: `apps/web/src/management/screen-effects/ScreenEffectPreview.tsx`
- Modify: `apps/web/src/management/screen-effects/ScreenEffectPreview.test.tsx`
- Modify: `apps/web/src/management/screen-effects/effect-editor-state.ts`
- Modify: `apps/web/src/management/screen-effects/effect-editor-state.test.ts`
- Modify: `apps/web/src/management/screen-effects/screen-effects.css`
- Modify: `tests/e2e/screen-effects.spec.ts`
- Modify: `tests/desktop/screen-effects.spec.ts`

**Interfaces:**
- Consumes: asset-library durations, repair endpoint, pure duration resolver, and browser envelope hook.
- Produces: per-variant timing modes, per-source fade controls, and matching Screen Effect preview/live behavior.

- [ ] **Step 1: Write failing Screen Effect editor tests**

Cover a new variant defaulting to Match longest media, copied variant preserving mode, video/sound longest selection, Custom seconds input, fallback/truncation warnings, separate-sound fades, video-soundtrack fades, mute, preview replay, undo, and save/reload.

- [ ] **Step 2: Run focused Screen Effect tests and confirm failure**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/screen-effects/ScreenEffectEditor.test.tsx apps/web/src/management/screen-effects/ScreenEffectPreview.test.tsx apps/web/src/management/screen-effects/effect-editor-state.test.ts --reporter=dot --maxWorkers=1
```

Expected: FAIL because variant timing is fixed and sound controls lack fades.

- [ ] **Step 3: Add per-variant duration controls**

Use the same labels and resolver as Alerts. Automatic mode shows the longest selected video/sound; Custom mode enables the existing seconds input. Repair only selected timed assets with null duration and update editor context after repair.

- [ ] **Step 4: Add separate sound and soundtrack fade controls**

Place fade controls beside their corresponding volume settings. Separate sound binds `fadeInMs` / `fadeOutMs`; video soundtrack binds `audioFadeInMs` / `audioFadeOutMs`. Preserve spacing, inspector scrolling, and the existing three-column responsive layout.

- [ ] **Step 5: Update inline preview**

Use the draft's resolved effective duration and envelope settings in `ScreenEffectPreview`. Keep local sound enabled by default, preserve the current mute toggle, and stop/revoke all media at the effective cutoff.

- [ ] **Step 6: Add Storybook, browser E2E, and desktop coverage**

Add automatic, Custom, fallback, and fade stories. Extend browser E2E through creation/save/reload and extend desktop Screen Effect coverage to prove the normalized fade fields reach explicit-device playback.

- [ ] **Step 7: Run focused Screen Effect verification**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/screen-effects/ScreenEffectEditor.test.tsx apps/web/src/management/screen-effects/ScreenEffectPreview.test.tsx apps/web/src/management/screen-effects/effect-editor-state.test.ts --reporter=dot --maxWorkers=1
corepack.cmd pnpm exec playwright test tests/e2e/screen-effects.spec.ts
corepack.cmd pnpm exec playwright test --config playwright.desktop.config.ts tests/desktop/screen-effects.spec.ts
```

Expected: focused unit, browser E2E, and desktop tests pass.

- [ ] **Step 8: Commit Screen Effect authoring controls**

```powershell
git add apps/web/src/management/screen-effects tests/e2e/screen-effects.spec.ts tests/desktop/screen-effects.spec.ts
git commit -m "feat: author screen effect media timing and fades"
```

### Task 10: Reconcile documentation and run the complete release gate

**Files:**
- Modify: `docs/product-plan.md`
- Modify: `docs/mvp-runbook.md`
- Create: `docs/verification/media-synced-duration-audio-fades.md`
- Modify: `openspec/changes/add-media-synced-duration-audio-fades/tasks.md`
- Modify: `openspec/changes/add-media-synced-duration-audio-fades/verification.md`

**Interfaces:**
- Consumes: completed implementation and every focused test result.
- Produces: operator guidance, evidence ledger, completed OpenSpec tracking, and a human-review-ready stacked branch.

- [ ] **Step 1: Update product and operator documentation**

Document automatic versus Custom timing, longest-media eligibility, 5/10-second fallback, 120-second cap, independent 500 ms fade defaults, legacy Custom migration, and asset replacement behavior. Keep TTS fades and timeline editing explicitly out of scope.

- [ ] **Step 2: Run changed-area lint and typecheck first**

```powershell
corepack.cmd pnpm exec eslint packages/core/src/assets packages/core/src/playback packages/core/src/audio packages/core/src/management packages/core/src/screen-effects apps/server/src/modules/assets apps/server/src/modules/alerts apps/server/src/modules/screen-effects apps/server/src/modules/playback apps/web/src/media apps/web/src/management/alerts apps/web/src/management/screen-effects apps/web/src/overlay apps/desktop/src/audio tests/e2e/management-alerts.spec.ts tests/e2e/screen-effects.spec.ts tests/desktop/screen-effects.spec.ts
corepack.cmd pnpm typecheck
```

Expected: both commands exit zero.

- [ ] **Step 3: Run the complete unit suite serially**

```powershell
corepack.cmd pnpm exec vitest run --reporter=dot --maxWorkers=1
```

Expected: every suite passes; report the exact file and test totals in the verification document.

- [ ] **Step 4: Run builds and Storybook accessibility checks**

```powershell
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
```

Expected: builds and all Storybook scenarios pass with no accessibility or console failures.

- [ ] **Step 5: Run affected browser and desktop journeys**

```powershell
corepack.cmd pnpm exec playwright test tests/e2e/management-assets.spec.ts tests/e2e/management-alerts.spec.ts tests/e2e/alert-video-audio.spec.ts tests/e2e/screen-effects.spec.ts
corepack.cmd pnpm exec playwright test --config playwright.desktop.config.ts tests/desktop/audio-routing.spec.ts tests/desktop/video-audio.spec.ts tests/desktop/screen-effects.spec.ts
```

Expected: all affected browser and desktop journeys pass.

- [ ] **Step 6: Strict-validate OpenSpec and repository formatting**

```powershell
openspec.cmd validate add-media-synced-duration-audio-fades --strict
git diff --check
```

Expected: both commands exit zero.

- [ ] **Step 7: Rebuild, restart one local instance, and perform live verification**

Stop only verified Stream Jams server processes from this worktree, start `node apps/server/dist/index.js` on one free local port, wait for the management page to return HTTP 200, and verify:

1. a new Alert resolves to its longest visible video/audio;
2. switching to Custom persists and survives reload;
3. replacing an asset changes the next automatic result;
4. Alert preview audibly fades in and out and mute remains independent;
5. a new Screen Effect variant exposes the same timing and fade controls;
6. Screen Effect inline preview and explicit-device test use the saved envelope;
7. existing objects remain Custom with fades disabled.

- [ ] **Step 8: Record evidence and complete OpenSpec tasks**

Write exact commands, counts, live port, tested object IDs, and limitations in `docs/verification/media-synced-duration-audio-fades.md`. Check OpenSpec boxes only for completed, evidenced work.

- [ ] **Step 9: Commit final documentation and verification**

```powershell
git add docs/product-plan.md docs/mvp-runbook.md docs/verification/media-synced-duration-audio-fades.md openspec/changes/add-media-synced-duration-audio-fades
git commit -m "docs: verify media timing and audio fades"
```

- [ ] **Step 10: Review branch scope before publication**

```powershell
git status --short --branch
git log --oneline origin/codex/align-screen-effects-editor..HEAD
git diff --stat origin/codex/align-screen-effects-editor...HEAD
git diff --check origin/codex/align-screen-effects-editor...HEAD
```

Expected: a clean worktree, only this feature's commits above PR #117, and no whitespace errors. Publishing or creating the stacked pull request remains a separate explicitly authorized action.
