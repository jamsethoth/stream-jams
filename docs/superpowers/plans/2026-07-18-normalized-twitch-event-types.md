# Normalized Twitch Event Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 14 provider-independent Twitch-origin alert triggers with equivalent direct Twitch and Streamer.bot ingestion, actionable OAuth scope upgrades, grouped alert creation, and realistic test samples.

**Architecture:** Core owns one canonical event-type tuple plus discriminated normalized payload schemas. Direct Twitch and Streamer.bot remain explicit adapters into that contract, after which the existing diagnostics, matching, resolution, queue, and overlay pipeline is reused unchanged. Management UI consumes grouped template metadata and server-built normalized samples; no new dependency or persistence schema is required.

**Tech Stack:** TypeScript 6, Zod 4, Node.js 24, Fastify 5, React 19, Vitest 4, Testing Library, Storybook, Playwright, SQLite text-backed alert records.

## Global Constraints

- Add exactly: `gift_subscription`, `community_gift`, `hype_train_start`, `hype_train_progress`, `hype_train_end`, `poll_start`, `poll_progress`, `poll_end`, `prediction_start`, `prediction_progress`, `prediction_lock`, `prediction_end`, `stream_online`, and `stream_offline`.
- Keep `sourcePlatform: "twitch"`; use `ingestProvider: "twitch" | "streamerbot"` to distinguish transport.
- Do not add dependencies, database migrations, third-party donations, Twitch charity donations, creator goals, or stream-driven intake control.
- Gifted subscriptions no longer match `subscription`; community gifts may intentionally produce one aggregate alert plus recipient gift alerts.
- Existing alert sets and the four-alert starter set remain unchanged.
- Supported malformed events must produce sanitized diagnostics with a reference ID and must not terminate later intake.
- Use explicit `.js` extensions for relative NodeNext imports, `import type` for type-only imports, and keep strict TypeScript flags unchanged.
- After each task: run its focused checks, mark OpenSpec tasks complete, commit, and push `codex/refactor-management-ui-ux`.
- After production changes: rebuild, restart affected services, wait for health, and verify the rebuilt runtime rather than a stale process.

---

### Task 1: Canonical Event Contract

**Files:**
- Modify: `packages/core/src/events/types.ts`
- Modify: `packages/core/src/events/schemas.ts`
- Modify: `packages/core/src/events/schemas.test.ts`
- Modify: `packages/core/src/alerts/schemas.ts`
- Modify: `packages/core/src/alerts/schemas.test.ts`
- Modify: `packages/core/src/alerts/condition-evaluator.ts`
- Modify: `packages/core/src/alerts/condition-evaluator.test.ts`
- Verify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `streamEventTypes`, expanded `StreamEventType`, 14 new normalized event interfaces, nested poll/prediction value objects, and `normalizedStreamEventSchema` coverage.
- Produces: scalar normalized fields consumed by provider adapters, alert samples, templates, and conditions in later tasks.

- [ ] **Step 1: Write failing event catalog and schema tests**

Add a table asserting that `streamEventTypeSchema` and `normalizedStreamEventSchema` accept every exact identifier and reject an unknown type. Use representative complete payloads for each family and assert nested poll choices and prediction outcomes reject missing IDs, titles, or non-integer totals.

```ts
const addedTypes = [
  "gift_subscription", "community_gift",
  "hype_train_start", "hype_train_progress", "hype_train_end",
  "poll_start", "poll_progress", "poll_end",
  "prediction_start", "prediction_progress", "prediction_lock", "prediction_end",
  "stream_online", "stream_offline"
] as const;

for (const type of addedTypes) {
  expect(streamEventTypeSchema.safeParse(type).success).toBe(true);
}
expect(streamEventTypeSchema.safeParse("donation").success).toBe(false);
```

- [ ] **Step 2: Run the focused tests and confirm the catalog is absent**

Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/events/schemas.test.ts packages/core/src/alerts/schemas.test.ts
```

Expected: FAIL because the new identifiers and payload variants are not accepted.

- [ ] **Step 3: Implement the shared type tuple and normalized interfaces**

Define the type source once in `events/types.ts` and make every new event include `amount` so the existing template context stays exhaustive:

```ts
export const streamEventTypes = [
  "follow", "subscription", "resubscription", "cheer", "raid", "channel_point_redemption",
  "gift_subscription", "community_gift",
  "hype_train_start", "hype_train_progress", "hype_train_end",
  "poll_start", "poll_progress", "poll_end",
  "prediction_start", "prediction_progress", "prediction_lock", "prediction_end",
  "stream_online", "stream_offline"
] as const;
export type StreamEventType = (typeof streamEventTypes)[number];

export interface GiftSubscriptionEvent extends BaseNormalizedStreamEvent {
  readonly type: "gift_subscription";
  readonly amount: 1;
  readonly tier: SubscriptionTier;
  readonly recipient: StreamEventActor;
  readonly gifter: StreamEventActor | null;
}

export interface CommunityGiftEvent extends BaseNormalizedStreamEvent {
  readonly type: "community_gift";
  readonly amount: number;
  readonly tier: SubscriptionTier;
  readonly cumulativeTotal: number | null;
  readonly anonymous: boolean;
}
```

Add shared Hype Train fields `trainId`, `level`, `progress`, `goal`, `total`, `startedAt`, `expiresAt`, `endedAt`, and `cooldownEndsAt`, using nullable timestamps/values where the phase does not supply them. Add poll fields `pollId`, `title`, `choices`, `totalVotes`, `startedAt`, `endsAt`, and `status`. Add prediction fields `predictionId`, `title`, `outcomes`, `totalUsers`, `totalPoints`, `startedAt`, `locksAt`, `endedAt`, `status`, and `winningOutcomeId`. Add stream fields `streamId`, `streamType`, `startedAt`, and `endedAt`. Use `amount = total`, `totalVotes`, `totalPoints`, or `null` for those four families respectively.

Mirror the interfaces with explicit Zod schemas and add all variants to `normalizedStreamEventSchema`. Export `subscriptionTierSchema`'s type as `SubscriptionTier`. In `alerts/schemas.ts`, replace the duplicated enum array with `z.enum(streamEventTypes)`.

- [ ] **Step 4: Add condition aliases and focused tests**

Extend `readConditionField` with stable aliases only:

```ts
case "giftCount": return readPath(event, "amount");
case "hypeTrainLevel": return readPath(event, "level");
case "hypeTrainProgress": return readPath(event, "progress");
case "pollVotes": return readPath(event, "totalVotes");
case "predictionPoints": return readPath(event, "totalPoints");
case "terminalStatus": return readPath(event, "status");
case "streamType": return readPath(event, "streamType");
```

Add tests proving numeric, equality, and ingest-provider conditions work and that raw metadata is not needed.

- [ ] **Step 5: Run core checks**

Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/events/schemas.test.ts packages/core/src/alerts/schemas.test.ts packages/core/src/alerts/condition-evaluator.test.ts
corepack.cmd pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Mark checkpoint 1 complete, commit, and push**

Mark OpenSpec tasks `1.1` through `1.3` complete. Commit only the core contract changes and task state:

```powershell
git add packages/core/src/events packages/core/src/alerts openspec/changes/add-normalized-twitch-event-types/tasks.md
git commit -m "feat: expand normalized Twitch event contract"
git push origin codex/refactor-management-ui-ux
```

### Task 2: Direct Twitch EventSub Coverage

**Files:**
- Modify: `apps/server/src/modules/twitch/twitch-event-normalizer.ts`
- Modify: `apps/server/src/modules/twitch/twitch-event-normalizer.test.ts`
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-client.ts`
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-client.test.ts`
- Modify: `apps/server/src/modules/events/event-ingestion-service.test.ts`

**Interfaces:**
- Consumes: expanded `NormalizedStreamEvent` union from Task 1.
- Produces: direct EventSub notification mappings and subscription requests used by runtime composition.

- [ ] **Step 1: Add table-driven failing normalizer tests**

Cover this exact mapping:

| EventSub notification | Canonical result |
| --- | --- |
| `channel.subscribe` with `is_gift: true` | `gift_subscription` |
| `channel.subscription.gift` | `community_gift` |
| `channel.hype_train.begin/progress/end` v2 | matching Hype Train phase |
| `channel.poll.begin/progress/end` v1 | matching poll phase |
| `channel.prediction.begin/progress/lock/end` v1 | matching prediction phase |
| `stream.online/offline` v1 | matching stream state |

Assert ordinary `channel.subscribe` still maps to `subscription`, gift recipients do not, aggregate gifts carry count/tier, terminal statuses are preserved, channel-level actors are broadcasters, and malformed nested choices/outcomes throw `TwitchEventNormalizationError`.

- [ ] **Step 2: Run the normalizer tests and confirm failure**

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/twitch/twitch-event-normalizer.test.ts
```

Expected: FAIL on unsupported notification types and gift branching.

- [ ] **Step 3: Implement explicit direct Twitch normalizers**

Expand `TwitchEventSubNotificationType`, its guard, and the main switch. Keep one parser per family and use the existing required/optional field helpers. The subscription branch must be explicit:

```ts
case "channel.subscribe":
  return message.payload.event.is_gift === true
    ? normalizeGiftSubscription(message)
    : normalizeSubscription(message);
case "channel.subscription.gift": return normalizeCommunityGift(message);
```

Use the EventSub message ID as the normalized event ID, broadcaster as actor for lifecycle events, recipient as actor for gift subscriptions, and anonymous display text for anonymous community gifts.

- [ ] **Step 4: Add failing subscription-definition tests**

Assert the documented versions and required scopes:

```ts
const expected = {
  "channel.subscription.gift": ["1", "channel:read:subscriptions"],
  "channel.hype_train.begin": ["2", "channel:read:hype_train"],
  "channel.hype_train.progress": ["2", "channel:read:hype_train"],
  "channel.hype_train.end": ["2", "channel:read:hype_train"],
  "channel.poll.begin": ["1", "channel:read:polls"],
  "channel.poll.progress": ["1", "channel:read:polls"],
  "channel.poll.end": ["1", "channel:read:polls"],
  "channel.prediction.begin": ["1", "channel:read:predictions"],
  "channel.prediction.progress": ["1", "channel:read:predictions"],
  "channel.prediction.lock": ["1", "channel:read:predictions"],
  "channel.prediction.end": ["1", "channel:read:predictions"],
  "stream.online": ["1", null],
  "stream.offline": ["1", null]
} as const;
```

- [ ] **Step 5: Expand subscription definitions and run focused checks**

Add definitions using `broadcaster_user_id` for all new types. Do not add another subscription for individual gift recipients because `channel.subscribe` already carries `is_gift`.

Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/twitch/twitch-event-normalizer.test.ts apps/server/src/modules/twitch/twitch-eventsub-client.test.ts apps/server/src/modules/events/event-ingestion-service.test.ts
corepack.cmd pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Mark checkpoint 2 complete, commit, and push**

Mark OpenSpec tasks `2.1` through `2.3` complete, then:

```powershell
git add apps/server/src/modules/twitch apps/server/src/modules/events/event-ingestion-service.test.ts openspec/changes/add-normalized-twitch-event-types/tasks.md
git commit -m "feat: ingest expanded Twitch EventSub events"
git push origin codex/refactor-management-ui-ux
```

### Task 3: Streamer.bot Twitch Parity

**Files:**
- Create: `apps/server/src/modules/streamerbot/fixtures/twitch-gift-sub.json`
- Create: `apps/server/src/modules/streamerbot/fixtures/twitch-gift-bomb.json`
- Create: representative Hype Train, poll, prediction, and stream JSON fixtures under `apps/server/src/modules/streamerbot/fixtures/`
- Modify: `apps/server/src/modules/streamerbot/fixtures/README.md`
- Modify: `apps/server/src/modules/streamerbot/streamerbot-event-normalizer.ts`
- Modify: `apps/server/src/modules/streamerbot/streamerbot-event-normalizer.test.ts`
- Modify: `apps/server/src/modules/streamerbot/streamerbot-runtime-service.ts`
- Modify: `apps/server/src/modules/streamerbot/streamerbot-runtime-service.test.ts`

**Interfaces:**
- Consumes: Task 1 canonical payloads.
- Produces: Streamer.bot parity events and exact runtime subscription selections.

- [ ] **Step 1: Add fixture-backed failing normalization tests**

Cover `GiftSub`, `GiftBomb`, `HypeTrainStart`, `HypeTrainUpdate`, `HypeTrainEnd`, `PollCreated`, `PollUpdated`, `PollCompleted`, `PollArchived`, `PollTerminated`, `PredictionCreated`, `PredictionUpdated`, `PredictionLocked`, `PredictionCompleted`, `PredictionCanceled`, `StreamOnline`, and `StreamOffline`. Fixtures must contain the smallest real Streamer.bot envelope that proves each required normalized field.

Assert `PollCompleted/Archived/Terminated` map to `poll_end` with statuses `completed/archived/terminated`, and `PredictionCompleted/Canceled` map to `prediction_end` with statuses `resolved/canceled`.

- [ ] **Step 2: Run normalizer tests and confirm unsupported results**

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/streamerbot/streamerbot-event-normalizer.test.ts
```

Expected: FAIL because the new source/type pairs return `unsupported`.

- [ ] **Step 3: Implement explicit Streamer.bot mappings**

Extend the existing Twitch-only switch with exact event names. Reuse `baseEvent`, stable upstream IDs, deterministic hash fallback, actor parsing, and metadata provenance. Do not inspect payload shape to guess the event type. Do not map `HypeTrainLevelUp`; `HypeTrainUpdate` is the canonical progress source.

```ts
case "GiftSub": return normalized(normalizeGiftSubscription(envelope));
case "GiftBomb": return normalized(normalizeCommunityGift(envelope));
case "HypeTrainStart": return normalized(normalizeHypeTrain(envelope, "hype_train_start"));
case "HypeTrainUpdate": return normalized(normalizeHypeTrain(envelope, "hype_train_progress"));
case "HypeTrainEnd": return normalized(normalizeHypeTrain(envelope, "hype_train_end"));
```

Follow the same explicit pattern for poll, prediction, and stream variants.

- [ ] **Step 4: Add failing runtime subscription tests**

Assert discovery subscribes to all names above, restores them after reconnect, degrades with a message listing unavailable required names, and still subscribes to available names. Assert `HypeTrainLevelUp` is not requested.

- [ ] **Step 5: Expand the supported subscription list and run focused checks**

Keep one readonly Twitch supported-name list in `streamerbot-runtime-service.ts` and derive the selection from discovery. Preserve exact discovered category casing.

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/streamerbot/streamerbot-event-normalizer.test.ts apps/server/src/modules/streamerbot/streamerbot-runtime-service.test.ts
corepack.cmd pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Mark checkpoint 3 complete, commit, and push**

Mark OpenSpec tasks `3.1` through `3.3` complete, then:

```powershell
git add apps/server/src/modules/streamerbot openspec/changes/add-normalized-twitch-event-types/tasks.md
git commit -m "feat: normalize expanded Streamer.bot Twitch events"
git push origin codex/refactor-management-ui-ux
```

### Task 4: Twitch Authorization Readiness

**Files:**
- Modify: `apps/server/src/modules/twitch/twitch-account-repository.ts`
- Modify: `apps/server/src/modules/twitch/twitch-oauth-service.ts`
- Modify: `apps/server/src/modules/twitch/twitch-oauth-service.test.ts`
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-runtime-service.ts`
- Modify: `apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts`
- Modify: `apps/server/src/modules/providers/provider-management-adapters.ts`
- Modify: `apps/server/src/modules/providers/provider-management-adapters.test.ts`
- Modify: `apps/server/src/http/routes/twitch-auth.test.ts`
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-api.test.ts`
- Modify: `apps/web/src/management/providers/ProviderPage.tsx`
- Modify: `apps/web/src/management/providers/ProviderPages.test.tsx`
- Modify: `apps/web/src/management/providers/ProviderPages.stories.tsx`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`

**Interfaces:**
- Produces: `authorizationState: "disconnected" | "ready" | "update-required"` and `missingScopes: readonly string[]` on Twitch connection status.
- Consumes: default OAuth scope list and existing reconnect actions; no token schema migration.

- [ ] **Step 1: Add failing scope and readiness tests**

Assert Device Code OAuth requests the existing scopes plus:

```ts
[
  "channel:read:hype_train",
  "channel:read:polls",
  "channel:read:predictions"
]
```

Assert a saved account missing any required scope remains `connected: true`, reports `authorizationState: "update-required"`, and lists only missing scopes. Assert direct EventSub runtime does not connect in that state and exposes a reference-linked actionable error.

- [ ] **Step 2: Implement server-side readiness calculation**

Extend `TwitchConnectionStatus` without deleting the account shape:

```ts
export type TwitchAuthorizationState = "disconnected" | "ready" | "update-required";

export function missingTwitchScopes(
  granted: readonly string[],
  required: readonly string[] = defaultTwitchOAuthScopes
): readonly string[] {
  const grantedSet = new Set(granted);
  return required.filter((scope) => !grantedSet.has(scope));
}
```

Disconnected status uses an empty missing list. Connected status computes readiness from the same sorted scope list used to start Device Code OAuth. Preserve access and refresh secret refs. Make runtime synchronization fail before opening EventSub when missing scopes are non-empty, with next step `Reconnect Twitch to grant the added event permissions.`

- [ ] **Step 3: Update provider validation and management API parsing**

Provider validation must reject `update-required` with human-readable missing capability names: Hype Trains, polls, and predictions. Update the web decoder's exact-key validation and TypeScript view type for the two new fields.

- [ ] **Step 4: Add the Event Sources recovery UI**

For a connected scope-deficient Twitch registration, show:

```text
Authorization update required
Reconnect Twitch to enable Hype Trains, polls, and predictions.
```

Render the existing `Reconnect Twitch` action in the row/detail context, keep the registration and account visible, and link runtime errors to Diagnostics when a reference ID exists. Add Storybook and Testing Library coverage for ready, update-required, reconnecting, and failed reconnect states.

- [ ] **Step 5: Run focused authorization and UI checks**

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/twitch/twitch-oauth-service.test.ts apps/server/src/modules/twitch/twitch-eventsub-runtime-service.test.ts apps/server/src/modules/providers/provider-management-adapters.test.ts apps/server/src/http/routes/twitch-auth.test.ts apps/web/src/management/management-api.test.ts apps/web/src/management/providers/ProviderPages.test.tsx apps/server/src/runtime/runtime-composition.smoke.test.ts
corepack.cmd pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Mark checkpoint 4 complete, commit, and push**

Mark OpenSpec tasks `4.1` through `4.3` complete, then:

```powershell
git add apps/server/src/modules/twitch apps/server/src/modules/providers apps/server/src/http/routes/twitch-auth.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts apps/web/src/management openspec/changes/add-normalized-twitch-event-types/tasks.md
git commit -m "feat: surface Twitch authorization updates"
git push origin codex/refactor-management-ui-ux
```

### Task 5: Grouped Alert Creation And Samples

**Files:**
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- Modify: `tests/e2e/management-alerts.spec.ts`

**Interfaces:**
- Consumes: all canonical event interfaces and scalar fields from Task 1.
- Produces: grouped template metadata, built-in samples, exhaustive test events, template variables, and event-specific condition definitions.

- [ ] **Step 1: Add failing catalog, starter, and sample tests**

Add a `group` field to each `alertStarterTemplates` entry using exact labels `Core`, `Subscriptions`, `Hype Train`, `Polls`, `Predictions`, and `Stream`. Assert every canonical type has exactly one template, while `starterAlertEventTypes` still creates only follow, raid, subscription, and channel-point alerts.

For each new event, assert `createAlert` succeeds, the generated document has two built-in samples, both pass `validateAlertSamplePayload`, and `sendTest` constructs the exact normalized type.

- [ ] **Step 2: Run focused tests and confirm missing templates/samples**

```powershell
corepack.cmd pnpm vitest run packages/core/src/management/contracts.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts
```

Expected: FAIL for missing templates and non-exhaustive test-event construction.

- [ ] **Step 3: Implement grouped definitions and normalized samples**

Add one template per canonical type with concise text using normalized fields. Gift labels must be `Gift subscription received` and `Community gift received`; their descriptions/samples must state per-recipient versus aggregate frequency.

Refactor `createBuiltInSamples` and `createTestEvent` into exhaustive switches over `StreamEventType`. Every event returns `normal` and `edge` samples. Use deterministic sample IDs/timestamps and validate the result through `normalizedStreamEventSchema` before returning it. Extend `getAlertTemplateVariableCatalog` and `validateAlertSamplePayload` with only stable normalized fields.

- [ ] **Step 4: Implement grouped picker and conditions**

Render the new-alert `<select>` with `<optgroup>` elements derived from template `group` values. Keep the create action, naming, disabled/needs-review defaults, and starter filter unchanged.

Add condition definitions:

| Family | Conditions |
| --- | --- |
| Gifts | tier, gift-count minimum |
| Hype Train | level minimum, progress minimum, total minimum |
| Poll | total-votes minimum; terminal status on `poll_end` |
| Prediction | total-points minimum, participant minimum; terminal status on `prediction_end` |
| Stream | stream type on `stream_online`; no event-only condition on offline |

Retain the ingest-provider restriction for every type. Do not add nested choice/outcome or raw metadata conditions.

- [ ] **Step 5: Add stories, component tests, and Playwright workflow**

Update story fixtures to use `StreamEventType` rather than repeated narrow unions. Add a grouped-picker story and tests that select at least one item from each group. In Playwright, create a community-gift alert, open it, verify sample/condition controls, send a test to a connected output fixture, and verify the alert remains disabled and needs review until explicitly enabled.

- [ ] **Step 6: Run frontend gates**

```powershell
corepack.cmd pnpm vitest run packages/core/src/management/contracts.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/modules/alerts/alert-editor-service.test.ts apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm test:e2e -- tests/e2e/management-alerts.spec.ts
corepack.cmd pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Mark checkpoint 5 complete, commit, and push**

Mark OpenSpec tasks `5.1` through `5.3` complete, then:

```powershell
git add packages/core/src/management apps/server/src/modules/alerts apps/web/src/management/alerts tests/e2e/management-alerts.spec.ts openspec/changes/add-normalized-twitch-event-types/tasks.md
git commit -m "feat: add grouped alert event creation"
git push origin codex/refactor-management-ui-ux
```

### Task 6: Integration, Documentation, And Live Verification

**Files:**
- Modify: `apps/server/src/modules/events/event-pipeline.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `docs/product-plan.md`
- Modify: `openspec/changes/add-normalized-twitch-event-types/tasks.md`
- Modify only if failures expose a gap: diagnostics/runtime files already touched by Tasks 2-4

**Interfaces:**
- Consumes: complete provider and alert-management slice.
- Produces: end-to-end proof, updated current-scope documentation, completed OpenSpec change, rebuilt running app.

- [ ] **Step 1: Add provider-parity and failure-continuity integration tests**

For one lifecycle event and one gift event, send equivalent direct Twitch and Streamer.bot inputs into the runtime composition and assert both match the same canonical rule. Send a malformed supported payload, assert the diagnostic row contains its reference ID and sanitized source/type, then send a valid payload and assert intake succeeds.

- [ ] **Step 2: Update product documentation**

Move the 14 implemented event types into the current Twitch scope in `docs/product-plan.md`. Keep donations, charity, creator goals, and stream-driven intake explicitly deferred and link the donation backlog section.

- [ ] **Step 3: Run all repository gates**

```powershell
openspec.cmd validate add-normalized-twitch-event-types --strict
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
```

Expected: every command exits `0`; do not skip, weaken, or delete tests to obtain green status.

- [ ] **Step 4: Rebuild and restart the local app**

Stop the existing Stream Jams Node process, run the production build, start `node apps/server/dist/index.js`, and wait until the health endpoint responds at `http://127.0.0.1:39187`. Keep the process running for user review.

- [ ] **Step 5: Verify rebuilt browser workflows**

At `http://127.0.0.1:39187/manage/modules/alerts`, verify grouped new-alert options, create one alert from each new group, inspect normal/edge samples and applicable conditions, and confirm the starter set was not expanded. At Event Sources, verify a scope-deficient Twitch grant shows the reconnect action and that statuses refresh without a manual page reload.

- [ ] **Step 6: Complete OpenSpec, commit, and push**

Mark tasks `6.1` through `6.4` complete, re-run strict validation, then:

```powershell
git add apps/server/src/modules/events/event-pipeline.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts docs/product-plan.md openspec/changes/add-normalized-twitch-event-types/tasks.md
git commit -m "test: verify expanded Twitch event workflow"
git push origin codex/refactor-management-ui-ux
```

Record the final commit IDs, gate results, running PID, and live URL in the completion report.
