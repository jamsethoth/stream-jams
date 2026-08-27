## 1. Core Reward Membership Contract

- [ ] 1.1 Add failing core schema tests for valid `channelPointReward oneOf` conditions and rejection of empty, oversized, blank, duplicate, non-string, and wrong-field values.
- [ ] 1.2 Extend the typed alert condition contract and parser with the narrowly valid string-array `oneOf` form while preserving all existing condition inputs.
- [ ] 1.3 Add failing evaluator and matcher tests for exact membership, non-membership, interaction with other AND conditions, and provider-independent normalized inputs.
- [ ] 1.4 Implement `oneOf` evaluation and expose it only in the channel-point reward authoring catalog.
- [ ] 1.5 Add round-trip repository and configuration backup/restore tests proving `oneOf` arrays persist and existing `equals` reward conditions remain unchanged.

## 2. Twitch Custom Reward Catalog

- [ ] 2.1 Define core management response schemas for sanitized reward metadata and bounded catalog error states.
- [ ] 2.2 Add failing Twitch API client tests for the linked broadcaster query, complete custom reward projection, empty catalogs, provider failures, and invalid responses.
- [ ] 2.3 Implement the typed `GET /helix/channel_points/custom_rewards` client operation with `broadcaster_id` and no manageable-only filter.
- [ ] 2.4 Add failing service tests for disconnected and missing-scope accounts, successful retrieval, one authorization recovery retry, failed recovery, ineligible channels, and redacted diagnostics.
- [ ] 2.5 Implement an on-demand catalog service that reuses the linked-account token lifecycle, retries authorization once, and does not persist provider data.
- [ ] 2.6 Add a rate-limited, management-authenticated catalog route with Fastify injection tests for authorization, success, empty, and mapped failure responses.

## 3. Management Client And Reward Picker

- [ ] 3.1 Add the typed web management client operation and focused request-state tests for catalog success, empty, disconnected, ineligible, and retryable failures.
- [ ] 3.2 Build an accessible reusable reward picker that fetches on open, supports explicit refresh/retry, shows title, cost, and status, and permits all returned custom rewards to be selected.
- [ ] 3.3 Add picker tests for multi-select, select-all snapshot behavior, catch-all mode, selected-mode validation, and preservation of first-selected order.
- [ ] 3.4 Reconcile fetched metadata by stable ID and render missing saved IDs as unavailable without removing them; cover refresh, provider failure, deletion, and account-switch cases.
- [ ] 3.5 Add Storybook states using local fixtures for loading, populated, inactive rewards, empty, provider errors, and unresolved saved selections.

## 4. Alert Creation And Editing

- [ ] 4.1 Extend the alert-create input and service tests with explicit catch-all or selected reward intent for custom redemption alerts, rejecting invalid combinations for other event types.
- [ ] 4.2 Materialize a selected-mode create request atomically as one disabled starter alert with one rule-wide `oneOf` condition; keep catch-all creation condition-free.
- [ ] 4.3 Integrate the reward picker into the Add alert workflow and test catalog loading, multi-selection, snapshot selection, validation, error recovery, and the existing disabled/needs-review result.
- [ ] 4.4 Integrate the same picker into the focused editor's rule-wide conditions while preserving manual exact-ID conditions and unsupported saved conditions according to existing compatibility behavior.
- [ ] 4.5 Add focused editor tests proving saved IDs survive offline catalog failures, deleted rewards, title/status changes, refresh, save, reload, export, and restore.

## 5. Overlap And Sample Guidance

- [ ] 5.1 Add a pure reward-coverage comparison with tests for disjoint sets, intersecting sets, either-side catch-all, disabled siblings, and conservative overlap when additional conditions exist.
- [ ] 5.2 Show a non-blocking potential-overlap warning in creation and editing without changing resolver priority, deduplication, or all-matching-alert playback.
- [ ] 5.3 Add session-sample controls and tests that choose a selected reward, default to the first selection when needed, update normalized reward ID/title, and avoid persisting catalog metadata as a built-in sample.
- [ ] 5.4 Verify condition explanations report match and no-match for inside/outside reward samples while Preview and Send test retain their existing selected-alert behavior.

## 6. End-To-End Verification And Documentation

- [ ] 6.1 Add Playwright coverage for creating a shared selected-reward alert, editing its selection, resolving an unavailable ID, using catch-all, seeing overlap guidance, and previewing representative samples.
- [ ] 6.2 Run affected core, server, and web tests plus lint, typecheck, build, Storybook test/build, and relevant Playwright gates without weakening existing coverage.
- [ ] 6.3 Rebuild and restart the local server and web UI, then verify the live management workflow against mocked or safely controlled Twitch catalog responses without exposing credentials or overlay keys.
- [ ] 6.4 Document operator behavior and forward-only backup compatibility for `oneOf`, then reconcile the implementation against every proposal requirement before publication.
