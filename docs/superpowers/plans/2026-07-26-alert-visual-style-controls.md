# Alert Visual Style Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver BL-002 by adding bounded typography and text-container controls whose saved appearance is consistent in the focused editor, local preview, Send test, live browser-source playback, persistence, backup, and restore.

**Architecture:** Keep styles on the existing shared text-layer document beside profile-specific geometry. Normalize and default the style contract in `@stream-jams/core`, backfill existing JSON documents with one data-only SQLite migration, carry the same typed objects through test/live overlay instructions, and translate them to CSS through one browser-safe mapper shared by the alert canvas and production overlay.

**Tech Stack:** TypeScript 6 strict mode, Zod, Node.js SQLite migrations, Fastify, React 19, native HTML inputs, existing management API/session boundaries, Vitest, Testing Library, Storybook 10, and Playwright.

## Global Constraints

- Base implementation on a fresh fetch of `origin/main`; this plan was prepared from clean detached `HEAD` `8482dab34c81392d58faf0aaa617b1f02ea2adee`, which exactly matched `origin/main` on 2026-07-26.
- Implement only OpenSpec change `add-alert-visual-style-controls`; it is strictly valid and currently has 0/16 implementation tasks complete.
- Recheck that `refactor-management-ui-ux` and `improve-management-ui-ux-audit-followups` remain task-complete, strictly valid, and present on `origin/main`. Both gates passed while this plan was prepared.
- Preserve strict TypeScript, ESM imports, package boundaries, management authentication/CSRF, overlay authorization, and runtime boundary validation.
- Add no dependency, remote font request, font asset type, raw CSS field, HTML/rich-text path, provider-specific presentation field, or parallel editor/rendering path.
- Keep `textStyle` and `boxStyle` shared on the layer. Landscape and vertical documents continue to own geometry only.
- Use canonical uppercase `#RRGGBBAA` colors. The editor may split the RGB and alpha channels into native controls, but it must persist one canonical color value.
- Production overlay failures remain transparent and report through the existing playback-failure/diagnostics path; no viewer-visible error content is added.
- Use existing explicit Save, dirty-navigation, live-impact confirmation, undo/redo, Storybook, and Playwright patterns.
- Do not remove BL-002 from `docs/backlog.md` until implementation is complete, the OpenSpec delta is synchronized/archived, and the final verification evidence exists.

---

## Verified Baseline

### OpenSpec and dependency state

- `openspec.cmd validate add-alert-visual-style-controls --strict` passes.
- `openspec.cmd list --json` reports `add-alert-visual-style-controls` at 0/16 tasks.
- `refactor-management-ui-ux` is merged through PR #66 and is 87/87 tasks complete.
- `improve-management-ui-ux-audit-followups` is merged through PR #68 and is 56/56 tasks complete.
- Both prerequisite changes pass strict validation. They remain active OpenSpec directories on `origin/main`, but their implementation gate is satisfied because their tasks, code, and merge commits are present.
- BL-003 `add-alert-shape-layer-authoring` depends on BL-002's canonical RGBA schema and reusable native color control. BL-002 must expose those two narrow seams without implementing Shape authoring.

### Current end-to-end flow

```text
Focused editor
  AlertEditorPage
    -> AlertEditorDocument
    -> PUT /management/alerts/:alertId/editor
    -> alertEditorSaveInputSchema
    -> AlertEditorService
    -> SqliteAlertEditorDocumentRepository.document_json

Draft/local preview
  AlertEditorPage -> AlertCanvas -> fixed canvas text CSS

Saved Send test
  AlertEditorService.createLayerInstruction
    -> OverlayInstruction.text
    -> playback queue / existing overlay WebSocket
    -> OverlaySurface -> fixed overlay text CSS

Live event
  PlaybackCoordinator loads saved editor documents
    -> DefaultAlertResolver.#createEditorLayerInstruction
    -> OverlayInstruction.text
    -> existing overlay WebSocket
    -> OverlaySurface

Backup/restore
  SqliteConfigurationSnapshotRepository
    -> allowlisted alert_editor_documents.document_json
    -> alertEditorDocumentSchema validation
    -> transactional restore
```

### Gaps confirmed in current code

- `packages/core/src/management/contracts.ts` gives text layers only `template`; there is no typed style contract or style default.
- `OverlayTextInstruction` contains only `text` and `layout`.
- `AlertEditorService` and `DefaultAlertResolver` independently create text instructions and currently drop all authoring-only style data because none exists.
- Canvas CSS uses a clamped maximum 28px font and `rgba(0,0,0,.85)` shadow; live overlay CSS uses 32px and `rgba(0,0,0,.72)`. The compatibility baseline must preserve production output and deliberately correct this preview drift.
- `SqliteAlertEditorDocumentRepository` already parses every read and write with `alertEditorDocumentSchema`; its generic storage code does not need a new repository method.
- Backup/restore already transports and validates `document_json`; it needs coverage, not a feature-specific backup service.
- Management GET, PUT, and Send test routes already parse the shared schemas and use the authenticated management boundary; no new endpoint is needed.
- `editor-state.ts` already stores whole-document history and copies/duplicates whole layer objects, so style edits automatically participate once controls call the existing `updateLayer`.
- Shape rendering exists, but Shape creation and fill authoring belong to BL-003.

## Fixed Contract Decisions

### Core types, limits, and compatibility values

Create `packages/core/src/alerts/text-style.ts` as the only core owner of these values:

```ts
export const alertFontPresets = [
  {
    id: "system-sans",
    label: "System sans",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  {
    id: "rounded-sans",
    label: "Rounded sans",
    fontFamily: 'ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif'
  },
  {
    id: "serif",
    label: "Serif",
    fontFamily: 'Georgia, "Times New Roman", serif'
  },
  {
    id: "monospace",
    label: "Monospace",
    fontFamily: 'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace'
  }
] as const;

export const alertTextStyleLimits = {
  fontSizePx: { min: 8, max: 512 },
  lineHeight: { min: 0.75, max: 3 },
  paddingPx: { min: 0, max: 256 },
  cornerRadiusPx: { min: 0, max: 512 },
  shadowOffsetPx: { min: -256, max: 256 },
  shadowBlurPx: { min: 0, max: 256 }
} as const;

export const alertFontWeights = [400, 500, 600, 700, 800, 900] as const;

export const compatibilityAlertTextStyle = {
  fontPreset: "system-sans",
  fontSizePx: 32,
  fontWeight: 800,
  lineHeight: 1.15,
  horizontalAlign: "center",
  verticalAlign: "center",
  color: "#FFFFFFFF",
  shadow: {
    offsetX: 0,
    offsetY: 2,
    blur: 8,
    color: "#000000B8"
  }
} as const;

export const compatibilityAlertTextBoxStyle = {
  backgroundColor: "#00000000",
  paddingPx: 0,
  cornerRadiusPx: 0,
  shadow: null
} as const;

export const defaultOptionalAlertShadow = {
  offsetX: 0,
  offsetY: 4,
  blur: 12,
  color: "#00000080"
} as const;
```

The schemas are strict objects so fields such as `fontFamily`, `fontUrl`, `css`, or `filter` are rejected instead of stripped:

```ts
export const rgbaColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{8}$/iu, "Use an 8-digit RGBA hex color")
  .transform((value) => value.toUpperCase());

export const alertShadowStyleSchema = z.object({
  offsetX: z.number().int().min(-256).max(256),
  offsetY: z.number().int().min(-256).max(256),
  blur: z.number().int().min(0).max(256),
  color: rgbaColorSchema
}).strict();

export const alertTextStyleSchema = z.object({
  fontPreset: z.enum(["system-sans", "rounded-sans", "serif", "monospace"]),
  fontSizePx: z.number().int().min(8).max(512),
  fontWeight: z.union([
    z.literal(400), z.literal(500), z.literal(600),
    z.literal(700), z.literal(800), z.literal(900)
  ]),
  lineHeight: z.number().finite().min(0.75).max(3),
  horizontalAlign: z.enum(["left", "center", "right"]),
  verticalAlign: z.enum(["top", "center", "bottom"]),
  color: rgbaColorSchema,
  shadow: alertShadowStyleSchema.nullable()
}).strict();

export const alertTextBoxStyleSchema = z.object({
  backgroundColor: rgbaColorSchema,
  paddingPx: z.number().int().min(0).max(256),
  cornerRadiusPx: z.number().int().min(0).max(512),
  shadow: alertShadowStyleSchema.nullable()
}).strict();
```

`alertLayerSchema` changes only its text branch:

```ts
alertLayerBaseSchema.extend({
  type: z.literal("text"),
  template: z.string(),
  textStyle: alertTextStyleSchema.default(compatibilityAlertTextStyle),
  boxStyle: alertTextBoxStyleSchema.default(compatibilityAlertTextBoxStyle)
})
```

The defaults make a legacy raw document parse successfully. Parsed `AlertEditorDocument` values and all newly created text layers carry both objects explicitly.

### Overlay instruction compatibility

Every new test/live resolver output must include the style objects:

```ts
export interface OverlayTextInstruction {
  readonly text: string;
  readonly layout: OverlayElementLayout;
  readonly textStyle?: AlertTextStyle | undefined;
  readonly boxStyle?: AlertTextBoxStyle | undefined;
}
```

The two fields remain optional only at the overlay transport boundary so an older in-memory instruction or a rolling local restart renders with compatibility defaults. `overlayTextInstructionSchema` defaults missing fields and strictly validates supplied fields. New resolver tests must assert that both fields are present, not merely defaulted in the browser.

### Shared browser mapping

Create `apps/web/src/overlay/components/alert-text-style.ts`:

```ts
export function alertTextLayerStyle(input: {
  readonly textStyle?: AlertTextStyle | undefined;
  readonly boxStyle?: AlertTextBoxStyle | undefined;
  readonly scale?: number;
}): CSSProperties | null;
```

Rules:

- Parse supplied or compatibility style objects with the core schemas before returning CSS.
- Return `null` for any invalid/unknown preset instead of reflecting an unchecked value into CSS.
- Map only fixed catalog IDs to fixed `fontFamily` stacks.
- Scale pixel size, padding, radius, offsets, and blur by `scale`; leave weight, line-height, alignment, and colors unchanged.
- Overlay uses `scale: 1`.
- Canvas uses `scale: canvasZoom / 100` because its surface dimensions are physically resized while the production profile canvas is rendered at fixed pixels and transformed as a unit.
- Keep geometry as the outer box. Use global `border-box`, `height: 100%`, and `width: 100%`; padding reduces the inner text area.
- Use `display: flex`, `justifyContent` for vertical alignment, and `textAlign` for horizontal alignment.
- Keep `overflowWrap: "anywhere"`. Do not add a new clipping mode.
- Convert shadows only from their typed fields; no string is accepted.

When the production overlay mapper returns `null`, treat the whole instruction as unrenderable: suppress its text, visual, audio, video, speech, and started/completed lifecycle; invoke the existing `onPlaybackEvent({ status: "failed", message: "Alert text style could not be rendered safely." })` path exactly once. `OverlayApp` already removes failed instructions and the server already records playback failure evidence, satisfying transparent fail-closed behavior without another diagnostics transport.

### Editor color control

Create `apps/web/src/management/alerts/editor/RgbaColorControl.tsx` as a small native control used for text color, text-shadow color, background color/opacity, and box-shadow color:

```ts
interface RgbaColorControlProps {
  readonly label: string;
  readonly value: string; // canonical #RRGGBBAA
  readonly onChange: (value: string) => void;
}
```

It renders one labelled `input type="color"` for RGB and one labelled `input type="range" min="0" max="100" step="1"` for opacity. Alpha conversion rounds `percent * 255 / 100`, emits two uppercase hex digits, and never stores a second opacity field. BL-003 will reuse this component and `rgbaColorSchema` for shape fill.

### Migration and rollback

- Add migration `017-alert-text-style-defaults`.
- It is data-only: no table/column/index/trigger changes.
- Use SQLite JSON functions to apply `json_insert` only to text layers missing `textStyle` or `boxStyle`; preserve explicit future/cherry-picked values and every non-text layer.
- Leave `updated_at` unchanged because schema backfill is not a user edit.
- The migration raises on malformed JSON through `json_each`; it must not silently skip a corrupt stored document.
- `currentSchemaVersion` moves from 16 to 17. Existing backup policy already requires an exact database schema version, so schema-16 archives remain incompatible with a schema-17 app until re-exported by a compatible app. This change does not add a second archive migration system.
- Rollback leaves additive style objects in `document_json`. Older builds ignore unknown object keys under their existing non-strict layer parsing. Before rollback, verify the target build still strips unknown text-layer keys rather than using strict object parsing.

## File Map

### Create

- `packages/core/src/alerts/text-style.ts` — catalog, limits, color/shadow/text/box schemas, types, defaults.
- `packages/core/src/alerts/text-style.test.ts` — canonicalization, bounds, unknown-field rejection, defaults.
- `apps/server/src/modules/db/migrations/017-alert-text-style-defaults.ts` — data-only JSON backfill.
- `apps/web/src/overlay/components/alert-text-style.ts` — one validated CSS mapper for canvas and overlay.
- `apps/web/src/overlay/components/alert-text-style.test.ts` — fixed catalog mapping, scaling, shadows, invalid fail-closed result.
- `apps/web/src/management/alerts/editor/RgbaColorControl.tsx` — native RGB/opacity control.

### Modify production files

- `packages/core/src/management/contracts.ts` — text-layer style fields and defaults.
- `packages/core/src/overlays/types.ts` — typed overlay text style fields.
- `packages/core/src/overlays/schemas.ts` — transport validation/defaults.
- `packages/core/src/alerts/alert-resolver.ts` — live instruction propagation.
- `packages/core/src/index.ts` — public text-style exports.
- `apps/server/src/modules/db/database.ts` — register migration 017.
- `apps/server/src/modules/alerts/alert-editor-service.ts` — new-document defaults and Send test propagation.
- `apps/web/src/management/alerts/editor/AlertEditorPage.tsx` — selected-text controls, validation, new-layer defaults.
- `apps/web/src/management/alerts/editor/AlertCanvas.tsx` — shared mapper with zoom scaling.
- `apps/web/src/management/alerts/editor/alert-editor-page.css` — inspector layout and remove fixed text treatment.
- `apps/web/src/overlay/components/OverlaySurface.tsx` — shared mapper and text-style failure reporting.
- `apps/web/src/App.css` — shared text-layer base CSS and remove fixed overlay treatment.

### Modify focused tests and fixtures

- `packages/core/src/management/contracts.test.ts`
- `packages/core/src/overlays/schemas.test.ts`
- `packages/core/src/alerts/alert-resolver.test.ts`
- `apps/server/src/modules/db/database.test.ts`
- `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- `apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.test.ts`
- `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- `apps/server/src/http/routes/management-ui.test.ts`
- `apps/web/src/management/alerts/editor/editor-state.test.ts`
- `apps/web/src/management/alerts/editor/AlertCanvas.test.tsx`
- `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- `apps/web/src/overlay/components/OverlaySurface.test.tsx`
- `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- `apps/web/src/overlay/components/OverlaySurface.stories.tsx`
- `apps/web/src/stories/story-fixtures.ts`
- `tests/e2e/management-alerts.spec.ts`
- `tests/e2e/overlay-playback.spec.ts`
- `tests/e2e/e2e-helpers.ts`

Strict typed alert-document fixtures that compile through contextual API types must also import and use the compatibility constants in:

- `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- `apps/server/src/modules/alerts/sqlite-alert-aggregate-mutation-store.test.ts`
- `apps/server/src/modules/playback/playback-coordinator.test.ts`
- `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- `apps/server/src/modules/providers/management-ui-service.test.ts`
- `apps/server/src/http/routes/management-ui.test.ts`
- `apps/web/src/App.test.tsx`
- `apps/web/src/management/ManagementApp.test.tsx`
- `apps/web/src/management/management-api.test.ts`
- `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- `apps/web/src/stories/mock-apis.ts`

Do not create a cross-package fixture framework. Update each file's existing base document factory once; spread-based cases inherit the style fields.

## Dependency Order

```text
Task 1: core contract
   |
   +--> Task 2: persistence/API compatibility
   |
   +--> Task 3: test/live resolution and shared rendering
                 |
                 +--> Task 4: focused editor controls
                               |
                               +--> Task 5: stories and browser workflows
                                             |
                                             +--> Task 6: reconciliation and live verification
```

## Task 1: Add the Core Style Contract and Compatibility Defaults

**Files:**

- Create: `packages/core/src/alerts/text-style.ts`
- Create: `packages/core/src/alerts/text-style.test.ts`
- Modify: `packages/core/src/management/contracts.ts:327-372`
- Modify: `packages/core/src/management/contracts.test.ts:196-373`
- Modify: `packages/core/src/overlays/types.ts:117-135`
- Modify: `packages/core/src/overlays/schemas.ts:26-39`
- Modify: `packages/core/src/overlays/schemas.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Produces: `rgbaColorSchema`, `alertShadowStyleSchema`, `alertTextStyleSchema`, `alertTextBoxStyleSchema`.
- Produces: `AlertShadowStyle`, `AlertTextStyle`, `AlertTextBoxStyle`, `AlertFontPresetId`.
- Produces: `alertFontPresets`, `alertFontWeights`, `alertTextStyleLimits`, `compatibilityAlertTextStyle`, `compatibilityAlertTextBoxStyle`, `defaultOptionalAlertShadow`.
- Produces: required `textStyle` and `boxStyle` on parsed text layers.
- Produces: optional transport compatibility fields on `OverlayTextInstruction`, defaulted by `overlayTextInstructionSchema`.

- [ ] **Step 1: Write failing contract tests**

Add tests proving:

- lowercase `#12ab34cd` normalizes to `#12AB34CD`;
- RGB-only, named colors, `rgb(...)`, URLs, CSS variables, and non-strings are rejected;
- each numeric minimum and maximum is accepted and one value outside each bound is rejected;
- only the six approved weights and four fixed font IDs are accepted;
- unknown fields such as `fontFamily`, `fontUrl`, `css`, `filter`, and `backgroundImage` are rejected;
- a legacy raw text layer with no style fields parses to the exact compatibility objects;
- explicit custom objects survive parsing unchanged except color uppercase normalization;
- missing overlay instruction styles default to compatibility values, while invalid supplied styles fail.

- [ ] **Step 2: Run the focused tests and confirm failure**

```powershell
corepack.cmd pnpm vitest run packages/core/src/alerts/text-style.test.ts packages/core/src/management/contracts.test.ts packages/core/src/overlays/schemas.test.ts
```

Expected: the new module/exports do not exist and legacy text layers have no explicit style objects.

- [ ] **Step 3: Implement the schemas, constants, and public exports**

Use the exact contract under “Fixed Contract Decisions.” Keep the schemas strict and keep font-family strings only in the fixed catalog. Do not accept a persisted raw stack.

- [ ] **Step 4: Extend the text-layer and overlay schemas**

Import the style schemas/defaults rather than duplicating them. Keep non-text layer branches unchanged. Keep overlay fields optional in the TypeScript transport interface but default them in the runtime schema.

- [ ] **Step 5: Update existing core typed fixtures**

Use:

```ts
textStyle: structuredClone(compatibilityAlertTextStyle),
boxStyle: structuredClone(compatibilityAlertTextBoxStyle)
```

in each base text-layer fixture. Do not cast missing values with `as AlertEditorDocument`.

- [ ] **Step 6: Re-run the focused tests**

Expected: all core schema, default, strictness, and transport-compatibility cases pass.

- [ ] **Step 7: Commit during implementation**

```powershell
git add packages/core/src
git commit -m "feat(alerts): define text style contracts"
```

## Task 2: Backfill Stored Documents and Prove API/Backup Compatibility

**Files:**

- Create: `apps/server/src/modules/db/migrations/017-alert-text-style-defaults.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts:272-395`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.test.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- Modify: `apps/server/src/http/routes/management-ui.test.ts:150-185`
- Modify the strict server fixture files listed in the File Map.

**Interfaces:**

- Consumes: Task 1 compatibility constants and style schemas.
- Produces: new/legacy/stored documents with explicit styles.
- Produces: database schema version 17 with unchanged table shape.
- Preserves: current GET/PUT/Send test routes and generic backup archive format.

- [ ] **Step 1: Add failing database migration tests**

Build a pre-017 `alert_editor_documents` table containing:

- one legacy text layer without style fields;
- one text layer with an explicit custom `textStyle` and missing `boxStyle`;
- one image layer;
- one document with no text layers.

Execute `alertTextStyleDefaultsMigration.sql` and assert:

- legacy text receives both exact compatibility objects;
- explicit text style is not overwritten and missing box style is inserted;
- image and no-text documents are structurally unchanged;
- `updated_at` is unchanged;
- running the SQL a second time is idempotent;
- malformed `document_json` aborts rather than getting marked migrated.

- [ ] **Step 2: Add failing repository, service, route, and backup tests**

Add evidence that:

- `createAlertEditorDocumentFromRule` creates styled text layers;
- a raw legacy row read through `SqliteAlertEditorDocumentRepository` returns explicit defaults;
- saving writes explicit style JSON;
- a styled variation document snapshots, validates, replaces, and reads back without loss;
- an invalid/unknown font submitted to `PUT /management/alerts/:id/editor` returns 400 and does not call the save command;
- a legacy GET response is normalized before it reaches the client;
- the migration list ends with `017-alert-text-style-defaults` and `currentSchemaVersion` is 17.

- [ ] **Step 3: Run focused server tests and confirm failure**

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/db/database.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.test.ts apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts apps/server/src/http/routes/management-ui.test.ts
```

Expected: migration 017 is absent, generated documents omit styles, and styled backup/API assertions fail.

- [ ] **Step 4: Implement the data-only migration**

Use `json_each(document_json, '$.layers')`, `json_insert`, `json_group_array`, and `json(...)` so objects remain JSON values rather than quoted strings. Add only missing paths on text layers. Register the migration last in `database.ts`.

The migration SQL must follow this shape:

```sql
UPDATE alert_editor_documents
SET document_json = json_set(
  document_json,
  '$.layers',
  json((
    SELECT json_group_array(json(
      CASE
        WHEN json_extract(layer.value, '$.type') = 'text'
          THEN json_insert(
            layer.value,
            '$.textStyle', json('{"fontPreset":"system-sans","fontSizePx":32,"fontWeight":800,"lineHeight":1.15,"horizontalAlign":"center","verticalAlign":"center","color":"#FFFFFFFF","shadow":{"offsetX":0,"offsetY":2,"blur":8,"color":"#000000B8"}}'),
            '$.boxStyle', json('{"backgroundColor":"#00000000","paddingPx":0,"cornerRadiusPx":0,"shadow":null}')
          )
        ELSE layer.value
      END
    ))
    FROM json_each(document_json, '$.layers') AS layer
  ))
);
```

Use exact JSON matching the Task 1 constants. Do not touch timestamps or add a document-version field in this slice.

- [ ] **Step 5: Make generated documents explicit**

Pass cloned compatibility objects when `createDocumentFromRule` builds its default text layer. This is the only production change required in the service for persistence; repository/API/backup production plumbing already uses the shared schema.

- [ ] **Step 6: Update strict server fixtures without casts**

Change each existing base text-layer fixture once. Keep legacy-compatibility tests raw/untyped so they genuinely omit the new fields.

- [ ] **Step 7: Re-run the focused server tests**

Expected: migration, repository, generated-document, authenticated API, and backup/restore tests pass.

- [ ] **Step 8: Commit during implementation**

```powershell
git add apps/server/src packages/core/src/management/contracts.test.ts
git commit -m "feat(alerts): migrate text style defaults"
```

## Task 3: Preserve Styles Through Test/Live Resolution and Share Rendering

**Files:**

- Modify: `packages/core/src/alerts/alert-resolver.ts:126-225`
- Modify: `packages/core/src/alerts/alert-resolver.test.ts:333-433`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts:719-766`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts:350-470`
- Create: `apps/web/src/overlay/components/alert-text-style.ts`
- Create: `apps/web/src/overlay/components/alert-text-style.test.ts`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.test.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.tsx:106-275`
- Modify: `apps/web/src/overlay/components/OverlaySurface.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css:459-491`
- Modify: `apps/web/src/App.css:150-168`

**Interfaces:**

- Consumes: Task 1 styles/defaults and overlay instruction fields.
- Produces: explicit styles in both `DefaultAlertResolver` live output and `AlertEditorService` Send test output.
- Produces: `alertTextLayerStyle(...)` used by both canvas and production overlay.
- Preserves: existing text moderation/template rendering, layer geometry, animation, route targeting, and playback reporting.

- [ ] **Step 1: Write failing resolver and Send test assertions**

Use a custom text layer with:

```ts
textStyle: {
  fontPreset: "serif",
  fontSizePx: 64,
  fontWeight: 700,
  lineHeight: 1.3,
  horizontalAlign: "left",
  verticalAlign: "bottom",
  color: "#FFCC00FF",
  shadow: null
},
boxStyle: {
  backgroundColor: "#102030BF",
  paddingPx: 24,
  cornerRadiusPx: 18,
  shadow: { offsetX: 4, offsetY: 6, blur: 12, color: "#00000080" }
}
```

Assert that live resolution and saved Send test emit those exact objects with rendered text and the selected profile geometry. Assert no provider payload, raw CSS, font URL, or raw event payload appears.

- [ ] **Step 2: Write failing mapper tests**

Assert:

- system/rounded/serif/monospace IDs map to only their fixed stacks;
- a scale of `0.5` turns 64px size, 24px padding, 18px radius, and a 4/6/12px shadow into 32/12/9 and 2/3/6 CSS pixels;
- alignment maps left/bottom to `textAlign: "left"` and `justifyContent: "flex-end"`;
- null shadows map to `textShadow: "none"` / `boxShadow: "none"`;
- canonical RGBA values are passed as colors;
- an unknown preset or out-of-bounds forged object returns `null`.

- [ ] **Step 3: Write failing canvas and overlay component tests**

Canvas:

- edit and local-preview states use the shared custom style;
- 50% canvas zoom scales pixel properties while preserving geometry percentages;
- compatibility style produces the production 32px treatment at 100%;
- styled text uses the same layer at landscape and vertical geometry.

Overlay:

- custom typography, box background, padding, radius, and both shadows render on the text element;
- missing optional transport styles use compatibility values;
- a forged invalid style renders/plays no text, media, audio, or speech, reports one safe `failed` playback event, and reports no started/completed event;
- no error text is rendered on the overlay surface.

- [ ] **Step 4: Run focused resolution/rendering tests and confirm failure**

```powershell
corepack.cmd pnpm vitest run packages/core/src/alerts/alert-resolver.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts apps/web/src/overlay/components/alert-text-style.test.ts apps/web/src/management/alerts/editor/AlertCanvas.test.tsx apps/web/src/overlay/components/OverlaySurface.test.tsx
```

Expected: styles are absent from instructions, the mapper does not exist, and fixed CSS differs between canvas and overlay.

- [ ] **Step 5: Propagate style fields through both resolution paths**

Add:

```ts
text: {
  text: renderedText,
  layout,
  textStyle: layer.textStyle,
  boxStyle: layer.boxStyle
}
```

to `DefaultAlertResolver.#createEditorLayerInstruction` and `AlertEditorService.createLayerInstruction`. Do not change legacy rule rendering without an editor document; its overlay schema defaults retain the compatibility appearance.

- [ ] **Step 6: Implement the shared browser mapper**

Use core validation and the fixed font catalog. Build shadow strings from scaled numbers. Never concatenate unchecked user text into a CSS property.

- [ ] **Step 7: Replace fixed canvas and overlay styling**

- Add a shared `.alert-text-layer` base for full-size flex content and wrapping.
- Keep editor selection border/outline on `.alert-canvas__layer`, outside the styled inner text box.
- Apply the mapper to the inner canvas text element at `viewState.zoom / 100`.
- Apply the mapper plus geometry/animation to the production overlay text element at scale 1.
- Remove the old fixed font/weight/shadow declarations after compatibility tests pass.
- Compute one `presentationInvalid` flag before the playback effects. Guard media/audio/speech startup and the started/completed timer with that flag, report the safe failure once, and render no instruction content.

- [ ] **Step 8: Re-run the focused resolution/rendering tests**

Expected: live, Send test, canvas, and overlay style parity tests pass.

- [ ] **Step 9: Commit during implementation**

```powershell
git add packages/core/src/alerts apps/server/src/modules/alerts apps/web/src
git commit -m "feat(alerts): render styled text consistently"
```

## Task 4: Add Focused Accessible Editor Controls

**Files:**

- Create: `apps/web/src/management/alerts/editor/RgbaColorControl.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx:194-224,459-475,548-586,825-952,1241-1251`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/editor-state.test.ts`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`
- Modify the strict web fixture files listed in the File Map.

**Interfaces:**

- Consumes: Task 1 catalog, weights, limits, defaults, and schemas.
- Consumes: Task 3 rendering mapper indirectly through `AlertCanvas`.
- Produces: reusable `RgbaColorControl`.
- Preserves: `updateLayer`, whole-document history, explicit Save, dirty navigation, live-impact confirmation, and profile geometry.

- [ ] **Step 1: Add failing focused-editor tests**

Cover:

- no text-style section when no layer, image, video, audio, TTS, or shape is selected;
- one `Typography` and one `Text box` fieldset for a selected text layer;
- labelled keyboard-operable controls for every stored field;
- font, size, weight, line-height, horizontal/vertical alignment, color/opacity, text-shadow toggle/details, background/opacity, padding, radius, and box-shadow toggle/details;
- valid edits update the canvas immediately, mark the document dirty, and are sent only on explicit Save;
- font size 7/513, line height 0.7/3.1, padding 257, radius 513, shadow offset 257, and blur 257 show field-specific messages, set `aria-invalid`, and disable Preview, Send test, and Save;
- Undo restores form and canvas values; Redo reapplies them;
- a style edit changes no landscape or vertical geometry;
- dirty navigation and active-set save confirmation include style edits;
- switching profiles after saving shows the shared style with independent geometry;
- disabling both shadows and setting background alpha/padding/radius to zero preserves the template and geometry.

- [ ] **Step 2: Add failing RGBA-control integration assertions**

Starting from `#102030FF`:

- selecting RGB `#abcdef` emits `#ABCDEFFF`;
- choosing opacity 75 emits `#ABCDEFBF`;
- choosing opacity 0 emits `#ABCDEF00`;
- its RGB and opacity inputs have distinct accessible names derived from the supplied label.

- [ ] **Step 3: Run focused editor tests and confirm failure**

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/alerts/editor/editor-state.test.ts apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
```

Expected: the style fieldsets and RGBA control do not exist.

- [ ] **Step 4: Implement the RGBA control**

Keep conversion inside the component file. Validate incoming and emitted values with `rgbaColorSchema`; do not maintain a second color regex or persist opacity separately.

- [ ] **Step 5: Add new-text-layer defaults**

When `addSimpleLayer("text")` creates a layer, include cloned compatibility `textStyle` and `boxStyle`. TTS remains unchanged and never displays visual style controls.

- [ ] **Step 6: Implement text-only fieldsets through `updateLayer`**

Use native controls:

- font preset, weight, and alignments: `select`;
- size, line-height, padding, radius, offsets, and blur: `input type="number"` with exact min/max/step;
- colors: `RgbaColorControl`;
- optional shadows: `input type="checkbox"`.

When a shadow is enabled from `null`, use `compatibilityAlertTextStyle.shadow` for text and `defaultOptionalAlertShadow` for the box. When disabled, store `null`.

- [ ] **Step 7: Add field-specific validation**

Use exported limits for messages, and validate the selected text layer with the core schemas. Render each error beside its input with stable `aria-describedby`. Compute one document-level style error so header actions are blocked while any text layer is invalid. Do not rely on the server's generic 400 response for normal form correction.

- [ ] **Step 8: Prove existing editor state supplies history/copy behavior**

Add assertions to `editor-state.test.ts` that update, duplicate, `copyAlertDesign`, undo, and redo preserve the style objects. Do not add a style-specific state store.

- [ ] **Step 9: Update existing fixture factories and re-run the focused tests**

Expected: text-only visibility, validation, Save, dirty-state, profile independence, undo/redo, and RGBA behavior pass without casts.

- [ ] **Step 10: Commit during implementation**

```powershell
git add apps/web/src
git commit -m "feat(editor): add text style controls"
```

## Task 5: Add Storybook and Browser Workflow Evidence

**Files:**

- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.stories.tsx`
- Modify: `apps/web/src/stories/story-fixtures.ts`
- Modify: `tests/e2e/management-alerts.spec.ts:524-621`
- Modify: `tests/e2e/overlay-playback.spec.ts`
- Modify: `tests/e2e/e2e-helpers.ts`

**Interfaces:**

- Consumes: Tasks 3-4 production components and contracts.
- Produces: agent/reviewer-visible states and browser-level save/reload/preview/test/live evidence.

- [ ] **Step 1: Add production-component editor stories**

Add or adapt focused stories named:

- `CompatibilityTextStyle`
- `ContrastingCustomTextStyle`
- `VerticalCustomTextStyle`
- `InvalidTextStyle`
- `NarrowScreenStyleGuard`
- `ReducedMotionStyleAuthoring`

The compatibility story uses exact defaults. The contrasting story uses the Task 3 custom fixture. The vertical story uses the same layer style with different geometry. The invalid story enters an out-of-range size and asserts the inline correction and disabled Save. The narrow story retains the existing larger-screen guard. The reduced-motion story leaves preview stopped and proves style authoring does not autoplay animation.

- [ ] **Step 2: Add overlay stories**

Use production `OverlaySurface` for:

- compatibility style;
- serif custom style with translucent background and box shadow;
- rounded vertical style;
- transparent fail-closed invalid preset in a test-only forged fixture.

No story may contain a route key, provider payload, remote font URL, or raw CSS string.

- [ ] **Step 3: Extend the focused management Playwright workflow**

In the existing alert-editor test:

1. Select the text layer.
2. Choose serif, 64px, weight 700, line-height 1.3, left/bottom alignment.
3. Set text to `#FFCC00FF`.
4. Disable text shadow.
5. Set background to `#102030BF`, padding 24, radius 18.
6. Enable the default box shadow.
7. Save through the active-set confirmation.
8. Assert the exact style objects in the intercepted PUT body and unchanged target-profile geometry.
9. Reload the editor from the saved response and assert every control restores.
10. Start local Preview and assert the canvas element's computed family, size, weight, alignment, color, background, padding, radius, and shadow.
11. Send test and assert the request document carries the same style objects.
12. Switch to vertical after save and assert the same style with vertical geometry.

- [ ] **Step 4: Extend live overlay Playwright coverage**

Send one styled text instruction through the existing synthetic playback helper. Assert the live browser-source text element:

- uses exact fixed-stack/computed style values;
- remains inside the target profile geometry;
- renders the translucent background and both alignment axes;
- reports normal started/completed playback;
- makes no network request for a font.

Send a forged invalid-preset instruction in a separate test and assert no text/error content appears while one safe failed playback report is sent.

- [ ] **Step 5: Run Storybook and browser tests**

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm build-storybook
corepack.cmd pnpm test:storybook:ci
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts tests/e2e/overlay-playback.spec.ts
```

Expected: all production stories pass a11y/console checks and both editor and live overlay workflows pass.

- [ ] **Step 6: Capture local visual evidence**

Capture non-committed review screenshots from the compatibility/custom editor and overlay stories at 1920x1080 and 1080x1920. Use computed-style assertions as the committed regression gate because OS-local font glyph rendering makes cross-platform pixel baselines unstable.

- [ ] **Step 7: Commit during implementation**

```powershell
git add apps/web/src tests/e2e
git commit -m "test(alerts): cover visual style workflows"
```

## Task 6: Reconcile, Verify, and Hand Off BL-002

**Files:**

- Modify: `openspec/changes/add-alert-visual-style-controls/tasks.md`
- Modify only when implementation proves contract drift:
  - `openspec/changes/add-alert-visual-style-controls/design.md`
  - `openspec/changes/add-alert-visual-style-controls/specs/alert-configuration-management/spec.md`
- Modify after implementation and spec synchronization:
  - `docs/backlog.md`

**Produces:** A strictly validated, live-verified, independently reviewable BL-002 slice and the reusable color seams required by BL-003.

- [ ] **Step 1: Map every OpenSpec scenario to evidence**

The final review matrix must name a test for:

- typography save and profile-shared style;
- unknown/external font rejection with no request;
- every numeric/color/shadow bound and field correction;
- box geometry/padding and clearing;
- draft preview, saved Send test, and live parity;
- transparent fail-closed rendering and diagnostics report;
- legacy parsing and migration appearance;
- explicit saved fields and backup/restore round trip;
- text-only controls;
- undo/redo and dirty navigation.

- [ ] **Step 2: Run focused package tests**

```powershell
corepack.cmd pnpm vitest run packages/core/src/alerts/text-style.test.ts packages/core/src/management/contracts.test.ts packages/core/src/overlays/schemas.test.ts packages/core/src/alerts/alert-resolver.test.ts apps/server/src/modules/db/database.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.test.ts apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts apps/server/src/http/routes/management-ui.test.ts apps/web/src/overlay/components/alert-text-style.test.ts apps/web/src/management/alerts/editor/editor-state.test.ts apps/web/src/management/alerts/editor/AlertCanvas.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/overlay/components/OverlaySurface.test.tsx
```

Expected: exit 0 with no skipped or weakened in-scope test.

- [ ] **Step 3: Run all repository gates**

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm build-storybook
corepack.cmd pnpm test:storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate add-alert-visual-style-controls --strict
```

Expected: every command exits 0. A relevant failure blocks completion.

- [ ] **Step 4: Rebuild, restart, and wait for health**

Start the rebuilt local service from this worktree, wait for `GET http://127.0.0.1:39187/health` to return 200, then reload `/manage` and both target-profile browser sources against the new build.

- [ ] **Step 5: Perform the live compatibility/style checklist**

Verify:

- an existing pre-style alert opens with the production-equivalent 32px/800/1.15 white text and current shadow;
- first save writes explicit style objects without changing geometry;
- landscape and vertical share style but retain separate layouts;
- every font preset renders from local stacks with network offline;
- background alpha, padding, radius, text shadow, and box shadow match canvas and overlay;
- local Preview never sends a request;
- Send test and a real/synthetic live event render the same saved style;
- invalid input blocks Preview, Send test, and Save with a field correction;
- undo/redo and dirty navigation work;
- invalid forged production style is transparent and creates a safe playback failure;
- backup export/restore preserves styles;
- rollback target behavior for additive keys is confirmed.

- [ ] **Step 6: Run one independent frontend review**

Use `stream-jams-frontend-review` against the final production UI, Storybook states, narrow guard, keyboard/focus behavior, color labels, style parity, redaction, and transparent overlay failure. Resolve in-scope findings and rerun affected gates.

- [ ] **Step 7: Reconcile OpenSpec and backlog only after evidence**

Mark OpenSpec tasks complete only when their evidence exists. Synchronize and archive `add-alert-visual-style-controls` through the normal OpenSpec workflow. Then remove BL-002 from `docs/backlog.md`; retain BL-003 with its dependency now satisfied. Do not treat the backlog as a completed ledger.

- [ ] **Step 8: Commit final reconciliation during implementation**

```powershell
git add openspec docs/backlog.md
git commit -m "docs(alerts): complete BL-002"
```

## Test Strategy Summary

| Layer | Evidence |
| --- | --- |
| Core schema | Exact presets/defaults, RGBA normalization, numeric bounds, strict unknown-field rejection |
| Database | Pre-017 JSON backfill, idempotence, explicit-style preservation, malformed JSON abort |
| Repository/API | Legacy read normalization, explicit save, authenticated 400 for invalid style |
| Backup | Styled document snapshot/validate/replace/read without loss |
| Resolver | Draft/saved/live style propagation with no provider/raw CSS data |
| Browser mapper | Fixed catalog, pixel scaling, alignment, shadows, invalid returns `null` |
| Canvas | Compatibility and custom style at zoom, profile-specific geometry |
| Overlay | Exact rendering, optional transport defaults, transparent safe failure |
| Editor | Text-only controls, accessible labels, bounds, explicit Save, undo/redo, dirty guard |
| Storybook | Compatibility/custom/vertical/invalid/narrow/reduced-motion states and a11y |
| Playwright | Style/save/reload/preview/Send test and synthetic live browser-source rendering |
| Live | Existing appearance, both profiles, offline fonts, backup/restore, diagnostics |

## Risks and Mitigations

- **Management and OBS choose different glyphs from a local stack.** Persist only a preset ID, keep ordered fallback stacks fixed, test computed stacks, and visually review both browser contexts. Exact glyph identity is not promised when the first local face is unavailable.
- **Canvas zoom causes preview/live drift.** Scale every pixel style value by the current canvas zoom while the production profile canvas stays at scale 1.
- **A JSON migration double-encodes objects or overwrites explicit styles.** Use `json(...)` plus `json_insert`, and test parsed stored JSON, idempotence, explicit values, and non-text layers.
- **A large padding value leaves little content area.** Keep the outer geometry unchanged, cap padding at 256px, and show the same wrapping in canvas and overlay.
- **Invalid draft numbers enter a typed document before Save.** Show field errors and block Preview, Send test, and Save; server and persistence schemas remain the final trust boundary.
- **Style fields broaden into a CSS injection surface.** Strict schemas, fixed enum IDs, numeric fields, and a fixed mapper are the only path to CSS.
- **Schema version 17 rejects older archives.** Retain the existing exact-version backup policy and explain re-export; do not create an archive upgrader inside BL-002.
- **BL-003 duplicates color handling.** Export `rgbaColorSchema` and keep `RgbaColorControl` reusable, but leave Shape creation/fill changes to BL-003.

## Explicit Non-Goals

- Custom font upload, font assets, installed-font discovery, remote/web font URLs, or license management.
- Rich text, per-variable spans, Markdown, HTML, arbitrary CSS, custom properties, gradients, filters, blend modes, or background images.
- Shape creation/editing, shape radius/stroke, multiple shape primitives, groups, masks, or drawing tools.
- Responsive units, per-profile style overrides, automatic cross-profile layout sync, or new canvas profiles.
- Timeline/keyframe editing, new animation presets, or changes to reduced-motion behavior outside the style-control states.
- Alert templates/themes, pack import/export, marketplace behavior, or bulk style operations.
- New management endpoints, overlay sockets, backup formats, persistence repositories, state machines, form libraries, color-picker dependencies, or visual-regression services.
