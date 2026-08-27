## Context

The implemented alert model is set → canonical event type → one or more default `AlertRule` records → zero or more owned `AlertVariant` records. The management set-detail response already exposes each editor identity as a flat `AlertInventoryRow` with event, kind, and parent identity; `alertStarterTemplates` supplies canonical event order, group, label, and empty-event coverage. This change additively carries each row's saved conditions, weight, and priority across that existing boundary so grouped list rows can reuse BL-004 summaries without loading editor documents one at a time.

`AlertSetsPage` currently filters then renders one flat table through `orderAlertRows`. The focused editor filters then maps the same flat rows directly to navigation buttons. This repeats event labels, hides empty event types, and makes sibling variations harder to scan. Runtime matching, persistence, IDs, mutation services, and routes already express the correct ownership and do not need another hierarchy.

`improve-alert-variation-authoring` owns priority groups, relative selection behavior, typed conditions, and readable matcher summaries. This change starts after it lands and only organizes saved values and those existing summary functions. It does not calculate a playback probability from inventory data.

## Goals / Non-Goals

**Goals:**

- Present canonical event types as the primary disclosure unit in Alert Sets and focused-editor navigation.
- Keep multiple defaults valid and nest each variation beneath its actual parent.
- Show empty/unknown events, useful derived counts/status, and event-scoped creation.
- Preserve row mutations, stable route identities, filtering context, keyboard behavior, and supported responsive layouts.
- Reuse one pure hierarchy/filter projection without forcing both surfaces into one generic view component.

**Non-Goals:**

- Persisted event groups, a nested server DTO, another endpoint, event-level enablement, bulk actions, or matcher changes.
- Broadening `AlertCreateInput`, persisted `AlertRule`, editor documents, or runtime matching beyond canonical `StreamEventType`.
- Priority/weight/condition authoring, sample evaluation, typography, shape, moderation, operator, media, animation, playback, or timeline work.
- A mobile focused-editor workspace, localization framework, or new component dependency.

## Decisions

### Derive groups from catalog and flat inventory

Create one web feature module exporting pure `buildAlertEventGroups` and `filterAlertEventGroups` functions. The builder combines `alertStarterTemplates`, complete inventory rows, and validation issues into:

```ts
interface AlertEventGroup {
  readonly key: string;
  readonly eventType: string;
  readonly label: string;
  readonly catalogGroup: string;
  readonly known: boolean;
  readonly defaults: readonly AlertDefaultGroup[];
  readonly defaultCount: number;
  readonly variationCount: number;
  readonly enabledCount: number;
  readonly status: "blocker" | "warning" | "needs-review" | "valid";
}

interface AlertDefaultGroup {
  readonly alert: AlertInventoryRow;
  readonly variations: readonly AlertInventoryRow[];
}
```

Canonical events follow catalog order. Stored defaults and variations retain inventory order. Unknown event types are appended under `Other`; an unattached variation remains visible in its event group with a diagnostic-safe orphan label instead of being discarded.

At the management boundary only, `AlertInventoryRow.eventType` is a non-empty `string`, `conditions` defaults to `[]`, `weight` defaults to `1`, and `priority` defaults to `null`. The server populates those fields from the already loaded persisted rule/variant. `AlertCreateInput`, `AlertEditorDocument`, persisted `AlertRule`, and runtime matchers keep `StreamEventType`. Unknown inventory event values are defensive display-only state: they appear under `Other`, expose no event-scoped creation action, and never enter creation or runtime parsing.

Alternative considered: add a nested management response. Rejected because all required identities and relationships are already loaded in one response and groups have no runtime behavior.

### Share projections, not a generic renderer

Alert Sets and the editor consume the same derived groups but render context-appropriate markup. Alert Sets needs row actions, filters, validation, profiles, and responsive tables/cards. Editor navigation needs compact route buttons and selected state. Sharing a configurable view component would create more props and conditionals than the duplicated small render shells it replaces.

Alternative considered: one `AlertEventGroupList` component for both surfaces. Rejected because only hierarchy/filter logic is genuinely identical.

### Preserve relationship context during filtering

Filtering operates on complete groups, not on rows before grouping. An event-label match shows that event's rows. A default-row match shows that default and its variations. A variation-row match shows the variation plus its owning default as context. Status/profile filters follow the same ancestor rule. During active filtering, headers show matching and total counts; unmatched empty groups are hidden unless the event label itself matches.

Search/filter forced expansion is computed separately from manual disclosure state. Clearing filters therefore restores the user's previous choices instead of leaving every matched group open.

Alternative considered: keep filtering the flat array first. Rejected because a matching variation can lose its parent and become visually misleading.

### Keep disclosure state local and predictable

On initial Alert Sets load, non-empty groups are expanded to preserve current row visibility and empty groups are collapsed. The editor always expands the selected alert's event and initially expands other non-empty groups. Manual state is retained across refreshes of the same set and reset when the selected set changes; it is not persisted to SQLite, local storage, or URLs.

Each header is a native button with `aria-expanded` and `aria-controls`. Expanded contents use ordinary headings, lists, tables, buttons, and links; no ARIA tree/treegrid or custom arrow-key model is introduced. Event groups have no enable toggle because event type is not a matcher entity.

### Keep current mutation contracts and restore focus in the web client

Event-scoped Add alert calls the existing create dialog with a known canonical event type fixed. Unknown groups expose no event-scoped creation action. Global Add alert retains the grouped picker. Successful global and event-scoped default creation stays on Alert Sets, refreshes the selected set, expands the owning group, and focuses the returned row. Duplicate, reset, enable/disable, preview, test, and delete keep existing service behavior and confirmations.

After create or duplicate, the owning group expands and focus moves to the returned row after refresh. Before deletion, the client records the next sibling, previous sibling, or group header as the focus target. The focused editor keeps existing dirty-navigation protection; toggling a disclosure does not trigger it.

### Respect current supported layouts

Alert Sets replaces the single inventory table with event sections containing row tables on wide screens and existing token-based stacked rows at its narrow breakpoint. The focused editor only reorganizes its navigation rail; below the supported workspace width it retains the existing actionable larger-screen requirement instead of adding a drawer or compressed editor.

### Reuse BL-004 summaries and existing copy boundaries

Variation condition summaries call `formatAlertConditionSummary` for canonical inventory event values. Priority-group summaries derive group membership by calling `buildAlertPriorityGroups` over the saved sibling candidates. Relative selection copy displays the saved weight and explicitly says the result depends on the sample's eligible alerts; it does not calculate or display another playback probability. Unknown event values use safe raw-condition fallback copy rather than being passed to the canonical formatter. Event labels use the existing canonical catalog/formatter, and all persisted/routed values remain stable IDs. Translation infrastructure and selected locales remain BL-017.

This is an additive flat-row transport change, not a new endpoint or nested hierarchy DTO. Defaults are emitted with their rule conditions, weight, and priority; variations are emitted with their variant conditions, weight, and priority. The existing editor document remains the authoring boundary.

## Risks / Trade-offs

- [BL-004 projection changes during implementation] → Reconcile its final exported summary contract before coding and consume it without copying semantics.
- [Many initially open groups remain long] → Preserve current visibility on first load, then let users collapse event sections; collect evidence before persisting preferences.
- [Filtering hides ownership context] → Filter complete groups and retain the owning default whenever a variation matches.
- [Unknown or orphaned stored rows disappear] → Append unknown events under `Other` and retain unattached variations with safe fallback context.
- [Focus is lost after asynchronous refresh] → Track a stable pending row/group key and focus only after the refreshed projection contains it.
- [Two render shells drift] → Share the pure projection, test both consumers against the same fixtures, and keep surface-specific markup small.

## Migration Plan

1. Complete, validate, and land `improve-alert-variation-authoring` on `origin/main`; reconcile its summary exports and final inventory contract.
2. Add the management inventory summary fields with boundary tests, then add pure group/filter projections and fixture tests without adding an endpoint or nested contract.
3. Replace Alert Sets flat inventory with event disclosures while preserving every row action and confirmation.
4. Replace the focused-editor flat navigation with the same derived hierarchy while retaining dirty-navigation and large-screen behavior.
5. Add stories, component tests, and Playwright coverage for populated, empty, unknown, filtered, narrow Alert Sets, and focus-restoration states.

No data migration or rollback transformation is required. Rolling back the UI restores flat rendering over the unchanged inventory response.

## Open Questions

None.
