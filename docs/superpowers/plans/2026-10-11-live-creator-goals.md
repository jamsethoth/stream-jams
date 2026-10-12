# Live Creator Goals Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. The user explicitly requested parent planning, GPT-6.1-sol medium implementation, then GPT-6.1-sol low testing; proceed without an additional approval checkpoint.

**Goal:** Make Twitch Creator Goals usable as live, read-only Data goals on every existing output, and finish the adjacent bus-driven follower refresh hook.

**Architecture:** Twitch EventSub normalizes goal events into the existing journaled bus. A server-owned source runtime snapshots Helix after subscriptions are ready, reconciles events, and atomically updates provider-owned Data values/goals. Existing Data projection and transports render them; Management configures account-bound source bindings.

**Tech stack:** Existing strict TypeScript, Zod, Fastify, SQLite repositories, React/Mantine, Vitest, Storybook and Playwright. No new dependencies.

**Spec:** `openspec/changes/add-twitch-overlay-data/{proposal,design,tasks}.md` and its `specs/twitch-overlay-data/spec.md`.

## Global constraints

- Continue PR #182 on `codex/data-overlays-implementation`, starting at `9c78c826` with main `4dc22d3c` merged. Remote state refreshed; worktree clean before planning.
- Goal permission is optional. Missing/rejected/revoked goal subscriptions must not disable existing alert intake. Tokens stay server-side.
- Read Twitch goals only. No creation, termination or modification of real Twitch goals; no normal profile or credentials in tests.
- Buffer at most 100 goal events during a snapshot. Overflow requires a new snapshot. Reconnect/account/maintenance epochs invalidate obsolete responses.
- Provider goals retain Twitch amounts and units; manual/rule updates and resets cannot mutate their value or target. Stale retention remains ten minutes; ended/invalid bindings hide immediately.
- Default binding follows the newest active goal of a supported type; pinned bindings never silently follow replacements. Switching A→B→A must not reactivate invalidated bindings.
- Fixtures are synthetic examples derived from current official documentation, explicitly labeled. Real-account acceptance stays separate and unchecked unless performed.
- Full Data rule authoring and Streamer.bot globals are outside this task. Fix relevant failures already present in this PR before handoff; do not weaken CI assertions.

## Source verification and rulings

- Official [Helix reference](https://dev.twitch.tv/docs/api/reference/#get-creator-goals) uses `created_at`; [EventSub goals](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelgoalbegin) uses `started_at`. Normalize the API boundary into the existing internal `started_at` field rather than requiring EventSub spelling from Helix. Do not copy documentation tokens.
- Twitch documents progress-before-begin delivery. Preserve newer progress when an older begin arrives; ended goals must not resurrect from an older notification or restart replay. Use notification occurrence time, broadcaster identity and a snapshot watermark.
- Keep the five approved binding types (`follower`, `subscription`, `subscription_count`, `new_subscription`, `new_subscription_count`). Other returned types remain visible but unbindable, per spec. Subscription/new_subscription units are sub points.
- Existing SQLite documents can store optional source metadata without changing table layout. Validate it in core and portable backup preflight; keep old Data documents valid. Add a migration only if a concrete structural need emerges.

## Shared interface contract

Task 1 owns the core contract and announces its completion before dependent builds. Keep these names consistent:

- `TwitchGoalBinding = { mode: "active-type"; type: SupportedTwitchGoalType } | { mode: "pinned"; goalId: string }` and `TwitchGoalSourceInput = { name: string; binding: TwitchGoalBinding }`.
- `DataValue.source` becomes a discriminated union: existing follower-total, or `{ provider: "twitch", kind: "creator-goal", broadcasterId, binding, invalidated?: true }`.
- A native goal remains an existing fixed-target goal with optional `source: { provider: "twitch", kind: "creator-goal" }`. It references its provider-owned value. Validate matching provenance and reject forged manual creation/update. No duplicate binding configuration on the goal.
- Core service methods: `createTwitchGoalBinding(input, broadcasterId): DataOverlayState`, `rebindTwitchGoalBinding(goalId, input, broadcasterId): DataOverlayState`, `applyTwitchCreatorGoals(broadcasterId, updates: readonly { valueId: string; currentAmount: number; targetAmount: number }[]): DataOverlayState`. Create value and native goal atomically, using the same display name in their separate namespaces. No-active placeholders (0/1) remain hidden by source status.
- Keep `TwitchDataSourceStatus.follower`. Replace goals pending status with `{ state, missingScopes, broadcasterId, updatedAt, activeGoals, bindings }`; states: waiting/current/stale/ended/invalid/error/reauthorization-required/disconnected. Each binding reports Data goal/value IDs, selected Twitch goal ID or null, state and units. `activeGoals` uses validated goal records with internal `started_at` normalization. Task 1 fixes/export exact schema for tasks 3/4.
- Existing GET `/data-overlays/sources/twitch` returns that status. POST `/data-overlays/sources/twitch/goals` creates a binding; PUT `/data-overlays/sources/twitch/goals/:id` rebinds it in place; both return Data state and use existing auth/CSRF/rate/maintenance guards.
- Canonical events `goal_begin`, `goal_progress`, `goal_end` carry typed goal fields (broadcaster ID, goal ID/type, description, current/target amounts, startedAt; end also endedAt/isAchieved), with `occurredAt` from notification metadata. Task 2 owns normalization/schema consistency and enum-dependent exhaustive maps.
- EventSub client adds optional `onStatusChanged(status)` notifications for ready subscriptions, disconnect/reconnect and revocation. Task 3 uses them to synchronize sources. Never await a long Helix snapshot inside notification intake; a goal event must be able to reach the buffer while HTTP is in flight.

## Review focus

1. Progress arrives during a delayed initial snapshot, or begin arrives after progress: never regress a displayed amount (task 3).
2. Old-account responses/events arrive after reconnect, maintenance or A→B→A: never reveal/rebind old data (tasks 1/3).
3. Optional goal subscription fails or is revoked while alerts are healthy: preserve alert intake and expose only goal readiness failure (task 2).
4. An end event races a snapshot or persisted replay: no resurrection; pinned stays ended while latest-type follows a replacement (task 3).
5. Backup/template/manual endpoints accidentally turn provider targets into editable custom goals or leak account identity: preserve readonly ownership and sanitize templates (tasks 1/4).

## Task 1 — Provider-goal contracts, persistence and ownership

**Owner:** medium implementer, core Data area only: `packages/core/src/data-overlays/{schemas,types,value-service,goals,template-schemas,template-instantiation,template-service}.ts`, related tests/exports; server Data repository and backup tests/validation if needed. Do not edit event contracts or runtime/web files.

- [x] Add failing contracts/service tests for atomic creation/rebind, negative/unsafe/unknown input, forged source metadata, readonly target/reset, account invalidation and backup roundtrip.
- [x] Implement the shared interfaces; update provider values and native target in one repository mutation/publication. Custom goals over follower totals retain existing behavior.
- [x] Keep generic text/progress projections working via existing value/goal references. Templates keep typed provider requirements but remove live values, binding/account identity and selected goal state.
- [x] Run core Data and repository/backup regressions plus core typecheck; report exact public types and files. Parent commits once integrated.

## Task 2 — Twitch goal EventSub and canonical bus contract

**Owner:** medium implementer, `packages/core/src/events/{types,schemas}.ts`, event-bus schemas/correlation as necessary; `apps/server/src/modules/twitch/twitch-event{,-sub}-*` actual normalizer/client/runtime files and tests. Own enum-dependent registries/fixtures outside task 1 only after notifying parent; avoid runtime composition.

- [x] Add synthetic documented begin/progress/end fixtures and tests for bounded fields, unsafe counts, unknown goal types, broadcaster identity and original event time.
- [x] Add canonical event variants and normalization; audit exhaustive event maps so goals do not accidentally trigger unrelated starter alerts/effects.
- [x] Subscribe to the three v1 goal types only with optional scope; report successfully active subscriptions. Test missing scope, partial optional failure/revocation, reconnect readiness and retained alerts.
- [x] Expose status notifications for task 3; run normalizer, EventSub and bus schema tests. Do not introduce a parallel goal intake path.

## Task 3 — Source runtime and authenticated binding routes

**Owner:** medium implementer, `twitch-data-source-runtime.ts`, new focused goal runtime module if needed, `twitch-goal-snapshot.ts`, `twitch-api-client.ts`, Data HTTP routes, `runtime-composition.ts`, source tests. Consume tasks 1/2 interfaces; avoid their owned files until handoff.

- [x] Test documented Helix `created_at` parsing, no snapshot before all goal subscriptions are active, two goals, initial-load race, overflow, progress-before-begin, end/tombstone and reconnect replay.
- [x] Implement epoch-safe snapshot/reconciliation and bounded retry/backoff honoring provider rate reset. Reject wrong-broadcaster results; handle missing/revoked permission without disconnecting alerts. Clear/mark source status on suspension/disconnect and republish stale expiry.
- [x] Register a stable Twitch Data consumer on the central bus. Follow events schedule authoritative refresh (10-second throttle); goal events update the source, filtered by account and snapshot watermark. Runtime state is resnapshotted on restart; no separate event socket or receipt store.
- [x] Implement binding create/rebind routes; snapshots/event updates change values/targets atomically and status drives all current browser/private outputs.
- [x] Run service/route/runtime regressions including maintenance/close, backup restore, auth and readonly rejects; notify parent when ready for web and full builds.

## Task 4 — Source controls and complete browser workflow

**Owner:** medium implementer after task 1 contract handoff, `apps/web/src/management/data-overlays/**`, `OperatorDataSection*`, Data API boundaries, source stories and `tests/e2e/twitch-data-overlays.spec.ts` or new focused goal acceptance file.

- [x] Read repository frontend skill and routed UX sections: Product Surfaces, Information Architecture, source forms, Inspector/Layers, Preview, target profiles, accessibility and error presentation. This approved post-MVP Data source does not change Twitch itself.
- [x] Show all active goals, type/units/current/target and selected binding; default to latest-of-type, offer pin and explicit rebind. Unknown types visible/unselectable; show waiting, stale, ended, invalid, error and optional-scope reconnect states.
- [x] Keep provider content/targets readonly in Management and Operator; permit existing safe naming/deletion flows. Maintain keyboard access and compact Operator. Diagnose/fix existing PR compact-layout and async pin failures at their root.
- [x] Add production-component stories and browser tests: create latest-type binding, render text/bar, progress, end/new replacement, pinned end/rebind, read-only behavior, account switch, restart and no-scope alerts. Use disposable server/SQLite/provider fixtures, no real account.

## Task 5 — Independent low-effort testing, verification and delivery

**Owners:** low testing subagents after implementation, one for backend/contracts and one for UI/browser acceptance; one may perform the single independent integration review. They may add focused tests in nonoverlapping files, but implementation corrections go to medium implementers. Parent verifies findings by reading affected code and running reproductions; no blanket acceptance of agent claims.

- [x] Run affected backend/source/bus/backup and frontend tests, full unit/script suite, lint, strict typecheck and workspace build. Classify and repair relevant regressions; implement CodeQL remediations without broad suppression (remote confirmation remains separate).
- [x] Build static Storybook only after all web/private builds finish; run full interaction/accessibility/console gate. Run rebuilt disposable Creator Goals acceptance plus existing Data and relevant source/output workflows; reproduce prior PR E2E failures.
- [x] Reconcile implementation against every goal spec scenario. Sync canonical spec and current docs/backlog; keep historical evidence dated. Record real-account/physical acceptance explicitly unperformed if no authorized test account is available.
- [ ] Commit scoped changes with per-file explanations, push to existing PR #182, update PR description, attach it and inspect remote checks. No merge or change from draft unless separately authorized.

## Execution record

- Plan self-reviewed against all goal requirements and five failure modes above. User's explicit plan-and-implement instruction supplies execution authorization; no second planning approval required.
- Baseline CI: validate/build/Storybook/security/package jobs passed; E2E has compact Operator layout and async pin checkbox failures; CodeQL flags grouping regex and Data image authorization branches. Logs: `.superpowers/sdd/2026-10-08-data-overlays/ci-before-goals.log`.
- Implementation and independent testing complete. Parent verified findings and final gates: 3,945 unit tests, 132 script tests (one platform exclusion), 145 browser tests, 478 Storybook scenarios plus 50 final affected-story checks; lint, strict typecheck, workspace build and strict OpenSpec validation pass. See [integration evidence](../../verification/live-creator-goals.md) for failures corrected, transient launch/load failures and acceptance limits.
- Main advanced during this work. The existing draft PR reports conflicts; this scoped live-goal delivery does not import the subsequent browser/desktop output refactor.
