# Group Alerts By Event Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat alert inventory and editor navigation with accessible event-type disclosures that preserve multiple defaults, variation ownership, filtering context, and every existing alert action.

**Architecture:** Build one pure client-side hierarchy/filter projection from `alertStarterTemplates`, the existing flat `AlertInventoryRow[]`, and validation issues. Alert Sets and the focused editor render small surface-specific disclosure shells over that projection; no server contract, database, route identity, matcher, or mutation behavior changes.

**Tech Stack:** TypeScript 6 strict mode, React 19, existing Stream Jams management components/tokens, Vitest, Testing Library, Storybook 10, Playwright.

## Global Constraints

- Start from current `origin/main` after `improve-alert-variation-authoring` is complete, strictly validated, and present.
- Reuse its condition, priority-group, relative-chance, and matcher-summary contracts; do not copy their semantics.
- Keep `AlertInventoryRow.id` as the default/variation route identity and `parentAlertId` as variation ownership.
- Multiple defaults per canonical event remain valid. Event groups have no runtime enabled state.
- Add no API, persistence record, migration, dependency, local-storage preference, mobile editor drawer, or generic tree component.
- Preserve every existing create, duplicate, reset, enable/disable, preview, test, delete, dirty-navigation, and live-impact behavior.
- Preserve unknown stored event types and unattached variation rows rather than hiding data.
- Use native disclosure buttons and ordinary semantic tables/lists; do not add ARIA tree/treegrid behavior.

---

## Current State And Target

Current `AlertSetsPage.tsx` filters `detail.inventory` before calling `orderAlertRows`, then renders one table. Current `AlertEditorPage.tsx` filters the same inventory and maps it directly to navigation buttons. Both lose empty canonical events and repeat event labels.

```text
Current                              Target

Follow default                      ▾ Follow  2 defaults · 2 variations
  Large follow variation              Follow default
Minimal follow default                  Large follow variation
Raid default                           Minimal follow default
                                    ▸ Raid  1 default
                                    ▸ Hype Train  No alerts  [+ Add]
```

The target derives hierarchy only:

```text
alertStarterTemplates ─┐
inventory rows ────────┼─ buildAlertEventGroups() ─ filterAlertEventGroups()
validation issues ─────┘                    │
                              ┌─────────────┴─────────────┐
                         Alert Sets                 Editor navigation
```

## Interfaces

Create `apps/web/src/management/alerts/alert-event-groups.ts` with these public contracts:

```ts
export interface AlertDefaultGroup {
  readonly alert: AlertInventoryRow;
  readonly variations: readonly AlertInventoryRow[];
}

export interface AlertEventGroup {
  readonly key: string;
  readonly eventType: string;
  readonly label: string;
  readonly catalogGroup: string;
  readonly known: boolean;
  readonly defaults: readonly AlertDefaultGroup[];
  readonly orphanedVariations: readonly AlertInventoryRow[];
  readonly defaultCount: number;
  readonly variationCount: number;
  readonly enabledCount: number;
  readonly status: "blocker" | "warning" | "needs-review" | "valid";
}

export interface AlertEventGroupFilter {
  readonly query: string;
  readonly eventType: string | null;
  readonly enabled: boolean | null;
  readonly profileId: TargetProfileId | null;
}

export interface FilteredAlertEventGroup {
  readonly group: AlertEventGroup;
  readonly defaults: readonly AlertDefaultGroup[];
  readonly orphanedVariations: readonly AlertInventoryRow[];
  readonly matchCount: number;
}

export function buildAlertEventGroups(input: {
  readonly catalog: typeof alertStarterTemplates;
  readonly alerts: readonly AlertInventoryRow[];
  readonly issues: readonly AlertValidationIssue[];
}): readonly AlertEventGroup[];

export function filterAlertEventGroups(
  groups: readonly AlertEventGroup[],
  filter: AlertEventGroupFilter
): readonly FilteredAlertEventGroup[];
```

Rules:

- Catalog events retain catalog order; unknown event types append in first-seen order under `Other`.
- Defaults and variations retain inventory order.
- A matching variation always carries its owning default as context.
- A matching default carries its visible variations.
- Header totals always describe the complete group; `matchCount` describes active filtering.
- Status severity order is blocker, warning, needs-review, valid.
- Search uses existing visible event labels and BL-004 matcher summaries, but routing and identity use stable IDs.

## Task 1: Reconcile The Landed Variation Contract

**Files:**
- Read: `openspec/changes/improve-alert-variation-authoring/`
- Read: `packages/core/src/management/contracts.ts`
- Read: the landed condition/summary module selected by BL-004
- Modify only if verified drift requires it: `openspec/changes/group-alerts-by-event-type/`

**Interfaces:**
- Consumes: final BL-004 summary exports and current inventory contract.
- Produces: exact import names recorded in Task 2 tests and no duplicate matcher logic.

- [ ] Fetch `origin/main`; confirm BL-004 tasks, strict validation, and implementation are complete.
- [ ] Search the final code for its event-field catalog, variation summary formatter, and inventory additions.
- [ ] Reconcile this plan and OpenSpec artifacts if names or available metadata differ; do not add fallback summary logic.
- [ ] Run `openspec.cmd validate group-alerts-by-event-type --strict`.

Expected: proposal remains valid and Task 2 can import one authoritative summary path.

- [ ] Commit later implementation-session planning drift as `docs(alerts): reconcile event grouping plan` only when reconciliation changed files.

## Task 2: Build And Filter Event Groups

**Files:**
- Create: `apps/web/src/management/alerts/alert-event-groups.ts`
- Create: `apps/web/src/management/alerts/alert-event-groups.test.ts`

**Interfaces:**
- Consumes: contracts under Interfaces above plus BL-004 formatter.
- Produces: `buildAlertEventGroups` and `filterAlertEventGroups` for Tasks 3 and 4.

- [ ] Write failing tests for the six required construction cases, including this representative parent/variation assertion:

```ts
function alertRow(input: Partial<AlertInventoryRow> & Pick<AlertInventoryRow, "id">): AlertInventoryRow {
  return {
    id: input.id,
    parentAlertId: null,
    setId: "set-1",
    providerKind: "twitch",
    eventType: "follow",
    name: input.id,
    kind: "default",
    enabled: true,
    reviewState: "ready",
    targetProfileIds: ["landscape"],
    previewText: "Preview",
    ...input
  };
}

it("nests a variation beneath only its owning default", () => {
  const groups = buildAlertEventGroups({
    catalog: alertStarterTemplates,
    alerts: [
      alertRow({ id: "follow-default" }),
      alertRow({ id: "large-follow", kind: "variation", parentAlertId: "follow-default" })
    ],
    issues: []
  });

  const follow = groups.find((group) => group.eventType === "follow");
  expect(follow?.defaults[0]?.variations.map((row) => row.id)).toEqual(["large-follow"]);
});
```

Cover catalog order with empty events, multiple defaults, unknown events under `Other`, orphan retention, and enabled/validation rollups with equally explicit assertions.

- [ ] Add focused filter tests proving a variation-only match retains its parent, an event-label match includes the event, status/profile filters keep context, and no matches returns an empty result.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/alerts/alert-event-groups.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] Implement the two pure functions with `Map`, `Set`, stable array traversal, and existing formatters. Do not add React state, server calls, caching, or a class.
- [ ] Re-run the focused test; expect all cases to pass.
- [ ] Commit as `feat(alerts): derive event type groups`.

## Task 3: Replace Alert Sets Flat Inventory

**Files:**
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/alert-sets-page.css`

**Interfaces:**
- Consumes: Task 2 projections and all current Alert Sets callbacks/dialogs.
- Produces: event disclosure sections with unchanged row commands and `pendingFocusKey` restoration.

- [ ] Add failing tests for initial expansion, Enter/Space toggle, empty-event creation, header counts/status, no group enable button, variation nesting, unknown/orphan rows, search-forced expansion, restored manual state, no matches, and request failure.
- [ ] Add failing mutation tests proving create/duplicate focus the returned row and delete focuses next sibling, previous sibling, then event header.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/alerts/alert-event-groups.test.ts
```

Expected: new disclosure/focus assertions fail against the flat table.

- [ ] Replace `orderAlertRows` and the single inventory table with event sections. Keep existing filters, row action callbacks, dialogs, status badges, confirmations, and API calls.
- [ ] Store manual expanded keys in component state; compute forced-open keys from filters without mutating that state. Reset manual keys only when set ID changes.
- [ ] Add pending-focus refs keyed by `alert:<id>` or `event:<eventType>` and focus after refreshed groups contain the key.
- [ ] Update CSS at the existing breakpoint so each event's rows stack without page-level horizontal scrolling.
- [ ] Add stories: MultipleDefaults, EmptyEvents, UnknownEvent, FilteredVariation, CollapsedWarning, NarrowRows, Loading, Error.
- [ ] Re-run focused tests; expect pass.
- [ ] Commit as `feat(alerts): group set inventory by event`.

## Task 4: Group Focused-Editor Navigation

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`

**Interfaces:**
- Consumes: Task 2 projections, current route selection, and dirty-navigation guard.
- Produces: compact event disclosures in the existing navigation rail.

- [ ] Add failing tests for selected-event forced expansion, nested variation labels, event search, unknown events, disclosure keyboard behavior, route switching, and disclosure toggling without dirty-navigation confirmation.
- [ ] Add a regression proving the existing unsupported-narrow-screen message remains; do not add a drawer.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/alert-event-groups.test.ts
```

Expected: grouped-navigation assertions fail against the flat button list.

- [ ] Render the Task 2 hierarchy inside the current `<nav>`. Always force the selected alert's event open; route changes continue through the current unsaved-change guard.
- [ ] Keep copy-design source selection based on full inventory rather than filtered navigation results.
- [ ] Add stories: GroupedNavigator, SelectedVariation, FilteredNavigator, UnknownEvent, UnsupportedNarrowScreen.
- [ ] Re-run focused tests; expect pass.
- [ ] Commit as `feat(alerts): group editor navigation by event`.

## Task 5: Browser Coverage And Final Verification

**Files:**
- Modify: `tests/e2e/management-alerts.spec.ts`
- Modify only for verified requirement evidence: relevant stories/tests and planning status files.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: end-to-end and live evidence for every OpenSpec scenario.

- [ ] Add Playwright coverage for expanding/collapsing events, creating from an empty event, variation-parent context, filtering/clearing, create/duplicate/delete focus, editor selection, and the existing narrow-screen guard.
- [ ] Run focused and repository gates:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/alerts
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test:unit
corepack.cmd pnpm build
corepack.cmd pnpm test:storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate group-alerts-by-event-type --strict
```

Expected: every command exits 0 with no weakened or skipped in-scope coverage.

- [ ] Rebuild/restart affected local services, wait for health, reload Alert Sets and the editor, and verify populated, empty, unknown, filtered, keyboard, landscape, and vertical workflows.
- [ ] Reconcile every requirement to a named test and complete an independent frontend review.
- [ ] Commit as `test(alerts): verify event type grouping`.

## Explicitly Deferred Ownership

- BL-002 owns typography and text-box styles.
- BL-003 owns solid-fill shape authoring.
- BL-004 owns variation priority, chance, conditions, and sample explanations.
- BL-005 owns durable rendered/TTS moderation.
- BL-012 owns media fit/focal controls.
- BL-013 owns additional animation presets.
- BL-017 owns selected locales, contrast checks, and reduced-motion guidance.
- BL-018 owns any timeline/keyframe editor.
- Custom font assets and composite presentation playback require new backlog decisions; they are not implementation tasks here.
