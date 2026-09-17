# Unified Screen Effect Variant Weighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every enabled Screen Effect variant participate in one weighted selection pool and give operators probability labels plus a safe local 1,000-selection simulation.

**Architecture:** Remove `kind` from the current core and management contract, while adapting the SQLite repository to read old rows and write the legacy storage shape required by migration 022. Keep weighted selection framework-independent in core; the React editor calls that selector locally for simulation and never invokes save, test, trigger, or output APIs.

**Tech Stack:** TypeScript, Zod, React, Vitest, Testing Library, SQLite, Storybook, Playwright, OpenSpec

**Spec:** `docs/superpowers/specs/2026-09-17-screen-effect-unified-variant-weighting-design.md`

## Global Constraints

- Every enabled variant participates in automatic selection using its positive integer weight.
- Require at least one enabled variant in every Screen Effect.
- Weight remains an integer from `1` through `10,000` and total weight must remain a positive safe integer.
- A new Screen Effect starts with one enabled variant named `Default` at weight `1`; the name has no runtime meaning.
- Preview and `Test saved…` continue to target the explicitly selected variant.
- Simulation performs exactly 1,000 local selections and must not save, queue playback, fire triggers, or use output routes.
- Existing SQLite `kind` data remains readable and backups remain structurally compatible.
- Do not alter Alerts contracts or Screen Effect sets, bindings, queue policy, cooldowns, priorities, routing, or playback behavior outside variant selection.

---

### Task 1: Unify the core variant contract and selector

**Files:**
- Modify: `packages/core/src/screen-effects/types.ts`
- Modify: `packages/core/src/screen-effects/schemas.ts`
- Modify: `packages/core/src/screen-effects/schemas.test.ts`
- Modify: `packages/core/src/screen-effects/variant-resolver.ts`
- Modify: `packages/core/src/screen-effects/variant-resolver.test.ts`
- Modify: `packages/core/src/screen-effects/authoring.ts`
- Modify: `packages/core/src/screen-effects/authoring.test.ts`
- Modify: `packages/core/src/screen-effects/effect-queue.test.ts`

**Interfaces:**
- Produces: `EffectVariant` without `kind`.
- Produces: `chooseWeightedVariant(variants: readonly { id: string; weight: number }[], random: number): string` as the single selection primitive.
- Produces: `screenEffectDocumentSchema` requiring at least one enabled variant.
- Consumes: no new dependencies.

- [ ] **Step 1: Write failing schema and resolver tests**

Update the new-document expectation so the variant is exactly:

```ts
{
  id: "variant-default",
  name: "Default",
  enabled: true,
  weight: 1,
  visual: null,
  sound: null,
  animation: null,
  durationMs: 10_000,
  outputs: { browserSource: false, deviceRouteIds: [] },
  visualOutputs: { browserSource: false, desktop: false }
}
```

Replace the “exactly one enabled default” test with cases proving one or many enabled variants parse, zero enabled variants fail, and an incoming `kind` field fails strict parsing. Update resolver fixtures to weights `1`, `2`, and `3`, then assert random values select across all three boundaries and disabled rows never win.

- [ ] **Step 2: Run focused core tests and verify the contract tests fail**

Run:

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/screen-effects/schemas.test.ts packages/core/src/screen-effects/variant-resolver.test.ts packages/core/src/screen-effects/authoring.test.ts packages/core/src/screen-effects/effect-queue.test.ts --reporter=dot --maxWorkers=1
```

Expected: failures reference the removed `kind` shape and old default fallback behavior.

- [ ] **Step 3: Implement the unified core model**

Remove `kind` from `EffectVariant` and `effectVariantSchema`. In `screenEffectDocumentSchema.superRefine`, use:

```ts
if (!document.variants.some((variant) => variant.enabled)) {
  context.addIssue({
    code: "custom",
    path: ["variants"],
    message: "Enable at least one variant"
  });
}
```

Remove `kind` from `createScreenEffectDocument` and `copyScreenEffectVariant`. Resolve content with:

```ts
const enabled = parsed.variants.filter((variant) => variant.enabled);
const selectedId = chooseWeightedVariant(enabled, random);
```

Update only Screen Effect fixtures that compile against this contract; leave Alert `kind` fields unchanged.

- [ ] **Step 4: Run focused core tests and typecheck core**

Run the focused Vitest command from Step 2, then:

```powershell
corepack.cmd pnpm --filter @stream-jams/core typecheck
```

Expected: all focused tests pass and core typecheck exits zero.

- [ ] **Step 5: Commit the core unit**

Stage only the Task 1 files and commit with:

```text
feat: unify screen effect variant weighting
```

### Task 2: Adapt existing SQLite rows at the repository boundary

**Files:**
- Modify: `apps/server/src/modules/screen-effects/sqlite-effect-repository.ts`
- Modify: `apps/server/src/modules/screen-effects/sqlite-effect-repository.test.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.test.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- Modify: Screen Effect fixtures in affected `apps/server` tests reported by TypeScript

**Interfaces:**
- Consumes: unified `EffectVariant` and `effectVariantSchema` from Task 1.
- Produces: repository reads legacy JSON containing `kind: "default" | "weighted"` into the unified domain model.
- Produces: repository writes `kind = "weighted"` in the legacy SQL column and adds `kind: "weighted"` only to stored JSON.

- [ ] **Step 1: Write failing legacy-read and neutral-write repository tests**

Seed one raw legacy row whose `document_json` contains `kind: "default"`, read it through `SqliteEffectRepository`, and expect the returned variant to have no `kind`. Save a unified document and inspect SQL directly:

```ts
expect(database.connection.prepare(
  "SELECT kind, document_json FROM screen_effect_variants WHERE id = ?"
).get("variant-default")).toMatchObject({ kind: "weighted" });
expect(JSON.parse(String(row.document_json))).toMatchObject({ kind: "weighted" });
```

Also assert `repository.find()` returns the unified object after the save.

- [ ] **Step 2: Run the repository tests and verify they fail**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/screen-effects/sqlite-effect-repository.test.ts --reporter=dot --maxWorkers=1
```

Expected: the repository rejects legacy JSON under the new strict schema or still reads/writes `kind` as domain data.

- [ ] **Step 3: Implement the storage adapter**

Add file-local helpers with these shapes:

```ts
type StoredEffectVariant = EffectVariant & { readonly kind: "default" | "weighted" };

function parseStoredVariant(value: unknown): EffectVariant;
function serializeStoredVariant(variant: EffectVariant): StoredEffectVariant;
```

`parseStoredVariant` must verify the raw value is a non-null object with a valid legacy kind, remove only `kind`, and pass the rest to `effectVariantSchema.parse`. `serializeStoredVariant` returns `{ ...variant, kind: "weighted" }`. Use the serialized object for the SQL `kind`, JSON, asset IDs, route IDs, and enabled/weight columns.

- [ ] **Step 4: Update backup and server fixtures without weakening coverage**

Remove `kind` only from Screen Effect domain documents. Keep raw configuration snapshot rows in their legacy physical form with `kind: "weighted"`, proving capture and restore still satisfy the migration 022 constraints.

- [ ] **Step 5: Run affected server tests and typecheck**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/screen-effects apps/server/src/modules/backup/configuration-backup-service.test.ts apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts --reporter=dot --maxWorkers=1
corepack.cmd pnpm --filter @stream-jams/server typecheck
```

Expected: tests pass; legacy rows round-trip without content loss.

- [ ] **Step 6: Commit the repository compatibility unit**

Stage only Task 2 files and commit with:

```text
fix: preserve legacy screen effect storage
```

### Task 3: Show probabilities and run a local distribution simulation

**Files:**
- Modify: `apps/web/src/management/screen-effects/ScreenEffectEditor.tsx`
- Modify: `apps/web/src/management/screen-effects/ScreenEffectTree.tsx`
- Modify: `apps/web/src/management/screen-effects/screen-effects.css`
- Modify: `apps/web/src/management/screen-effects/ScreenEffectEditor.test.tsx`
- Modify: `apps/web/src/management/screen-effects/ScreenEffectEditor.stories.tsx`
- Modify: `apps/web/src/management/screen-effects/effect-editor-state.test.ts`
- Modify: Screen Effect fixtures in affected `apps/web` tests and stories reported by TypeScript

**Interfaces:**
- Consumes: `chooseWeightedVariant` and unified `EffectVariant` from Task 1.
- Produces: `expectedVariantChance(variant, variants): number`, returning a percentage from `0` through `100`.
- Produces: local simulation rows `{ id, name, weight, expectedPercent, count, observedPercent }` for all variants.

- [ ] **Step 1: Write failing editor tests**

Add tests that assert:

```ts
expect(screen.getByLabelText("Variant weight")).toBeEnabled();
expect(screen.queryByLabelText("Variant kind")).not.toBeInTheDocument();
expect(screen.getByText("25% expected")).toBeVisible();
expect(screen.getByText("75% expected")).toBeVisible();
```

For deterministic simulation, add optional prop `random?: () => number` with production default `Math.random`; supply a cycling sequence in the test. Click `Simulate 1,000 selections`, assert the semantic table reports expected and observed counts, assert disabled variants report zero, and assert API save/test mocks were not called. Add a test that disabling the final enabled variant exposes `Enable at least one variant` and disables Save.

- [ ] **Step 2: Run editor tests and verify they fail**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/screen-effects/ScreenEffectEditor.test.tsx apps/web/src/management/screen-effects/effect-editor-state.test.ts --reporter=dot --maxWorkers=1
```

Expected: missing simulation action/table and old Kind control assertions fail.

- [ ] **Step 3: Implement probability display and last-enabled validation**

Compute enabled total weight with a safe integer reduction. Show each enabled row as `Weight N · P% expected · Enabled`; show disabled rows as `Weight N · Disabled · 0% expected`. Remove the Kind control and old fallback help. Enable weight and enabled inputs for every variant. Let schema validation reject zero enabled variants, display its existing validation summary, and leave Save disabled while invalid.

- [ ] **Step 4: Implement the local 1,000-selection simulation**

Keep `simulationRows` in editor state. On button activation:

```ts
const enabled = document.variants.filter((variant) => variant.enabled);
const counts = new Map(document.variants.map((variant) => [variant.id, 0]));
for (let index = 0; index < 1_000; index += 1) {
  const id = chooseWeightedVariant(enabled, random());
  counts.set(id, (counts.get(id) ?? 0) + 1);
}
```

Render a captioned semantic table with Variant, Weight, Expected, Selections, and Observed columns. Wrap the refreshed result in `role="status" aria-live="polite"`. Catch selector errors and show an inline actionable error without changing the draft.

- [ ] **Step 5: Update Storybook coverage and styles**

Add or update the weighted-variants story so it visibly shows multiple enabled weights, one disabled variant, calculated chances, and simulation. Keep the table within the editor viewport using the existing scroll regions and design tokens. Do not add a dialog.

- [ ] **Step 6: Run focused web checks**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/screen-effects --reporter=dot --maxWorkers=1
corepack.cmd pnpm --filter @stream-jams/web typecheck
corepack.cmd pnpm --filter @stream-jams/web build
```

Expected: focused tests, web typecheck, and production build pass.

- [ ] **Step 7: Commit the editor unit**

Stage only Task 3 files and commit with:

```text
feat: simulate screen effect weights
```

### Task 4: Reconcile specifications and verify the live workflow

**Files:**
- Modify: `tests/e2e/screen-effects.spec.ts`
- Modify: `openspec/changes/align-screen-effects-presentation/design.md`
- Modify: `openspec/changes/align-screen-effects-presentation/specs/screen-effects/spec.md`
- Modify: `openspec/changes/align-screen-effects-presentation/tasks.md`
- Modify: any remaining Screen Effect fixture identified by `rg` or typecheck

**Interfaces:**
- Consumes: completed core, storage, and editor behavior from Tasks 1–3.
- Produces: browser regression coverage and an OpenSpec record matching shipped behavior.

- [ ] **Step 1: Update the browser workflow test**

Create or edit a Screen Effect with two enabled variants at weights `1` and `3`. Verify the tree shows `25% expected` and `75% expected`, run simulation, assert the result totals 1,000, save and reload, then verify both weights persist. Register request tracking and assert simulation sends no save, live-test, or trigger request.

- [ ] **Step 2: Update OpenSpec requirements and task evidence**

Replace default-versus-weighted language with the single enabled weighted pool. Add requirements for probability labels, local 1,000-selection simulation, no external side effects, and legacy persistence compatibility. Mark tasks complete only after their verification evidence exists.

- [ ] **Step 3: Scan for stale Screen Effect kind usage**

Run:

```powershell
rg -n 'kind: "(default|weighted)"|variant\.kind|enabled default|weighted variants' packages/core/src/screen-effects apps/server/src/modules/screen-effects apps/web/src/management/screen-effects tests/e2e/screen-effects.spec.ts
```

Expected: only deliberate legacy-storage compatibility references remain.

- [ ] **Step 4: Run required validation**

Run:

```powershell
corepack.cmd pnpm exec vitest run --reporter=dot --maxWorkers=1
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm exec playwright test tests/e2e/screen-effects.spec.ts
openspec.cmd validate align-screen-effects-presentation --strict
```

Expected: all commands pass. Classify and report any unrelated failure without calling the suite green.

- [ ] **Step 5: Restart and verify the local app**

Stop only the current Stream Jams instance serving the isolated profile, rebuild/restart it on the currently assigned port, wait for health, reload the existing editor URL, and verify: all variants expose weight and enabled controls; chances update after editing; simulation fills the middle/editor workflow without opening another player; preview and `Test saved…` still target the selected variant.

- [ ] **Step 6: Commit final fixtures, specs, and verification evidence**

Stage only Task 4 files and commit with:

```text
test: verify unified effect weighting
```
