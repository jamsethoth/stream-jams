## Context

Stream Jams already links a broadcaster through Twitch Device Code OAuth with `channel:read:redemptions`, subscribes broadly to custom-reward redemption events, and normalizes each event to provider-independent fields including `rewardId` and `rewardTitle`. Alert rules can match one reward with an `equals` condition, but management users must discover and type the opaque reward ID themselves. Rule conditions are combined with AND semantics, so duplicating a reward condition cannot express a set of alternatives.

Twitch exposes the linked broadcaster's custom rewards through `GET /helix/channel_points/custom_rewards`. The operation requires a user access token whose user matches `broadcaster_id`, returns at most 50 rewards without pagination, and includes inactive states that remain useful when maintaining alert configuration. The access token and raw provider response must remain server-side.

The change crosses the Twitch integration, core alert contracts and evaluator, management HTTP API, alert creation, focused alert editing, sample evaluation, and configuration portability. It must preserve provider-independent playback and existing saved `equals` conditions.

## Goals / Non-Goals

**Goals:**

- Let an authorized management user load all custom rewards belonging to the linked Twitch broadcaster and refresh the list on demand.
- Let one channel-point redemption alert match any member of a selected reward-ID set.
- Make shared-reward selection available when creating an alert and when editing its rule-wide conditions.
- Preserve stable reward IDs and alert editability when catalog metadata cannot be resolved.
- Keep catch-all intent, snapshot selection, overlap behavior, and sample matching visible to the operator.
- Reuse the existing normalized redemption event and playback pipeline for both direct Twitch and Streamer.bot intake.

**Non-Goals:**

- Creating, updating, enabling, disabling, or deleting rewards on Twitch.
- Fetching redemption history or reacting to reward add, update, or remove lifecycle events.
- Persisting or periodically synchronizing a local reward catalog.
- Supporting Twitch automatic rewards, Power-Ups, or provider-specific raw payload matching.
- Introducing a general Boolean expression tree or changing the rule engine's existing AND semantics.
- Automatically making future rewards members of a saved snapshot selection.

## Decisions

### 1. Retrieve the catalog through a narrow management-only server boundary

Add a typed Twitch API client operation for `GET /helix/channel_points/custom_rewards` using the linked account's user ID as `broadcaster_id` and the existing user access token. A thin, rate-limited, management-authenticated HTTP route delegates to a service that resolves the linked account, obtains a usable token, validates the provider response, and projects only management-safe fields: reward ID, title, prompt, cost, background color, user-input requirement, and enabled, paused, and in-stock status.

The browser never receives the token, raw Twitch response, or provider URLs. Reward images are excluded from the first slice because title, cost, and status are sufficient for reliable selection and avoiding remote-image/CSP behavior keeps the boundary small.

On an authorization failure, the service uses the existing token validation/refresh lifecycle and retries the catalog call once. A second authorization failure is returned as an actionable reconnect state. Disconnected accounts, missing scope, non-Affiliate/non-Partner broadcasters, upstream failures, invalid responses, and successful empty catalogs remain distinguishable without exposing provider secrets.

**Alternatives considered:** Calling Twitch from the browser would expose privileged credentials and duplicate lifecycle handling. Persisting the catalog would require staleness, ownership, and lifecycle-event policies that are unnecessary for authoring.

### 2. Fetch on demand and reconcile presentation metadata in the client

The create dialog fetches the catalog when its channel-point redemption workflow opens. The focused editor fetches when its reward picker opens. Both provide explicit refresh and retry actions; no background polling or durable cache is added.

Saved reward IDs are the source of truth. A successfully fetched catalog supplies current labels and state badges. IDs absent from the current catalog remain in the draft and render as `Unavailable reward` with the ID, whether they were deleted, belong to a previously linked account, or merely cannot be resolved. A failed fetch leaves the draft editable and never rewrites or removes selections. Disabled, paused, and out-of-stock custom rewards remain selectable and are labeled with their current state.

**Alternatives considered:** Persisting titles beside IDs would produce stale identity data and expand backup semantics. Removing unresolved IDs would silently alter alert behavior during transient failures or account changes.

### 3. Add a dedicated, narrowly validated `oneOf` condition

Extend the core condition contract with `operator: "oneOf"` and a string-array value. Its runtime meaning is true only when the normalized scalar field value exactly equals one member of the array. The first authoring slice permits this operator only for `channelPointReward`, mapped to normalized `rewardId`; all other rule conditions continue to combine with it using the existing AND behavior.

The accepted array contains 1 through 50 non-empty, unique reward IDs. Parsing rejects invalid field/operator/value combinations rather than broadening the existing untyped union. The UI preserves first-selected order for stable summaries, while matching is order-independent. Existing `equals` conditions read, edit, export, restore, and match without conversion.

**Alternatives considered:** Reusing `includes` would invert the established string containment semantics. Multiple `equals` conditions would be ANDed and could never match. A Boolean condition tree would solve a much larger problem with greater authoring and migration complexity.

### 4. Model catch-all separately from snapshot multi-selection

The channel-point reward authoring control offers two modes:

- `Every custom reward, including future rewards` saves no `channelPointReward` condition and therefore uses the existing catch-all rule behavior.
- `Selected rewards` saves one `channelPointReward oneOf [...]` condition. `Select all currently listed` selects the catalog's current IDs as a snapshot; later Twitch rewards are not added automatically.

The selected mode cannot be saved with an empty list. When adding an alert, the chosen mode and optional selected IDs are passed through the create contract so the service creates the disabled starter alert and its rule atomically with the intended condition. In the editor, the picker edits the rule-wide condition and uses the existing save boundary.

**Alternatives considered:** Treating an empty array as catch-all hides intent and makes transient catalog failures dangerous. A dynamic all-rewards marker would couple live playback to Twitch catalog availability and change behavior whenever the catalog changes.

### 5. Preserve intentional multiple-match behavior and surface overlap conservatively

The resolver continues to play every matching active alert. Creation and editing show a non-blocking warning when another active channel-point redemption rule in the current set has an intersecting selected-reward set or either rule is catch-all. The check is intentionally conservative when rules also contain other conditions: it says the rules may overlap rather than claiming duplicate playback is certain.

No automatic priority, exclusion, disabling, or deduplication is introduced. This retains deliberate layered alerts and keeps matching provider-independent.

**Alternatives considered:** Preventing overlap would remove existing creative flexibility. Automatic deduplication would make rule outcomes depend on hidden precedence that the current product does not define.

### 6. Drive preview and test explanations with representative selected rewards

The reward picker lets the operator choose one selected reward as the session sample, defaulting to the first selected ID when the current sample does not match the set. It updates the normalized sample's `rewardId` and available `rewardTitle`; it does not persist Twitch catalog metadata into the alert document. Preview and Send test continue through their existing paths.

If the operator edits or selects a sample whose reward ID is outside the saved `oneOf` set, the existing condition explanation reports a rule no-match. Catch-all rules accept any valid custom-reward sample.

**Alternatives considered:** Generating a built-in sample per live reward would turn ephemeral provider state into persisted alert configuration. Silently bypassing rule conditions during tests would make preview results disagree with live matching.

## Risks / Trade-offs

- **Twitch catalog availability can interrupt assisted authoring** → Preserve IDs, keep manual drafts editable, and provide explicit retry/reconnect guidance without making catalog access part of playback.
- **Shared selections can overlap generic or other shared rules** → Show a conservative, non-blocking overlap warning and retain the documented all-matches-play behavior.
- **Reward status and titles can become stale while a picker is open** → Fetch on open, expose refresh, and use IDs rather than titles for matching.
- **A backup containing `oneOf` is not understood by older Stream Jams versions** → Treat this as forward-only configuration compatibility, document it in release notes, and never silently downgrade the condition.
- **Adding an array form to the condition contract can weaken validation if modeled too broadly** → Validate the operator, field, and value shape together and add positive, negative, boundary, backup, and evaluator tests.
- **Provider errors could leak sensitive details** → Map them to bounded domain errors and keep tokens, raw bodies, and reward URLs out of responses and logs.

## Migration Plan

1. Extend and test the core condition schema/evaluator so existing `equals` data remains accepted before any UI can write `oneOf`.
2. Add and test the on-demand Twitch catalog service and protected route using the existing OAuth lifecycle.
3. Add creation, editor, reconciliation, overlap, and sample authoring workflows behind the new validated contracts.
4. Rebuild the server and web app, then verify direct-Twitch-shaped and Streamer.bot-shaped normalized redemption samples follow identical matching behavior.

No SQLite migration is required because condition values already use JSON storage. Rollback to a version predating `oneOf` is safe only before such conditions are saved; otherwise the operator must remain on the new version or deliberately replace shared conditions with supported single-reward rules. The application must not perform a lossy automatic conversion.

## Open Questions

None. Exact UI copy and component placement may be refined during implementation without changing the behavioral contract.

## Sources

- [Twitch API: Get Custom Reward](https://dev.twitch.tv/docs/api/reference#get-custom-reward)
- [Twitch authentication scopes](https://dev.twitch.tv/docs/authentication/scopes/)
- [Twitch EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
