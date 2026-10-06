# Architecture Audit Repairs Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Use checkbox steps for tracking. Default to one implementing agent; any required independent review follows AGENTS.md and occurs once at the end.

**Goal:** Repair all seven class/interface findings and all five simplicity findings while preserving runtime behavior and reducing the number of contracts and paths a maintainer must understand.

**Architecture:** Keep existing composition and domain boundaries. Introduce explicit narrow ports at persistence and safety boundaries, share browser-compatible response schemas and exact pure transformations, and delete unused implementation paths. Retain separate alert/effect policies and desktop hosts.

**Tech Stack:** Existing strict TypeScript, Zod, Node/Fastify, SQLite, React, Electron, Vitest, Storybook and Playwright; no new dependencies.

**Spec:** [Class/interface audit](../../audits/2026-10-05-class-interface-structure-audit.md), [simplicity audit](../../audits/2026-10-05-simplicity-and-consistency-audit.md), and the relevant canonical OpenSpec behavior specifications. This is a repair plan, not approval to implement or publish it.

## Global constraints

- Baseline: error-taxonomy repairs at `b1f505807bc2ece68792d0fa79214056fd348b57`; do not redo them. The two audits describe twelve remaining findings.
- Preserve strict, noUncheckedIndexedAccess and exactOptionalPropertyTypes; use type imports and explicit `.js` relative imports in NodeNext modules.
- SQLite remains behind typed repository interfaces. No database migration is expected: preserve current tables, singleton and transaction semantics.
- Keep management/overlay authorization separate, binding at `127.0.0.1`, and provider/artwork credentials and upstream URLs server-private.
- Preserve module mute independence, output absence, generation/occurrence ownership, bounded queues, cancellation, shutdown order and media release.
- No generic repository, coordinator, provider, dialog or window framework; no new superclass hierarchy or dependency.
- Preserve starter-theme implementation explicitly retained by its approved removal-of-entry-points spec.
- Scope excludes redesign, new product features, external provider changes, production data changes and hardware configuration.
- Source paths below are repository-relative. New filenames and API names are design decisions; existing paths were checked during planning.

## Execution preparation

- [ ] Refresh remote state, verify current branch/worktree and inspect whether each finding still exists. Preserve the untracked audit documents and inventory. Follow the repository's branch-from-origin/main slice workflow, first ensuring the error-taxonomy baseline is present there; if it is not, record that prerequisite and explicitly choose a stacked repair branch rather than silently losing those repairs.
- [ ] Before product edits, create an OpenSpec change `repair-architecture-contracts-and-simplicity` with proposal, design, requirements and tasks reflecting this plan. Validate it using the installed CLI. Keep independently reviewable slices below as separate commits; if delivered as separate PRs, give each slice its matching spec and prerequisite.
- [ ] Include the audits and this plan in the implementation/spec commit, without claiming the findings are repaired. No commit, push, PR, merge or runtime change is authorized by the planning request alone.
- [ ] Read frontend-change guidance before implementing tasks 3, 7, 9 and 10; identify applicable settings/diagnostics, screen-effects and alert-editor UX sections. This is existing MVP maintenance, with no new backlog feature.

## Coverage and order

| Task | Findings | Result | Dependency |
| --- | --- | --- | --- |
| 1 | A6 | Neutral playback contracts and identity | Baseline |
| 2 | A2 | Configured outputs require mute capability | 1 |
| 3 | A1 | Validated shared settings/export responses | Baseline |
| 4 | A4 | Timer credential repository | Baseline |
| 5 | A3 | Provider registration repository port | Baseline |
| 6 | A5, S1 | Typed private artwork capability; one Music publication path | Baseline; reconcile task 5 imports if it ran first |
| 7 | A7 | Narrow Screen Effect editor dependency | 3 if response types changed |
| 8 | S2 | Shared server duration projection | 1 if playback imports changed |
| 9 | S3, S5 | Unused helpers removed; one template preview implementation | Baseline |
| 10 | S4 | Dialog-owned drafts/errors and shared focus sequence | Baseline |

Recommended sequence is the table order: safety and response validation precede cosmetic simplification. Apart from listed dependencies, slices can ship independently. There is no requirement to run parallel agents.

## Review focus

1. A malformed successful settings/export response must fail at the client boundary and show actionable management feedback (task 3).
2. A configured output without mute support must fail explicitly; a completely absent optional output must remain valid (task 2).
3. Failed credential persistence must not return a new usable token or invalidate the previous credential (task 4).
4. A blocked Music recipient followed by source replacement must not publish obsolete artwork/state; explicit test refresh must retain its inclusion semantics (task 6).
5. Reopening or switching a dialog after failure must not retain stale drafts/errors or lose keyboard focus (task 10).

## Task 1 — Neutral playback ownership (A6)

**Files:** Create `apps/server/src/modules/playback/playback-ports.ts`, `occurrence-identity.ts`, and `occurrence-identity.test.ts`. Modify `playback-coordinator.ts`, `../screen-effects/effect-playback-coordinator.ts`, `../screen-effects/effect-admission-service.ts`, `../../runtime/runtime-composition.ts`, plus their existing tests and other importers found by symbol search.

**Interfaces:** Move `OverlayPlaybackInstructionSink` and `DesktopVisualPlaybackSink` unchanged into `playback-ports.ts`. Export `moduleOccurrenceKey(moduleId: string, occurrenceId: string): string` from `occurrence-identity.ts`, retaining exactly `JSON.stringify([moduleId, occurrenceId])`. Internal callers import the neutral modules directly; no permanent sibling re-export or old alias.

- [ ] Add identity tests asserting exact serialization for alerts/effects, empty strings and strings containing quotes/separators, and distinct keys for ambiguous concatenations. Retain existing media admission/release tests.
- [ ] Move the types and identity function; update every source/test importer. Do not merge coordinators or alter timing, queue advancement or completion policy.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/playback apps/server/src/modules/screen-effects apps/server/src/runtime/runtime-media-shutdown.test.ts` and `corepack.cmd pnpm typecheck`; require successful exits. Search for old identity names and sibling contract imports; require no remaining implementation dependencies of that form.
- [ ] Record the behavior-preserving slice and validation in its commit.

## Task 2 — Required safety capabilities (A2)

**Files:** Modify task 1's `playback-ports.ts`, `playback-coordinator.ts`, `packages/core/src/audio/transport.ts`, `apps/server/src/modules/audio/desktop-audio-sink.ts`, `apps/server/src/runtime/runtime-composition.ts`; update OverlayGateway, AudioHost, WorkerAudioClient callers/fixtures as typechecking requires. Tests: existing playback, desktop-audio-sink and audio transport tests, runtime composition tests, `tests/e2e/management-alert-safety.spec.ts`, `tests/desktop/module-mute.spec.ts`.

**Interfaces:** Require `setPlaybackMuted(muted: boolean): void` and `setModuleMutes(state: ModuleMuteState): void` on the configured browser sink. Require `setModuleMutes(state: ModuleMuteState): Promise<void>` on `DesktopAudioTransport`. Retain optional preparation/play compatibility and existing optional whole-output dependencies. Avoid adding a second public port unless a real delivery-only consumer cannot use this required contract.

- [ ] Add tests where a deliberately malformed runtime-injected browser/audio substitute lacks required mute methods: configured admission must reject with an actionable existing error, and safety application must not report success. Add typechecked complete substitutes; use a narrowly localized unsafe cast only in the intentional malformed-input test.
- [ ] Add positive tests for independent Alerts/Effects mute, global mute, saved mute initialization, absent optional desktop output, and rejected asynchronous mute. Preserve existing partial-failure behavior explicitly; do not promise cross-output atomicity.
- [ ] Make methods required, remove silent mute optional chaining, and validate configured adapters before they are admitted or playback begins. Do not substitute no-op implementations just to satisfy the contract.
- [ ] Run focused playback/audio/core transport/runtime tests, typecheck, and rebuilt disposable-service safety acceptance. Run the existing desktop module-mute test with its isolated fixture. Physical audibility remains a separate acceptance limitation if unavailable.
- [ ] Commit only after no configured output can claim unsupported mute success.

## Task 3 — Authoritative response contracts (A1)

**Files:** Modify `packages/core/src/config/schemas.ts` and `packages/core/src/index.ts`; create `packages/core/src/management/settings-response-contracts.ts` and `diagnostics-response-contracts.ts` only for shapes not already described exactly by existing schemas. Modify `apps/web/src/management/management-api.ts`, `management-http-client.ts` and their tests, server settings/moderation routes and `apps/server/src/modules/diagnostics/diagnostics-service.ts` where copied producer types occur. Add core contract tests alongside any new files.

**Interfaces:** Shared schemas `serverConfigViewSchema`, `desktopConfigViewSchema`, `moderationSettingsViewSchema`, `diagnosticsExportViewSchema`, `diagnosticsDebugExportViewSchema`; shared view types inferred from them. Reuse authoritative existing schemas rather than defining an identical second schema. Expose actual response projections, not persistence records. Raw JSON HTTP methods return `Promise<unknown>`; remove caller-selected generic JSON return types and migrate all callers to parse/narrow explicitly. Binary transport remains separate.

- [ ] Inventory GET/PATCH settings and GET/POST exports, including their server serializers and current UI fixtures. Decide required/null/optional members from actual producer contracts, not a single happy-path sample. Include `runtimeLogSkippedCorruptRecords` in the shared debug export shape. Preserve export extension data deliberately; do not strip redacted useful fields accidentally.
- [ ] Add wrong-type, missing-required-field, nullability and malformed nested export tests for each affected response. Assert `{ host: 17, port: "not-a-port" }` rejects. Test both reads and successful writes. Assert valid server-produced exports preserve their data and skipped-corrupt-record count.
- [ ] Share inferred producer/client types, parse unknown at domain client boundaries, and remove duplicated web DTO declarations. Migrate raw generic callsites without casting their values back to trusted types. Map validation failure through existing actionable client errors; never include raw credential-bearing response bodies.
- [ ] Run management API/HTTP client and new core schema tests, relevant server route/diagnostics tests, typecheck and web build. Verify settings load/update and diagnostics download against a disposable rebuilt service; use `tests/e2e/management-settings.spec.ts` and add malformed-response coverage there if the failure presentation changes.
- [ ] Commit shared contracts and producer/client migration together so neither side is temporarily inconsistent.

## Task 4 — Timer credential persistence boundary (A4)

**Files:** Create `apps/server/src/modules/timers/timer-automation-credential-repository.ts`, `sqlite-timer-automation-credential-repository.ts` and its test. Modify `timer-automation-credential-service.ts`, its test, runtime construction in `apps/server/src/runtime/runtime-composition.ts`, and any other constructor callers.

**Interfaces:** `TimerAutomationCredentialRecord = { verifier: string; createdAt: string; rotatedAt: string | null; revokedAt: string | null }`. Synchronous port `read(): TimerAutomationCredentialRecord | null`, `issueOrRotate(verifier: string, timestamp: string): TimerAutomationCredentialRecord`, `revoke(timestamp: string): void`. SQLite issue/rotate atomically reads current status, computes timestamps and upserts; service options accept `repository`, `now?`, `generateToken?`, replacing `connection`.

- [ ] Add a typed in-memory repository fixture and service assertions for token format, hashing, timing-safe verification semantics, revoked/absent records, invalid verifier and rejected persistence. Issue must return a token only after persistence succeeds.
- [ ] Add SQLite tests for singleton rotation, rollback after injected write failure, original createdAt retained across active rotation, new createdAt and null rotatedAt after revocation/reissue, and repeated revocation retaining the first revokedAt. Preserve existing invalid-row handling instead of broadening it incidentally.
- [ ] Move SQL, row mapping and narrow transactions into the adapter. Keep random generation, token validation, hash policy and constant-time comparison in the service. Store only the verifier, not the token. Wire the adapter in composition; leave scoped automation grant credentials untouched.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/timers/timer-automation-credential-service.test.ts apps/server/src/modules/timers/sqlite-timer-automation-credential-repository.test.ts apps/server/src/runtime/runtime-automation.test.ts` plus typecheck. Verify timer credential issue/use/rotate/revoke on a disposable database through the actual route test.
- [ ] Commit without schema migrations or normal-profile changes.

## Task 5 — Provider persistence port (A3)

**Files:** Create `apps/server/src/modules/providers/provider-registration-repository.ts`. Modify `sqlite-provider-registration-repository.ts`, `provider-management-service.ts`, its test and all imports/projections of this repository found in runtime/provider services. Keep SQLite integration tests.

**Interfaces:** Move `ProviderRegistrationRecord` and `ProviderActivationRecordResult` to the neutral port module unchanged. `ProviderRegistrationRepository` declares the adapter's eight current public operations with identical signatures: save, delete, findById, list, findActive, activate, deactivateMusic, updateTtsSafety. The SQLite class implements it. Service consumes this interface; other consumers use narrow `Pick<ProviderRegistrationRepository, ...>` where already appropriate.

- [ ] Add a substitute repository checked with `satisfies ProviderRegistrationRepository` and service tests for a lookup/write/activation failure, without requiring SQLite private members or double assertions.
- [ ] Move neutral types and update imports; keep schema parsing and SQL in the adapter. Preserve transactional active-provider replacement, secret references, capability filtering and deactivation behavior.
- [ ] Run provider service/repository tests, provider security lifecycle tests and typecheck. Existing SQLite tests must continue to prove atomic activation and persistence mapping; the focused fake does not replace them.
- [ ] Commit the complete port migration with no generic CRUD layer.

## Task 6 — Music capability and publication simplification (A5, S1)

**Files:** Create `apps/server/src/modules/music/music-source-adapter.ts` and a contract test. Modify `music-runtime-coordinator.ts`, its test, `pear-music-source.ts`, its test and runtime factory wiring. Add `apps/server/src/runtime/runtime-music-publication.test.ts`, using the real runtime output synchronization path with disposable/fake recipients, not a copy of its queue algorithm.

**Interfaces:** Server-private `MusicArtworkCapability` has `getArtworkPolicy(): MusicArtworkPolicy` and `getArtworkDescriptor(ref: string, owner: Pick<MusicSnapshot, "providerId" | "generation">): PrivateArtworkDescriptor | null`. Server `MusicRuntimeSourceAdapter extends MusicSourceAdapter` has `readonly artwork: MusicArtworkCapability | null`; factory returns this type. Pear supplies the paired capability; artwork-free sources explicitly supply null. Keep core/public normalized adapter and snapshot types free of private descriptors.

- [ ] Add artwork-free, valid artwork, missing/wrong paired capability typechecks and stale owner/provider/generation tests. Verify upstream URLs/policy/credentials never enter public snapshots.
- [ ] Before deleting the unused sink path, test real runtime subscription/output sync for blocked first recipient, rapid revisions coalescing to latest, failure allowing subsequent output, generation replacement, shutdown and explicit includeTest requests queued behind ordinary refresh. Use existing fake provider/runtime facilities; no live Pear dependency.
- [ ] Replace intersection assertions with the named private adapter/capability. Retain fail-closed null lookup for wrong ownership and absent artwork.
- [ ] Remove MusicRuntimePublication, sink option, active/pending publication fields and drainer. Rewrite coordinator tests around public revision subscription/getProjection; keep assertions about snapshots and lifecycle, and relocate output-delivery assertions to runtime tests.
- [ ] Run Music module tests, new runtime publication tests, typecheck, `tests/e2e/music.spec.ts` and `tests/e2e/music-security.spec.ts` against rebuilt disposable fixtures. Run existing desktop Music acceptance when available; do not infer physical acceptance from unit tests.
- [ ] Commit with exactly one production publication path and coverage of its actual coalescing behavior.

## Task 7 — Screen Effect editor dependency projection (A7)

**Files:** Modify `apps/web/src/management/screen-effects/ScreenEffectEditor.tsx`, its tests and stories; update consumers only if required.

**Interfaces:** Export `ScreenEffectEditorManagementApi` as required `Pick<ManagementApi, "listAssetLibraryItems" | "getTwitchStatus" | "getTwitchCustomRewards" | "listRegisteredProviders" | "getStreamerBotSubscriptions">` intersected with `Partial<Pick<ManagementApi, "repairAssetDuration">>`. Use it in props and both context loaders; keep asset/audio clients separate.

- [ ] Replace double-asserted fixtures with typed/satisfies fixtures. Verify omission of a required method fails typechecking, and omission of duration repair remains supported.
- [ ] Update props/loaders and test connected, provider-free and failed-context loading plus absent/present duration repair. No new wrapper client or visual redesign.
- [ ] Run ScreenEffectEditor tests and typecheck. Build/test its relevant stories; verify the editor loads against a rebuilt disposable service. If behavior changes, run `tests/e2e/screen-effects.spec.ts`.
- [ ] Commit the narrow contract and complete fixture updates together.

## Task 8 — Shared duration candidate projection (S2)

**Files:** Create `apps/server/src/modules/playback/media-duration-candidates.ts` and its test. Modify `playback-coordinator.ts`, `../alerts/alert-editor-service.ts` and `../screen-effects/effect-admission-service.ts` and their existing tests.

**Interfaces:** `projectMediaDurationCandidates(assetIds: readonly string[], records: ReadonlyMap<string, { readonly originalFileName: string; readonly mediaType: MediaDurationCandidate["mediaType"]; readonly durationMs: number | null }>): readonly MediaDurationCandidate[]`. It preserves ID order, skips absent records, uses originalFileName and sets eligible true. It does not fetch assets, deduplicate IDs or choose duration policy.

- [ ] Test missing records, null duration, order and exact labels/types. Retain caller tests for five-second alert fallback, ten-second effect fallback and the 120,000 ms maximum.
- [ ] Replace the three repeated missing-record projections. Leave the strict prevalidated line-520 projection and browser display-name projections separate. Do not change captureAdmission, maximum duration or authored timing.
- [ ] Run helper, playback, alert editor service and effect admission tests plus typecheck. Inspect the resulting helper/callers: abandon extra configurable mapping options if they erase the simplicity gain.
- [ ] Commit the small shared transformation.

## Task 9 — Unused helpers and consistent previews (S3, S5)

**Files:** Modify `apps/web/src/management/alerts/editor/editor-state.ts`, its tests, `AlertEditorPage.tsx`, its tests and `template-preview.test.ts`; modify `apps/web/src/management/editor/snapping.test.ts`, `packages/core/src/assets/media-reference.ts` and its tests. Retain `template-preview.ts` and the core template renderer as authoritative.

**Interfaces:** Remove snapLayerGeometry/SnapOptions and assertDesktopMediaProtocolVersion. Use existing `renderAlertTemplatePreview(template: string, sample: unknown): string` for the two editor preview instructions. No new abstraction.

- [ ] Repeat whole-tree reference search before deletion. Move unique snapping grid/threshold/bounds assertions onto snapEditorRect's production contract and wrong-version assertions onto privateMediaReferenceSchema/actual IPC boundaries. Do not preserve tests solely to keep dead wrappers alive.
- [ ] Add preview tests for nested own properties, missing/null/object values, HTML characters with escaping disabled, inherited properties and function/symbol values. Assert editor preview text and TTS instruction text match the shared renderer. Use the core renderer's existing own-property/data-value behavior; document this intentional consistency change.
- [ ] Delete the wrappers, unneeded import and local renderTemplateValue. Do not remove desktop protocol literal validation or starter-theme implementation.
- [ ] Run core media-reference, snapping, editor-state, template-preview and AlertEditorPage tests, typecheck and affected web build. Verify editor text/TTS preview on rebuilt disposable UI; run relevant existing alert-editor acceptance and stories.
- [ ] Commit with no duplicate template interpreter and no remaining callers of deleted APIs.

## Task 10 — Alert Sets dialog state (S4)

**Files:** Modify `apps/web/src/management/alerts/AlertSetsPage.tsx`, its tests/stories and `tests/e2e/management-alerts.spec.ts`.

**Interfaces:** Two local nullable state objects: `CreateAlertDialogState` owns eventLocked, eventType, name, rewardSelection and error; `VariationDialogState` owns parent, name and error. Null means closed. Keep separate objects to preserve existing behavior rather than inventing dialog mutual exclusion. Local `revealCreatedAlert(created: { readonly id: string; readonly setId: string; readonly eventType: StreamEventType }): Promise<void>` owns group reveal, refresh, pending focus and expansion in their existing order; callers own validation, dialog closing and notices.

- [ ] Add tests for event-locked/default creation, selected-reward validation, failed create then close/reopen, failed variation then opening another parent, event changes resetting reward selection, duplicate focus restoration, Escape/cancel, and keyboard focus after refresh.
- [ ] Replace individual create/variation setters with grouped state updates. Retain operation-specific error messages, disabled/review-required creation semantics, busy protection, polling generations and disclosure state.
- [ ] Share only the identical reveal/refresh/focus sequence. Do not add a generic async mutation engine, global reducer or modal framework. If a dialog component split is unnecessary, keep these local types/functions in the page.
- [ ] Run AlertSetsPage tests and typecheck, affected stories with accessibility checks, and `tests/e2e/management-alerts.spec.ts`. Rebuild/restart the disposable service, wait for health and verify create/variation/duplicate plus failure recovery live.
- [ ] Commit after draft reset and focus behavior match expectations.

## Final verification and handoff

- [ ] Reconcile all twelve finding IDs against code and tests. Mark audit findings repaired only with source/test evidence; preserve original audit baseline and append status rather than rewriting historical observations.
- [ ] Run once on the integrated branch: `corepack.cmd pnpm lint`, `corepack.cmd pnpm typecheck`, `corepack.cmd pnpm test`, `corepack.cmd pnpm build`, `corepack.cmd pnpm build-storybook`, `corepack.cmd pnpm test:storybook:ci`, and `corepack.cmd pnpm test:e2e`. Focused checks above are iteration gates; these are final repository/publishing gates. Do not repeat green suites without a new change or unresolved failure.
- [ ] Run the affected desktop fixture suites for module mute/Music/media protocol. Report unavailable physical desktop/audio acceptance explicitly; do not change the user's normal profile or devices.
- [ ] Diagnose failures and classify regression, test defect or environment failure. Relevant failures block completion; no skipped/weakened tests or fabricated green status.
- [ ] Rebuild/restart affected disposable local services, wait for health and reload affected settings, diagnostics, safety, Music, screen-effects and alert workflows. Confirm the running build is the repaired revision.
- [ ] Perform at most one independent whole-branch review if required, using the AGENTS.md review subagent configuration; repair actionable findings and rerun only affected verification.
- [ ] Validate OpenSpec artifacts, sync completed requirements and record evidence. Keep unfinished requirements unchecked and report exact blockers.
- [ ] Report per-finding outcomes, meaningful behavior changes, tests and limitations. Commit/push/PR/merge remain subject to the user's execution/delivery authorization. No publication is implied by this planning request.

The completion criterion is simpler, explicit contracts with preserved product behavior and verified failure paths. The audit's estimated line reduction is a planning estimate, not a quota; small necessary contract/schema additions may increase net lines while reducing maintenance ambiguity.
