# Simplicity and consistency audit — 2026-10-05

This pass supplements [the class/interface audit](./2026-10-05-class-interface-structure-audit.md). A1–A7 remain open recommendations. This is an investigation, not an implementation or publication of repairs.

Implementation follow-up: S1–S5 and A1–A7 have been implemented on `codex/architecture-audit-repairs`. See the [execution ledger](2026-10-05-architecture-repair-progress.md) for source/test reconciliation and verification status. The audit findings below retain their original baseline and estimates.

The useful simplifications are fewer supported paths, shared transformations, and state grouped by the operation it represents. None of these findings calls for a deeper inheritance hierarchy. Prefer ordinary functions and local state ownership; introduce an abstraction only when it reduces the work required to understand the callers.

## Findings

### S1 — delete: Remove the unused Music publication pipeline

**Evidence:** [MusicRuntimePublication and the optional sink](../../apps/server/src/modules/music/music-runtime-coordinator.ts#L16), the two publication fields at lines 51–52, and [the second publication/drain path](../../apps/server/src/modules/music/music-runtime-coordinator.ts#L253). The production [constructor](../../apps/server/src/runtime/runtime-composition.ts#L961) supplies no sink. Production instead subscribes to revisions through [queueMusicOutputSync](../../apps/server/src/runtime/runtime-composition.ts#L1441).

Whole-tree symbol and constructor searches found sink consumers only in `music-runtime-coordinator.test.ts` (lines 35, 208, 240 and 268). Consequently the coordinator maintains a snapshot publication type and a bounded delivery algorithm that production never executes, while composition maintains a separate delivery algorithm that production does execute. Tests for the former can give maintainers the wrong impression about which algorithm protects real recipients.

**Repair:** Remove the unused sink option, publication type, fields and drainer; retain revision subscription and the actual output synchronization path. Move valuable slow-recipient, latest-state and recipient-failure assertions onto the production output path before removing tests of the alternative. Preserve generation ownership, bounded delivery, explicit test-output inclusion and shutdown tracking. The canonical Music specs require behavior, not this optional sink API.

**Estimated reduction:** about 33 production lines, excluding test changes. Highest priority because it removes an entire alternative path.

### S2 — reuse: Share the repeated server duration-candidate projection

**Evidence:** The same missing-record filtering and `{ assetId, label, mediaType, durationMs, eligible: true }` construction occurs in [PlaybackCoordinator](../../apps/server/src/modules/playback/playback-coordinator.ts#L303), [AlertEditorService](../../apps/server/src/modules/alerts/alert-editor-service.ts#L530), and [EffectAdmissionService](../../apps/server/src/modules/screen-effects/effect-admission-service.ts#L297). Duration resolution itself is already shared in core.

**Repair:** Use one small server function that projects asset IDs and typed records into duration candidates. Keep asset capture, duration policy and fallback values at the callers. Alerts use a five-second fallback and effects use ten seconds; these differences are intentional. Playback's separate line-520 projection assumes records exist, so do not silently replace that assumption with filtering. Browser projections use display names and should not gain a server dependency merely to share this mapper.

**Estimated reduction:** approximately 15–20 production lines after adding the helper and imports. This is one concrete transformation, not a configurable duration service or base coordinator.

### S3 — delete: Remove two helper APIs with no production callers

**Evidence:** [snapLayerGeometry](../../apps/web/src/management/alerts/editor/editor-state.ts#L441) and its `SnapOptions` at line 39 are referenced only by their defining module and `editor-state.test.ts`. The live [AlertCanvas](../../apps/web/src/management/alerts/editor/AlertCanvas.tsx#L140) calls `snapEditorRect` directly with operation mode, peers and bounds. Separately, [assertDesktopMediaProtocolVersion](../../packages/core/src/assets/media-reference.ts#L35) is referenced only by its own test. Actual private media validation already requires a literal protocol version in the schema at line 21.

**Repair:** Remove these unused wrappers/types and the snapping import made unnecessary by their removal. Preserve useful snapping boundary assertions in tests of the actual snapping function. Preserve wrong-version rejection tests at the actual private-media/IPC boundaries. Remove the unused assertion API, not protocol validation.

Whole-tree searches included source, tests, docs and specs; no string-based or dynamic references to these names were found. These are internal repository usage findings, not a claim about consumers outside this repository.

**Estimated reduction:** about 18 production lines, excluding test changes.

### S4 — shrink: Give each Alert Sets dialog ownership of its draft and error

**Evidence:** [AlertSetsPage state](../../apps/web/src/management/alerts/AlertSetsPage.tsx#L102) spreads the create-alert operation across six state values and the variation operation across three. Opening a create dialog [sets six values separately](../../apps/web/src/management/alerts/AlertSetsPage.tsx#L384); opening a variation sets three. Create, variation and duplicate also repeat the reveal/refresh/focus/expand sequence at lines 422–426, 453–457 and 477–481.

This is a maintenance burden rather than a demonstrated runtime defect: a reader must track several setters to understand one operation, and future fields must be reset in every entry path.

**Repair:** Start narrowly: group the create dialog's draft/error/open state into one nullable typed object and do the same for variation, or let dedicated dialog components own their drafts. Use a single discriminated dialog state only if the product requires those dialogs to be mutually exclusive. Extract the identical created-alert reveal/refresh/focus sequence into a named local function. Keep operation-specific validation, notices and failure messages explicit.

Avoid a global dialog framework, generic mutation engine or reducer for all page state. Polling generations, disclosure state and focus restoration have real responsibilities and should remain visible. Moving code to components is not itself a line reduction.

**Estimated reduction:** not credited for regrouping state; roughly 3–6 lines for sharing the focus sequence. The primary gain is understanding one dialog without reconstructing unrelated setters.

### S5 — reuse: Use the existing template preview renderer in the alert editor

**Evidence:** [AlertEditorPage.renderTemplateValue](../../apps/web/src/management/alerts/editor/AlertEditorPage.tsx#L2118) manually walks dotted paths for the preview instructions at lines 671 and 678. [renderAlertTemplatePreview](../../apps/web/src/management/alerts/editor/template-preview.ts#L5) already delegates to the core renderer with HTML escaping disabled, and is used by both AlertCanvas and AlertThemePreview.

**Repair:** Replace the local template interpreter with the existing preview function. Check ordinary text, missing values, object values and dotted paths. Also make the handling of inherited properties and non-data values explicit: the two implementations differ, so this is not a claim of complete behavioral equivalence. Follow the core template contract rather than preserving a second implicit contract.

**Estimated reduction:** approximately 6 production lines after the import. The larger benefit is one definition of template preview behavior.

## Scope and exclusions

The broad scan covered the same 468 TypeScript source files as the declaration inventory, excluding named test/spec/story entrypoints and declaration files, but including supporting modules in test-support and story directories. It inspected repeated bodies, potential unused exports, large modules, package manifests and candidate callers. Manual tracing concentrated on runtime composition, playback/admission, Music, alert/editor flows, providers, desktop hosts and persistence. This is not a claim that every function was reviewed individually.

The earlier September complexity audit's resolved findings were checked to avoid reporting them again. No dependency removal was justified by this pass. Long files and single-implementation interfaces were not automatically treated as problems.

Intentionally retained:

- Starter-theme implementation, including AlertThemeChooser: the approved [disable-starter-themes design](../../openspec/changes/archive/2026-10-05-disable-alert-starter-themes/design.md#L33) explicitly retains it while removing active entry points.
- Persistence ports and schema validation: these express real package and trust boundaries.
- Cancellation, generation guards, shutdown order, bounded queues and mute capabilities: these protect runtime ownership and user controls.
- Different alert/effect policies and export/restore normalization: shared plumbing must not hide different product rules.
- Similar desktop recovery methods: introducing a generic host hierarchy was not shown to reduce total complexity.

A1–A7 remain separately tracked. In particular, sharing wire schemas (A1), requiring real mute capability (A2), and narrowing concrete or oversized interfaces (A3/A7) also support simplicity, but are not counted twice here.

## Validation and repair ordering

Source references and whole-tree usage checks underpin these findings. No product files were changed and no runtime behavior was tested during this pass. Implementation must verify each affected boundary; this report does not establish that proposed removals already pass tests.

Repair S1 first, then the small S3/S5 removals and reuse, S2's mapping, and S4's state ownership. Keep each independently reviewable. Avoid combining this work into a broad class hierarchy rewrite.

net: approximately -75–85 production lines, -0 dependencies possible. This is a rough planning estimate, excludes test churn and moved code, and does not assign a fictional savings to regrouping dialog state.
