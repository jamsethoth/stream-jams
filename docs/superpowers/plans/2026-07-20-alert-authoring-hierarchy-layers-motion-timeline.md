# Alert Authoring Hierarchy, Layers, Motion, And Timing Implementation Plan

> **Superseded research — do not execute this plan.** On 2026-07-21, `origin/main` established `docs/backlog.md` as the canonical planning index and added narrower changes for variation authoring, visual styles, shape layers, operator controls, and moderation. Event grouping now belongs to `group-alerts-by-event-type` and its implementation plan at `docs/superpowers/plans/2026-07-21-group-alerts-by-event-type.md`. Media controls remain BL-012, animations BL-013, accessibility/i18n BL-017, and timeline/keyframes BL-018. Custom font assets and composite presentation playback require separate product decisions before proposal work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make alert defaults and variations easy to navigate, add practical layer styling and deterministic preset motion, and establish a small shared-playhead timing foundation without building a full timeline editor.

**Architecture:** Derive event disclosures from the existing canonical catalog and flat rule/variation inventory; do not add an event-group entity. Version the JSON editor document for typed style, media, timing, and motion fields, then resolve an alert to one composite presentation driven by a shared monotonic clock in preview and live overlay. Reuse the current preview transport for a read-only timing strip; keyframes remain a separately approved phase.

**Tech Stack:** TypeScript 6 strict mode, React 19, Fastify 5, Zod 4, SQLite JSON documents, Vitest, Testing Library, Storybook 10, Playwright, browser Font Loading API, browser Web Animations API.

## Global Constraints

- Planning baseline is clean `origin/main` and `HEAD` at `da7a21fce002cbe921e9ca9680b3a64100808347` on 2026-07-20.
- Do not begin implementation until `refactor-management-ui-ux` and `add-normalized-twitch-event-types` are complete, strictly validated, archived/synced into main specs, and present in the implementation branch's `origin/main`.
- Keep browser-source outputs, provider-neutral event types, `127.0.0.1` binding, management/overlay authorization separation, and independent landscape/vertical layouts.
- Add no frontend animation, font, or timeline dependency. Use Font Loading and Web Animations APIs.
- Add no SQLite DDL for hierarchy, editor styles, timing, motion, or fonts. Editor documents remain versioned JSON; asset media type is already stored as text.
- Do not preserve old-build readability after a version-2 document is explicitly saved. Take a safety backup and document restore-based rollback.
- Full keyframes, rich text, remote fonts, arbitrary CSS/HTML/JS, groups, masks, multi-select, nonlinear media editing, and OBS integration remain out of scope.
- Every implementation slice starts with failing tests, preserves unrelated user changes, and ends with focused gates before broader validation.

---

## 1. Evidence And Current-State Map

### 1.1 Repository and OpenSpec state

- `git fetch origin` completed before analysis. `HEAD`, `origin/main`, and their merge base were all `da7a21fce002cbe921e9ca9680b3a64100808347`; the worktree was clean and detached.
- `openspec.cmd list --json` showed `refactor-management-ui-ux` at 86/87 tasks with only final re-audit/validation/live verification unchecked. `add-normalized-twitch-event-types` was 19/19 but not archived. This proposal therefore records both as hard prerequisites instead of pretending their active delta specs are already main.
- `.codegraph/` exists, but `codegraph.cmd sync .` reported that the repository was not initialized. Analysis therefore used bounded `rg` searches and direct source reads.

### 1.2 Current information architecture

The approved UX model is already set → provider catalog context → canonical event type → event default → conditional variation. Provider context helps authoring and sample selection; it is not a hidden runtime condition. The implementation preserves the lower identities but presents them as flat rows:

```text
Alerts / Sets
└─ Expanded set
   └─ one flat table
      ├─ Follow default A
      ├─   variation A1
      ├─ Follow default B
      ├─ Raid default
      └─ ...

Focused editor left rail
└─ one flat list of default and variation route buttons
```

Evidence:

- `apps/web/src/management/alerts/AlertSetsPage.tsx` filters `detail.inventory` and renders one table; `orderAlertRows` only places variations after their parent.
- `apps/web/src/management/alerts/editor/AlertEditorPage.tsx` maps the visible inventory directly to alert buttons.
- `packages/core/src/management/contracts.ts` already supplies the canonical `alertStarterTemplates` catalog grouped as Core, Subscriptions, Hype Train, Polls, Predictions, and Stream.
- The high-fidelity boards under `docs/design/hifi-concept-boards/` establish the selected set, focused editor, left navigation, canvas, inspector, target profiles, and simple preview scrubber, but do not yet solve dense variation navigation.

### 1.3 Current domain and persistence

| Concept | Current source | Consequence for this plan |
|---|---|---|
| Default alert | `AlertRule` in `packages/core/src/alerts/types.ts` | Multiple rules may share one `eventType`; do not enforce a Twitch-style single default. |
| Variation | `AlertVariant` owned by one rule | Conditions, weight, priority, enablement, and editor identity remain variation-specific. |
| Inventory row | `AlertInventoryRow` in `packages/core/src/management/contracts.ts` | `parentAlertId`, `kind`, and `eventType` are already sufficient to derive hierarchy. |
| Editor identity | rule ID for a default; variant ID for a variation | Grouping must not introduce route IDs or duplicate documents. |
| Editor document | JSON in migration 009/010 repository | Add schema version/defaulted fields; no table migration. |
| Profile layout | layer geometry per fixed target profile | Style and time can be shared while geometry stays profile-specific. |
| Asset | stable global ID and text media type | Font needs validation/UI/usage/backup support, not DDL. |

`apps/server/src/modules/alerts/alert-set-management-service.ts` already projects every default and attached variation into one response. Duplicate-default copies the full rule plus variations; duplicate-variation copies one variation. Event grouping is therefore presentation-only. The only management contract extension needed for useful row summaries is structured `conditions`, `weight`, and `priority` already available in memory during projection.

### 1.4 Current editor and playback data flow

```text
normalized provider/test event
  → AlertMatcher selects every matching AlertRule
  → AlertResolver selects one AlertVariant per rule
  → editor document lookup by rule/variant ID + target profile
  → one OverlayInstruction per visible layer
  → PlaybackCoordinator queues/delivers each instruction
  → WebSocket → OverlaySurface owns a timer per instruction
```

Evidence:

- `packages/core/src/alerts/alert-resolver.ts` chooses the variation once and maps visible layers to separate instructions.
- `apps/server/src/modules/playback/playback-coordinator.ts` queues, delivers, and awaits those instruction lifecycles.
- `apps/web/src/overlay/components/OverlaySurface.tsx` renders one surface per instruction and computes CSS entrance/exit timing independently.
- `apps/web/src/management/alerts/editor/AlertCanvas.tsx` reuses the CSS animation helper, while `AlertEditorPage.tsx` separately owns a requestAnimationFrame preview clock.
- `packages/core/src/management/contracts.ts` currently permits free-form animation strings and minimal layer fields. Text exposes only a template; image/video/audio expose asset IDs and volume; shape exists in contracts but not the Add layer UI.

The proposed flow is:

```text
catalog + flat inventory + issues
  → buildAlertEventGroups() → Sets disclosures + editor navigator

normalized event
  → match rule → select variation once → load one versioned editor document
  → resolve one CompositeAlertPresentation for one target profile
  → queue/deliver one lifecycle item
  → prepare local resources (bounded)
  → one monotonic clock → every layer, media element, motion phase, and completion
```

### 1.5 What to borrow from Twitch—and what not to

Twitch's official alert UI makes event types the left-side navigation and keeps variants under an event; its customization surface also validates demand for font, media, color, shadow, and entrance/exit controls. See [Setup Alerts by Twitch](https://help.twitch.tv/s/article/setup-alerts-by-twitch) and [Alerts by Twitch customization](https://help.twitch.tv/s/article/alerts-by-twitch-customization).

Borrow:

- event disclosures as the primary scan unit;
- visible default/variation relationship;
- concise conditions, priority, weight, and enabled status near each variation;
- one-click creation in the selected event context.

Do not borrow:

- an assumption of exactly one default per event;
- Twitch provider labels as runtime matching fields;
- provider-specific condition vocabulary in persisted presentation text;
- the full customization option count or a full timeline before Stream Jams has a shared playback clock.

## 2. Proposed UX

### 2.1 Alert Sets hierarchy

```text
Alert inventory                  Search [____________]  Status [All]  Profile [All]

▾ Follow                         2 defaults · 3 variations · 4 enabled       1 warning
  Follow — Standard              Enabled · Both profiles                 [Edit] [⋯]
    ├─ Large channel             amount ≥ 10k · priority 20 · weight 1    [Edit] [⋯]
    └─ First-time follower       first-time · priority 10 · weight 2       [Edit] [⋯]
  Follow — Minimal               Disabled · Needs review                  [Edit] [⋯]
  [+ Add Follow alert]

▸ Raid                           1 default · 0 variations · 1 enabled         Valid
▸ Hype Train                     No alerts                                 [+ Add]
```

Behavior:

- Show every canonical event, even with zero defaults. Place unknown persisted types in `Other`.
- Default group order follows `alertStarterTemplates`; stored defaults retain their existing service order; variations retain their persisted order.
- Header badges show default count, variation count, enabled count, and worst blocker/warning/review state. Full issue text remains in the editor.
- Do not add an event enabled checkbox or bulk toggle: no event group exists in the matcher.
- Group Add alert opens the existing create flow with event fixed. Global Add alert retains its grouped event picker.
- A default row offers Edit, Preview, Test, Add variation, Enable/Disable, Duplicate, Reset, Delete. A variation row offers the same applicable actions without Add variation; its destructive copy explains that only it is removed.
- Duplicate default copies the rule and all variations; duplicate variation copies only that variation. Both land disabled/Needs review and receive focus.
- Search matches event label, default/variation name, and formatted condition values. Filters cover status, target profile, and catalog family. Active search/filter opens matches and restores manual disclosure state when cleared.
- Loading uses one set-card skeleton with stable height. Request errors use the existing management error banner and Retry. Empty set still shows all catalog events. No matches names active filters and offers Clear filters.

Keyboard and accessibility:

- Use a native disclosure `<button aria-expanded aria-controls>` plus semantic nested lists on narrow layouts and a table inside the disclosure on wide layouts.
- Enter/Space toggles. Tab reaches only expanded row actions. Do not implement arrow-key tree navigation or `role="treegrid"`.
- After create/duplicate, focus the new row heading/action; after deletion focus next sibling, previous sibling, then group disclosure.
- Badge text must not rely on color. Counts use localized pluralization. Row names remain headings/accessible names, not icons alone.

Responsive behavior:

- At the existing inventory breakpoint, convert each row to a stacked card with name/status, condition summary, profiles, then wrapped actions.
- Keep event header/actions on two lines when necessary; avoid horizontal page scroll.
- The focused editor retains its supported minimum canvas width. Below it, event navigation becomes a dismissible drawer; it does not squeeze the canvas and inspector into unusable columns.

### 2.2 Focused editor navigator

- Use the same `buildAlertEventGroups()` result as Sets, with the current set selected.
- The current default/variation is always visible and its group forced open.
- Event headers show compact counts/status; rows show name and the shortest useful matcher summary.
- Search behavior and unknown-event fallback match Sets.
- Switching a disclosure never triggers the unsaved-change guard; switching rule/variation/set/profile keeps the current Save and leave / Discard / Cancel behavior.

### 2.3 Inspector organization

Avoid a single expanding form. Split the selected-layer inspector into existing design-system sections:

1. Content: text template or compatible asset picker.
2. Typography, only for Text: font source/family, size, weight/style, color, alignments, line height, letter spacing, wrap, outline, shadow.
3. Appearance: opacity; fit/focal for visual media; fill/border/radius for Shape.
4. Playback: video/audio loop, audio volume, mute-preview state.
5. Position & size: existing profile-specific geometry.
6. Timing & motion: layer start/end plus entrance/emphasis/exit phase controls.

Use compact presets plus exact numeric fields. Sliders may mirror volume, opacity, focal point, and preview playhead, but every value must have a labeled numeric input.

### 2.4 Text controls retained and pruned

| Control | Decision | Reason |
|---|---|---|
| System/local font | Keep | Common branding need; local asset preserves offline/deterministic behavior. |
| Size, 100-step weight, normal/italic | Keep | Covers ordinary alert typography without variable-axis UI. |
| Color, horizontal/vertical alignment | Keep | Essential composition controls. |
| Line height, letter spacing, wrapping | Keep | Needed for long usernames and vertical profile layouts. |
| One outline and one shadow | Keep | Broadcast legibility over unknown backgrounds. |
| Rich spans/Markdown | Prune | Complicates template substitution, selection, and accessibility. |
| Remote fonts/arbitrary stack | Prune | Breaks local-first and deterministic loading. |
| Variable font axes, gradients, curved text, auto-fit | Prune | High complexity for low initial coverage. Revisit from evidence. |

Warnings: small text, low contrast against selected sample background, overflow in either target profile, and no edge protection. Contrast remains a warning because the actual scene is unknown. The management form remains WCAG 2.2 AA; rendered text keeps `dir="auto"`.

### 2.5 Media and shape controls

- Image/GIF/video: stable asset ID, opacity, contain/cover/fill, focal X/Y. Video loop is optional and video is always muted; authors add an Audio layer for sound.
- Audio: stable asset ID, volume, loop, preview play/stop/mute. Start/end comes from the timing lane; no trim, fade, pan, duck, or waveform.
- TTS: keep current provider-neutral layer and template. It shares timing but does not acquire provider-specific style fields.
- Shape: expose one rectangle with fill, border color/width, corner radius, opacity. No gradients, SVG, masks, filters, or additional primitives.
- Static rotation waits for the Phase-5 transform model; do not store it in profile geometry and later keyframes simultaneously.

### 2.6 Motion and preview behavior

- Entrance: none, fade, scale, slide up/down/left/right.
- Emphasis: none, pulse, bounce, shake.
- Exit: none, fade, scale, slide up/down/left/right.
- Easing: linear, ease, ease-in, ease-out, ease-in-out, back-out.
- Each phase has exact duration and delay. The timing strip shows delay and active animation as one phase block.
- Entrance begins at lane start plus its delay. Emphasis follows entrance plus its delay. Exit delay+animation is anchored to lane end. Reject overlap with an exact corrective error.
- Layer order controls stacking only. `Stagger by layer order` writes explicit entrance delays; preview immediately reflects them.
- Preview, Pause, Replay, and Seek all use the existing transport. No inspector control owns a second timer.
- With OS reduced motion, do not autoplay; default to session-only reduced simulation. An explicit Full motion preview button permits reviewing authored output. Live OBS output follows saved motion and ignores host media-query state for machine-independent broadcasts.

### 2.7 Internationalization boundary

- Persist stable event IDs, condition fields/operators, preset tokens, and asset IDs only. Never persist translated group names, matcher sentences, validation copy, or font-source labels.
- Keep event/group/action/status copy in the alert feature's existing copy/constants boundary; do not add an i18n dependency in this phase. A future translator can replace that boundary without changing persistence or APIs.
- Build condition summaries from structured metadata with `Intl.NumberFormat` and `Intl.PluralRules`; do not concatenate English fragments returned by the server.
- Use CSS logical properties and allow action layouts to grow for translated labels. Keep rendered alert text at `dir="auto"`; verify an RTL sample in Storybook and Playwright.
- Search compares normalized user-visible labels and names with the browser locale while routing/filter identity remains the stable event ID.

## 3. Proposed Contracts

Names below are the interfaces later tasks produce. Implementers may refine internal helpers but must keep one validated source of truth and the specified behavior.

```ts
interface AlertInventoryRow {
  // existing fields unchanged
  readonly conditions: readonly AlertCondition[];
  readonly weight: number | null;   // null for default rules
  readonly priority: number;
}

interface AlertEventGroup {
  readonly eventType: StreamEventType | string;
  readonly catalogGroup: string;
  readonly label: string;
  readonly isKnown: boolean;
  readonly defaults: readonly AlertDefaultGroup[];
  readonly defaultCount: number;
  readonly variationCount: number;
  readonly enabledCount: number;
  readonly status: "blocker" | "warning" | "needs-review" | "valid";
}

interface AlertDefaultGroup {
  readonly row: AlertInventoryRow;
  readonly variations: readonly AlertInventoryRow[];
}
```

`buildAlertEventGroups(catalog, rows, issues)` is pure and lives in the web alert feature. Do not persist these types or create a nested server response.

```ts
type AlertFontSource =
  | { readonly kind: "system"; readonly family: SystemFontFamily }
  | { readonly kind: "asset"; readonly assetId: string };

interface AlertTextStyle {
  readonly font: AlertFontSource;
  readonly sizePx: number;              // 8..240
  readonly weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  readonly fontStyle: "normal" | "italic";
  readonly color: HexColor;
  readonly horizontalAlign: "left" | "center" | "right";
  readonly verticalAlign: "top" | "middle" | "bottom";
  readonly lineHeight: number;           // 0.8..3
  readonly letterSpacingPx: number;      // -5..50
  readonly wrap: "none" | "words" | "anywhere";
  readonly outline: { readonly widthPx: number; readonly color: HexColor };
  readonly shadow: {
    readonly offsetXPx: number;
    readonly offsetYPx: number;
    readonly blurPx: number;
    readonly color: HexColor;
  };
}

interface AlertVisualStyle {
  readonly opacity: number;              // 0..1
  readonly fit: "contain" | "cover" | "fill";
  readonly focalXPercent: number;         // 0..100
  readonly focalYPercent: number;         // 0..100
  readonly loop: boolean;                 // video only; ignored/rejected for image
}

interface AlertAudioStyle {
  readonly volume: number;               // 0..1
  readonly loop: boolean;
}

interface AlertShapeStyle {
  readonly fill: HexColor;
  readonly borderColor: HexColor;
  readonly borderWidthPx: number;         // 0..40
  readonly cornerRadiusPx: number;        // 0..500
  readonly opacity: number;               // 0..1
}
```

`HexColor` accepts only `#RRGGBB` and `#RRGGBBAA`. WOFF2/WOFF/TTF/OTF join the asset media-type union with MIME/signature validation. The database column remains unchanged.

```ts
type EntrancePreset = "none" | "fade" | "scale" |
  "slide-up" | "slide-down" | "slide-left" | "slide-right";
type EmphasisPreset = "none" | "pulse" | "bounce" | "shake";
type ExitPreset = EntrancePreset;
type MotionEasing = "linear" | "ease" | "ease-in" |
  "ease-out" | "ease-in-out" | "back-out";

interface MotionPhase<Preset extends string> {
  readonly preset: Preset;
  readonly durationMs: number;            // 0..10_000
  readonly delayMs: number;               // 0..60_000
  readonly easing: MotionEasing;
}

interface AlertLayerMotion {
  readonly entrance: MotionPhase<EntrancePreset>;
  readonly emphasis: MotionPhase<EmphasisPreset>;
  readonly exit: MotionPhase<ExitPreset>;
}

interface AlertLayerTiming {
  readonly startMs: number;
  readonly endMs: number | null;          // null follows document duration
}

interface AlertEditorDocumentV2 {
  readonly schemaVersion: 2;
  // current identity, conditions, duration, profiles, samples
  readonly layers: readonly AlertLayerV2[];
}

interface CompositeAlertPresentation {
  readonly kind: "alert-presentation";
  readonly id: string;
  readonly overlayId: string;
  readonly targetProfileId: OverlayTargetProfileId;
  readonly operatorTest?: true;
  readonly durationMs: number;
  readonly layers: readonly AlertPresentationLayer[];
}
```

The composite payload is one queue/lifecycle item. Non-alert module instructions remain supported. Alert layers contain resolved text and overlay-safe asset IDs, never raw provider payloads, filesystem paths, or remote font URLs.

## 4. Migration, Compatibility, And Rollout

### 4.1 Hierarchy

No data migration. The current row IDs, parent IDs, event types, orders, enabled state, and mutation endpoints remain authoritative. Unknown event types are shown, not discarded.

### 4.2 Editor documents

- Add `schemaVersion: 2` and a Zod preprocess/normalizer at the repository/service boundary.
- Unversioned documents receive behavior-preserving defaults in memory. Do not rewrite on read.
- Map current entrance/exit strings to typed presets; emphasis becomes none; start is 0; end follows document duration.
- Preserve current text defaults, current dark text shadow, and image/video `fill` behavior.
- First explicit version-2 save runs the existing safety-backup path before writing. Restore tests cover mixed version-1/version-2 data.
- Rollback after a version-2 save requires restoration of that backup. State this in release notes; do not add a dual-write compatibility layer.

### 4.3 Fonts/assets

No DDL. Add font values to core unions, validators, pickers, previews, replacement compatibility, usage traversal, overlay route tests, and backup/restore manifests. Keep all existing route-key and management-token boundaries.

### 4.4 Playback deployment

Ship core composite schemas, resolver, coordinator, WebSocket client, canvas preview, and OverlaySurface support in one atomic slice. Do not release a server that emits composite alerts to an overlay build that cannot parse them. Other module instruction shapes continue to work.

### 4.5 Rollout sequence

1. Hierarchy only; no stored-data change.
2. Version-2 styles and local fonts; preview/live static parity.
3. Composite playback and typed preset motion.
4. Numeric layer timing and read-only strip.
5. Observe real authoring and playback before proposing keyframes.

## 5. Dependency-Ordered Roadmap

### Phase 0 — Prerequisite reconciliation

Finish and archive/sync the two active prerequisite changes, rebase, update this proposal against resulting main specs, and strictly validate before code.

### Phase 1 — Hierarchy/grouping foundation

Derived event groups, structured matcher summaries, shared navigator projection, disclosures, responsive rows, search/filter, keyboard/focus behavior, and state stories/tests. No persistence change.

Exit gate: multiple defaults and attached variations are unambiguous in Sets and editor; mutation semantics and unsaved navigation remain correct; empty/unknown events are preserved.

### Phase 2 — Typography and practical layers

Version-2 document parser, text styles, local font assets, visual fit/focal controls, video/audio loop, rectangle shape, shared static renderer, accessibility warnings, and backup/restore coverage.

Exit gate: old documents render identically; new styles match preview/live in both profiles; failed font/media layers fail closed with diagnostics.

### Phase 3 — Richer preset motion

Composite presentation, one lifecycle, typed phases/easing, shared scheduler, Web Animations adapters, bounded preparation, stagger command, reduced-motion preview behavior, deterministic overlay tests.

Exit gate: fake-clock and Playwright evidence show identical relative timing across preview/live and repeated playback; one completion is reported.

### Phase 4 — Playhead/timing foundation

Layer start/end, exact inspector inputs, read-only semantic lanes, ruler seek, shared play/pause/replay, session reduced-motion simulation. No drag or timeline state framework.

Exit gate: every lane/phase is derived from the saved document and shared clock, and timing can be authored without a hidden second model.

### Phase 5 — Keyframes, separate future OpenSpec change

Proceed only if Phase 4 usage shows presets plus numeric lane bounds are insufficient. First scope only position, scale, rotation, and opacity keyframes with typed values/time/easing. Presets expand one-way into keyframes; switching back requires explicit reset. Add drag, snapping, zoom, undo/redo, and accessibility only with that approved change.

Still exclude text-content keyframes, asset swaps, audio automation, arbitrary CSS properties, nested compositions, masks, particles, and full nonlinear video editing.

## 6. Affected Files And Boundaries

| Area | Files to modify/create | Responsibility |
|---|---|---|
| Core management | `packages/core/src/management/contracts.ts`, `contracts.test.ts`, `alert-set-contracts.test.ts` | Inventory metadata, version-2 editor document schemas. |
| Core assets | `packages/core/src/assets/types.ts`, `schemas.ts`, `asset-validator.ts`, tests | Font media types and bounded signature validation. |
| Core presentation | `packages/core/src/overlays/types.ts`, `schemas.ts`, tests; create `packages/core/src/overlays/alert-presentation-schedule.ts` and test | Composite payload, styles, timing, pure motion schedule. |
| Alert resolution | `packages/core/src/alerts/alert-resolver.ts`, test | One selected document → one composite presentation. |
| Server inventory/documents | `apps/server/src/modules/alerts/alert-set-management-service.ts`, `alert-editor-service.ts`, `sqlite-alert-editor-document-repository.ts`, tests | Flat metadata projection, v1 normalization, v2 save. |
| Server assets | `apps/server/src/modules/assets/asset-library-service.ts`, repository/store tests, `apps/server/src/http/routes/assets.ts`, tests | Font registration, usage, replace/delete, safe reads, backup/restore. |
| Playback | `apps/server/src/modules/playback/playback-coordinator.ts`, test; `apps/server/src/websocket/overlay-gateway.ts`, test | One composite lifecycle and delivery. |
| Hierarchy UI | Create `apps/web/src/management/alerts/alert-event-groups.ts`, `.test.ts`, `AlertEventGroupList.tsx`, `.test.tsx`; modify Sets/editor pages and CSS | Shared derived hierarchy and accessible disclosures. |
| Inspector | Create focused controls under `apps/web/src/management/alerts/editor/inspector/`; modify editor page/state/tests | Typed style/media/timing/motion authoring. |
| Rendering | Create `apps/web/src/overlay/alert-resource-loader.ts`, test, `alert-animation-driver.ts`, test; modify AlertCanvas/OverlaySurface and tests | Font/media preparation, shared styles, Web Animations clock adapters. |
| Timing strip | Create `apps/web/src/management/alerts/editor/AlertTimingStrip.tsx`, test and CSS | Read-only lanes and ruler seek. |
| Stories/E2E | Alert Sets/Editor/Overlay stories and tests; `tests/e2e/management-alerts.spec.ts`, `overlay-playback.spec.ts` | Visual states, accessibility, responsive and live workflow coverage. |
| Planning/release | Current OpenSpec change, `docs/product-plan.md`, `docs/future-features.md`, release/backup docs selected by prerequisite branch | Scope status and rollback limitation. |

Do not create a new persistence repository, event-group route, nested-inventory endpoint, timeline store, CSS-evaluation path, font CDN client, or animation dependency.

## 7. Agent-Sized Implementation Tasks

Each task is a reviewable slice. Commit steps apply only during a later authorized implementation run; this planning task creates no commit.

### Task 1: Reconcile Prerequisites And Freeze Contracts

**Files:**
- Modify: `openspec/changes/enhance-alert-authoring-foundations/proposal.md`
- Modify: `openspec/changes/enhance-alert-authoring-foundations/design.md`
- Modify: `openspec/changes/enhance-alert-authoring-foundations/specs/**/*.md`
- Modify: `openspec/changes/enhance-alert-authoring-foundations/tasks.md`

**Interfaces:**
- Consumes: archived/synced main specs from both prerequisite changes.
- Produces: strictly valid proposal whose requirement names and field contracts match new `origin/main`.

- [ ] Confirm `git rev-parse origin/main`, merge base, branch, and clean status after fetch.
- [ ] Confirm both prerequisite change directories are archived and their requirements exist under `openspec/specs/`.
- [ ] Reconcile duplicate/renamed requirements; retain the decisions and bounds in Sections 2–4.
- [ ] Run `openspec.cmd validate enhance-alert-authoring-foundations --strict`.

Expected: validation succeeds; no production files change.

- [ ] Commit the reconciled planning artifacts with `docs(alerts): plan authoring foundations` during the later apply workflow.

### Task 2: Derive Event Hierarchy And Extend Inventory Metadata

**Files:**
- Create: `apps/web/src/management/alerts/alert-event-groups.ts`
- Create: `apps/web/src/management/alerts/alert-event-groups.test.ts`
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/alert-set-contracts.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`

**Interfaces:**
- Consumes: `alertStarterTemplates`, flat `AlertInventoryRow[]`, `AlertValidationIssue[]`.
- Produces: `buildAlertEventGroups(catalog, rows, issues): readonly AlertEventGroup[]` and structured row `conditions`, `weight`, `priority`.

- [ ] Write failing tests for catalog order, multiple defaults, attached variations, zero-row events, unknown events, enabled counts, worst status, and orphan fallback.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/management/alert-set-contracts.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/web/src/management/alerts/alert-event-groups.test.ts
```

Expected: failures identify absent metadata/projector.

- [ ] Add only the three structured inventory fields and populate them from already-loaded rules/variants. Do not format localized summaries server-side.
- [ ] Implement the pure projector with stable catalog/store order and `Other` fallback.
- [ ] Re-run the focused command; expect all selected files to pass.
- [ ] Commit as `feat(alerts): derive event hierarchy`.

### Task 3: Render Shared Accessible Event Disclosures

**Files:**
- Create: `apps/web/src/management/alerts/AlertEventGroupList.tsx`
- Create: `apps/web/src/management/alerts/AlertEventGroupList.test.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/alert-sets-page.css`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`
- Modify: both alert Storybook files and `tests/e2e/management-alerts.spec.ts`

**Interfaces:**
- Consumes: Task 2 `AlertEventGroup[]`, existing mutation callbacks, route IDs, validation/status components.
- Produces: one reusable disclosure view with `mode: "inventory" | "navigator"`, controlled selection, manual disclosure state, filter-forced expansion, and mutation focus hooks.

- [ ] Write failing Testing Library cases for native disclosure keyboard behavior, Tab visibility, forced expansion/restoration, Add preselection, row semantics, create/duplicate/delete focus, no-match/error/empty states, and unsaved route guard.
- [ ] Implement the shared list without `role="tree"` or `role="treegrid"`; retain all current row actions and confirmations.
- [ ] Add desktop table and narrow stacked-row CSS using existing tokens and logical properties.
- [ ] Add Storybook stories: MultipleDefaults, EmptyCatalogEvents, UnknownEvent, FilteredMatches, NarrowInventory, EditorNavigatorDrawer, Loading, Error.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/alerts/AlertEventGroupList.test.tsx apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts
```

Expected: hierarchy, keyboard, responsive, mutation, and unsaved-change cases pass.

- [ ] Commit as `feat(alerts): group defaults by event`.

### Task 4: Add Version-2 Layer And Motion Schemas

**Files:**
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `packages/core/src/overlays/types.ts`
- Modify: `packages/core/src/overlays/schemas.ts`
- Modify: `packages/core/src/overlays/schemas.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.ts`
- Modify: its test

**Interfaces:**
- Consumes: current unversioned `AlertEditorDocument` and preset animation.
- Produces: `AlertEditorDocumentV2`, typed styles/timing/motion, `normalizeAlertEditorDocument(input)`, and version-2 save boundary.

- [ ] Write failing tests for every numeric/token bound, discriminated layer field, version-1 default mapping, legacy animation conversion, fill/text-shadow parity, null end following document duration, overlap rejection, and no rewrite on read.
- [ ] Implement Zod schemas/default constants and one normalizer; do not scatter fallback values across React and overlay code.
- [ ] Keep the repository table and migrations unchanged. Invoke the existing safety-backup mechanism before the first version-2 write in a data directory.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/management/contracts.test.ts packages/core/src/overlays/schemas.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.test.ts
```

Expected: legacy and version-2 cases pass; malformed schedules/styles fail at the boundary.

- [ ] Commit as `feat(alerts): version presentation documents`.

### Task 5: Register And Serve Local Font Assets

**Files:**
- Modify: `packages/core/src/assets/types.ts`, `schemas.ts`, `asset-validator.ts`, and tests
- Modify: `apps/server/src/modules/assets/asset-library-service.ts` and tests
- Modify: `apps/server/src/http/routes/assets.ts` and tests
- Modify: asset usage/backup traversal selected after prerequisite merge
- Modify: `apps/web/src/management/assets/AssetPicker.tsx`, `AssetPreview.tsx`, tests/stories
- Create: `apps/web/src/overlay/alert-resource-loader.ts`
- Create: `apps/web/src/overlay/alert-resource-loader.test.ts`

**Interfaces:**
- Consumes: existing stable asset IDs and overlay-safe route builder.
- Produces: font media types, signature validation, role-filtered picker, `loadAlertFont(assetId, overlayUrl): Promise<string>` returning a generated family name.

- [ ] Add fixture-based failing tests for valid WOFF2/WOFF/TTF/OTF, mismatched extension/MIME/signature, oversize, remote URL rejection, usage impact, backup/restore, route-key scope, revoked key, and redacted errors.
- [ ] Add media types without DDL; reject unsafe files before storing. Extend usage traversal to text `fontAssetId`.
- [ ] Implement `FontFace` loading with family `sj-font-${sanitizedAssetId}` and one cached promise per asset/URL. Never interpolate submitted font metadata into CSS.
- [ ] Extend picker compatibility and file affordances; show licensing/source metadata as optional user-owned notes, not fetched data.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/assets apps/server/src/modules/assets apps/server/src/http/routes/assets.test.ts apps/web/src/management/assets/AssetPicker.test.tsx apps/web/src/overlay/alert-resource-loader.test.ts
```

Expected: valid local fonts load by purpose-scoped URL; every unsafe/unauthorized case fails closed.

- [ ] Commit as `feat(assets): support local alert fonts`.

### Task 6: Build Focused Layer Inspector Controls

**Files:**
- Create: `apps/web/src/management/alerts/editor/inspector/TextLayerInspector.tsx`
- Create: `VisualLayerInspector.tsx`, `AudioLayerInspector.tsx`, `ShapeLayerInspector.tsx`, `MotionInspector.tsx`, `TimingInspector.tsx`
- Create focused tests beside those files
- Modify: `AlertEditorPage.tsx`, `editor-state.ts`, tests, stories, CSS
- Modify: `AlertCanvas.tsx` and test

**Interfaces:**
- Consumes: Task 4 schemas/defaults and Task 5 compatible picker/font loader.
- Produces: schema-valid patches through the existing editor state path; no component writes persistence or constructs overlay URLs.

- [ ] Write failing role/label tests for every retained control and bound, rectangle Add layer, video-muted copy, audio/video loop, sample-background warnings, long/RTL text, target-profile switching, and invalid-save focus.
- [ ] Split inspector sections by responsibility. Use existing field, button, status, modal, and asset-picker patterns; no form library.
- [ ] Add one reusable numeric-field adapter that reports exact min/max and does not coerce an empty edit to zero prematurely.
- [ ] Add stories for styled text, custom font loading/error, long RTL, visual fits/focal points, looping video/audio, shape, timing error, and reduced-motion preference.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/alerts/editor
```

Expected: inspector and canvas state tests pass in landscape and vertical profiles.

- [ ] Commit as `feat(alerts): expand layer controls`.

### Task 7: Resolve One Composite Alert Presentation

**Files:**
- Modify: `packages/core/src/overlays/types.ts`, `schemas.ts`, tests
- Modify: `packages/core/src/alerts/alert-resolver.ts`, test
- Modify: `apps/server/src/modules/playback/playback-coordinator.ts`, test
- Modify: `apps/server/src/websocket/overlay-gateway.ts`, test
- Modify: `apps/web/src/overlay/overlay-client.ts`, test

**Interfaces:**
- Consumes: one selected rule/variation editor document and target profile.
- Produces: one `CompositeAlertPresentation` and one started/terminal lifecycle; existing non-alert instructions remain parseable.

- [ ] Write failing tests proving selection occurs once, invisible layers are omitted, order is stable, resolved text is normalized, target geometry is correct, no raw provider payload/path is emitted, and one queue item completes once.
- [ ] Add the discriminated composite payload to overlay schemas. Keep existing non-alert instruction compatibility explicitly tested.
- [ ] Change alert resolution from N layer instructions to one presentation and update coordinator/gateway lifecycle atomically.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/alerts/alert-resolver.test.ts packages/core/src/overlays/schemas.test.ts apps/server/src/modules/playback/playback-coordinator.test.ts apps/server/src/websocket/overlay-gateway.test.ts apps/web/src/overlay/overlay-client.test.ts
```

Expected: one selected design becomes one validated presentation and one terminal acknowledgement.

- [ ] Commit as `refactor(alerts): deliver composite presentations`.

### Task 8: Implement Shared Motion Schedule And Clock

**Files:**
- Create: `packages/core/src/overlays/alert-presentation-schedule.ts`
- Create: its test
- Create: `apps/web/src/overlay/alert-animation-driver.ts`
- Create: its test
- Modify: `apps/web/src/overlay/components/OverlaySurface.tsx`, test, stories
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.tsx`, test
- Modify: `apps/web/src/App.css`

**Interfaces:**
- Consumes: typed layer timing/motion and one elapsed time.
- Produces: pure `buildAlertPresentationSchedule(presentation)` intervals/state and Web Animations adapter supporting play, pause, seek, finish, cancel.

- [ ] Write fake-clock failing tests for entrance/emphasis/exit order, exit anchoring, all preset/easing tokens, pause/resume/seek, staggered delays, layer start/end, cleanup, and repeated runs.
- [ ] Implement preset keyframes as immutable data in core/web-compatible code; do not accept CSS strings from documents.
- [ ] Drive both preview and live adapters from the same schedule. Remove current alert CSS animation ownership once parity tests pass.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/overlays/alert-presentation-schedule.test.ts apps/web/src/overlay/alert-animation-driver.test.ts apps/web/src/overlay/components/OverlaySurface.test.tsx apps/web/src/management/alerts/editor/AlertCanvas.test.tsx
```

Expected: time-state snapshots match between preview and overlay adapters.

- [ ] Commit as `feat(alerts): add deterministic preset motion`.

### Task 9: Bound Resource Preparation And Media Lifecycle

**Files:**
- Modify: `apps/web/src/overlay/alert-resource-loader.ts`, test
- Modify: `apps/web/src/overlay/components/OverlaySurface.tsx`, test
- Modify: `apps/web/src/overlay/OverlayApp.lifecycle.test.tsx`
- Modify: `apps/server/src/modules/playback/playback-coordinator.test.ts`
- Modify: `tests/e2e/overlay-playback.spec.ts`

**Interfaces:**
- Consumes: composite presentation asset references.
- Produces: `prepareAlertResources(presentation, urlBuilder, 3_000)` result keyed by layer ID; valid siblings begin on one clock after all resources settle or the bound expires.

- [ ] Write failing cases for all-ready, one-font-fails, one-video-times-out, audio play rejection, muted video, loop stop, disconnect cleanup, and redacted diagnostic output.
- [ ] Prepare resources concurrently with one three-second outer bound. Mark failed layers transparent/silent; do not reject the whole presentation.
- [ ] Start one clock after settle, stop every media element at lane/presentation end, and acknowledge one terminal state.
- [ ] Run focused tests and `corepack.cmd pnpm exec playwright test tests/e2e/overlay-playback.spec.ts`.

Expected: valid siblings remain synchronized and no media survives completion/disconnect.

- [ ] Commit as `feat(alerts): synchronize presentation media`.

### Task 10: Add The Read-Only Timing Strip And Reduced Preview

**Files:**
- Create: `apps/web/src/management/alerts/editor/AlertTimingStrip.tsx`
- Create: `AlertTimingStrip.test.tsx`
- Modify: `editor-state.ts`, test
- Modify: `AlertEditorPage.tsx`, test, stories, CSS
- Modify: `AlertCanvas.tsx`, test
- Modify: `tests/e2e/management-alerts.spec.ts`

**Interfaces:**
- Consumes: existing preview elapsed/duration/play/pause/seek state plus Task 8 schedule.
- Produces: semantic ruler, read-only lanes, layer selection, numeric timing patch, and session-only reduced/full preview mode.

- [ ] Write failing tests for ruler click/keyboard seek, null end following duration, lane selection, phase segments, boundary errors, pause/resume, OS reduced-motion no-autoplay, simulation, and explicit full preview.
- [ ] Render lanes from the shared schedule only; no independent timeline state, drag handles, zoom, snapping, waveform, or keyframe model.
- [ ] Use a labeled range-like ruler with exact elapsed text and keyboard increments. Keep lane buttons in DOM order matching layer order.
- [ ] Run focused editor tests and management-alerts Playwright.

Expected: every preview control and lane observes one clock in both profiles and reduced-motion mode.

- [ ] Commit as `feat(alerts): add presentation timing strip`.

### Task 11: Complete Integrated Verification And Live Workflow

**Files:**
- Modify only test/docs files needed to close requirement gaps found during reconciliation.
- Do not weaken, skip, or delete a failing test.

**Interfaces:**
- Consumes: completed Tasks 1–10.
- Produces: evidence that every OpenSpec scenario and migration/rollback claim is covered.

- [ ] Map each proposal scenario to a unit, Storybook, API, or Playwright test; add explicit negative/failure coverage where absent.
- [ ] Run repository gates:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test:unit
corepack.cmd pnpm build
corepack.cmd pnpm test:storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate enhance-alert-authoring-foundations --strict
```

Expected: every command exits 0 with no skipped in-scope coverage.

- [ ] Test mixed v1/v2 data, first-write backup, restore, invalid font, unknown event, disconnected overlay, preparation timeout, and both target profiles.
- [ ] Rebuild/restart the local service, wait for health, reload management and both browser-source URLs, and verify the complete live workflow against the new build.
- [ ] Record Phase-5 evidence/questions in `docs/future-features.md`; do not start a keyframe proposal without review.
- [ ] Commit verification/docs as `test(alerts): verify authoring foundations`.

## 8. Test Strategy

| Layer | Required evidence |
|---|---|
| Pure core | Schema bounds/defaults, schedule interval math, legacy normalization, composite instruction validation, unknown token rejection. |
| Server services | Inventory metadata, one variation selection, one lifecycle, v1/v2 persistence, font usage/backup, safe diagnostics. |
| React unit | Disclosure keyboard/focus, search restoration, responsive semantics, inspector bounds, warnings, timing seek, reduced motion. |
| Storybook | Every hierarchy state, both profiles, long/RTL text, style/media states, every motion family, timing conflicts, loading/error/empty. |
| Playwright management | Create/duplicate/delete semantics, filters, drawer, custom font, style/save/reload, timeline seek, reduced motion. |
| Playwright overlay | Composite playback, preview/live parity, preparation failures, looping media stop, disconnect/cleanup, one completion. |
| Live local | Rebuilt server/UI/overlay with saved v1 data upgraded on save, landscape and vertical outputs, real browser media APIs. |

Use fake monotonic time for schedule math, but keep browser tests for FontFace, Web Animations, media events, and rendering. Retain Testing Library role/label queries and Storybook accessibility checks.

## 9. Risks And Alternatives

- **Nested server DTO instead of derived groups:** rejected until response size or ordering evidence demands it; it duplicates existing relationship data.
- **ARIA tree/treegrid:** rejected because rows contain many actions and native disclosure/tab behavior is easier to understand and test.
- **Remote fonts:** rejected for offline, privacy, CSP, licensing, and deterministic-layout reasons.
- **Arbitrary animation names/CSS:** rejected at the input boundary; typed presets prevent injection and keep preview/live parity.
- **One instruction per layer with a shared group ID:** rejected because independently delivered messages and lifecycle acknowledgements can still race. One composite envelope is smaller and deterministic.
- **Full timeline now:** rejected because current per-layer playback has no common clock. A timing strip first proves the clock and data model.
- **Persisted reduced-motion alternative now:** deferred; live output must be stable across OBS hosts. Collect author demand first.
- **Static rotation now:** deferred to avoid storing transform twice before the keyframe property model exists.
- **Large font/media preparation stalls:** bound to three seconds and isolate failed layers; validate the constant with representative local assets.
- **Old build after v2 save:** use pre-write safety backup; do not add indefinite dual-write complexity.

## 10. Review Checkpoints

Stop for product/engineering review at each boundary:

1. Confirm multiple-default hierarchy, labels, and group summaries before Task 3.
2. Confirm retained/pruned controls and legacy defaults before Task 4 implementation.
3. Confirm composite payload and phase schedule before server/overlay changes.
4. Confirm timing strip remains read-only before Task 10.
5. After live verification, decide whether Phase 5 has enough evidence for a separate OpenSpec proposal.

No production implementation, commit, push, or pull request was performed while creating this plan.
