# Alert Variation Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make alert variation priority, relative chance, normalized conditions, and sample-dependent selection understandable and safely editable without changing live matching or weighted-random behavior.

**Architecture:** Add one framework-independent core module that owns the approved condition catalog, sample normalization, priority-group projection, and variant-selection explanation. Expose a focused management projection for sibling variations, extend the existing editor save request with atomic sibling-priority assignments, and render the result inside the existing Event inspector and editor history/dirty-state flow.

**Tech Stack:** Node.js 24.16.0, pnpm 11.2.2, TypeScript 6.0.3 strict mode, Zod 4.4.3, Fastify 5.8.5, SQLite through `node:sqlite`, React 19.2.7, Vitest 4.1.9, Testing Library, Storybook 10.4.6, Playwright 1.61.0.

## Global Constraints

- Start implementation from freshly fetched `origin/main`; the planning baseline was clean detached `HEAD` `8482dab34c81392d58faf0aaa617b1f02ea2adee`, exactly equal to `origin/main` on 2026-07-26.
- `refactor-management-ui-ux`, `improve-management-ui-ux-audit-followups`, and `add-normalized-twitch-event-types` are present on that baseline, have all tasks checked, and pass strict OpenSpec validation. Their still-active change folders are lifecycle cleanup, not a BL-004 implementation blocker.
- Preserve `DefaultAlertMatcher`, `DefaultAlertConditionEvaluator`, and the resolver's highest-priority-then-weighted-random semantics. Sample explanation must call the same pure selection projection as live resolution and must not consume randomness.
- Keep Preview and Send test targeted at the selected alert document. BL-004 adds a non-enqueuing explanation of what live matching would do; it does not turn either action into a general event simulator.
- Keep explicit Save, undo/redo, dirty navigation, live-impact confirmation, stale-save protection, and the last successfully saved rule active when validation fails.
- Use native buttons, selects, checkboxes, text inputs, and number inputs. Do not add drag-and-drop, query-builder, probability, or form dependencies.
- Add no SQLite table, column, migration, backup archive version, editor-document version, or dual-write path.
- Never expose raw provider payloads, actor targeting, secrets, overlay keys, or arbitrary metadata fields as new authoring choices.
- Preserve existing unsupported saved conditions unchanged and readable; do not silently delete or rewrite them. Newly added or changed conditions must pass the approved catalog at the server boundary.
- Keep the default alert outside draggable priority groups. Preserve legacy priority values until the user explicitly changes group order or membership.
- Changed production UI requires proportional Testing Library, Storybook accessibility, and Playwright coverage.

---

## 1. Verified Baseline And Current Flow

### Remote and OpenSpec evidence

- `git fetch origin --prune` completed.
- `HEAD`, `origin/main`, and their merge base are all `8482dab34c81392d58faf0aaa617b1f02ea2adee`.
- The worktree was clean and detached before this plan was written.
- `openspec.cmd status --change improve-alert-variation-authoring --json` reports all four planning artifacts complete and 0/16 implementation tasks checked.
- Strict validation passes for BL-004 and all three named prerequisites.
- Focused current tests pass after building the core package: 19 core condition/resolver tests and 39 server/editor tests.

### Current domain and persistence

- `packages/core/src/alerts/types.ts` stores rule-wide conditions, cooldown, and rule priority on `AlertRule`; variation conditions, positive weight, and optional integer priority live on `AlertVariant`.
- `packages/core/src/alerts/condition-evaluator.ts` evaluates `equals`, `includes`, `min`, `max`, and `range` against normalized events and already maps approved aliases such as `raidViewers`, `cheerAmount`, `tenureMonths`, `giftCount`, `terminalStatus`, and `ingestProvider`.
- `packages/core/src/alerts/alert-resolver.ts` filters enabled matching variants, keeps the highest effective priority (`priority ?? 0`), then consumes one random value for weighted selection.
- `apps/server/src/modules/db/migrations/002-alert-variant-selection.ts` already added `conditions_json` and non-null integer `priority`; `apps/server/src/modules/db/migrations/011-alert-variant-order.ts` preserves stable variant array order separately.
- `apps/server/src/modules/alerts/sqlite-alert-repository.ts` writes `undefined` priority as `0` and reads stored `0` back as `undefined`. This is the compatibility boundary for legacy default-priority variations.
- `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts` already exports variant conditions, priority, order, and editor-document JSON, so no backup format change is needed.

### Current management and editor flow

```text
SQLite rule + variants
        |
        +--> AlertSetManagementService --> flat AlertInventoryRow[]
        |
        +--> AlertEditorService --> one hydrated AlertEditorDocument
                                      |
                                      v
                             AlertEditorPage Event tab
                          raw priority + fixed condition inputs
                                      |
                                      v
                         PUT one document / one rule projection
                                      |
                                      v
                       aggregate transaction saves rule + metadata
                                  + selected document

Normalized live event --> matcher --> resolver selection --> playback queue

Selected sample -------> new shared sample normalizer
                      --> new shared selection projection
                      --> explanation only; no enqueue and no random draw
```

### Why a focused sibling projection is required

The editor document contains only the selected default or variation. Honest priority grouping and relative chance require every sibling's enabled state, conditions, weight, and saved priority. Extending the general alert-set inventory would spread BL-004 fields across unrelated list and Storybook fixtures. A focused read-only editor context endpoint is smaller and keeps the cross-surface inventory contract unchanged.

### Rejected approaches

| Approach | Rejection |
|---|---|
| Sequentially save each sibling variation from the browser | Creates partial live states, repeated confirmation, and failure recovery that the existing aggregate transaction already avoids. |
| Copy selector logic into React | Risks probability and eligibility drift from live playback. |
| Add sibling fields to every `AlertInventoryRow` | Broadens an unrelated list projection and forces all alert-set consumers to carry authoring-only data. |
| Add a generic query builder or drag-and-drop library | Exceeds the approved normalized field/operator scope and adds dependencies without need. |
| Rewrite every priority during load or unrelated save | Changes legacy selection without explicit user intent and creates noisy persistence diffs. |

## 2. Locked Contracts And Compatibility Decisions

### Core authoring contracts

Create `packages/core/src/alerts/variation-authoring.ts` with these public contracts:

```ts
export type AlertConditionValueKind = "number" | "text" | "enum" | "boolean";

export interface AlertConditionOption {
  readonly label: string;
  readonly value: string;
}

export interface AlertConditionFieldDefinition {
  readonly field: string;
  readonly label: string;
  readonly valueKind: AlertConditionValueKind;
  readonly operators: readonly AlertCondition["operator"][];
  readonly minimum?: number;
  readonly options?: readonly AlertConditionOption[];
}

export interface AlertConditionValidationIssue {
  readonly conditionIndex: number;
  readonly code:
    | "unsupported-field"
    | "unsupported-operator"
    | "missing-value"
    | "invalid-value"
    | "out-of-bounds"
    | "reversed-range";
  readonly message: string;
}

export interface AlertVariationSelectionCandidate {
  readonly id: string;
  readonly enabled: boolean;
  readonly conditions?: readonly AlertCondition[] | undefined;
  readonly weight: number;
  readonly priority?: number | null | undefined;
}

export interface AlertPriorityGroup {
  readonly variationIds: readonly string[];
}

export interface AlertVariationPriorityAssignment {
  readonly variationId: string;
  readonly priority: number;
}

export interface AlertVariationSampleEvaluationCandidate {
  readonly id: string;
  readonly enabled: boolean;
  readonly conditionsMatch: boolean;
  readonly inHighestEligibleGroup: boolean;
  readonly relativeChance: {
    readonly weight: number;
    readonly totalWeight: number;
    readonly percentage: number;
  } | null;
}

export interface AlertVariationSampleEvaluation {
  readonly ruleMatches: boolean;
  readonly outcome:
    | "rule-no-match"
    | "no-enabled-candidate"
    | "default-fallback"
    | "weighted-candidates";
  readonly highestEligiblePriority: number | null;
  readonly legacyDefaultTie: boolean;
  readonly candidates: readonly AlertVariationSampleEvaluationCandidate[];
}

export interface AlertVariationSelectionProjection<
  T extends AlertVariationSelectionCandidate
> {
  readonly matching: readonly T[];
  readonly highestPriority: number | null;
  readonly topPriority: readonly T[];
  readonly totalWeight: number;
}

export function getAlertConditionFieldDefinitions(
  eventType: StreamEventType
): readonly AlertConditionFieldDefinition[];

export function validateAuthoredAlertConditions(
  eventType: StreamEventType,
  conditions: readonly AlertCondition[]
): readonly AlertConditionValidationIssue[];

export function formatAlertConditionSummary(
  eventType: StreamEventType,
  condition: AlertCondition
): string;

export function createNormalizedAlertSampleEvent(input: {
  readonly eventType: StreamEventType;
  readonly ingestProvider: IngestProviderId;
  readonly payload: Record<string, unknown>;
  readonly id: string;
  readonly occurredAt: string;
}): NormalizedStreamEvent;

export function buildAlertPriorityGroups(
  variations: readonly AlertVariationSelectionCandidate[]
): readonly AlertPriorityGroup[];

export function moveAlertPriorityGroup(
  groups: readonly AlertPriorityGroup[],
  fromIndex: number,
  toIndex: number
): readonly AlertPriorityGroup[];

export function moveAlertVariationToPriorityGroup(
  groups: readonly AlertPriorityGroup[],
  variationId: string,
  targetIndex: number | "new-last"
): readonly AlertPriorityGroup[];

export function normalizeAlertPriorityGroups(
  groups: readonly AlertPriorityGroup[],
  defaultPriority: number
): readonly AlertVariationPriorityAssignment[];

export function projectAlertVariationSelection<T extends AlertVariationSelectionCandidate>(
  event: NormalizedStreamEvent,
  candidates: readonly T[],
  conditionEvaluator?: AlertConditionEvaluator
): AlertVariationSelectionProjection<T>;

export function chooseWeightedAlertVariation<T extends AlertVariationSelectionCandidate>(
  projection: AlertVariationSelectionProjection<T>,
  randomValue: number
): T | null;

export function evaluateAlertVariationSample(input: {
  readonly event: NormalizedStreamEvent;
  readonly ruleConditions: readonly AlertCondition[];
  readonly candidates: readonly AlertVariationSelectionCandidate[];
  readonly defaultCandidateId: string;
  readonly conditionEvaluator?: AlertConditionEvaluator;
}): AlertVariationSampleEvaluation;
```

### Exhaustive condition catalog

Every event receives the common `ingestProvider` enum (`Direct Twitch`, `Streamer.bot`) with `equals`. Event-specific fields are:

| Event types | Field | Control | Operators | Bounds/options |
|---|---|---|---|---|
| `follow`, all others | `ingestProvider` | select | `equals` | `twitch`, `streamerbot` |
| `subscription`, `resubscription`, `gift_subscription`, `community_gift` | `tier` | select | `equals` | Prime, Tier 1, Tier 2, Tier 3 |
| `resubscription` | `tenureMonths` | number/range | `equals`, `min`, `max`, `range` | minimum 1 |
| `cheer` | `cheerAmount` | number/range | `equals`, `min`, `max`, `range` | minimum 1 |
| `raid` | `raidViewers` | number/range | `equals`, `min`, `max`, `range` | minimum 1 |
| `channel_point_redemption` | `channelPointReward` | text | `equals` | non-empty reward ID |
| `channel_point_redemption` | `rewardTitle` | text | `equals`, `includes` | non-empty text |
| `community_gift` | `giftCount` | number/range | `equals`, `min`, `max`, `range` | minimum 1 |
| `community_gift` | `anonymous` | checkbox | `equals` | `true`, `false` |
| all Hype Train events | `hypeTrainLevel` | number/range | `equals`, `min`, `max`, `range` | minimum 1 |
| all Hype Train events | `hypeTrainProgress`, `total` | number/range | `equals`, `min`, `max`, `range` | minimum 0 |
| all Poll events | `pollVotes` | number/range | `equals`, `min`, `max`, `range` | minimum 0 |
| `poll_end` | `terminalStatus` | select | `equals` | Completed, Archived, Terminated |
| all Prediction events | `predictionPoints`, `totalUsers` | number/range | `equals`, `min`, `max`, `range` | minimum 0 |
| `prediction_end` | `terminalStatus` | select | `equals` | Resolved, Canceled |
| `stream_online` | `streamType` | select | `equals` | Live, Watch party, Premiere, Rerun |

Use a `satisfies Record<StreamEventType, ...>` map so adding a normalized event fails typechecking until the catalog decision is explicit. Summaries use `is`, `contains`, `at least`, `at most`, and `between X and Y` copy and display enum labels rather than stored codes.

### Management contracts

Add these schemas and inferred types to `packages/core/src/management/contracts.ts`:

```ts
export const alertVariationAuthoringCandidateSchema = z.object({
  editorId: nonEmptyStringSchema,
  variantId: nonEmptyStringSchema,
  kind: z.enum(["default", "variation"]),
  name: nonEmptyStringSchema,
  enabled: z.boolean(),
  conditions: z.array(alertConditionSchema),
  weight: positiveIntegerSchema,
  priority: z.number().int().nullable()
});

export const alertVariationAuthoringContextSchema = z.object({
  ruleId: nonEmptyStringSchema,
  eventType: streamEventTypeSchema,
  candidates: z.array(alertVariationAuthoringCandidateSchema).min(1)
}).superRefine((context, refinement) => {
  const defaults = context.candidates.filter(
    (candidate) => candidate.kind === "default"
  );
  if (
    defaults.length !== 1
    || context.candidates[0]?.kind !== "default"
    || defaults[0]?.editorId !== context.ruleId
  ) {
    refinement.addIssue({
      code: "custom",
      message: "Variation context requires one first default candidate keyed by the rule ID"
    });
  }
});

export const alertVariationPriorityAssignmentSchema = z.object({
  variationId: nonEmptyStringSchema,
  priority: z.number().int()
});

export const alertEditorSaveInputSchema = z.object({
  document: alertEditorDocumentSchema,
  confirmLiveImpact: z.boolean().default(false),
  priorityAssignments: z.array(alertVariationPriorityAssignmentSchema).default([])
});
```

`GET /management/alerts/:alertId/editor/variation-context` returns `AlertVariationAuthoringContext`. Existing document and set-detail responses remain unchanged.

### Priority normalization and legacy behavior

- Build groups from non-default variations only, ordered by effective priority descending; keep current variant array order inside a tied group.
- The default candidate is shown separately and retains its saved priority.
- Map `editorId` to editor routes and `variantId` to resolver candidates; pass the default candidate's actual `variantId`, not the rule ID, as `defaultCandidateId`.
- If group order/membership is unchanged, send no assignments and preserve every stored integer exactly.
- After an explicit group change, assign every conditional variation a positive priority above the effective default: for group index `i`, `Math.max(defaultPriority, 0) + groupCount - i`.
- This makes group order deterministic and keeps all members of one group tied.
- A stored conditional variation at the same effective priority as the default currently competes with that default in the live resolver. Before explicit normalization, the explanation must show the default's real relative chance and a legacy-tie warning. It must not pretend the default is only a fallback.
- Once the user changes group order/membership, normalized conditional groups sit above the default and the default becomes the fallback when no conditional group matches.
- Disabled variations remain visible in their groups but never receive a chance.

### Saved-condition compatibility

- New or changed catalog conditions must validate field applicability, operator, value kind, required value, bound, and range order in the browser and server.
- An unsupported condition already present in the resolved rule/variant may round-trip unchanged and may be removed.
- The editor renders such a condition as `Legacy condition: <field> <operator> <value>` without an editable raw-value control.
- A client may not add, mutate, or duplicate an unsupported condition through the save API.
- Known conditions with invalid values are editable and block Save, Preview, explanation, and Send test until corrected; the server keeps the prior saved rule active.

### Preview, test, and live meaning

- Local Preview renders the selected draft design with the selected sample.
- Send test sends the selected draft design to the chosen output.
- The new explanation reports which saved/draft candidate live resolution would choose from, before randomness.
- Full provider-event simulation, queue/cooldown mutation, and repeated historical simulation remain out of scope.

## 3. OpenSpec Task Reconciliation

| Existing task | Current evidence | Implementation task |
|---|---|---|
| 1.1 prerequisite gate | Complete, strict-valid, and on `origin/main`; recheck at implementation start | Task 1 |
| 1.2 current-model reconciliation | Completed by this plan against contracts, persistence, API, editor, samples, resolver, stories, and E2E | Task 1 records clarifications |
| 2.1-2.2 priority groups | Optional integer priority and stable variant order already persist; no authoring projection exists | Task 2 |
| 2.3-2.4 relative chance | Resolver semantics exist privately; explanation must share them | Task 2 |
| 3.1-3.2 typed catalog | Current component has a fixed one-operator catalog; server accepts arbitrary conditions | Tasks 2 and 4 |
| 3.3 sibling projection | Current editor receives only one document | Tasks 3 and 4 |
| 4.1-4.2 editor UX | Raw numeric priority/weight and limited inputs exist; dirty/undo/save guards already exist | Tasks 5 and 6 |
| 4.3 Storybook | Existing VariationAuthoring and InvalidConditionInput cover only the old UI | Task 7 |
| 4.4 Playwright | Current E2E covers one variation/minimum/save flow only | Task 7 |
| 5.1-5.3 verification | Gates and live workflow are established | Task 8 |

## Task 1: Reconfirm Baseline And Reconcile OpenSpec Wording

**Files:**
- Modify: `openspec/changes/improve-alert-variation-authoring/design.md`
- Modify: `openspec/changes/improve-alert-variation-authoring/specs/alert-configuration-management/spec.md`
- Modify: `openspec/changes/improve-alert-variation-authoring/tasks.md`
- Read: prerequisite change artifacts and `docs/backlog.md`

**Produces:** Approved artifact wording for legacy default-priority ties, server-boundary validation, atomic sibling saves, and selected-alert Preview/Send test behavior.

- [ ] Fetch `origin/main`, prove the implementation worktree is clean and based on its current tip, and repeat the three prerequisite strict validations.
- [ ] Confirm BL-004 is still unimplemented by searching for the core contracts named in this plan and by checking its task count.
- [ ] Amend the design migration section to state that unchanged priorities are preserved and all conditional siblings normalize only after explicit group order/membership changes.
- [ ] Add a spec scenario that an existing default-priority tie is explained using current live semantics until the user explicitly normalizes groups.
- [ ] Add a spec scenario that unchanged unsupported saved conditions round-trip read-only while new or modified unsupported conditions are rejected.
- [ ] Clarify that sample explanation is non-enqueuing and that Preview/Send test continue targeting the selected alert.
- [ ] Refine tasks 2-4 to name the shared resolver projection, focused context endpoint, and atomic assignment validation; do not expand the feature set.
- [ ] Run:

```powershell
openspec.cmd validate improve-alert-variation-authoring --strict
```

Expected: `Change 'improve-alert-variation-authoring' is valid`.

- [ ] Commit the artifact reconciliation with `docs(alerts): reconcile variation authoring semantics`.

## Task 2: Build The Shared Catalog, Priority, And Selection Model

**Files:**
- Create: `packages/core/src/alerts/variation-authoring.ts`
- Create: `packages/core/src/alerts/variation-authoring.test.ts`
- Modify: `packages/core/src/alerts/alert-resolver.ts`
- Modify: `packages/core/src/alerts/alert-resolver.test.ts`
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `packages/core/src/index.ts`

**Consumes:** Existing `AlertCondition`, `DefaultAlertConditionEvaluator`, normalized event types/schema, and private resolver selection semantics.

**Produces:** The exact core interfaces in Section 2, Zod management schemas, and one selection projection used by both explanation and live resolution.

- [ ] Write catalog tests that iterate all `streamEventTypes`, prove each gets the common ingest-provider field, assert the table in Section 2, and prove no definition starts with `metadata.` or targets actor identity.
- [ ] Write validation/summary tests for numeric `equals`/`min`/`max`/`range`, text `includes`, enum selects, boolean equality, missing values, wrong types, out-of-bounds values, reversed ranges, unsupported fields, and unsupported operators.
- [ ] Port the existing server sample-event cases into core tests and prove `createNormalizedAlertSampleEvent` returns a valid normalized event for all 20 event types from built-in/session payload shapes.
- [ ] Write group tests for stable grouping of `undefined`, zero, negative, and positive legacy priorities; moving groups; joining an existing group; splitting to `new-last`; removing empty groups; and deterministic assignments above a non-zero default priority.
- [ ] Write projection/evaluation tests for rule no-match, disabled and non-matching variations, highest group only, one candidate at 100%, 1:3 weights at 25%/75%, default fallback, no enabled candidate, and a legacy default tie.
- [ ] Run the new core test and confirm it fails because the module and exports do not exist.
- [ ] Implement the exhaustive catalog, validation, summaries, sample normalizer, group operations, normalization, and pure selection/evaluation functions using arrays, `Map`, and the existing evaluator. Add no class or dependency.
- [ ] Replace only the private candidate filtering/priority/weight calculation in `DefaultAlertResolver` with `projectAlertVariationSelection` and `chooseWeightedAlertVariation`.
- [ ] Keep `AlertVariantSelectionError`, random clamping, one random draw, and selected variant results unchanged.
- [ ] Add the management schemas and public exports. The context schema must reject zero/multiple defaults and a default whose `editorId` is not the rule ID.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/alerts/variation-authoring.test.ts packages/core/src/alerts/alert-resolver.test.ts packages/core/src/management/contracts.test.ts
corepack.cmd pnpm --filter @stream-jams/core build
```

Expected: all tests pass and the strict core build emits no type errors.

- [ ] Commit as `feat(alerts): share variation authoring semantics`.

## Task 3: Add The Focused Sibling Context Projection

**Files:**
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/modules/providers/management-ui-service.ts`
- Modify: `apps/server/src/modules/providers/management-ui-service.test.ts`
- Modify: `apps/server/src/http/routes/management-ui.ts`
- Modify: `apps/server/src/http/routes/management-ui.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-api.test.ts`

**Interfaces:**
- Produces: `AlertEditorService.getVariationContext(alertId): Promise<AlertVariationAuthoringContext>`.
- Produces: authenticated `GET /management/alerts/:alertId/editor/variation-context`.
- Produces: `ManagementApi.getAlertVariationAuthoringContext(alertId)`.

- [ ] Write service tests for a default route ID, a variation route ID, stable candidate order, actual default variant ID, conditions, weights, priorities, disabled siblings, and not-found behavior.
- [ ] Implement `getVariationContext` by reusing `#resolveEditorItem`, projecting the resolved rule once, and mapping index zero to `{ editorId: rule.id, kind: "default" }`.
- [ ] Add the method through `ManagementUiServiceOptions`, `ManagementUiService`, and runtime composition without creating another service.
- [ ] Add the protected GET route and parse its result with `alertVariationAuthoringContextSchema`.
- [ ] Add route tests for authentication, valid response, malformed service response failure, and variation IDs resolving to the same parent context.
- [ ] Add the typed HTTP client method and test its URL, parse success, and invalid-response rejection.
- [ ] Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm vitest run apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/providers/management-ui-service.test.ts apps/server/src/http/routes/management-ui.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts apps/web/src/management/management-api.test.ts
```

Expected: focused context tests pass; existing editor-document and alert-set responses remain byte-for-byte compatible.

- [ ] Commit as `feat(alerts): expose variation sibling context`.

## Task 4: Save Priority Groups And Conditions Atomically

**Files:**
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-aggregate-mutation-store.ts` only if the existing whole-rule mutation type needs a narrower name; no new storage behavior is expected
- Modify: `apps/server/src/modules/alerts/sqlite-alert-aggregate-mutation-store.test.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-repository.test.ts`
- Modify: `apps/server/src/modules/providers/management-ui-service.ts`
- Modify: `apps/server/src/modules/providers/management-ui-service.test.ts`
- Modify: `apps/server/src/http/routes/management-ui.ts`
- Modify: `apps/server/src/http/routes/management-ui.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-api.test.ts`

**Interfaces:**
- Extends: `AlertEditorService.saveDocument(alertId, document, confirmLiveImpact, priorityAssignments)`.
- Extends: `ManagementApi.saveAlertEditorDocument(alertId, document, confirmLiveImpact?, priorityAssignments?)`.
- Reuses: one `AlertAggregateMutationStore.commit` with `expectedRules`, one updated whole rule, selected metadata, and the selected hydrated editor document.

**Assignment validation:**

- Empty assignments mean no priority-group edit and preserve every sibling priority.
- Non-empty assignments must contain every non-default variant exactly once and no other ID.
- Assigned priorities must be positive integers above the default priority and must form contiguous group values.
- The selected variation document returned/stored by the service must contain its assigned priority.
- Default priority is never changed by this request.

- [ ] Write failing service tests for a successful group reorder, a variation joining a group, priority-only live-impact confirmation, selected-document hydration, and no-assignment preservation.
- [ ] Add rejection tests for a default ID, unknown ID, duplicate ID, missing sibling, partial list, non-integer priority, priority at/below default, and non-contiguous groups.
- [ ] Add condition-boundary tests proving valid catalog conditions save, invalid/reversed ranges fail before mutation, unchanged unsupported saved conditions round-trip, removal succeeds, and new/modified `metadata.*` conditions fail.
- [ ] Build the candidate rule in memory, apply selected document fields plus validated sibling assignments, and send one whole rule through the existing aggregate transaction.
- [ ] For priority-only changes in an active set, derive affected target profiles from sibling editor documents and require the existing live-impact confirmation before commit.
- [ ] Move `createTestEvent` behavior to `createNormalizedAlertSampleEvent`; keep the current generated reference ID, timestamp, ingest-provider mapping, and normalized schema parse.
- [ ] Add a SQLite regression proving all sibling priorities change or none do when the final editor-document write fails.
- [ ] Assert repository round-trip order and conditions are unchanged and priorities return through the optional-zero compatibility mapping.
- [ ] Thread `priorityAssignments` through the route, management service, runtime adapter, and web client. Do not add another mutation endpoint.
- [ ] Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm vitest run apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/alerts/sqlite-alert-aggregate-mutation-store.test.ts apps/server/src/modules/alerts/sqlite-alert-repository.test.ts apps/server/src/modules/providers/management-ui-service.test.ts apps/server/src/http/routes/management-ui.test.ts apps/web/src/management/management-api.test.ts
```

Expected: invalid input leaves the stored rule and editor document unchanged; valid assignments commit as one rule update.

- [ ] Commit as `feat(alerts): save variation groups atomically`.

## Task 5: Extend Editor History And Draft Evaluation

**Files:**
- Modify: `apps/web/src/management/alerts/editor/editor-state.ts`
- Modify: `apps/web/src/management/alerts/editor/editor-state.test.ts`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`

**Interfaces:**

Extend `AlertEditorState` without changing existing `editor.document` call sites:

```ts
interface AlertEditorSnapshot {
  readonly document: AlertEditorDocument;
  readonly priorityGroups: readonly AlertPriorityGroup[];
}

export interface AlertEditorState {
  readonly document: AlertEditorDocument;
  readonly savedDocument: AlertEditorDocument;
  readonly priorityGroups: readonly AlertPriorityGroup[];
  readonly savedPriorityGroups: readonly AlertPriorityGroup[];
  readonly past: readonly AlertEditorSnapshot[];
  readonly future: readonly AlertEditorSnapshot[];
  readonly historyLimit: number;
}

export function applyPriorityGroupUpdate(
  state: AlertEditorState,
  update: (groups: readonly AlertPriorityGroup[]) => readonly AlertPriorityGroup[]
): AlertEditorState;
```

- [ ] Write state tests proving document and group edits share one undo/redo sequence, group-only edits mark dirty, Revert restores both, Save resets both histories, and the history limit still applies.
- [ ] Update the internal history snapshots while retaining existing `applyEditorUpdate`, layer helpers, and component access to `editor.document`.
- [ ] Load document, set detail, TTS providers, and variation context through the existing page load flow; do not render the editor until document and variation context are valid.
- [ ] Build initial groups from `context.candidates.filter(kind === "variation")`.
- [ ] Derive the current evaluation with `useMemo`: parse/normalize the sample, overlay the selected document's draft fields, overlay normalized draft assignments only when groups are dirty, and call `evaluateAlertVariationSample`.
- [ ] Extend dirty-navigation and live-impact summaries so a group-only change is guarded and names all affected enabled profiles.
- [ ] On Save, send assignments only when group state differs from the saved group state. Preserve the existing pending-save rule by comparing both submitted document and submitted group references before marking the current state saved.
- [ ] After success, update the local context with the returned selected document and submitted assignments; after failure, retain the complete draft and saved baseline.
- [ ] Add page tests for context load/error, group-only dirty navigation, undo/redo, pending-save edits, failed-save retention, priority assignment payload, and no assignments on unrelated saves.
- [ ] Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm vitest run apps/web/src/management/alerts/editor/editor-state.test.ts apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
```

Expected: all existing editor behavior passes plus the new group-history and save-payload cases.

- [ ] Commit as `feat(alerts): track variation group drafts`.

## Task 6: Replace Raw Event Controls With Typed Authoring

**Files:**
- Create: `apps/web/src/management/alerts/editor/AlertEventInspector.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`

**Consumes:** Task 2 catalog/summary/validation exports and Task 5 draft/evaluation state.

**Produces:** A focused production Event inspector component; `AlertEditorPage` remains responsible for data loading, commands, toasts, navigation, and save confirmation.

- [ ] Extract the current Event inspector from the 1,300-line page without changing sample, Preview, audio/TTS, or Send test behavior.
- [ ] Render rule-wide controls under `Affects default and all variations`: rule conditions, cooldown, and rule priority.
- [ ] Render selected-variation controls under `Affects this variation only`: variation conditions and `Relative chance` weight.
- [ ] Replace one-button-per-field and fixed operators with a field select, approved operator select, and one native control determined by `valueKind`.
- [ ] For numeric range, render labelled Minimum and Maximum number inputs and retain the last valid saved condition while the draft is incomplete/reversed.
- [ ] Use selects for enum values, a checkbox for `anonymous`, text input for normalized text fields, and number inputs with catalog minimums.
- [ ] Show `formatAlertConditionSummary` for each condition and `Legacy condition` read-only rows for unsupported saved conditions; keep Remove available.
- [ ] Do not expose `metadata.*`, actor fields, provider IDs other than `ingestProvider`, arbitrary path entry, or raw JSON condition editing.
- [ ] Combine catalog validation and sample normalization errors into field-specific messages. Disable Save, Preview, explanation, and Send test on invalid draft input.
- [ ] Add Testing Library coverage for every control kind/operator, changing operators resets to a valid operator-specific value, reversed/incomplete ranges, readable summaries, legacy preservation/removal, raw-field exclusion, and shared-impact copy.
- [ ] Preserve accessible fieldset/legend structure, labelled controls, keyboard operation, focus after Add/Remove, and text—not color alone—for errors.
- [ ] Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
```

Expected: typed condition authoring and all prior editor workflows pass.

- [ ] Commit as `feat(alerts): add typed condition authoring`.

## Task 7: Add Priority Groups, Relative Chance, Stories, And E2E

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEventInspector.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`
- Modify: `tests/e2e/management-alerts.spec.ts`

**Priority-group controls:**

- Default alert appears in a separate `Fallback` row.
- Each conditional group is labelled `Priority group N` and `evaluated first/next/last`.
- Group buttons are `Move group earlier` and `Move group later`.
- Each variation has a labelled `Move to priority group` select listing existing groups plus `New lowest-priority group`; users can move that new group earlier afterward.
- No within-group reorder control is rendered because row order has no runtime meaning.

**Sample explanation:**

- Rule mismatch: identify the failing rule summaries and state that no alert plays.
- One top candidate: show 100% relative chance.
- Multiple top candidates: show weight/total and percentage for each; state that live selection remains random.
- No conditional match: show the enabled default as fallback.
- Disabled/non-matching/lower-priority variations remain visible with the reason they are not candidates.
- Legacy default tie: include the default's real percentage and explain that an explicit group edit will normalize conditional groups above it.

- [ ] Add failing component tests for group movement, joining/splitting groups, disabled siblings, unchanged priorities, default isolation, first/last button disabling, and no within-group ordering.
- [ ] Render groups and candidate summaries from core projections. Use no client-side priority or chance formula.
- [ ] Put the sample explanation in a labelled semantic section with polite status updates and concise random-selection copy.
- [ ] Ensure an invalid sample hides stale percentages and shows only the sample correction.
- [ ] Update `VariationAuthoring` and `InvalidConditionInput` stories and add production-component states: `SingleEligibleVariation`, `WeightedTopGroup`, `DefaultFallback`, `LegacyDefaultTie`, `InvalidRange`, `SharedRuleImpact`, `ExpandedConditionCatalog`, and `PrioritySaveFailure`.
- [ ] Keep Storybook payloads local and tiny; include no route key, credential, raw provider payload, or external asset.
- [ ] Extend the existing variation Playwright flow to stub the context endpoint, create siblings, move a group, join a group, set 1:3 relative weights, add a numeric range, verify 25%/75%, save exact assignments, reload with normalized priorities, and Send test to the selected variation.
- [ ] Add negative E2E coverage that a reversed range disables Save/Preview/Send test and that a failed save retains group membership and condition drafts.
- [ ] Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm vitest run apps/web/src/management/alerts/editor
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts
```

Expected: unit, Storybook accessibility/interaction, and focused browser tests pass.

- [ ] Commit as `feat(alerts): explain variation selection`.

## Task 8: Complete Verification, Live Proof, And OpenSpec Synchronization

**Files:**
- Modify only to close verified requirement gaps: tests and stories named above
- Modify: `openspec/changes/improve-alert-variation-authoring/tasks.md`
- Sync: `openspec/changes/improve-alert-variation-authoring/specs/alert-configuration-management/spec.md` into `openspec/specs/alert-configuration-management/spec.md`
- Modify after implementation and spec sync: `docs/backlog.md`

### Requirement-to-test evidence

| Requirement | Minimum evidence |
|---|---|
| Ordered priority groups | Core group tests, editor keyboard/control tests, Playwright save/reload |
| Relative chance | Core projection tests, Storybook one/weighted/fallback/tie states, editor tests |
| Typed conditions | Exhaustive core catalog tests, server boundary tests, editor control tests, invalid-range E2E |
| Sample explanation | Core evaluator tests, editor sample-change tests, Storybook states |
| Shared rule impact | Editor copy/live-warning tests and atomic server confirmation tests |
| Live semantics unchanged | Existing resolver tests plus deterministic new shared-projection tests |
| Last saved state survives invalid input/failure | Server atomic rollback tests and editor failed-save tests |

- [ ] Map every OpenSpec scenario to named test evidence and add only missing negative/failure cases.
- [ ] Run the complete repository gates:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate improve-alert-variation-authoring --strict
```

Expected: every command exits 0; no in-scope test is skipped or weakened.

### Rebuilt live workflow

- [ ] Rebuild and restart the local service from the implementation branch, wait for `GET http://127.0.0.1:39187/health` to return healthy, and reload the management UI so no old bundle remains.
- [ ] Create or use a disposable inactive verification set; do not alter the active production set.
- [ ] Create a Raid default and three variations: two matching top-group variations with weights 1 and 3, and one matching lower group.
- [ ] With a 125-viewer sample, verify 25%/75% top-group chances, zero chance for the lower group, random-selection copy, and selected-alert Preview behavior.
- [ ] Change the sample below every variation threshold and verify default fallback without enqueueing playback.
- [ ] Enter a reversed range, confirm Save/Preview/Send test are blocked, reload in another tab, and confirm the previously saved rule remains active.
- [ ] Fix the range, move one variation into another group, reorder groups, save with live-impact confirmation when applicable, reload, and confirm stable group order and normalized sibling priorities.
- [ ] Connect a disposable landscape browser source and run Send test; confirm it renders the selected draft alert rather than performing random sibling selection.
- [ ] Through the authenticated `/alerts/test` path, send unique normalized Raid event IDs and confirm only the highest eligible priority group reaches playback. Use deterministic unit tests—not observed random frequency—as the acceptance proof for the exact 1:3 weighting.
- [ ] Verify the Event inspector with keyboard only: add/remove a condition, change operator, edit range endpoints, move a group, move a variation, inspect explanation, undo/redo, save, and revert.
- [ ] Remove the disposable set after evidence is recorded.

### Documentation lifecycle

- [ ] Check every BL-004 task only after its code/test evidence passes.
- [ ] Sync the delta requirement into the main `alert-configuration-management` spec and rerun strict validation.
- [ ] Remove BL-004 from `docs/backlog.md` only after implementation and spec sync; rewrite BL-039's dependency as `Variation authoring contract implemented` so it does not point to a removed backlog row.
- [ ] Do not archive the OpenSpec change until implementation, spec sync, backlog cleanup, and user review are complete.
- [ ] Commit final evidence/docs as `test(alerts): verify variation authoring`.

## 4. Migration And Rollback

- **SQLite:** no DDL. Existing `conditions_json`, `priority`, and `variant_order` remain authoritative.
- **Priority data:** unchanged rules retain exact values. An explicit group edit rewrites only that rule's conditional-variation priorities in one transaction.
- **Default compatibility:** legacy default-priority ties remain live and are explained honestly until explicit normalization.
- **Editor documents:** only the selected document is rewritten. Sibling document JSON may retain old priority snapshots, but `hydrateDocument` already overlays the current rule/variant priority on every load.
- **Conditions:** approved existing conditions become typed. Unsupported saved conditions remain read-only/removable and unchanged until the user removes them.
- **Backups:** existing table snapshots already contain every changed value; archive version 2 remains valid.
- **Rollback to the old UI:** normalized priorities are ordinary integers and existing condition values retain the existing `AlertCondition` shape, so the old numeric editor and resolver can read them without a reverse migration.

## 5. Risks And Mitigations

- **Displayed chance drifts from live selection:** both use `projectAlertVariationSelection`; only the resolver calls `chooseWeightedAlertVariation`.
- **Sibling save partially applies:** one whole-rule aggregate transaction plus rollback regression.
- **Default is falsely described as fallback for legacy zero-priority data:** explicit `legacyDefaultTie` result and Storybook/test coverage.
- **Unsupported saved condition is lost:** unchanged-condition comparison at the server boundary and read-only rendering.
- **Malicious client bypasses UI validation:** server validates every new/changed catalog condition and every assignment.
- **Group-only edit escapes dirty/live guards:** priority groups share editor history and affected-profile confirmation.
- **Sample shape differs from Send test:** browser explanation and server test construction share `createNormalizedAlertSampleEvent`.
- **Percentages look guaranteed:** copy always says sample-specific and live selection remains random.
- **Event inspector becomes harder to scan:** variation-only controls stay hidden for defaults; rule-wide and variation-only sections remain separate fieldsets.
- **Editor file grows further:** extract only the Event inspector; do not refactor unrelated layer/canvas code.

## 6. Explicit Non-Goals

- Nested AND/OR groups, generic query building, arbitrary metadata paths, raw provider payloads, actor targeting, bulk multi-select editing, or historical simulation.
- Changing the resolver's priority, condition, weight, or random-selection algorithm.
- Making Preview or Send test run the entire match/queue/cooldown pipeline.
- Persisted custom sample libraries.
- Drag-and-drop ordering or a new UI dependency.
- Alert inventory grouping; BL-039 owns that follow-on work.
- Typography, shape layers, moderation, media crop/fit, additional animations, or timeline/keyframe authoring.
- SQLite schema/version changes, API versioning, LAN access, cloud sync, or OBS integration.

## 7. Review Checkpoints

1. Approve the legacy default-priority tie and unsupported-condition compatibility wording before Task 1 changes the OpenSpec artifacts.
2. Review the core selection projection against current resolver tests before server/API work.
3. Review the focused context and atomic assignment contracts before UI work.
4. Review typed controls, keyboard behavior, and sample explanation in Storybook before Playwright/live verification.
5. Review final requirement evidence before spec sync, BL-004 backlog removal, or OpenSpec archive.

No production code, commit, push, or pull request was performed while creating this plan.
