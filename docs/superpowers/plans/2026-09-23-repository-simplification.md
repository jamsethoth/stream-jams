# Repository Simplification Implementation Plan

Execution note (September 23, 2026): The user chose native inline execution. The eleven slices were implemented as sequential commits on the audit branch rather than separate pull requests; the final measured outcomes and verification are recorded in the [audit resolution](../../audits/2026-09-23-repository-complexity-and-documentation-audit.md#resolution-status).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all twelve findings from the September 23 repository audit through behavior-preserving, independently reviewable simplification slices.

**Architecture:** Keep the existing core/server/web/desktop boundaries. Delete code with no production owner, consolidate behavior at the narrowest existing boundary, and extract only the three responsibilities that are demonstrably mixed today: output readiness, management route services, and local Alert preview playback. Deliver the work as eleven ordered pull requests so each deletion or interface change can be reviewed and reverted independently.

**Tech Stack:** Existing strict TypeScript/ESM, React 19, Fastify, SQLite, Vite, Vitest, Testing Library, Storybook and Playwright. Add no runtime or development dependencies; remove the web package's unused direct `tslib` declaration.

**Spec:** [Repository complexity and documentation audit](../../audits/2026-09-23-repository-complexity-and-documentation-audit.md). Canonical behavior remains defined by [OpenSpec capabilities](../../../openspec/specs) and the current source/tests. Backlog ownership is BL-041 and BL-054 through BL-056 in [the canonical backlog](../../backlog.md).

## Global Constraints

- Preserve every HTTP route, response schema, overlay URL shape, WebSocket contract, database schema, persisted record and visible UI workflow.
- Preserve the intentional differences between live Alert resolution and selected-document tests: live matching and remote TTS remain live-owned; tests retain `operatorTest`, selected variant/document behavior and browser-speech projection.
- Preserve management origin, bearer-session, CSRF and rate-limit enforcement. Test infrastructure must use the production security pre-handler rather than a weaker substitute.
- Preserve transparent fail-closed browser overlays, separate Alert and Screen Effect queues, explicit named audio routes, desktop display binding, and no fallback output.
- Keep the composition root explicit. Do not introduce a dependency-injection container, generic plugin loader, generic queue superclass, state-machine package or utility dependency.
- Keep the SQLite repository, transaction, backup/restore, migration and desktop privilege boundaries identified as valuable in the audit.
- Do not combine these slices into one code pull request. Each task below is one independently reviewable branch and pull request based on the latest `origin/main` after its prerequisites merge.
- The audit/documentation branch must land before implementation so the report, synchronized specifications and BL-054 through BL-056 are present on the implementation base.
- These are behavior-preserving maintenance changes. If implementation reveals a desired behavior change, stop that slice and create an approved OpenSpec delta before changing the behavior.
- After every slice, run its focused tests, affected package typecheck and lint. Before publishing each pull request, run the broader gates named in that task.
- After browser-visible changes in Tasks 10 and 11, rebuild/restart the local service, wait for health, reload the new bundle and exercise the changed workflow in the browser.

## Review Focus

- Live and test Alert instructions must stay field-for-field equal for shared layer properties while preserving their intentional TTS, identity and routing differences; Task 6 owns the parity tests.
- Unsafe management requests must reject a missing CSRF token and a foreign Origin even when the bearer session is valid; Task 4 owns these route-fixture regressions.
- Browser readiness must distinguish module output, unified visual visibility and unified audio, while desktop readiness must require the configured display to remain available; Task 7 owns the matrix.
- A stale or stopped Alert preview must never begin delayed media/TTS playback and must revoke every created object URL; Task 10 owns cancellation and disposal tests.
- Browser-source routes must load no management or operator application chunk, remain transparent while idle and preserve current route-key/socket behavior; Task 11 owns manifest, build-budget and Playwright checks.

## Finding-To-Task Map

| Finding | Planned task | Result |
| --- | --- | --- |
| R1 duplicated Alert instruction construction | Task 6 | One pure core layer projector with live/test parity coverage |
| R2 readiness policy in runtime composition | Task 7 | Output readiness and Screen Effect eligibility services |
| R3 Alert editor owns preview player | Task 10 | Disposable preview controller plus React hook |
| R4 forwarding façade and optional app bag | Tasks 8-9 | Narrow route services and an explicit production app factory |
| R5 duplicate asset transport/DTO | Task 5 | Shared authenticated raw transport and core `AssetRecord` |
| R6 weaker route-test auth | Task 4 | Production security fixture and removal of bearer-only pre-handler |
| R7 unused logger | Task 1 | Old logger and its tests deleted |
| R8 mandatory no-op transcoder | Task 2 | Direct validated-byte import path |
| R9 disconnected geometry helpers | Task 1 | Dead helpers/tests deleted; production behavior coverage retained |
| R10 duplicate readers/parsers | Task 3 | One private core path reader and one server route parser |
| R11 management code in overlay bundle | Task 11 | Route-scoped dynamic chunks and enforced budgets |
| R12 unused direct `tslib` | Task 1 | Direct dependency removed and lockfile regenerated |

## Delivery Order

Tasks 1-3 are low-risk deletion and consolidation. Tasks 4-6 establish trustworthy security, transport and Alert instruction boundaries. Task 7 removes runtime policy before Tasks 8-9 reshape HTTP composition. Task 10 isolates the editor's media lifecycle. Task 11 changes the production asset graph last, after the application boundaries are smaller and stable.

BL-056 closes after Tasks 1-2 merge. BL-054 closes after Tasks 3-6 merge. BL-055 closes after Tasks 7-10 merge. BL-041 closes after Task 11 meets its build budgets and live browser check. Remove each row only when every finding assigned to it is merged and its relevant specifications remain synchronized.

---

### Task 1: Remove Verified Dead Code And The Unused Direct Dependency

**Findings:** R7, R9 and R12.

**Files:**
- Delete: `apps/server/src/modules/diagnostics/logger.ts`
- Delete: `apps/server/src/modules/diagnostics/logger.test.ts`
- Delete: `packages/core/src/screen-effects/layout.ts`
- Delete: `packages/core/src/screen-effects/layout.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/web/src/management/alerts/editor/editor-state.ts`
- Modify: `apps/web/src/management/alerts/editor/editor-state.test.ts`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.test.tsx`
- Modify: `apps/server/src/modules/diagnostics/runtime-jsonl-logger.test.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:** No new production interface. `RuntimeJsonlLogger` remains the sole runtime logger. `AlertCanvas.onGeometryChange` remains the production keyboard-movement boundary. `OverlaySurface` remains the production fixed-profile fitting boundary.

- [x] **Step 1: Reconfirm that every deletion candidate has no production consumer**

Run:

```powershell
rg -n "createStructuredLogger|resolveHourlyLogFilePath|shouldLogLevel|fitScreenEffectCanvas|screenEffectCanvas|moveLayerWithArrow|EditorArrowKey" apps packages scripts
rg -n 'from "tslib"|importHelpers' apps/web tsconfig*.json apps/web/tsconfig*.json
```

Expected: the old logger is referenced only by its own test, the Screen Effect layout module only by its own test/export, the arrow helper only by its state test, and `tslib` by no tracked web source/configuration.

- [x] **Step 2: Pin the production behavior that replaces the disconnected tests**

Add this interaction to `AlertCanvas.test.tsx`, using the existing `editorDocument` fixture:

```tsx
it("moves the focused layer by one pixel or ten with Shift", async () => {
  const user = userEvent.setup();
  const onGeometryChange = vi.fn();
  render(<AlertCanvas assetApi={assetApi} document={editorDocument}
    onGeometryChange={onGeometryChange} onSelectLayer={vi.fn()}
    preview={false} profileId="landscape" samplePayload={{}} selectedLayerId={null} />);
  const layer = screen.getByRole("button", { name: "Badge layer" });
  layer.focus();
  await user.keyboard("{ArrowRight}");
  await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
  expect(onGeometryChange).toHaveBeenNthCalledWith(1, "layer-shape", expect.objectContaining({ x: 193, y: 108 }));
  expect(onGeometryChange).toHaveBeenNthCalledWith(2, "layer-shape", expect.objectContaining({ x: 192, y: 118 }));
});
```

The existing fixture uses `layer-shape` at `(192, 108)`, so the two calls above pin the exact one-pixel and ten-pixel deltas. Keep the existing `OverlaySurface.test.tsx` profile-scale matrix; it already covers the live fitting calculation. Extend `runtime-jsonl-logger.test.ts` to assert that logging leaves the caller's metadata object unchanged after redaction/sanitization.

Run: `corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertCanvas.test.tsx apps/web/src/overlay/components/OverlaySurface.test.tsx apps/server/src/modules/diagnostics/runtime-jsonl-logger.test.ts`.

Expected: PASS before deletion, establishing the production owners.

- [x] **Step 3: Delete the unused implementations and exports**

Remove the two logger files and Screen Effect layout files. Remove the `screen-effects/layout.js` barrel export. Remove `EditorArrowKey`, `moveLayerWithArrow` and their two state-only tests. Do not change `AlertCanvas` or `OverlaySurface` production calculations in this slice.

- [x] **Step 4: Remove `tslib` from the web package and regenerate the lockfile**

Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/web remove tslib
corepack.cmd pnpm install --frozen-lockfile
```

Expected: the manifest and lockfile no longer declare `tslib` as a direct web dependency; a transitive entry may remain.

- [x] **Step 5: Verify and commit the deletion slice**

Run:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertCanvas.test.tsx apps/web/src/overlay/components/OverlaySurface.test.tsx apps/server/src/modules/diagnostics/runtime-jsonl-logger.test.ts
corepack.cmd pnpm build
```

Commit: `refactor: remove unused implementations`

---

### Task 2: Remove The No-Op Media Transcoding Stage

**Finding:** R8.

**Files:**
- Modify: `packages/core/src/assets/media-import-pipeline.ts`
- Modify: `packages/core/src/assets/media-import-pipeline.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: route/runtime tests constructing `DefaultMediaImportPipeline`, found with `rg -l "NoopMediaTranscodingStage|transcoder:" apps packages`
- Modify: `docs/mvp-runbook.md` only if the current text still claims transcoding

**Interfaces:** `DefaultMediaImportPipelineOptions` keeps `validator`, `repository`, `store`, `probe`, `generateId` and `calculateChecksum`; it removes `transcoder`. Accepted original bytes flow directly to checksum, metadata probing and storage.

- [x] **Step 1: Strengthen the import-pipeline preservation test**

In `media-import-pipeline.test.ts`, make the accepted-media test use a distinct `Uint8Array` and assert that the exact same byte object reaches checksum/probe/store:

```ts
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const calculateChecksum = vi.fn(() => "sha256:abc123");
// construct without a transcoder after Step 2
expect(calculateChecksum).toHaveBeenCalledWith(bytes);
expect(store.writes[0]?.bytes).toBe(bytes);
```

For timed media, assert `probe.inspect` receives the original MIME type, byte length and byte object. Retain the probe-failure fallback and replacement storage-version tests.

- [x] **Step 2: Collapse the pipeline to validated original input**

Delete `MediaTranscodeInput`, `MediaTranscodeOutput`, `MediaTranscodingStage`, `NoopMediaTranscodingStage`, the option/field and the awaited call. Build one local accepted value after validation:

```ts
const accepted = {
  ...input,
  mediaType: validation.mediaType,
  normalizedExtension: validation.normalizedExtension
};
const checksum = this.#calculateChecksum(accepted.bytes);
```

Use `accepted` for probe, storage and the saved `AssetRecord`. Remove the old no-op-stage test and barrel exports. Remove `transcoder` construction from runtime and test fixtures.

- [x] **Step 3: Verify and commit**

Run:

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/assets/media-import-pipeline.test.ts apps/server/src/http/routes/assets.test.ts apps/server/src/runtime/runtime-composition.test.ts
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
```

Commit: `refactor: remove no-op media transcoder`

---

### Task 3: Consolidate Exact Duplicate Readers And Overlay Parameters

**Finding:** R10.

**Files:**
- Create: `packages/core/src/internal/read-own-path.ts`
- Create: `packages/core/src/internal/read-own-path.test.ts`
- Modify: `packages/core/src/alerts/condition-evaluator.ts`
- Modify: `packages/core/src/templates/template-renderer.ts`
- Create: `apps/server/src/http/routes/overlay-route-params.ts`
- Create: `apps/server/src/http/routes/overlay-route-params.test.ts`
- Modify: `apps/server/src/http/routes/assets.ts`
- Modify: `apps/server/src/http/routes/overlays.ts`

**Interfaces:** `readOwnPath(value: unknown, path: string): unknown` is package-private and is not exported from `packages/core/src/index.ts`. `readModuleOverlayParams` and `readUnifiedOverlayParams` return the current validated strings and `OverlayPurpose | null` shapes; they remain server-internal.

- [x] **Step 1: Add failing tests for the private core reader**

```ts
it("reads own nested values and rejects inherited or empty segments", () => {
  const inherited = Object.create({ secret: "no" }) as Record<string, unknown>;
  inherited.actor = { displayName: "James" };
  expect(readOwnPath(inherited, "actor.displayName")).toBe("James");
  expect(readOwnPath(inherited, "secret")).toBeUndefined();
  expect(readOwnPath(inherited, "actor..displayName")).toBeUndefined();
  expect(readOwnPath(inherited, "")).toBeUndefined();
});
```

Run: `corepack.cmd pnpm exec vitest run packages/core/src/internal/read-own-path.test.ts`.

Expected: FAIL because the module does not exist.

- [x] **Step 2: Implement and adopt `readOwnPath`**

Move the existing reducer unchanged into the new internal file, export only from that file, and import it relatively from the condition evaluator and template renderer. Delete both local copies. Run the new test plus `condition-evaluator.test.ts` and `template-renderer.test.ts`.

- [x] **Step 3: Add failing server parser tests**

```ts
it("normalizes module and unified route parameters without coercing values", () => {
  expect(readModuleOverlayParams({ moduleId: "alerts", purpose: "live", overlayKey: "ovl_x" }))
    .toEqual({ moduleId: "alerts", purpose: "live", overlayKey: "ovl_x" });
  expect(readModuleOverlayParams({ moduleId: 1, purpose: "replay", overlayKey: null }))
    .toEqual({ moduleId: "", purpose: null, overlayKey: "" });
  expect(readUnifiedOverlayParams({ purpose: "test", overlayKey: "ovl_y" }))
    .toEqual({ purpose: "test", overlayKey: "ovl_y" });
});
```

Run: `corepack.cmd pnpm exec vitest run apps/server/src/http/routes/overlay-route-params.test.ts`.

Expected: FAIL because the module does not exist.

- [x] **Step 4: Move the server parsers without changing route behavior**

Create the shared parser file with `parseOverlayPurpose`, `readModuleOverlayParams` and `readUnifiedOverlayParams`; import it from both route files and remove the four duplicate local readers. Retain query-profile validation in its current owner.

- [x] **Step 5: Verify and commit**

Run:

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/alerts/condition-evaluator.test.ts packages/core/src/templates/template-renderer.test.ts packages/core/src/internal/read-own-path.test.ts apps/server/src/http/routes/overlay-route-params.test.ts apps/server/src/http/routes/assets.test.ts apps/server/src/http/routes/overlays.test.ts
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
```

Commit: `refactor: consolidate shared readers`

---

### Task 4: Make Route Tests Use Production Management Security

**Finding:** R6.

**Files:**
- Create: `apps/server/src/http/test-support/management-security-fixture.ts`
- Create: `apps/server/src/http/test-support/management-security-fixture.test.ts`
- Create: `apps/server/src/http/middleware/management-bearer-token.ts`
- Move/modify: `apps/server/src/http/middleware/management-auth.test.ts` to test the token helper only
- Modify: `apps/server/src/http/middleware/management-security.ts`
- Delete: `apps/server/src/http/middleware/management-auth.ts`
- Modify: every route test returned by `rg -l "createManagementAuthPreHandler" apps/server/src/http/routes`

**Interfaces:**

```ts
export const testManagementOrigin = "http://127.0.0.1:39187";
export function createTestManagementSecurity(
  sessionService: Pick<ManagementSessionService, "verifySession">
): preHandlerHookHandler;
export function managementTestHeaders(
  session: Pick<ManagementSession, "id" | "csrfToken">,
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
): Record<string, string>;
```

The helper constructs `createManagementSecurityPreHandler` with an allowlist containing `testManagementOrigin`. Headers always include Origin and bearer authorization; unsafe methods also include the CSRF token.

- [x] **Step 1: Add a failing fixture contract test**

Register one GET and one POST on a small Fastify instance. Assert a valid GET succeeds, a valid POST succeeds, POST without CSRF returns `403 MANAGEMENT_CSRF_REQUIRED`, and either method with `http://evil.invalid` returns `403 MANAGEMENT_ORIGIN_FORBIDDEN`.

Run: `corepack.cmd pnpm exec vitest run apps/server/src/http/test-support/management-security-fixture.test.ts`.

Expected: FAIL because the fixture does not exist.

- [x] **Step 2: Implement the fixture and isolate bearer parsing**

Move `extractBearerToken` unchanged to `management-bearer-token.ts`; import it from production security. Implement the test helper against production security. Keep timing-safe CSRF comparison and logging behavior in `management-security.ts`.

- [x] **Step 3: Migrate route fixtures in small compilable groups**

Replace bearer-only pre-handler construction and hand-written authorization headers. For example:

```ts
const session = await sessions.createSession();
const managementAuthPreHandler = createTestManagementSecurity(sessions);
const getHeaders = managementTestHeaders(session);
const postHeaders = managementTestHeaders(session, "POST");
```

Use the matching method for every injected unsafe request. Migrate assets/configuration, overlay/playback, provider/TTS, then management UI/Screen Effects. Run each changed test file immediately.

- [x] **Step 4: Close the asset replacement CORS gap while the production boundary is under test**

Add `x-stream-jams-confirm-impact` to `allowedRequestHeaders` in `management-security.ts` and extend its OPTIONS test to expect that header, because the production asset replacement client already sends it.

- [x] **Step 5: Remove the obsolete pre-handler and verify**

After `rg -n "createManagementAuthPreHandler" apps/server/src` returns no callers, delete `management-auth.ts`; retain token parser tests in the renamed file.

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/http/middleware apps/server/src/http/routes
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
```

Commit: `test: use production management security`

---

### Task 5: Unify Asset Requests With The Management HTTP Client

**Finding:** R5.

**Files:**
- Modify: `apps/web/src/management/management-http-client.ts`
- Modify: `apps/web/src/management/management-http-client.test.ts`
- Modify: `apps/web/src/management/assets/asset-api.ts`
- Modify: `apps/web/src/management/assets/asset-api.test.ts`
- Modify: asset fixtures importing the local `AssetRecord` type

**Interfaces:**

```ts
export interface ManagementRawRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly headers?: HeadersInit;
  readonly body?: BodyInit | null;
  readonly fallbackMessage: string;
}
export interface ManagementHttpClient {
  request(path: string, options: ManagementRawRequestOptions): Promise<Response>;
  // existing JSON helpers remain
}
export interface HttpAssetApiOptions extends HttpManagementClientOptions {
  readonly client?: ManagementHttpClient;
}
```

`request` owns session acquisition, authorization, CSRF for unsafe methods, exactly one retry after a 401, header merging and `ManagementHttpError`. Caller headers cannot override authorization or CSRF.

- [x] **Step 1: Add failing raw-request transport tests**

Test an octet-stream POST with custom file headers, assert the management client appends bearer/CSRF without losing them, then return 401 and assert one new session plus one retry. Add a failing-response assertion that checks `ManagementHttpError.code`, `referenceId`, `nextStep` and HTTP status.

Run: `corepack.cmd pnpm exec vitest run apps/web/src/management/management-http-client.test.ts`.

Expected: FAIL because `request` does not exist.

- [x] **Step 2: Promote `requestWithSession` to the public raw operation**

Build a `Headers` instance from caller headers, overwrite authorization, add CSRF only for unsafe methods, and reuse `createManagementHttpError`. Rewrite JSON helpers on top of `request` so one implementation owns session/error behavior.

- [x] **Step 3: Replace the asset API's session implementation**

Import and re-export `AssetRecord` from `@stream-jams/core`; remove the local DTO, `ManagementSessionResponse`, cache and retry code. Construct `options.client ?? createManagementHttpClient(options)` and call `client.request` for list/import/file/replace.

Add asset tests that assert `durationMs` survives a list/import response and a structured server failure remains a `ManagementHttpError`. Preserve binary bodies, URL encoding and impact-confirmation headers.

- [x] **Step 4: Verify and commit**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/management-http-client.test.ts apps/web/src/management/assets/asset-api.test.ts apps/web/src/management/assets/AssetManager.test.tsx apps/web/src/management/assets/AssetPicker.test.tsx
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm build
corepack.cmd pnpm build-storybook
```

Commit: `refactor: share management asset transport`

---

### Task 6: Give Alert Layer Projection One Core Owner

**Finding:** R1.

**Files:**
- Create: `packages/core/src/alerts/alert-layer-instruction.ts`
- Create: `packages/core/src/alerts/alert-layer-instruction.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/alerts/alert-resolver.ts`
- Modify: `packages/core/src/alerts/alert-resolver.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`

**Interfaces:**

```ts
export type AlertLayerInstructionBase = Pick<OverlayInstruction,
  "id" | "overlayId" | "moduleId" | "purpose" | "scope" |
  "targetProfileId" | "durationMs"> & { readonly operatorTest?: true };

export interface BuildAlertLayerInstructionInput {
  readonly base: AlertLayerInstructionBase;
  readonly layer: AlertLayer;
  readonly layout: OverlayElementLayout | undefined;
  readonly renderedText?: string | undefined;
  readonly tts?: OverlayInstruction["tts"] | undefined;
  readonly visualMediaType?: OverlayVisualInstruction["mediaType"] | undefined;
  readonly audio?: {
    readonly sourceKind: ResolvedAudioLayer["sourceKind"];
    readonly playbackDurationMs: number;
    readonly fadeInMs: number;
    readonly fadeOutMs: number;
  } | undefined;
}

export function buildAlertLayerInstruction(
  input: BuildAlertLayerInstructionInput
): OverlayInstruction | null;
```

Callers render/moderate text and decide the TTS payload. The projector owns common null fields, animation, layouts, visual media/loop, audio volume/envelope and shape fill.

- [x] **Step 1: Add the failing table-driven projector test**

Cover text, image, GIF-backed video, looping video, audio with non-zero fades, enabled TTS payload, shape and a visual without layout. Assert each full `OverlayInstruction`, including all null fields and the optional `operatorTest` base property.

Run: `corepack.cmd pnpm exec vitest run packages/core/src/alerts/alert-layer-instruction.test.ts`.

Expected: FAIL because the module does not exist.

- [x] **Step 2: Implement the pure projector**

Use one exhaustive layer-type branch. Return `null` for layout-dependent layers without layout and for TTS when `input.tts` is absent. Do not render templates, select variants, resolve destinations or generate IDs inside this function.

- [x] **Step 3: Replace the live resolver's private builder**

Create the current live base at the call site, render text/TTS with the current renderers and provider mode/payload, pass resolved audio envelope values, and call the shared function. Delete `#createEditorLayerInstruction`. Preserve `desktopVisualEligible` decoration outside the projector.

- [x] **Step 4: Replace the selected-document test builder**

Create the `operatorTest: true` base and browser-speech TTS payload at the call site. Delete `createLayerInstruction` from the server service. Retain selected document/variant selection, moderation and dispatch in `AlertEditorService`.

- [x] **Step 5: Add parity and difference tests**

Construct equivalent text, visual, audio and shape layers through live resolver and editor test paths; compare their common content after removing IDs, target metadata and `operatorTest`. Separately assert remote live TTS remains `remote-trigger` with provider payload while selected-document test TTS remains `browser-speech` with no provider payload.

- [x] **Step 6: Verify and commit**

Run:

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/alerts/alert-layer-instruction.test.ts packages/core/src/alerts/alert-resolver.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/playback/playback-coordinator.test.ts
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
```

Commit: `refactor: unify alert layer projection`

---

### Task 7: Move Readiness And Eligibility Policy Out Of Runtime Composition

**Finding:** R2.

**Files:**
- Create: `apps/server/src/modules/overlays/output-readiness-service.ts`
- Create: `apps/server/src/modules/overlays/output-readiness-service.test.ts`
- Create: `apps/server/src/modules/screen-effects/effect-playback-eligibility-service.ts`
- Create: `apps/server/src/modules/screen-effects/effect-playback-eligibility-service.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- Modify: `apps/server/src/modules/providers/management-ui-service.ts`
- Modify: `apps/server/src/modules/providers/management-ui-service.test.ts`
- Modify: `apps/web/src/management/home/HomePanel.tsx`
- Modify: `apps/web/src/management/home/HomePanel.test.tsx`

**Interfaces:**

```ts
export class OutputReadinessService {
  isModuleBrowserSourceConnected(moduleId: string, targetProfileId: TargetProfileId | null): boolean;
  isUnifiedBrowserSourceConnected(): boolean;
  listAlertBrowserSources(origin: string): Promise<readonly AlertBrowserSourceView[]>;
  hasConfiguredAlertBrowserOutput(origin: string): Promise<boolean>;
  isBrowserOutputReady(input: {
    moduleId: string; hasVisual: boolean; hasAudio: boolean;
    targetProfileId: TargetProfileId | null;
  }): Promise<boolean>;
  isDesktopVisualReady(moduleId: string): Promise<boolean>;
  hasReadyAudioRoute(routeIds: readonly string[]): Promise<boolean>;
}

export class EffectPlaybackEligibilityService {
  referencesExist(content: EffectContentSnapshot): Promise<boolean>;
  hasAvailableOutput(content: EffectContentSnapshot): Promise<boolean>;
}
```

The output service depends on narrow readers for gateway client states, output management, surfaces, desktop status and audio status. The Effect service owns Screen Effect media/route integrity and translates its variant policy into output-service queries.

- [x] **Step 1: Add the output readiness matrix**

Test module-connected visual, unified-visible visual, unified-hidden visual, unified audio regardless of visual layer visibility, unavailable/missing desktop display, desktop status exception, one ready named route among unavailable routes, and browser-source inventory connection-state ordering. Pin the event-source startup states too: `starting` and `reconnecting` remain transitional setup states, while `error` is blocked.

Run: `corepack.cmd pnpm exec vitest run apps/server/src/modules/overlays/output-readiness-service.test.ts`.

Expected: FAIL because the service does not exist.

- [x] **Step 2: Implement the output query service**

Move the existing client-state predicates, unified-surface visibility check, desktop display/status check, audio route status query and Alert browser-source projection into the class. Keep exceptions fail-closed. Do not import Screen Effect document types here.

- [x] **Step 3: Add and implement Screen Effect eligibility tests**

Test missing/mismatched visual media, non-audio sound, deleted audio route, valid references, visual-only, browser-audio-only, desktop-only, device-only and no-ready-output cases. Implement `EffectPlaybackEligibilityService` with the asset repository, route repository and `OutputReadinessService`.

- [x] **Step 4: Rewire runtime collaborators**

Instantiate both services once. Pass `referencesExist` and `hasAvailableOutput` to Effect admission/playback. Pass browser/desktop queries to `AlertEditorService`, browser-source listing to `AlertSetManagementService`, and configured-output query to the Home service. Delete the local closures and move `isEffectBrowserOutputReady` tests to the new service test.

- [x] **Step 5: Keep Home readiness current during event-source startup**

Add a failing Home test that starts with an event source in `starting`, advances the existing five-second live-status interval, and observes `complete` after the API reports `healthy`. Reuse the Event sources page polling interval, preserve the last visible summary when a refresh fails, and stop polling once the event source is either healthy or blocked. Update the server readiness action for `starting` and `reconnecting` to describe the transition (`Starting event source` / `Reconnect in progress`) instead of the unrelated `Enable intake` action.

- [x] **Step 6: Verify and commit**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/overlays/output-readiness-service.test.ts apps/server/src/modules/screen-effects/effect-playback-eligibility-service.test.ts apps/server/src/modules/screen-effects/effect-admission-service.test.ts apps/server/src/modules/screen-effects/effect-playback-coordinator.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/modules/providers/management-ui-service.test.ts apps/web/src/management/home/HomePanel.test.tsx apps/server/src/runtime/runtime-composition.test.ts
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
```

Commit: `refactor: extract output readiness policy`

---

### Task 8: Replace The Management Façade With Narrow Route Services

**Finding:** R4, façade half.

**Files:**
- Rename/modify: `apps/server/src/modules/providers/management-ui-service.ts` to `management-overview-service.ts`
- Rename/modify: corresponding service test
- Split: `apps/server/src/http/routes/management-ui.ts`
- Create: `apps/server/src/http/routes/management-home.ts`
- Create: `apps/server/src/http/routes/management-providers.ts`
- Create: `apps/server/src/http/routes/management-alerts.ts`
- Create: `apps/server/src/http/routes/management-assets.ts`
- Create: `apps/server/src/http/routes/management-diagnostics.ts`
- Create: `apps/server/src/http/routes/management-route-errors.ts`
- Split/modify: `apps/server/src/http/routes/management-ui.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`

**Interfaces:** `ManagementOverviewService` retains only `getHomeSetupSummary`, `listRegisteredProviders` and `getRegisteredProvider`, because these methods compose or decorate multiple sources. Provider commands use `ProviderManagementService`; Alert set commands use `AlertSetManagementService`; editor commands use `AlertEditorService`; asset commands use `AssetLibraryService`; diagnostics/backup/maintenance use their existing services or narrow callbacks.

- [x] **Step 1: Split the route tests by existing URL family**

Move tests without changing assertions: Home; providers/TTS; Alert sets/editor; asset metadata; diagnostics/backup/local maintenance. Each test creates a Fastify instance, applies the Task 4 production-security fixture and calls only its domain registrar. Run all five files and expect PASS before production movement.

- [x] **Step 2: Extract route registrars and shared error mapping**

Move handlers and their schemas/readers intact. Each registrar accepts one narrow interface, for example:

```ts
export interface ManagementAlertRouteDependencies {
  readonly alertSets: Pick<AlertSetManagementService,
    "listSets" | "getSet" | "createSet" | "createAlert" |
    "createAlertVariation" | "duplicateManagedAlert" | "resetManagedAlert" |
    "deleteManagedAlert" | "renameSet" | "duplicateSet" |
    "getActivationImpact" | "activateSet" | "markStarterReviewComplete" |
    "setAlertEnabled" | "deleteSet">;
  readonly alertEditor: Pick<AlertEditorService, "getDocument" | "getVariationContext" | "saveDocument" | "sendTest">;
  readonly reportClientError: (alertId: string, input: AlertEditorErrorReportInput) => Promise<AlertEditorErrorReportResult>;
  readonly preHandlers: readonly preHandlerHookHandler[];
  readonly generateServerErrorId?: (() => string) | undefined;
}
```

List every consumed method explicitly in the final types; do not use whole-class types or `any`. Preserve paths and response parsing exactly.

- [x] **Step 3: Shrink and rename the concrete service**

Delete the 34 forwarding methods/options. Keep Home aggregation and provider live/Twitch decoration. Rename the class and tests to describe that ownership. Pass existing domain services directly to route registrars from runtime composition.

- [x] **Step 4: Verify route equivalence**

Run the split route tests, `management-overview-service.test.ts`, runtime composition smoke tests and web management API tests. Compare `rg -n 'app\.(get|post|put|patch|delete)\('` results before/after so every old management URL appears once.

- [x] **Step 5: Commit**

Run:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
```

Commit: `refactor: narrow management route services`

---

### Task 9: Make Production Server Dependencies Explicit

**Finding:** R4, application-factory half. Depends on Task 8 so route tests no longer need a partially assembled production app.

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/server/src/http/routes/web-shell.test.ts`
- Modify: remaining tests returned by `rg -l "createServerApp\(" apps/server/src`

**Interfaces:**

```ts
export interface BaseServerAppOptions {
  readonly metadata: ServerAppMetadata;
  readonly generateServerErrorId?: () => string;
  readonly serverErrorLogger?: (entry: ServerErrorLogEntry) => void;
}
export function createBaseServerApp(options: BaseServerAppOptions): FastifyInstance;

export type ProductionServerAppDependencies = BaseServerAppOptions &
  ServerConfigRouteDependencies & DesktopConfigRouteDependencies &
  AudioOutputRouteDependencies & SurfaceSettingsRouteDependencies &
  ConfigurationBackupRouteDependencies & ManagementSessionRouteDependencies &
  ManagementUiRouteDependencies & ModerationRouteDependencies &
  DiagnosticsRouteDependencies & OverlayModuleRouteDependencies &
  OverlayOutputManagementRouteDependencies & OverlayRouteDependencies &
  AssetRouteDependencies & AlertRuleRouteDependencies &
  AlertCollectionRouteDependencies & PlaybackRouteDependencies &
  PlaybackOperationsRouteDependencies & TtsRouteDependencies &
  TwitchAuthRouteDependencies & TwitchEventSubRouteDependencies &
  TwitchRewardCatalogRouteDependencies & StreamerBotSubscriptionRouteDependencies &
  ScreenEffectRouteDependencies & WebShellRouteDependencies;

export function createServerApp(dependencies: ProductionServerAppDependencies): FastifyInstance;
```

- [x] **Step 1: Convert health/error and isolated route tests to the base factory**

`createBaseServerApp` installs Fastify, the error handler and health only. Tests of an individual registrar call it and register that route explicitly. Web-shell tests register web-shell and overlay routes explicitly against the base app.

- [x] **Step 2: Make the production factory fully typed**

Replace `ServerAppDependencies extends Partial<...>` and all `has*Dependencies` predicates with `ProductionServerAppDependencies`. Register every production route unconditionally. Keep optional members that are genuinely optional inside a route dependency interface; do not make an entire production route optional.

- [x] **Step 3: Prove runtime construction is complete at compile time**

Call the new factory from `createRuntimeAppComposition`. Add a type-only regression using `satisfies ProductionServerAppDependencies` for the assembled object. Remove tests that expected a partial bag to throw at runtime; replace them with direct registrar tests for missing security only where the registrar itself supports such construction.

- [x] **Step 4: Verify and commit**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/app.test.ts apps/server/src/http/routes apps/server/src/runtime/runtime-composition.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
```

Commit: `refactor: require complete server assembly`

---

### Task 10: Extract The Alert Preview Media Controller

**Finding:** R3.

**Files:**
- Create: `apps/web/src/management/alerts/editor/alert-preview-controller.ts`
- Create: `apps/web/src/management/alerts/editor/alert-preview-controller.test.ts`
- Create: `apps/web/src/management/alerts/editor/use-alert-preview.ts`
- Create: `apps/web/src/management/alerts/editor/use-alert-preview.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`

**Interfaces:**

```ts
export interface AlertPreviewState {
  readonly active: boolean;
  readonly playing: boolean;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly runId: number;
}
export interface AlertPreviewStartInput {
  readonly document: AlertEditorDocument;
  readonly ttsTextByLayerId: Readonly<Record<string, string>>;
  readonly includeAudio: boolean;
  readonly includeTts: boolean;
}
export interface AlertPreviewController {
  getSnapshot(): AlertPreviewState;
  subscribe(listener: () => void): () => void;
  start(input: AlertPreviewStartInput): Promise<void>;
  play(): void;
  pause(): void;
  seek(elapsedMs: number): void;
  stop(): void;
  dispose(): void;
}
```

The controller owns clocks, animation frame/timers, media preparation deadline, `Audio` elements, object URLs, gain synchronization and speech synthesis. The hook owns one controller instance and subscribes through `useSyncExternalStore`. `AlertEditorPage` retains draft/sample validation, moderation requests, notices and error presentation.

- [x] **Step 1: Add failing controller lifecycle tests**

Inject clock/timer/animation-frame, `createAudio`, object-URL, speech and `AssetApi.getAssetFile` adapters. Test: start/play; pause; seek; natural completion; preparation timeout; second start cancels first; stop before a delayed blob resolves prevents `play`; every created URL is revoked; dispose cancels speech/timers/media and makes later async completion inert.

Run: `corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/alert-preview-controller.test.ts`.

Expected: FAIL because the controller does not exist.

- [x] **Step 2: Implement the imperative controller**

Use a monotonically increasing generation number for stale work. Store cleanup callbacks in one owned set. `stop` increments the generation before running cleanup. `dispose` calls `stop`, clears listeners and permanently rejects new start work. Reuse `createMediaGainController`, `resolveAudioEnvelope` and resolved document duration; do not duplicate fade math.

- [x] **Step 3: Implement and test the React hook**

Construct the controller once per `assetApi` identity, subscribe with `useSyncExternalStore`, dispose on unmount, and return state plus controller commands. The hook test must prove unmount calls `dispose` once and rerender with the same API does not recreate the controller.

- [x] **Step 4: Rewire `AlertEditorPage`**

Replace preview state/refs and the clock/media functions with the hook. Keep `previewLocally` responsible for sample validation and parallel moderation; once moderation is current, set preview text and call `preview.start`. Draft edits, profile/sample switches, undo/redo/revert and unmount call `preview.stop` through the existing `resetLocalPreview` boundary.

- [x] **Step 5: Preserve visible behavior**

Retain component tests for Preview versus Test draft, muted defaults, stored preferences, pause/resume/seek, media fades, moderation failures and cleanup. Add one component regression where moderation from an old Preview resolves after a draft edit and does not reopen playback.

- [x] **Step 6: Verify live UI and commit**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/alert-preview-controller.test.ts apps/web/src/management/alerts/editor/use-alert-preview.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm build
corepack.cmd pnpm build-storybook
corepack.cmd pnpm test:storybook:ci
corepack.cmd pnpm test:e2e
```

Rebuild/start the local app, open one Alert, exercise Preview/play/pause/seek/stop and edit the draft during playback. Confirm no console error, leaked audio or stale preview.

Commit: `refactor: isolate alert preview playback`

---

### Task 11: Split Browser Route Bundles And Enforce Budgets

**Finding:** R11 and BL-041.

**Files:**
- Create: `apps/web/src/route-shell.ts`
- Modify: `apps/web/src/main.tsx`
- Create: `scripts/check-web-route-bundles.mjs`
- Create: `scripts/check-web-route-bundles.test.mjs`
- Modify: `apps/web/package.json`
- Modify: `apps/server/src/http/routes/web-shell.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `tests/e2e/management.spec.ts`
- Modify: `tests/e2e/operator.spec.ts`
- Modify: `tests/e2e/overlay.spec.ts`
- Modify: `.github/workflows/ci.yml` only if the root build command does not already execute the new budget check
- Modify: `docs/backlog.md` after budgets and live verification pass

**Interfaces:**

```ts
export type WebRouteShell = "management" | "operator" | "overlay";
export function resolveWebRouteShell(pathname: string): WebRouteShell;
```

`main.tsx` imports only React/bootstrap code statically and dynamically imports exactly one of `App`, `OperatorApp` or `OverlayApp` after resolving the pathname. The server can continue rendering one manifest entry because Vite records route applications as dynamic chunks.

- [x] **Step 1: Add failing route-selection tests**

Test `/manage`, nested management paths, `/operator`, module overlay paths and unified overlay paths. Unknown paths resolve to management, preserving the current shell fallback.

- [x] **Step 2: Introduce route-scoped dynamic imports**

Implement:

```tsx
const loaders = {
  management: () => import("./App.js").then(({ App }) => <App />),
  operator: () => import("./operator/OperatorApp.js").then(({ OperatorApp }) => <OperatorApp />),
  overlay: () => import("./overlay/OverlayApp.js").then(({ OverlayApp }) => <OverlayApp />)
} satisfies Record<WebRouteShell, () => Promise<ReactNode>>;
```

Set language/direction/body class before loading. Render the chosen component inside `StrictMode`; on load failure, log once while leaving overlay output transparent. Do not render diagnostic text into an overlay shell.

- [x] **Step 3: Add a manifest-based bundle boundary checker**

The script reads `apps/web/dist/.vite/manifest.json`, walks static imports and dynamic entry graphs, then gzips unique JavaScript files for each route. It fails unless:

- bootstrap/static graph is at most 100 KiB gzip;
- overlay initial graph is at most 150 KiB gzip;
- operator initial graph is at most 175 KiB gzip;
- management initial graph is at most 250 KiB gzip;
- overlay graph contains neither `src/App.tsx` nor any `src/management/` module;
- operator graph contains no Alert editor or Screen Effect editor module.

Test the script with a synthetic manifest containing a shared vendor chunk, valid dynamic graphs, a management leak into overlay and an over-budget chunk. Add it after `vite build` in the web build script.

- [x] **Step 4: Update shell/build tests**

Extend web-shell fixtures to include `dynamicImports` and verify the generated shell loads only the bootstrap entry. In runtime smoke, assert management, operator and overlay HTML all resolve while their client route chooses the expected application. Keep route keys absent from returned HTML.

- [x] **Step 5: Add browser workflow coverage**

In Playwright, load management, operator and a test-owned overlay route from the production-style server. Assert the correct root landmark, overlay transparency while idle, no management landmark on overlay, no overlay connection/auth regression and no console errors. Inspect resource entries and assert no URL whose manifest source belongs to `src/management/` loads on the overlay page.

- [x] **Step 6: Verify, measure and close the backlog item**

Run:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
node.exe scripts/check-web-route-bundles.mjs
corepack.cmd pnpm build-storybook
corepack.cmd pnpm test:storybook:ci
$env:CI='true'; corepack.cmd pnpm test:e2e
```

Record the emitted route totals in the pull-request description. Rebuild/start the local service, reload management/operator/module-overlay/unified-overlay routes, and confirm idle transparency plus live test playback. Remove BL-041 only after these checks pass.

Commit: `perf: isolate browser route bundles`

---

## Final Reconciliation

After all eleven tasks merge, fetch current `origin/main` and rerun the complete repository gates once as an integration check:

```powershell
corepack.cmd pnpm install --frozen-lockfile
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm build-storybook
corepack.cmd pnpm test:storybook:ci
$env:CI='true'; corepack.cmd pnpm test:e2e
openspec.cmd validate --all --strict
git diff --check
```

Re-run the audit's production-reference searches and size measurements. Update the audit with a dated resolution table rather than rewriting its original evidence. Remove BL-054, BL-055 and BL-056 only when every mapped task is merged; leave any row whose task is still open. No canonical requirement should change unless a separately approved behavior change was introduced.

The completion review must confirm that the resulting code has one Alert layer projector, one management session/error transport, one production management security pre-handler, one runtime logger, no transcoder seam, no disconnected geometry implementation, no duplicated path/overlay-parameter reader, explicit production server dependencies, a disposable Alert preview owner and route-isolated web bundles within the stated budgets.
