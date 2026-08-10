# Alert Visual Style Validation Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. The current feature worktree is intentionally dirty and these tasks overlap shared test fixtures, so keep execution inline unless the user explicitly requests subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five validation gaps found in `add-alert-visual-style-controls` with deterministic contract, persistence, component, Storybook, and Chromium browser tests, without introducing screenshot baselines or new product behavior.

**Architecture:** Preserve the existing style contracts and shared `alertTextLayerStyle` mapper as the source of truth. Add lossless persistence proof at the SQLite snapshot boundary, exercise every editor control through production components, and validate vertical rendering using computed CSS and fixed-viewport DOM geometry. Use native disclosure behavior directly rather than adding React accordion state.

**Tech Stack:** TypeScript 6, React 19, Vitest 4, Testing Library, Storybook 10 test-runner, Playwright 1.61 Chromium, Node 24, SQLite, OpenSpec.

## Global Constraints

- Work only in `C:\Users\James\.codex\worktrees\49ee\stream-jams` on the existing `codex/add-alert-visual-style-controls` branch; preserve every unrelated or pre-existing uncommitted change.
- Active OpenSpec change: `add-alert-visual-style-controls`, schema `spec-driven`, repository-local scope.
- Treat this as validation closure. Do not change production behavior unless a new test demonstrates an actual defect; if that occurs, use `superpowers:systematic-debugging`, add the failing regression first, and implement the smallest in-scope fix.
- Do not add screenshot baselines, hosted visual-review tooling, browser projects, packages, font files, external fonts, raw CSS inputs, or network dependencies.
- Gate visual behavior through exact mapper values, computed CSS, and fixed-viewport DOM geometry. Screenshots are optional review artifacts only and must not be checked in.
- Keep management and overlay authentication separate. Do not expose route keys, credentials, personal channel data, or real overlay URLs in fixtures, output, screenshots, or logs.
- Use production components and typed client mocks. Keep live overlays transparent and fail closed.
- Use `.cmd` shims on Windows: `corepack.cmd`, `pnpm`, and `openspec.cmd` as shown below.
- Do not commit, push, open a PR, archive the OpenSpec change, or alter the canonical backlog unless the user separately authorizes it.
- The app is stopped before execution. Start it only for final live verification and stop it again before handoff.

## File Map

- `openspec/changes/add-alert-visual-style-controls/design.md`: records deterministic visual-parity decision; already updated during planning.
- `openspec/changes/add-alert-visual-style-controls/tasks.md`: tracks audit follow-ups 6.1-6.6; mark each item only after its evidence passes.
- `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`: owns non-default styled-document portable snapshot and restore proof.
- `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`: owns editor-control wiring, persistence, field errors, disclosure independence, and dirty-state assertions.
- `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`: owns production-component Storybook disclosure interactions for text and TTS layers.
- `tests/e2e/e2e-helpers.ts`: may extend the synthetic overlay instruction fixture with typed `targetProfileId` and caller-supplied text layout.
- `tests/e2e/management-alerts.spec.ts`: owns the landscape-to-vertical authoring, reload, preview, Send test, and real keyboard disclosure workflow.
- `tests/e2e/overlay-playback.spec.ts`: owns fixed-viewport vertical overlay CSS, geometry, lifecycle, and fail-closed browser assertions.
- `apps/web/src/overlay/components/alert-text-style.test.ts`: existing deterministic mapper coverage; modify only if reconciliation finds an exact mapping value not already asserted.
- Production files are conditional only: change `AlertEditorPage.tsx`, `RgbaColorControl.tsx`, `alert-text-style.ts`, or `OverlaySurface.tsx` only when a new failing test exposes a defect in that file.

## Explicit Non-Goals

- Pixel-perfect cross-OS screenshots or image snapshots.
- Firefox, WebKit, or a hosted browser matrix.
- Automated control of OBS or a permanent OBS test harness.
- New text-style fields, font presets, profile geometry behavior, disclosure persistence, or accordion coordination.
- Backup file-format changes, migrations, data rewrites, or production repository refactoring.
- Re-running unrelated product audits or broadening BL-002 beyond its accepted OpenSpec requirements.

---

### Task 1: Prove Custom Styled Documents Survive Backup And Restore

**OpenSpec task:** 6.2

**Files:**
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts:20-58`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts:377-427`
- Modify after passing: `openspec/changes/add-alert-visual-style-controls/tasks.md`

**Interfaces:**
- Consumes: `SqliteConfigurationSnapshotRepository.snapshot()`, `.validate(configuration)`, and `.replace({ tables, assets })`; the existing `editorDocument()` and `seededAsset()` fixtures.
- Produces: a regression test proving all non-default `textStyle` and `boxStyle` members survive snapshot serialization, schema validation, replacement, and database readback without loss.

- [ ] **Step 1: Add a custom styled-document fixture**

Add a helper beside `editorDocument()` that changes every style family, including both shadows and canonical RGBA alpha values:

```ts
function styledEditorDocument() {
  const document = editorDocument();
  return {
    ...document,
    layers: document.layers.map((layer) => layer.type === "text" ? {
      ...layer,
      textStyle: {
        fontPreset: "serif" as const,
        fontSizePx: 64,
        fontWeight: 700 as const,
        lineHeight: 1.3,
        horizontalAlign: "left" as const,
        verticalAlign: "bottom" as const,
        color: "#FFCC00BF" as const,
        shadow: { offsetX: -4, offsetY: 6, blur: 12, color: "#00000080" as const }
      },
      boxStyle: {
        backgroundColor: "#102030BF" as const,
        paddingPx: 24,
        cornerRadiusPx: 18,
        shadow: { offsetX: 4, offsetY: 8, blur: 20, color: "#ABCDEF66" as const }
      }
    } : layer)
  };
}
```

- [ ] **Step 2: Write a sensitivity-first restore test**

Insert the custom document, snapshot it, validate the portable configuration, replace owned rows from that snapshot, query `alert_editor_documents.document_json`, parse it, and compare the whole restored document to the fixture:

```ts
it("round-trips non-default text and box styles through a portable snapshot", () => {
  const expected = styledEditorDocument();
  database.connection.prepare(
    "UPDATE alert_editor_documents SET document_json = ? WHERE alert_id = ?"
  ).run(JSON.stringify(expected), expected.id);
  const repository = new SqliteConfigurationSnapshotRepository(database.connection);
  const snapshot = repository.snapshot();
  const configuration: ConfigurationBackupArchive["configuration"] = {
    appConfig: {},
    ...snapshot
  };

  expect(repository.validate(configuration)).toEqual([]);
  repository.replace({ tables: snapshot.tables, assets: [seededAsset()] });

  const row = database.connection.prepare(
    "SELECT document_json FROM alert_editor_documents WHERE alert_id = ?"
  ).get(expected.id) as { readonly document_json: string };
  expect(JSON.parse(row.document_json)).toEqual(expected);
});
```

- [ ] **Step 3: Prove the assertion catches style loss**

Before the first passing run, temporarily clone `snapshot.tables`, delete `textStyle` and `boxStyle` from its text-layer JSON, restore the damaged clone, and run:

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts
```

Expected: FAIL at the whole-document equality assertion, showing the test detects lost custom style fields. Remove only the deliberate damage before continuing.

- [ ] **Step 4: Run the real round-trip test**

Run the same focused command.

Expected: PASS with the unmodified snapshot. If it fails, diagnose the serialization or restore boundary before touching production code; do not weaken the equality assertion.

- [ ] **Step 5: Mark OpenSpec task 6.2 complete**

Change only `- [ ] 6.2` to `- [x] 6.2` after the focused test passes. Leave the work uncommitted unless the user authorizes a commit.

---

### Task 2: Exercise Every Advanced Editor Style Control And Error Path

**OpenSpec task:** 6.3

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx:23-128`
- Modify after passing: `openspec/changes/add-alert-visual-style-controls/tasks.md`
- Conditional production files: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx:991-1279`, `apps/web/src/management/alerts/editor/RgbaColorControl.tsx`

**Interfaces:**
- Consumes: labelled native controls rendered by `TextStyleControls`, `ShadowControls`, `StyleNumberInput`, and `RgbaColorControl`; `saveAlertEditorDocument` typed mock.
- Produces: integration proof for line height, text color, text shadow, box shadow, canonical alpha conversion, exact persisted values, and field-specific correction messages.

- [ ] **Step 1: Add expectations that initially expose the missing interactions**

Extend `edits and validates text-only typography and box styles` to expect these values in the saved document before adding their user interactions:

```ts
textStyle: expect.objectContaining({
  lineHeight: 1.45,
  color: "#ABCDEF80",
  shadow: {
    offsetX: -5,
    offsetY: 7,
    blur: 20,
    color: "#11223366"
  }
}),
boxStyle: expect.objectContaining({
  shadow: {
    offsetX: 3,
    offsetY: 9,
    blur: 16,
    color: "#44556699"
  }
})
```

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
```

Expected: FAIL because the current test has not driven those controls and still saves defaults/null values.

- [ ] **Step 2: Drive every missing production control**

Add role/label-based interactions before Save. Keep the existing font, alignment, background, padding, and radius edits:

```ts
fireEvent.change(within(typography).getByLabelText("Line height"), { target: { value: "1.45" } });
fireEvent.change(within(typography).getByLabelText("Text color color"), { target: { value: "#abcdef" } });
fireEvent.change(within(typography).getByLabelText("Text color opacity"), { target: { value: "50" } });
fireEvent.change(within(typography).getByLabelText("Text shadow horizontal offset"), { target: { value: "-5" } });
fireEvent.change(within(typography).getByLabelText("Text shadow vertical offset"), { target: { value: "7" } });
fireEvent.change(within(typography).getByLabelText("Text shadow blur"), { target: { value: "20" } });
fireEvent.change(within(typography).getByLabelText("Text shadow color color"), { target: { value: "#112233" } });
fireEvent.change(within(typography).getByLabelText("Text shadow color opacity"), { target: { value: "40" } });
await user.click(within(textBox).getByLabelText("Box shadow"));
fireEvent.change(within(textBox).getByLabelText("Box shadow horizontal offset"), { target: { value: "3" } });
fireEvent.change(within(textBox).getByLabelText("Box shadow vertical offset"), { target: { value: "9" } });
fireEvent.change(within(textBox).getByLabelText("Box shadow blur"), { target: { value: "16" } });
fireEvent.change(within(textBox).getByLabelText("Box shadow color color"), { target: { value: "#445566" } });
fireEvent.change(within(textBox).getByLabelText("Box shadow color opacity"), { target: { value: "60" } });
```

Do not click the already-enabled compatibility text-shadow checkbox off; keep it enabled and edit its fields.

- [ ] **Step 3: Add representative field-specific invalid-value assertions**

After the valid-save assertions, change one decimal field, one bounded whole-number field, and one shadow whole-number field to invalid values:

```ts
fireEvent.change(within(typography).getByLabelText("Line height"), { target: { value: "3.01" } });
expect(within(typography).getByText("Line height must be between 0.75 and 3.")).toBeVisible();

fireEvent.change(within(typography).getByLabelText("Text shadow horizontal offset"), {
  target: { value: "1.5" }
});
expect(within(typography).getByText("Text shadow horizontal offset must be a whole number.")).toBeVisible();

fireEvent.change(within(textBox).getByLabelText("Padding"), { target: { value: "257" } });
expect(within(textBox).getByText("Padding must be between 0 and 256.")).toBeVisible();
expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
expect(screen.getByRole("button", { name: "Send test" })).toBeDisabled();
```

- [ ] **Step 4: Run the focused editor and color-control tests**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/RgbaColorControl.test.tsx apps/web/src/overlay/components/alert-text-style.test.ts
```

Expected: PASS. If any label is wrong, inspect the production accessible name and correct the test only when the control is already correctly labelled; otherwise fix the production label with a failing accessibility assertion retained.

- [ ] **Step 5: Mark OpenSpec task 6.3 complete**

Change only `- [ ] 6.3` to `- [x] 6.3` after the focused tests pass. Leave the work uncommitted unless separately authorized.

---

### Task 3: Validate Every Disclosure Independently

**OpenSpec task:** 6.5

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx:48-61`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx:824-837`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx:49-63`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx:397-420`
- Modify: `tests/e2e/management-alerts.spec.ts:596-607`
- Modify: `tests/e2e/management-alerts.spec.ts:670-760`
- Modify after passing: `openspec/changes/add-alert-visual-style-controls/tasks.md`

**Interfaces:**
- Consumes: native `<details open>` / `<summary>` sections and their existing labelled controls.
- Produces: component, Storybook, and real-Chromium proof that Live TTS, Typography, Text box, Position and size, and Animation preset can each collapse/reopen while other sections retain their state and Save remains clean.

- [ ] **Step 1: Make the component test fail on untested sections**

Replace the single Typography toggle with an ordered mapping and first assert all controls become hidden without yet toggling the other summaries:

```ts
const disclosures = [
  ["Typography", "Font size"],
  ["Text box", "Padding"],
  ["Position and size", "X"],
  ["Animation preset", "Entrance"]
] as const;
```

Run the focused `AlertEditorPage.test.tsx` command and expect failure on Text box, Position and size, or Animation preset because only Typography was toggled in the old test.

- [ ] **Step 2: Toggle and reopen all text-layer disclosures independently**

For each pair, click the matching summary and assert its control is hidden. After every collapse, assert all earlier controls remain hidden and Save remains disabled. Then reopen in reverse order and assert every control is visible with its original value.

Use `getByText(label, { selector: "summary" })`, `getByLabelText(control)`, and native visibility assertions; do not add disclosure state to production React code.

- [ ] **Step 3: Strengthen Live TTS component and Storybook interactions**

Keep the existing Live TTS component toggle, and add `expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()` immediately after collapse and reopen, before changing TTS data.

In `ActiveSpeakerBotTts`, collapse and reopen the `Live TTS` summary before editing the template:

```ts
const liveTtsSummary = canvas.getByText("Live TTS", { selector: "summary" });
const enabled = canvas.getByRole("checkbox", { name: "Enable TTS for this alert" });
await userEvent.click(liveTtsSummary);
await expect(enabled).not.toBeVisible();
await userEvent.click(liveTtsSummary);
await expect(enabled).toBeVisible();
```

- [ ] **Step 4: Strengthen Storybook text-section independence**

Update `CollapsibleLayerSections` with the same four summary/control pairs. Collapse all four, assert all controls remain hidden concurrently, then reopen all four and assert their original values. Pointer activation is intentional in Storybook; real keyboard activation belongs in Playwright.

- [ ] **Step 5: Strengthen Chromium keyboard coverage**

In `management-alerts.spec.ts`, use the four text-section pairs and `summary.focus()` plus `page.keyboard.press("Enter")` to collapse all sections. Assert every anchor control is hidden concurrently, Save remains disabled, then reopen them in reverse order.

In the existing TTS E2E workflow, focus the `Live TTS` summary, toggle with Enter, assert the enable checkbox hides/reappears, and assert this alone does not enable Save.

- [ ] **Step 6: Run component, Storybook, and focused browser gates**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts --project=chromium
```

Expected: all commands exit 0; Storybook reports no accessibility or console failures; Chromium proves keyboard toggling.

- [ ] **Step 7: Mark OpenSpec task 6.5 complete**

Change only `- [ ] 6.5` to `- [x] 6.5` after all three coverage layers pass.

---

### Task 4: Close Vertical Authoring, Delivery, And Deterministic Geometry Gaps

**OpenSpec task:** 6.4

**Files:**
- Modify: `tests/e2e/management-alerts.spec.ts:524-668`
- Modify: `tests/e2e/e2e-helpers.ts:6-51`
- Modify: `tests/e2e/e2e-helpers.ts:163-209`
- Modify: `tests/e2e/overlay-playback.spec.ts:10-102`
- Reconcile only if needed: `apps/web/src/overlay/components/alert-text-style.test.ts:28-78`
- Conditional production file: `apps/web/src/overlay/components/OverlaySurface.tsx:68-101`, `apps/web/src/overlay/components/OverlaySurface.tsx:278-287`
- Modify after passing: `openspec/changes/add-alert-visual-style-controls/tasks.md`

**Interfaces:**
- Consumes: shared text style persisted on `AlertEditorDocument.layers`, independent `targetProfiles[].layerLayouts`, management `sendAlertEditorTest` request, `OverlayComposition.targetProfileId`, and `OverlayInstruction.targetProfileId`.
- Produces: one management-browser workflow proving shared style across enabled Landscape and Vertical profiles, plus one vertical 1080x1920 overlay test proving exact computed CSS and outer-box geometry without screenshots.

- [ ] **Step 1: Make the management test demand a vertical delivery**

Change the mocked test route to echo the request profile instead of hard-coding Landscape:

```ts
const request = route.request().postDataJSON() as { readonly targetProfileId: "landscape" | "vertical" };
testRequests.push(request);
await route.fulfill({
  contentType: "application/json",
  json: {
    status: "queued",
    targetProfileId: request.targetProfileId,
    referenceId: `ref-e2e-editor-${request.targetProfileId}`,
    test: true
  }
});
```

Before adding profile-enablement interactions, expect two requests with Landscape then Vertical. Run the focused Playwright test and expect failure because Vertical is still disabled and no second request exists.

- [ ] **Step 2: Complete the vertical authoring workflow through production controls**

Preserve the existing assertion that Vertical initially blocks Send test. Then:

1. Assert the vertical canvas still renders the saved shared `48px` Serif style and `16px` padding.
2. Click `Mark profile reviewed`.
3. Check `Use this profile for live alerts`.
4. Save and accept the active-alert confirmation dialog.
5. Reload while the URL remains on `profile=vertical`.
6. Assert the custom style and Vertical canvas are restored.
7. Click Preview and assert `Local preview is running.`
8. Click Send test and assert the toast says `Queued on Vertical` with the vertical reference ID.
9. Assert `testRequests` equals one Landscape request followed by one Vertical request.
10. Assert the saved document retains identical layer style objects while Landscape and Vertical `layerLayouts` remain distinct.

Do not replace the original disabled-profile coverage; prove the transition from blocked to reviewed/enabled.

- [ ] **Step 3: Extend typed E2E overlay fixtures for profile and layout**

Add these optional members:

```ts
interface OverlayComposition {
  readonly targetProfileId?: "landscape" | "vertical" | undefined;
}

interface OverlayInstruction {
  readonly targetProfileId?: "landscape" | "vertical" | undefined;
}

export function emptyComposition(input: {
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly targetProfileId?: "landscape" | "vertical" | undefined;
  readonly modules?: readonly OverlayModuleSnapshot[] | undefined;
}): OverlayComposition;

export function textInstruction(input: {
  readonly id: string;
  readonly text: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly durationMs?: number | undefined;
  readonly moduleId?: string | undefined;
  readonly overlayId?: string | undefined;
  readonly textStyle?: Record<string, unknown> | undefined;
  readonly boxStyle?: Record<string, unknown> | undefined;
  readonly targetProfileId?: "landscape" | "vertical" | undefined;
  readonly layout?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly zIndex: number;
  } | undefined;
}): OverlayInstruction;
```

Forward exact optional fields without assigning `undefined`, and use `input.layout` in place of the default text layout when supplied:

```ts
return {
  overlayId: "default",
  purpose: input.purpose,
  scope: input.scope,
  ...(input.targetProfileId === undefined ? {} : { targetProfileId: input.targetProfileId }),
  modules: input.modules ?? []
};

return {
  id: input.id,
  overlayId: input.overlayId ?? "default",
  moduleId: input.moduleId ?? "alerts",
  purpose: input.purpose,
  scope: input.scope,
  ...(input.targetProfileId === undefined ? {} : { targetProfileId: input.targetProfileId }),
  visual: null,
  audio: null,
  text: {
    text: input.text,
    layout: input.layout ?? { x: 40, y: 32, width: 420, height: 96, zIndex: 10 },
    textStyle: input.textStyle,
    boxStyle: input.boxStyle
  },
  tts: null,
  durationMs: input.durationMs ?? 4_000
};
```

Keep existing callers unchanged through optional defaults.

- [ ] **Step 4: Add a vertical fixed-viewport overlay browser test**

Use a 1080x1920 viewport, a vertical composition, and a 800x180 text layout at x=140/y=820. Send a custom rounded-sans style with non-zero padding, radius, background, text shadow, and box shadow. Assert:

```ts
await page.setViewportSize({ width: 1080, height: 1920 });
await page.goto("/overlay/modules/alerts/live/ovl_vertical?profile=vertical");

const outer = page.getByTestId("overlay-text-vertical-styled");
const inner = outer.locator(".alert-text-layer");
await expect(inner).toHaveCSS("box-sizing", "border-box");
await expect(inner).toHaveCSS("font-size", "72px");
await expect(inner).toHaveCSS("padding", "32px");
await expect(inner).toHaveCSS("border-radius", "32px");
await expect(inner).toHaveCSS("overflow-wrap", "anywhere");

const outerBox = await outer.boundingBox();
const innerBox = await inner.boundingBox();
expect(outerBox).not.toBeNull();
expect(innerBox).not.toBeNull();
expect(outerBox!.x).toBeCloseTo(140, 1);
expect(outerBox!.y).toBeCloseTo(820, 1);
expect(outerBox!.width).toBeCloseTo(800, 1);
expect(outerBox!.height).toBeCloseTo(180, 1);
expect(innerBox!.width).toBeCloseTo(outerBox!.width, 1);
expect(innerBox!.height).toBeCloseTo(outerBox!.height, 1);
```

Also assert the playback lifecycle removes the instruction after its bounded duration. Do not use `toHaveScreenshot()`.

- [ ] **Step 5: Run the deterministic mapper and focused browser tests**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/overlay/components/alert-text-style.test.ts apps/web/src/overlay/components/OverlaySurface.test.tsx apps/web/src/management/alerts/editor/AlertCanvas.test.tsx
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts tests/e2e/overlay-playback.spec.ts --project=chromium
```

Expected: PASS with exact CSS and geometry assertions. If bounding coordinates differ only because the test did not supply `targetProfileId` consistently to composition and instruction, correct the fixture. Do not loosen geometry to broad ranges or introduce pixel snapshots.

- [ ] **Step 6: Mark OpenSpec task 6.4 complete**

Change only `- [ ] 6.4` to `- [x] 6.4` after both management and overlay browser paths pass.

---

### Task 5: Reconcile Requirements And Run All Gates

**OpenSpec task:** 6.6

**Files:**
- Modify: `openspec/changes/add-alert-visual-style-controls/tasks.md`
- Review: `openspec/changes/add-alert-visual-style-controls/proposal.md`
- Review: `openspec/changes/add-alert-visual-style-controls/design.md`
- Review: `openspec/changes/add-alert-visual-style-controls/specs/alert-configuration-management/spec.md`
- Review: every test file changed in Tasks 1-4

**Interfaces:**
- Consumes: all evidence produced by Tasks 1-4.
- Produces: a fresh, reproducible validation record; strict OpenSpec status with 24/24 tasks complete; a rebuilt live smoke check; and the app returned to its initially stopped state.

- [ ] **Step 1: Reconcile every audited gap against evidence**

Create a temporary checklist in the execution notes, not a repository file:

```text
custom style backup -> snapshot validate replace deep equality
advanced controls -> labelled UI edit save exact values and field errors
visual parity -> shared mapper exact values plus computed CSS and fixed geometry
disclosures -> all five independently toggled without dirty state
vertical -> save reload preview Send test target transport overlay render
```

For each line, point to a named test and assertion. If any line lacks evidence, return to the owning task before running broad gates.

- [ ] **Step 2: Run focused tests once more**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/RgbaColorControl.test.tsx apps/web/src/overlay/components/alert-text-style.test.ts apps/web/src/overlay/components/OverlaySurface.test.tsx apps/web/src/management/alerts/editor/AlertCanvas.test.tsx
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts tests/e2e/overlay-playback.spec.ts --project=chromium
```

Expected: both commands exit 0 with no skipped relevant tests.

- [ ] **Step 3: Run repository and frontend gates**

Run sequentially and record each exit code and test count:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate add-alert-visual-style-controls --strict
```

Expected: every command exits 0. A relevant failure blocks completion; diagnose before rerunning and never call a failing suite green.

- [ ] **Step 4: Rebuild and start the app temporarily**

Start the built server from this worktree in a background process with a hidden window, then poll `http://127.0.0.1:39187/health` until healthy. Use the repository's existing local configuration; do not modify an active alert merely to create manual evidence.

Verify in a normal browser:

1. Existing alerts still load with compatibility styles.
2. A styled text layer shows the same computed style in Landscape and Vertical editor canvases.
3. All five disclosures collapse/reopen independently and collapsing alone does not enable Save.
4. Preview uses the draft style and Send test targets the selected reviewed/enabled profile.
5. Both Landscape and Vertical overlay routes load the rebuilt web bundle and remain transparent while idle.

- [ ] **Step 5: Perform the non-gating OBS/Cef smoke check when OBS is available**

Add the disposable local Vertical browser-source URL to an OBS test scene, send a styled test alert, and visually confirm font fallback, wrapping, padding, radius, shadows, and outer-box placement are reasonable. Record pass/fail in the handoff without screenshots or personal URLs.

If OBS is unavailable, report `OBS/Cef smoke not run: OBS unavailable` rather than weakening or blocking deterministic gates. Do not install, launch, or reconfigure OBS without user approval.

- [ ] **Step 6: Restore the stopped-app state**

Stop only the Stream Jams process started in Step 4. Verify all three conditions:

```text
no matching Stream Jams server process
no listener on 127.0.0.1:39187
GET /health is offline
```

Do not terminate unrelated Node, Vite, Storybook, browser, or OBS processes.

- [ ] **Step 7: Mark OpenSpec task 6.6 complete and validate final status**

Change `- [ ] 6.6` to `- [x] 6.6`, then run:

```powershell
openspec.cmd instructions apply --change add-alert-visual-style-controls --json
openspec.cmd validate add-alert-visual-style-controls --strict
```

Expected: `24/24` tasks complete and strict validation succeeds.

- [ ] **Step 8: Final review checkpoint**

Report changed files, test counts, browser/live evidence, whether OBS/Cef was available, and confirmation that the app is stopped. Do not commit, push, open a PR, or archive the change without separate user authorization.

## Plan Self-Review

- Spec coverage: every existing typography, box-style, workflow-parity, compatibility, accessibility, and disclosure requirement remains owned by the original plan; Tasks 1-5 add direct evidence for each audited gap.
- Completeness scan: every action has an exact file, assertion, command, expected result, or bounded conditional branch.
- Type consistency: `targetProfileId` uses only `"landscape" | "vertical"`; style fixture members match `AlertTextStyle` and `AlertTextBoxStyle`; test commands use current package scripts.
- Scope: no production behavior, dependency, migration, screenshot baseline, cross-browser project, or new style feature is planned unless a deterministic regression exposes a defect.
