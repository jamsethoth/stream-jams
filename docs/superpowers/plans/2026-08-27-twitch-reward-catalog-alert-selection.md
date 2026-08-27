# Twitch Reward Catalog Alert Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator load the linked Twitch broadcaster's custom rewards and create or edit one shared channel-point alert that matches any selected reward.

**Architecture:** `packages/core` owns the discriminated `oneOf` condition, reward-selection projection, overlap semantics, management contracts, and response validation. `apps/server` adds one on-demand catalog service that reuses the existing OAuth lifecycle and exposes a protected sanitized endpoint; no token or catalog enters browser storage. `apps/web` uses one reusable catalog-backed picker in Add alert and the focused editor while the existing normalized event, EventSub subscription, SQLite JSON storage, matcher, preview, and playback paths remain authoritative.

**Tech Stack:** TypeScript 6, Zod 4, Node.js 24, Fastify 5, React 19, Vite 8, Vitest 4, Testing Library, Storybook 10, Playwright 1.61, SQLite, OpenSpec.

**Spec:** `openspec/changes/add-twitch-reward-catalog-alert-selection/design.md`, `openspec/changes/add-twitch-reward-catalog-alert-selection/specs/twitch-reward-catalog/spec.md`, and `openspec/changes/add-twitch-reward-catalog-alert-selection/specs/alert-configuration-management/spec.md`

## Global Constraints

- Use Twitch `GET /helix/channel_points/custom_rewards` with the linked user's access token, the linked account ID as `broadcaster_id`, and no `only_manageable_rewards=true` filter.
- Return at most 50 validated custom rewards with ID, title, prompt, cost, background color, user-input requirement, and enabled, paused, and in-stock state; omit images, provider URLs, raw bodies, automatic rewards, Power-Ups, and redemption history.
- Keep the catalog management-authenticated, rate-limited, server-side, on demand, and non-persistent. Fetch when the relevant picker opens and on explicit refresh; do not poll.
- On a catalog HTTP 401, reuse the existing OAuth refresh lifecycle and retry exactly once. Distinguish disconnected, missing-scope, reconnect-required, ineligible-channel, and retryable provider states without exposing secrets.
- `oneOf` is exact scalar string membership and is authored only for `channelPointReward`; accept 1 through 50 non-empty unique IDs. All other conditions retain existing AND semantics.
- Existing `channelPointReward equals <rewardId>` data must read, edit, export, restore, and match unchanged. Merely opening and saving an alert must not rewrite it to `oneOf`; an explicit picker change may replace it.
- `Every custom reward, including future rewards` stores no reward condition. `Selected rewards` stores one `oneOf` condition. `Select all currently listed` is a snapshot and never auto-adds later rewards.
- Stable reward IDs are persisted; catalog titles and statuses are presentation-only. Missing IDs remain visible as `Unavailable reward` with their ID and are never removed automatically.
- Disabled, paused, and out-of-stock custom rewards remain selectable and display their status.
- Potential overlap with another active rule is a non-blocking warning. The resolver continues to play every matching active alert without hidden precedence or deduplication.
- Direct Twitch and Streamer.bot continue to match the same canonical `rewardId`; do not add an intake-provider condition or per-reward EventSub subscription.
- Preview and Send test continue targeting the selected alert. Condition explanation alone reports whether the normalized session sample is live-rule eligible.
- Add no dependency, SQLite table, column, migration, durable catalog cache, remote image load, reward mutation, reward lifecycle subscription, or general Boolean condition tree.
- Browser-visible changes use semantic management CSS variables, accessible labeled controls, production components in Storybook, typed API mocks, role/label tests, and loading, populated, inactive, empty, failure, and unresolved states.
- Keep OpenSpec task checkboxes unchanged until implementation evidence exists. Do not sync/archive the change, push, create a PR, or merge without the corresponding explicit workflow and approval.

---

### Task 1: Add the core reward-membership condition and pure selection helpers

**Files:**
- Create: `packages/core/src/alerts/channel-point-reward-selection.ts`
- Create: `packages/core/src/alerts/channel-point-reward-selection.test.ts`
- Modify: `packages/core/src/alerts/types.ts:10-14`
- Modify: `packages/core/src/alerts/schemas.ts:16-20`
- Modify: `packages/core/src/alerts/schemas.test.ts`
- Modify: `packages/core/src/alerts/condition-evaluator.ts:8-24`
- Modify: `packages/core/src/alerts/condition-evaluator.test.ts`
- Modify: `packages/core/src/alerts/variation-authoring.ts:13-29,126-140,196-244,612-680`
- Modify: `packages/core/src/alerts/variation-authoring.test.ts`
- Modify: `packages/core/src/index.ts:50-90`

**Interfaces:**
- Produces: `channelPointRewardIdsSchema`, `channelPointRewardSelectionSchema`, `ChannelPointRewardSelection`, `readChannelPointRewardSelection(conditions)`, `replaceChannelPointRewardSelection(conditions, selection)`, and `channelPointRewardSelectionsMayOverlap(left, right)`.
- Produces: `ScalarAlertConditionOperator = "equals" | "min" | "max" | "range" | "includes"` for generic scalar/range authoring controls.
- Produces: `AlertCondition` as a union whose new branch is exactly `{ field: "channelPointReward"; operator: "oneOf"; value: readonly string[] }`.
- Preserves: every existing scalar/range condition branch and the existing `channelPointReward` → normalized `rewardId` alias.

- [ ] **Step 1: Write failing schema and helper tests**

Add table-driven cases for 1 and 50 unique IDs, and rejection cases for 0 and 51 IDs, whitespace-only IDs, duplicates after trimming, a non-string member, and `oneOf` on `rewardTitle`. Add pure-helper cases for catch-all extraction, legacy `equals` extraction, `oneOf` extraction, explicit conversion, removal back to catch-all, selected-set intersection, disjoint sets, and either-side catch-all.

```ts
expect(alertConditionSchema.parse({
  field: "channelPointReward",
  operator: "oneOf",
  value: ["reward-a", "reward-b"]
})).toEqual({
  field: "channelPointReward",
  operator: "oneOf",
  value: ["reward-a", "reward-b"]
});

expect(readChannelPointRewardSelection([
  { field: "channelPointReward", operator: "equals", value: "reward-a" }
])).toEqual({ mode: "selected", rewardIds: ["reward-a"] });

expect(channelPointRewardSelectionsMayOverlap(
  { mode: "selected", rewardIds: ["reward-a", "reward-b"] },
  { mode: "selected", rewardIds: ["reward-b", "reward-c"] }
)).toBe(true);
```

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/alerts/schemas.test.ts packages/core/src/alerts/channel-point-reward-selection.test.ts packages/core/src/alerts/condition-evaluator.test.ts packages/core/src/alerts/variation-authoring.test.ts
```

Expected: failures because `oneOf`, the selection schema, and the pure helpers do not exist.

- [ ] **Step 3: Define the discriminated condition and selection contracts**

Use separate condition branches so adding a string array cannot make arrays valid for `equals`, `includes`, or numeric operators.

```ts
export type ScalarAlertConditionOperator = "equals" | "min" | "max" | "range" | "includes";

export type AlertCondition =
  | {
      readonly field: string;
      readonly operator: ScalarAlertConditionOperator;
      readonly value: string | number | boolean | readonly [number, number];
    }
  | {
      readonly field: "channelPointReward";
      readonly operator: "oneOf";
      readonly value: readonly string[];
    };

export const channelPointRewardIdsSchema = z.array(nonEmptyStringSchema)
  .min(1)
  .max(50)
  .superRefine((rewardIds, refinement) => {
    if (new Set(rewardIds).size !== rewardIds.length) {
      refinement.addIssue({ code: "custom", message: "Reward selections must be unique" });
    }
  });

export const channelPointRewardSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("selected"), rewardIds: channelPointRewardIdsSchema })
]);

export type ChannelPointRewardSelection = z.infer<typeof channelPointRewardSelectionSchema>;
```

Make `alertConditionSchema` a union of the existing scalar/range object and a literal `channelPointReward`/`oneOf` object using `channelPointRewardIdsSchema`.

- [ ] **Step 4: Implement selection conversion and overlap without rewriting untouched input**

`readChannelPointRewardSelection` treats no reward condition as catch-all, a valid legacy `equals` string as a one-ID presentation selection, and `oneOf` as a selected set. `replaceChannelPointRewardSelection` is called only after explicit user interaction; it removes all reward-ID conditions for catch-all or replaces the first reward-ID condition with one `oneOf` condition while preserving the relative order of unrelated conditions.

```ts
export function channelPointRewardSelectionsMayOverlap(
  left: ChannelPointRewardSelection,
  right: ChannelPointRewardSelection
): boolean {
  if (left.mode === "all" || right.mode === "all") return true;
  const rightIds = new Set(right.rewardIds);
  return left.rewardIds.some((rewardId) => rightIds.has(rewardId));
}
```

- [ ] **Step 5: Add evaluator, authoring validation, and summary behavior**

Add a `oneOf` evaluator branch that returns true only for an actual string exactly present in a string-array condition value. Add `oneOf` to the `channelPointReward` definition only, validate its array with `channelPointRewardIdsSchema`, and format it as `Reward ID is one of reward-a, reward-b`. Add one evaluator case for direct Twitch and one for Streamer.bot with the same normalized `rewardId`, asserting identical results. Do not alter `includes`.

```ts
case "oneOf":
  return typeof actual === "string"
    && Array.isArray(condition.value)
    && condition.value.every((candidate) => typeof candidate === "string")
    && condition.value.includes(actual);
```

- [ ] **Step 6: Re-run focused core tests and typecheck**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/alerts/schemas.test.ts packages/core/src/alerts/channel-point-reward-selection.test.ts packages/core/src/alerts/condition-evaluator.test.ts packages/core/src/alerts/alert-matcher.test.ts packages/core/src/alerts/variation-authoring.test.ts
corepack.cmd pnpm --filter @stream-jams/core typecheck
```

Expected: all focused core tests pass and core typechecking exits 0.

- [ ] **Step 7: Commit the core condition contract**

```powershell
git add packages/core/src/alerts packages/core/src/index.ts
git commit -m "feat(alerts): add reward set matching"
```

### Task 2: Add catalog and alert-create management contracts

**Files:**
- Create: `packages/core/src/management/twitch-reward-catalog.ts`
- Create: `packages/core/src/management/twitch-reward-catalog.test.ts`
- Modify: `packages/core/src/management/contracts.ts:261-265,1050-1070`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `packages/core/src/index.ts:220-225`

**Interfaces:**
- Consumes: `channelPointRewardSelectionSchema` and `ChannelPointRewardSelection` from Task 1.
- Produces: `twitchCustomRewardSchema`, `twitchCustomRewardCatalogSchema`, `TwitchCustomReward`, and `TwitchCustomRewardCatalog`.
- Produces: optional wire field `AlertCreateRequestInput.channelPointRewardSelection`; omission retains legacy catch-all creation. Parsed selected mode is valid only for `channel_point_redemption`.

- [ ] **Step 1: Write failing catalog-contract tests**

Validate a complete reward, a 50-reward catalog, and an empty catalog. Reject missing IDs, blank titles, zero/non-integer cost, malformed colors, missing state booleans, 51 rewards, provider image/URL keys under strict object parsing, and an unknown top-level key.

```ts
expect(twitchCustomRewardCatalogSchema.parse({ rewards: [{
  id: "reward-hydrate",
  title: "Hydrate",
  prompt: "Drink some water",
  cost: 500,
  backgroundColor: "#00E5CB",
  isUserInputRequired: false,
  isEnabled: true,
  isPaused: false,
  isInStock: true
}] }).rewards[0]?.id).toBe("reward-hydrate");
```

- [ ] **Step 2: Run the catalog-contract test and verify RED**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/management/twitch-reward-catalog.test.ts
```

Expected: failure because the catalog module does not exist.

- [ ] **Step 3: Implement the strict sanitized catalog schemas**

```ts
export const twitchCustomRewardSchema = z.object({
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  prompt: z.string(),
  cost: positiveIntegerSchema,
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/u),
  isUserInputRequired: z.boolean(),
  isEnabled: z.boolean(),
  isPaused: z.boolean(),
  isInStock: z.boolean()
}).strict();

export const twitchCustomRewardCatalogSchema = z.object({
  rewards: z.array(twitchCustomRewardSchema).max(50)
}).strict();
```

- [ ] **Step 4: Write failing alert-create contract tests**

Cover explicit catch-all, one selected reward, 50 selected rewards, omitted-selection compatibility, and rejection of empty/duplicate/51-ID selections. Assert that `channelPointRewardSelection` is rejected for `raid` and every other non-redemption event type.

```ts
expect(alertCreateInputSchema.parse({
  eventType: "channel_point_redemption",
  name: "Hydration rewards",
  channelPointRewardSelection: { mode: "selected", rewardIds: ["reward-a", "reward-b"] }
}).channelPointRewardSelection).toEqual({
  mode: "selected",
  rewardIds: ["reward-a", "reward-b"]
});
```

- [ ] **Step 5: Add the optional, event-scoped create field**

```ts
export const alertCreateInputSchema = z.object({
  eventType: streamEventTypeSchema,
  name: z.string().trim().min(1).max(120),
  themeId: alertStarterThemeIdSchema.default(defaultAlertStarterThemeId),
  channelPointRewardSelection: channelPointRewardSelectionSchema.optional()
}).superRefine((input, refinement) => {
  if (input.eventType !== "channel_point_redemption" && input.channelPointRewardSelection !== undefined) {
    refinement.addIssue({
      code: "custom",
      path: ["channelPointRewardSelection"],
      message: "Reward selection is available only for channel point redemption alerts"
    });
  }
});
```

Keep `AlertCreateRequestInput = z.input<typeof alertCreateInputSchema>` for callers and `AlertCreateInput = z.output<typeof alertCreateInputSchema>` for the server boundary.

- [ ] **Step 6: Run focused contracts and core typecheck**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/management/twitch-reward-catalog.test.ts packages/core/src/management/contracts.test.ts
corepack.cmd pnpm --filter @stream-jams/core typecheck
```

Expected: catalog and create-input tests pass and core typechecking exits 0.

- [ ] **Step 7: Commit the management contracts**

```powershell
git add packages/core/src/management packages/core/src/index.ts
git commit -m "feat(twitch): define reward catalog contracts"
```

### Task 3: Retrieve the linked broadcaster catalog through a protected server route

**Files:**
- Create: `apps/server/src/modules/twitch/twitch-reward-catalog-service.ts`
- Create: `apps/server/src/modules/twitch/twitch-reward-catalog-service.test.ts`
- Create: `apps/server/src/http/routes/twitch-reward-catalog.ts`
- Create: `apps/server/src/http/routes/twitch-reward-catalog.test.ts`
- Modify: `apps/server/src/modules/twitch/twitch-api-client.ts:1-180,220-320`
- Modify: `apps/server/src/modules/twitch/twitch-api-client.test.ts`
- Modify: `apps/server/src/app.ts:1-70,185-205,380-410`
- Modify: `apps/server/src/app.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts:293,401-470,815-835`
- Modify: `apps/server/src/runtime/runtime-composition.test.ts`

**Interfaces:**
- Consumes: `TwitchCustomRewardCatalog`, the existing `TwitchOAuthService.validateConnectedAccount()`/`refreshConnectedAccount()`, `TwitchAccountRepository.findConnectedAccount()`, `SecretStore.getSecret()`, and `createTwitchTokenSecretRef()`.
- Produces: narrow `TwitchRewardApiClient.getCustomRewards({ accessToken, clientId, broadcasterId }): Promise<TwitchCustomRewardCatalog>`; do not add the catalog method to the OAuth-only `TwitchApiClient` interface.
- Produces: `TwitchRewardCatalogService.listCustomRewards(): Promise<TwitchCustomRewardCatalog>`.
- Produces: authenticated `GET /twitch/custom-rewards` and bounded codes `TWITCH_REWARD_CATALOG_DISCONNECTED`, `TWITCH_REWARD_CATALOG_SCOPE_REQUIRED`, `TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED`, `TWITCH_REWARD_CATALOG_INELIGIBLE`, and `TWITCH_REWARD_CATALOG_PROVIDER_ERROR`.

- [ ] **Step 1: Write failing Twitch API client tests**

Assert an encoded request to `/channel_points/custom_rewards?broadcaster_id=broadcaster-1`, `Authorization: Bearer`, `Client-Id`, absence of `only_manageable_rewards`, complete projection of enabled/paused/out-of-stock rewards, successful empty data, and rejection of invalid JSON, more than 50 records, malformed required fields, and non-2xx responses.

```ts
await client.getCustomRewards({
  accessToken: "access-token",
  clientId: "client-id",
  broadcasterId: "broadcaster-1"
});

expect(fetcher).toHaveBeenCalledWith(
  "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=broadcaster-1",
  expect.objectContaining({ headers: {
    authorization: "Bearer access-token",
    "client-id": "client-id"
  } })
);
```

- [ ] **Step 2: Run the API client test and verify RED**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/twitch/twitch-api-client.test.ts
```

Expected: failure because `getCustomRewards` is absent.

- [ ] **Step 3: Implement raw Twitch projection at the client boundary**

Add `TwitchCustomRewardsRequest` and a separate `TwitchRewardApiClient` interface. Make `DefaultTwitchApiClient` implement both the existing OAuth `TwitchApiClient` and the new reward interface so OAuth test doubles do not acquire an unrelated required method. Parse `body.data` as an array, map Twitch snake-case fields to the strict core contract, then call `twitchCustomRewardCatalogSchema.parse({ rewards })`. Never include `image`, `default_image`, or unknown raw fields in the returned object.

```ts
return twitchCustomRewardCatalogSchema.parse({
  rewards: body.data.map((reward) => ({
    id: reward.id,
    title: reward.title,
    prompt: reward.prompt,
    cost: reward.cost,
    backgroundColor: reward.background_color,
    isUserInputRequired: reward.is_user_input_required,
    isEnabled: reward.is_enabled,
    isPaused: reward.is_paused,
    isInStock: reward.is_in_stock
  }))
});
```

- [ ] **Step 4: Write failing catalog-service tests**

Test connected success, empty success, inactive rewards retained, disconnected account, missing `channel:read:redemptions`, missing access-token secret, initial validation failure, first-call 401 followed by one refresh and success, refresh failure, second 401 with no third call, Twitch 403 as ineligible, and other provider/response errors preserved for bounded route mapping. Assert calls and captured logs never contain access or refresh tokens.

```ts
expect(apiClient.getCustomRewards).toHaveBeenCalledTimes(2);
expect(oauthService.refreshConnectedAccount).toHaveBeenCalledTimes(1);
expect(secretStore.getSecret).toHaveBeenCalledWith(
  createTwitchTokenSecretRef("broadcaster-1", "access_token")
);
```

- [ ] **Step 5: Implement one lifecycle owner and one retry**

Define a domain error class whose code union contains only the four actionable account/channel states. Before the first catalog call, validate the connected account without connection-change notifications, confirm the required scope, and read the current access token. On `TwitchApiHttpError` status 401, call `refreshConnectedAccount({ notifyConnectionChanged: false })`, re-read account/token, and issue one final catalog call. Map status 403 to ineligible; after the final 401 return reconnect-required. Propagate other provider errors without raw bodies.

```ts
export class TwitchRewardCatalogError extends Error {
  constructor(
    readonly code:
      | "TWITCH_REWARD_CATALOG_DISCONNECTED"
      | "TWITCH_REWARD_CATALOG_SCOPE_REQUIRED"
      | "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED"
      | "TWITCH_REWARD_CATALOG_INELIGIBLE",
    message: string
  ) {
    super(message);
    this.name = "TwitchRewardCatalogError";
  }
}
```

- [ ] **Step 6: Write and implement the protected route**

The route dependency is a pick exposing only `listCustomRewards`, plus existing management auth/rate-limit hooks and optional logger. Use status 409 for disconnected/scope/reconnect, 422 for ineligible, and 502 with `TWITCH_REWARD_CATALOG_PROVIDER_ERROR` for other Twitch/OAuth/response failures. Use a 500 only for unknown errors handled by the global boundary.

```ts
app.get("/twitch/custom-rewards", { preHandler }, async (_request, reply) => {
  try {
    return twitchCustomRewardCatalogSchema.parse(
      await dependencies.twitchRewardCatalogService.listCustomRewards()
    );
  } catch (error) {
    return sendTwitchRewardCatalogError(reply, error);
  }
});
```

Fastify injection tests must prove missing management sessions are rejected before service invocation, the management rate limit is applied, response schemas are sanitized, and every bounded error maps to the specified HTTP status/code.

- [ ] **Step 7: Wire the optional route group into app and runtime composition**

Add `TwitchRewardCatalogRouteDependencies` as a partial `ServerAppDependencies` member, register only when `twitchRewardCatalogService` exists, and require service plus both management hooks in the dependency guard. Add a narrow optional `twitchRewardApiClient` runtime-composition input for tests. In production, create one `DefaultTwitchApiClient` and reuse it for the OAuth and reward interfaces; when tests inject an OAuth fake and a reward fake, keep the two structural contracts independent. Instantiate the service after `TwitchOAuthService` so it can share `twitchAccountRepository`, `secretStore`, and `twitchClientId`. Add a runtime composition assertion that the production app answers the route through the injected fake reward API client.

- [ ] **Step 8: Run focused server verification**

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm exec vitest run apps/server/src/modules/twitch/twitch-api-client.test.ts apps/server/src/modules/twitch/twitch-oauth-service.test.ts apps/server/src/modules/twitch/twitch-eventsub-client.test.ts apps/server/src/modules/twitch/twitch-reward-catalog-service.test.ts apps/server/src/http/routes/twitch-reward-catalog.test.ts apps/server/src/app.test.ts apps/server/src/runtime/runtime-composition.test.ts
corepack.cmd pnpm --filter @stream-jams/server typecheck
```

Expected: every focused server test passes and server typechecking exits 0.

- [ ] **Step 9: Commit the protected catalog path**

```powershell
git add apps/server/src
git commit -m "feat(twitch): expose custom reward catalog"
```

### Task 4: Persist selected reward sets during alert creation without a migration

**Files:**
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.ts:165-185,870-910`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- Modify: `apps/server/src/http/routes/management-ui.ts:298-315`
- Modify: `apps/server/src/http/routes/management-ui.test.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-repository.test.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.test.ts`

**Interfaces:**
- Consumes: parsed `AlertCreateInput.channelPointRewardSelection` and `replaceChannelPointRewardSelection` from Tasks 1–2.
- Produces: selected-mode creation as one disabled rule containing one `channelPointReward oneOf [...]` condition; catch-all and omitted legacy creation retain `conditions: []`.
- Preserves: existing `value_json` serialization and backup archive version; no production repository or backup-store code change is expected.

- [ ] **Step 1: Write failing create-service and HTTP boundary tests**

Cover selected creation with one and multiple IDs, explicit catch-all, omitted-selection compatibility, selected creation with theme choice, invalid empty/duplicate/oversized selection, and rejection of reward selection on a non-redemption event. Assert a failed request commits no rule, metadata, or editor document.

```ts
const created = await service.createAlert("set-default", alertCreateInputSchema.parse({
  eventType: "channel_point_redemption",
  name: "Hydration choices",
  themeId: "clean-signal",
  channelPointRewardSelection: { mode: "selected", rewardIds: ["reward-a", "reward-b"] }
}));

expect(created.conditions).toEqual([{
  field: "channelPointReward",
  operator: "oneOf",
  value: ["reward-a", "reward-b"]
}]);
expect(created.enabled).toBe(false);
expect(created.reviewState).toBe("needs-review");
```

- [ ] **Step 2: Run focused create tests and verify RED**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/http/routes/management-ui.test.ts
```

Expected: selected creation returns an empty rule condition or the route contract rejects the new field.

- [ ] **Step 3: Thread the parsed selection into atomic rule materialization**

Keep parsing in the HTTP route. In `createAlert`, derive conditions only for `channel_point_redemption`, default omission to `{ mode: "all" }`, and pass them into `starterRuleInput`. Do not reparse provider data or perform a catalog lookup during creation.

```ts
const rewardSelection = input.channelPointRewardSelection ?? { mode: "all" as const };
const conditions = input.eventType === "channel_point_redemption"
  ? replaceChannelPointRewardSelection([], rewardSelection)
  : [];
const created = this.#materializeRule(
  starterRuleInput(setId, template, input.name, conditions)
);
```

Update invalid-input copy to mention reward selection without exposing IDs: `Choose a supported event type, reward selection, and starter theme, and enter an alert name between 1 and 120 characters.`

- [ ] **Step 4: Add failing SQLite and backup round-trip tests**

Save a rule with `oneOf`, close and reopen the repository, and assert array order and IDs are exact. Export a configuration backup containing the same rule, preflight/restore it into the test data directory, and assert the restored repository returns the same condition. Add a legacy `equals` fixture and assert it is not converted.

```ts
expect(restoredRule.conditions).toEqual([{
  field: "channelPointReward",
  operator: "oneOf",
  value: ["reward-a", "reward-b"]
}]);
expect(restoredLegacyRule.conditions).toEqual([{
  field: "channelPointReward",
  operator: "equals",
  value: "reward-a"
}]);
```

- [ ] **Step 5: Run persistence, backup, and service verification**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/http/routes/management-ui.test.ts apps/server/src/modules/alerts/sqlite-alert-repository.test.ts apps/server/src/modules/backup/configuration-backup-service.test.ts
corepack.cmd pnpm --filter @stream-jams/server typecheck
```

Expected: all focused tests pass with no new migration or backup version change.

- [ ] **Step 6: Commit alert creation and portability**

```powershell
git add apps/server/src/modules/alerts apps/server/src/modules/backup/configuration-backup-service.test.ts apps/server/src/http/routes/management-ui.ts apps/server/src/http/routes/management-ui.test.ts
git commit -m "feat(alerts): create shared reward alerts"
```

### Task 5: Build the typed web catalog client, reusable picker, and overlap projection

**Files:**
- Create: `apps/web/src/management/alerts/TwitchRewardPicker.tsx`
- Create: `apps/web/src/management/alerts/TwitchRewardPicker.test.tsx`
- Create: `apps/web/src/management/alerts/TwitchRewardPicker.stories.tsx`
- Create: `apps/web/src/management/alerts/twitch-reward-picker.css`
- Create: `apps/web/src/management/alerts/channel-point-reward-overlap.ts`
- Create: `apps/web/src/management/alerts/channel-point-reward-overlap.test.ts`
- Modify: `apps/web/src/management/management-api.ts:1-55,248-310,350-385`
- Modify: `apps/web/src/management/management-api.test.ts`
- Modify: `apps/web/src/stories/mock-apis.ts`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/management/ManagementApp.test.tsx`

**Interfaces:**
- Consumes: core `TwitchCustomRewardCatalog`, `ChannelPointRewardSelection`, `readChannelPointRewardSelection`, and `channelPointRewardSelectionsMayOverlap`.
- Produces: `ManagementApi.getTwitchCustomRewards(): Promise<TwitchCustomRewardCatalog>` using `GET /twitch/custom-rewards` and `twitchCustomRewardCatalogSchema`.
- Produces: `TwitchRewardPicker({ selection, loadRewards, onChange, disabled?, overlapAlertNames?, sampleRewardId?, onUseAsSample? })`.
- Produces: `TwitchRewardSampleChoice = { rewardId: string; rewardTitle: string }`.
- Produces: `findOverlappingChannelPointAlertNames(inventory, selection, excludedRuleId)` filtering to other enabled default custom-redemption rules.
- Test fixture: `customReward(id, title, overrides?)` returns a complete `TwitchCustomReward` with safe defaults and applies typed overrides.

- [ ] **Step 1: Write failing management API tests**

Assert the exact GET path, strict parsing of a populated and empty response, acceptance of all status combinations, and rejection of leaked token/image keys, malformed fields, 51 rewards, or an unknown top-level key.

```ts
await expect(api.getTwitchCustomRewards()).resolves.toEqual({
  rewards: [customReward("reward-hydrate", "Hydrate")]
});
expect(fetcher).toHaveBeenCalledWith(
  "/twitch/custom-rewards",
  expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer session-1" }) })
);

function customReward(
  id: string,
  title: string,
  overrides: Partial<TwitchCustomReward> = {}
): TwitchCustomReward {
  return {
    id,
    title,
    prompt: "",
    cost: 500,
    backgroundColor: "#00E5CB",
    isUserInputRequired: false,
    isEnabled: true,
    isPaused: false,
    isInStock: true,
    ...overrides
  };
}
```

- [ ] **Step 2: Add the API method and update complete ManagementApi fixtures**

Use `getContract("/twitch/custom-rewards", twitchCustomRewardCatalogSchema, "Unable to load Twitch custom rewards.")`. Add safe empty-catalog defaults to `createStoryManagementApi`, `App.test.tsx`, and `ManagementApp.test.tsx`; scoped page APIs remain picks and need the method only when their component consumes it.

- [ ] **Step 3: Write failing overlap-projection tests**

Use inventory rows to prove selected intersection and either-side catch-all return names; disjoint sets, disabled rules, variations, other event types, and the excluded current rule do not.

```ts
expect(findOverlappingChannelPointAlertNames(
  inventory,
  { mode: "selected", rewardIds: ["reward-hydrate"] },
  "alert-current"
)).toEqual(["General channel points"]);
```

- [ ] **Step 4: Implement the pure management projection**

Filter `kind === "default"`, `enabled === true`, `eventType === "channel_point_redemption"`, and `id !== excludedRuleId`; read each row's saved selection with the core helper and return stable inventory-order names whose coverage may overlap.

- [ ] **Step 5: Write failing picker interaction tests**

Cover initial loading, loaded rewards, explicit refresh, retry after failure, empty success, disconnected/scope/reconnect/ineligible/provider errors, two selected checkboxes, select-all snapshot, clear selection, catch-all radio, disabled controls, paused/disabled/out-of-stock/user-input labels, and unresolved selected IDs before and after catalog failure. Assert no `<img>` or provider URL is rendered.

Also test sample behavior: an outside sample defaults once to the first selected reward after the request settles, an already-matching sample is unchanged, and `Use as sample` emits the stable ID/current title.

```tsx
render(<TwitchRewardPicker
  loadRewards={async () => ({ rewards: [
    customReward("reward-a", "Hydrate"),
    customReward("reward-b", "Stretch", { isPaused: true })
  ] })}
  onChange={onChange}
  selection={{ mode: "selected", rewardIds: ["reward-a"] }}
/>);

expect(await screen.findByRole("checkbox", { name: /Hydrate/u })).toBeChecked();
expect(screen.getByText("Paused")).toBeInTheDocument();
```

- [ ] **Step 6: Implement the picker with bounded request state**

Use one effect generation/ref guard so stale requests and React Strict Mode do not overwrite newer refreshes. Render mode radios in a fieldset, one labeled checkbox per returned reward, `Select all currently listed`, `Clear selection`, and `Refresh rewards`. Merge selected IDs with the catalog by stable ID; render every missing ID as an unavailable row. Preserve first-selected order when toggling.

Map `ManagementHttpError.code` to actionable copy:

| Code | Summary | Next action |
|---|---|---|
| `TWITCH_REWARD_CATALOG_DISCONNECTED` | Twitch is not connected | Open `/manage/event-sources` and connect Twitch |
| `TWITCH_REWARD_CATALOG_SCOPE_REQUIRED` | Twitch permission update required | Reconnect Twitch from Event sources |
| `TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED` | Twitch authorization expired | Reconnect Twitch, then retry |
| `TWITCH_REWARD_CATALOG_INELIGIBLE` | Custom rewards are unavailable for this channel | Confirm Affiliate/Partner eligibility |
| other | Twitch rewards could not be loaded | Retry; existing IDs remain editable |

After request settlement, if selected mode has IDs and `sampleRewardId` is outside them, call `onUseAsSample` once with the first ID and its current title or `Unavailable reward`.

- [ ] **Step 7: Add production-component Storybook states**

Stories: `LoadingCatalog`, `PopulatedMultiSelection`, `InactiveRewards`, `EmptyCatalog`, `Disconnected`, `ProviderFailure`, and `UnavailableSavedReward`. Use typed local fixtures, no external URLs, and play assertions for the main label/status in each state.

- [ ] **Step 8: Run focused web component verification**

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm exec vitest run apps/web/src/management/management-api.test.ts apps/web/src/management/alerts/channel-point-reward-overlap.test.ts apps/web/src/management/alerts/TwitchRewardPicker.test.tsx apps/web/src/App.test.tsx apps/web/src/management/ManagementApp.test.tsx
corepack.cmd pnpm --filter @stream-jams/web typecheck
corepack.cmd pnpm --filter @stream-jams/web build-storybook
```

Expected: focused tests, web typechecking, and Storybook build pass.

- [ ] **Step 9: Commit the client and picker**

```powershell
git add apps/web/src
git commit -m "feat(alerts): add Twitch reward picker"
```

### Task 6: Integrate reward selection into Add alert

**Files:**
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx:1-45,70-120,320-365,1180-1230`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/alert-sets-page.css`

**Interfaces:**
- Consumes: `TwitchRewardPicker`, `ChannelPointRewardSelection`, `findOverlappingChannelPointAlertNames`, and `ManagementApi.getTwitchCustomRewards` from Tasks 1 and 5.
- Produces: explicit `channelPointRewardSelection` only on channel-point create requests; all other event payloads remain unchanged.
- Preserves: event/name/theme state, disabled/Needs-review creation, server-error input retention, and current focus/refresh behavior.

- [ ] **Step 1: Write failing Add alert workflow tests**

Test switching to Channel point redemption loads rewards, selecting two sends one selected-mode payload, catch-all sends `{ mode: "all" }`, Select all sends only the IDs present in that response, empty selected mode disables Create, provider error retains name/theme/selection, event switching removes the property from a Raid request, dialog reopen resets catch-all, and an intersecting active rule shows a non-blocking warning while Create remains enabled.

```ts
expect(managementApi.createAlert).toHaveBeenCalledWith("set-default", {
  eventType: "channel_point_redemption",
  name: "Shared hydration",
  themeId: "clean-signal",
  channelPointRewardSelection: {
    mode: "selected",
    rewardIds: ["reward-hydrate", "reward-stretch"]
  }
});
```

- [ ] **Step 2: Run the focused page test and verify RED**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/AlertSetsPage.test.tsx
```

Expected: no catalog method is called and the create payload has no reward selection.

- [ ] **Step 3: Add create-dialog selection state and reset rules**

Initialize `createAlertRewardSelection` to `{ mode: "all" }` whenever the dialog opens. Reset to catch-all when changing away from `channel_point_redemption`; start catch-all when changing into it. Keep selection in state after a failed submit.

```ts
const [createAlertRewardSelection, setCreateAlertRewardSelection] =
  useState<ChannelPointRewardSelection>({ mode: "all" });

const overlapAlertNames = useMemo(() =>
  findOverlappingChannelPointAlertNames(
    detail?.inventory ?? [],
    createAlertRewardSelection,
    null
  ),
  [createAlertRewardSelection, detail]
);
```

- [ ] **Step 4: Render the picker only for custom-redemption creation**

Place it between Alert name and starter theme. Pass `loadRewards={() => managementApi.getTwitchCustomRewards()}`, selection, change handler, busy state, and overlap names. The picker owns loading/empty/error copy; the dialog owns form validity.

- [ ] **Step 5: Send event-scoped payloads and enforce selected-mode validity**

```ts
const rewardSelectionInput = createAlertEventType === "channel_point_redemption"
  ? { channelPointRewardSelection: createAlertRewardSelection }
  : {};

await managementApi.createAlert(detail.overview.id, {
  eventType: createAlertEventType,
  name: createAlertName.trim(),
  themeId: createAlertThemeId,
  ...rewardSelectionInput
});
```

Disable Create when selected mode has zero IDs, even though the picker also shows its inline correction. Keep catch-all valid with an empty catalog.

- [ ] **Step 6: Update stories with typed catalog fixtures**

Add an Add-alert channel-point story with two selected rewards and an overlap warning, plus an empty-catalog state. Reuse `createStoryManagementApi` and production `CreateAlertDialog` through `AlertSetsPage`; do not story private markup.

- [ ] **Step 7: Run Add alert verification**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/AlertSetsPage.test.tsx
corepack.cmd pnpm --filter @stream-jams/web typecheck
corepack.cmd pnpm --filter @stream-jams/web build
```

Expected: the Add alert workflow tests pass and the web package typechecks/builds.

- [ ] **Step 8: Commit Add alert integration**

```powershell
git add apps/web/src/management/alerts/AlertSetsPage.tsx apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/alerts/AlertSetsPage.stories.tsx apps/web/src/management/alerts/alert-sets-page.css
git commit -m "feat(alerts): select rewards during creation"
```

### Task 7: Integrate catalog-backed rule editing, unresolved IDs, overlap, and samples

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEventInspector.tsx:1-120,305-480`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx:1-100,175-280,449-490,630-665,1090-1150,1280-1325`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`

**Interfaces:**
- Consumes: picker and overlap projection from Task 5, plus `readChannelPointRewardSelection` and `replaceChannelPointRewardSelection` from Task 1.
- Produces: rule-wide picker editing in the Event inspector; variation conditions retain the generic exact-ID control and cannot author `oneOf`.
- Produces: `applyRewardToSessionSample({ rewardId, rewardTitle })`, updating only `sampleDraft`/validation state.
- Preserves: untouched legacy `equals`, unsupported-condition read-only behavior, editor undo/save/live-impact flows, built-in sample definitions, and Preview/Send-test selected-alert behavior.

- [ ] **Step 1: Write failing editor tests for saved-condition compatibility**

Load a default alert containing legacy `equals`, open the Event inspector, let the catalog fail, save without touching the picker, and assert the saved document still contains `equals`. Then explicitly add a second reward and assert it becomes one `oneOf` condition. Cover removing all through catch-all, unresolved ID preservation across save/reload, refreshed title/status reconciliation by ID, deleted ID retention, and an account-switch catalog with entirely different IDs.

```ts
expect(managementApi.saveAlertEditorDocument).toHaveBeenCalledWith(
  "alert-reward",
  expect.objectContaining({
    conditions: [{ field: "channelPointReward", operator: "equals", value: "legacy-reward" }]
  }),
  false
);
```

- [ ] **Step 2: Write failing overlap and sample tests**

Test warning names for selected intersection and another catch-all, no warning for disabled/disjoint/current rules, selecting `Use as sample`, automatic first-selected fallback when the current reward is outside the set, inside/outside condition explanations, and no mutation of `document.samplePayloads`. Assert Preview and Send test remain available according to their existing profile/sample rules even when the live-rule explanation is no-match.

- [ ] **Step 3: Run the focused editor test and verify RED**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
```

Expected: no reward picker is present and session samples cannot be populated from catalog rewards.

- [ ] **Step 4: Add dedicated picker props to the Event inspector**

Add `loadTwitchCustomRewards`, `overlapAlertNames`, `sampleRewardId`, and `onUseRewardSample`. For `channel_point_redemption`, derive the selection from `document.conditions`, render `TwitchRewardPicker`, and on explicit change call `replaceChannelPointRewardSelection` through the existing document updater.

Keep the generic `ConditionList`, but add `hiddenFields` so the rule list does not render a second Reward ID row. In generic rows, use a type-guarded `scalarOperators(definition)` helper returning `readonly ScalarAlertConditionOperator[]`; this filters `oneOf` out before `conditionWithDefault` and its scalar return type. A saved variation-level `oneOf` renders through the existing Legacy condition path and cannot be added or modified.

```tsx
<TwitchRewardPicker
  loadRewards={props.loadTwitchCustomRewards}
  onChange={(selection) => props.onChange((document) => ({
    ...document,
    conditions: [...replaceChannelPointRewardSelection(document.conditions, selection)]
  }))}
  onUseAsSample={props.onUseRewardSample}
  overlapAlertNames={props.overlapAlertNames}
  sampleRewardId={props.sampleRewardId}
  selection={readChannelPointRewardSelection(props.document.conditions)}
/>
```

- [ ] **Step 5: Compute current-rule overlap in `AlertEditorPage`**

Derive `currentRuleId` as `document.parentAlertId ?? document.id`. Call `findOverlappingChannelPointAlertNames(setDetail.inventory, selection, currentRuleId)` only for channel-point documents; pass the stable names to the inspector. Do not put overlap rules in React state or the resolver.

- [ ] **Step 6: Update the session sample without persisting catalog metadata**

```ts
const applyRewardToSessionSample = useCallback((choice: TwitchRewardSampleChoice) => {
  if (editor === null) return;
  const currentPayload = parseSample(sampleDraft) ?? {};
  const nextPayload = {
    ...currentPayload,
    rewardId: choice.rewardId,
    rewardTitle: choice.rewardTitle
  };
  setSampleDraft(JSON.stringify(nextPayload, null, 2));
  setSampleError(validateAlertSamplePayload(editor.document.eventType, nextPayload));
}, [editor, sampleDraft]);
```

Pass `samplePayload?.rewardId` only when it is a string. Do not append to or rewrite `document.samplePayloads`; Reset sample continues restoring the selected built-in payload.

- [ ] **Step 7: Add focused editor Storybook scenarios**

Add `SharedRewardSelection`, `UnavailableSavedReward`, `CatalogFailurePreservesSelection`, and `PotentialOverlapWarning`. Mock only `getTwitchCustomRewards` and existing API boundaries through `createStoryManagementApi`; use a real `AlertEditorPage` and typed documents.

- [ ] **Step 8: Run editor and shared-condition verification**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/TwitchRewardPicker.test.tsx packages/core/src/alerts/condition-evaluator.test.ts packages/core/src/alerts/variation-authoring.test.ts
corepack.cmd pnpm --filter @stream-jams/web typecheck
corepack.cmd pnpm --filter @stream-jams/web build-storybook
```

Expected: editor/picker/core tests, web typechecking, and Storybook build pass.

- [ ] **Step 9: Commit editor integration**

```powershell
git add apps/web/src/management/alerts/editor
git commit -m "feat(alerts): edit shared reward selection"
```

### Task 8: Add browser acceptance coverage, operator documentation, and final evidence

**Files:**
- Modify: `tests/e2e/management-alerts.spec.ts`
- Modify: `docs/mvp-runbook.md`
- Modify: `docs/product-plan.md:192-208`
- Modify: `openspec/changes/add-twitch-reward-catalog-alert-selection/tasks.md` only after each implementation item has evidence.

**Interfaces:**
- Consumes: all completed core, server, creation, picker, and editor work.
- Produces: browser-level acceptance evidence for the complete management workflow and operator-facing compatibility guidance.

- [ ] **Step 1: Add failing Playwright coverage for shared creation**

Route `**/twitch/custom-rewards` with local sanitized fixtures. Open Add alert, select Channel point redemption, choose Hydrate and Stretch, verify the snapshot/overlap copy, submit, capture the create request, and assert its exact `channelPointRewardSelection`. Reopen and create catch-all, asserting `{ mode: "all" }`.

```ts
await page.route("**/twitch/custom-rewards", (route) => route.fulfill({
  contentType: "application/json",
  json: { rewards: [
    customRewardFixture("reward-hydrate", "Hydrate"),
    customRewardFixture("reward-stretch", "Stretch")
  ] }
}));

function customRewardFixture(id: string, title: string) {
  return {
    id,
    title,
    prompt: "",
    cost: 500,
    backgroundColor: "#00E5CB",
    isUserInputRequired: false,
    isEnabled: true,
    isPaused: false,
    isInStock: true
  };
}
```

- [ ] **Step 2: Add failing Playwright coverage for editing and samples**

Open an editor document whose `oneOf` includes a deleted ID. Assert `Unavailable reward` plus the ID, add a current reward, see a non-blocking overlap warning, use the current reward as the session sample, verify the live-rule explanation matches, change the JSON to an outside reward and verify no-match, then Preview and Send test through the existing selected-alert workflow. Save/reload and assert both stable IDs remain.

- [ ] **Step 3: Run the focused browser file**

```powershell
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts
```

Expected: every management-alerts Playwright scenario passes with no external Twitch mutation or secret in traces/screenshots.

- [ ] **Step 4: Document operator behavior and compatibility**

Add a `Channel point reward alerts` section to `docs/mvp-runbook.md` covering linked-account loading, Refresh, catch-all versus snapshot Select all, inactive rewards, unavailable IDs, shared-design behavior, overlap warnings, and session sample selection. State explicitly that backups containing `oneOf` restore in this and later compatible builds but are not understood by older Stream Jams builds; there is no lossy downgrade.

Update the Alert Model in `docs/product-plan.md` so `Specific channel point reward` also states that one shared rule can select multiple stable reward IDs and all matching active alerts continue to play.

- [ ] **Step 5: Reconcile implementation against the OpenSpec checklist**

For every item in `openspec/changes/add-twitch-reward-catalog-alert-selection/tasks.md`, link or record the focused test/build/live evidence before changing `- [ ]` to `- [x]`. Leave any item unchecked if its evidence is incomplete. Strict-validate after checkbox edits.

- [ ] **Step 6: Run final repository gates**

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate add-twitch-reward-catalog-alert-selection --strict
openspec.cmd validate --all --strict --json
```

Allow the full Vitest suite its normal collection/execution window. If it fails or stalls, retain the output and report the gap; focused passing tests are not a substitute for a full-suite pass.

- [ ] **Step 7: Rebuild, restart, and live-check the management workflow**

Start only the task-owned local server instance, wait for `/health`, and reload the management UI. Verify a read-only catalog load from the linked account when available, explicit Refresh, selected/catch-all creation, saved editor selection, unavailable-ID display using a controlled fixture if needed, overlap guidance, sample match/no-match explanation, Preview, Send test, save, and reload. Confirm browser devtools/logs contain no Twitch token, raw provider body, reward image URL, or overlay route key. Shut down only the service instance started for this task.

- [ ] **Step 8: Commit acceptance evidence and documentation**

```powershell
git add tests/e2e/management-alerts.spec.ts docs/mvp-runbook.md docs/product-plan.md openspec/changes/add-twitch-reward-catalog-alert-selection/tasks.md
git commit -m "test(alerts): cover shared Twitch rewards"
```

## Implementation Order And Review Gates

1. Tasks 1–2 establish compile-time and runtime contracts; do not start server work while their focused tests fail.
2. Task 3 can be reviewed as a read-only Twitch integration independently of alert persistence.
3. Task 4 makes selected creation durable and portable before the browser can submit it.
4. Task 5 supplies the reusable, story-covered UI boundary; Tasks 6–7 consume it without duplicating fetch or reconciliation logic.
5. Task 8 is the publication-readiness gate. It does not authorize OpenSpec archive/sync, push, PR creation, or merge.

## Spec Coverage Map

| OpenSpec behavior | Plan evidence |
|---|---|
| Protected linked-broadcaster catalog and sanitized metadata | Tasks 2–3 |
| Inactive rewards, empty catalog, provider/account failure states | Tasks 3 and 5 |
| One authorization recovery retry and no secret leakage | Task 3 |
| Exact `oneOf` matching and invalid-value rejection | Task 1 |
| Legacy `equals`, SQLite, export, and restore compatibility | Tasks 1 and 4 |
| Catch-all, selected mode, and Select-all snapshot | Tasks 4–6 |
| Current metadata, refresh, unavailable IDs, and offline editing | Tasks 5 and 7 |
| Non-blocking overlap and all-matches-play behavior | Tasks 1, 5–7 |
| Representative selected samples and honest no-match explanation | Tasks 5 and 7 |
| Direct Twitch/Streamer.bot parity and broad EventSub subscription | Tasks 1, 3, and final regression gates |
| Storybook, Playwright, live workflow, docs, and OpenSpec evidence | Tasks 5–8 |
