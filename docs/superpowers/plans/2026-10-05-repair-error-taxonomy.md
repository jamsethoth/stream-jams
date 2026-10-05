# Error Taxonomy Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Default to one agent; this document authorizes no implementation by itself.

**Goal:** Repair all five error-class audit findings while preserving safe API responses, specialized domain data and diagnostic provenance.

**Architecture:** Share explicit name/cause mechanics in core and a narrow safe HTTP envelope in the server. Keep module-owned semantic errors and explicit boundary mappings; consolidate only the duplicate Screen Effects constructor and three payload-free subscription leaves.

**Tech Stack:** Existing strict TypeScript/ESM pnpm workspace, native ErrorOptions, Fastify inject, Vitest, Node SQLite, ws, Playwright and the existing TypeScript-based provenance checker. No new dependencies.

**Spec:** `openspec/changes/repair-error-taxonomy/specs/application-error-contracts/spec.md`; design and baseline live alongside it. Source baseline: `90c5e8323f9b8bce0d85dbcf0eee8164da7dcf5e`.

**Global Constraints:** Planning-only delivery now. Future implementation must fetch current remote state, verify findings remain, and start a scoped `codex/` branch from `origin/main`. Preserve package boundaries, safe copy, leaf identities except the specified consolidations, typed payloads, standard causes, redaction, single-owner logging and existing recovery. No profile/credential/schema changes. Use disposable data for integration/browser tests. Retain intentional third-party compatibility adapters; do not introduce a global catch-all error registry.

**Review Focus:** Wrong 500 paths repaired; all 24 names addressed; public contracts and identity-sensitive consumers preserved; unknown/lookalike errors fail safely; no unsafe message disclosure, duplicate diagnostics or changed retry behavior. An independent code review, if requested during implementation, uses the repository's review-subagent policy.

## Coverage and order

| Finding | Repair | Slice |
| --- | --- | --- |
| E1 P2 duplicate constructor/mapping gap | One authoritative definition constructor; admission variant mapping | 1 |
| E2 P2 24 generic diagnostic names | Explicit names, runtime serialization assertions and enforcement | 2, 6 |
| E3 P3 repeated envelopes | NamedError plus server-only SafeHttpError; retain payload-rich leaves | 2 |
| E4 P3 redundant subscription leaves | One family with existing codes, copy and diagnostic names | 3 |
| E5 P3 mixed dispatch | Module-owned codes/guards, safe runtime outcomes and vendor adapters | 4, 5, 6 |

Each slice has an independently testable deliverable. Sequence them to avoid temporary half-migrations. Do not use a numeric class-count target: legitimate new typed outcomes may offset removed duplicate declarations.

## Task 1: Screen Effects identity and admission mappings

**Files:** Create `apps/server/src/modules/screen-effects/effect-errors.ts`. Modify `effect-admission-service.ts`, `effect-management-service.ts` in that directory and `apps/server/src/http/routes/screen-effects.ts`. Extend their three existing `.test.ts` files, especially `apps/server/src/http/routes/screen-effects.test.ts` for the complete boundary.

- [ ] Write two deterministic Fastify-inject regressions spanning management -> admission -> route/global handler. Change the disposable definition/variant after the management precheck using a controlled availability promise; assert definition disappearance gives 404 `SCREEN_EFFECT_NOT_FOUND`, variant disappearance gives 409 `SCREEN_EFFECT_VARIANT_UNAVAILABLE`. Assert exact safe bodies and no generic-500 diagnostic ownership. Include unchanged success and unknown-error 500 controls.
- [ ] Run these tests against the existing code and confirm the failing outcome is the mapping defect, not fixture setup.
- [ ] Move `EffectDefinitionNotFoundError` to the authoritative domain file, migrate both services and route to that constructor, and retain service re-exports only where needed by existing imports. Map admission `EffectVariantNotFoundError` explicitly; preserve safe body conventions. Do not solve this by adding a base class beneath two duplicate leaves.
- [ ] Search all definitions/imports/constructions/guards for these names; verify there is exactly one definition and no stale constructor import.
- [ ] Run `corepack pnpm exec vitest run apps/server/src/modules/screen-effects/effect-admission-service.test.ts apps/server/src/modules/screen-effects/effect-management-service.test.ts apps/server/src/http/routes/screen-effects.test.ts` and affected-package typecheck.

**Exit:** Both interleavings have their existing domain response; admission result/status contracts and mutation scheduling are unchanged.

## Task 2: Shared mechanics and all 24 stable names

**Files:** Create `packages/core/src/shared/named-error.ts` and its `.test.ts`, export from `packages/core/src/index.ts`. Create `apps/server/src/http/safe-http-error.ts` and its `.test.ts`. Modify all declaration files enumerated in `audit-baseline.md`; the list is exhaustive, not an example. Extend `packages/core/src/diagnostics/serialized-exception.test.ts` and appropriate existing owning-module tests. Add `apps/server/src/http/error-contracts.test.ts` for cross-module observable contracts.

**Interfaces:** `NamedError(name: string, message: string, options?: ErrorOptions) extends Error`; `SafeHttpError(name: string, statusCode: number, code: string, safeMessage: string, options?: ErrorOptions) extends NamedError`. The server foundation owns readonly status/code/safeMessage. Explicit string names are required; do not derive them from `constructor.name`.

- [ ] Add failing observable tests that serialize the actual previously unnamed errors, covering each of the 24 entries. Test private `PolicyError` through its public style-policy operation rather than exporting an implementation solely for tests. Assert stable type and existing code/message, payload-sensitive fields through their actual consumers, and standard cause/redaction where relevant. Assert meaningful inheritance/leaf-first mapping for media capacity and invalid music asset references remains unchanged.
- [ ] Implement the two primitives and migrate the six repeated envelopes: DesktopConfigError, SurfaceSettingsError, AutomationCredentialError, AutomationControlError, HttpResponseError and AudioOutputError. Preserve old signatures/defaults and AudioOutputError's nextStep/routeIds/references/owners. Optional cause support may be appended where previously absent; do not manufacture causes for ordinary domain outcomes.
- [ ] Migrate the other 18 unnamed declarations to explicit stable naming through NamedError. Preserve all existing properties and semantic identities. Keep already correctly named unrelated errors as they are. Avoid altering the serializer or transported schema.
- [ ] Keep global/route ownership explicit. Test an unowned SafeHttpError and a secret-bearing unknown error: neither gains new automatic disclosure. Existing owned cases retain exact status/code/safe copy.
- [ ] Run `corepack pnpm exec vitest run packages/core/src/diagnostics/serialized-exception.test.ts packages/core/src/shared/named-error.test.ts apps/server/src/http/safe-http-error.test.ts apps/server/src/http/error-contracts.test.ts` plus owning-module tests for the changed files, then `corepack pnpm typecheck`.

**Exit:** The complete 24-entry baseline passes real construction/serialization checks; envelope leaves retain identities and payloads. The browser can import NamedError without Node dependencies.

## Task 3: Consolidate the three subscription leaves

**Files:** Create `apps/server/src/modules/providers/provider-errors.ts`; modify `provider-management-service.ts`, its `.test.ts`, and `apps/server/src/http/routes/streamerbot-subscriptions.ts`. Extend the owning route test (create `streamerbot-subscriptions.test.ts` alongside the route if no existing dedicated test owns those scenarios).

**Interface:** `StreamerBotSubscriptionError(code: StreamerBotSubscriptionErrorCode, options?: ErrorOptions) extends NamedError`. The union contains exactly `STREAMERBOT_SUBSCRIPTIONS_WRONG_PROVIDER`, `STREAMERBOT_SUBSCRIPTIONS_INACTIVE`, `STREAMERBOT_BROADCASTER_UNVERIFIED`. A fixed internal code -> message/name map preserves the existing three diagnostic names, not the new family constructor's name.

- [ ] Record the three current route body/status and serialized-name contracts in parameterized tests; include unknown-code rejection and the retained selection-unavailable payload.
- [ ] Replace constructions/imports of WrongProvider, Inactive and BroadcasterUnverified leaves with the family; update identity assertions to the family plus code. Keep the existing code-owned boundary responses (422/409/409).
- [ ] Delete obsolete three declarations after searching all consumers. Do not retain empty compatibility subclasses or broaden the family to payload-rich errors.
- [ ] Run `corepack pnpm exec vitest run apps/server/src/modules/providers/provider-management-service.test.ts apps/server/src/http/routes/streamerbot-subscriptions.test.ts apps/server/src/http/error-contracts.test.ts` and affected-package typecheck.

**Exit:** One family expresses the three distinctions; responses, diagnostics and selection-unavailable fields retain their old contracts.

## Task 4: Replace first-party message/name classification

**Files:** Extend `apps/server/src/modules/screen-effects/effect-errors.ts`, modify `sqlite-effect-repository.ts` and `apps/server/src/http/routes/screen-effects.ts`. Create `apps/server/src/modules/streamerbot/streamerbot-runtime-error.ts`, modify `streamerbot-runtime-service.ts`. Modify `apps/server/src/modules/diagnostics/diagnostics-service.ts`, `apps/server/src/http/routes/diagnostics.ts`, `packages/core/src/playback/playback-queue.ts` and `apps/server/src/http/routes/playback.ts`. Extend each existing owning `.test.ts` file.

**Interfaces:** `EffectReferenceUnavailableError(kind: "visual-asset" | "sound-asset" | "audio-route", referenceId: string, options?: ErrorOptions)` with `SCREEN_EFFECT_REFERENCE_UNAVAILABLE`; bounded safe formatter preserves existing copy. `StreamerBotRuntimeError(code: StreamerBotRuntimeErrorCode, options?: ErrorOptions)` uses the closed internal union `STREAMERBOT_RUNTIME_CONNECTION_FAILED`, `STREAMERBOT_RUNTIME_CONNECTION_TIMEOUT`, `STREAMERBOT_RUNTIME_TWITCH_CATEGORY_UNAVAILABLE`, `STREAMERBOT_RUNTIME_EVENT_CATALOG_UNAVAILABLE`, `STREAMERBOT_RUNTIME_SUBSCRIPTION_UNAVAILABLE`. It selects fixed safe messages and accepts no arbitrary remote message input. DiagnosticsLimitError adds internal `INVALID_DIAGNOSTICS_LIMIT`; PlaybackQueueItemNotFoundError adds internal `PLAYBACK_QUEUE_ITEM_NOT_FOUND`. Their guards validate existing maxLimit/itemId fields with the exact owning type constraints.

- [ ] Add regressions for all three missing reference kinds, runtime failure outcomes, diagnostics limit and playback missing item. Add negatives for matching-English ordinary errors, matching-name objects, malformed payloads, unknown codes and secret-bearing remote messages. Existing public response bodies remain the baseline.
- [ ] Replace the three repository native errors with typed reference outcomes and remove the route's reference-message regex.
- [ ] Replace runtime prefix whitelisting and corresponding native constructions with the bounded runtime family. Preserve existing client-failure adoption: known recorded failures keep their diagnostic reference and are not logged again. Verify timeout/connection/subscription recovery sequencing is unchanged.
- [ ] Replace first-party name-only fallbacks with owning validated code guards; maintain local constructor handling where meaningful. Preserve TTS/OAuth code mapping and startup/queue conflict payloads.
- [ ] Run `corepack pnpm exec vitest run apps/server/src/modules/screen-effects/sqlite-effect-repository.test.ts apps/server/src/http/routes/screen-effects.test.ts apps/server/src/modules/streamerbot/streamerbot-runtime-service.test.ts apps/server/src/modules/diagnostics/diagnostics-service.test.ts apps/server/src/http/routes/diagnostics.test.ts packages/core/src/playback/playback-queue.test.ts apps/server/src/http/routes/playback.test.ts`, then typecheck and provenance gate.

**Exit:** Audited first-party paths no longer classify by English wording or bare names; expected/unknown outcomes, safe copy and diagnostic ownership remain tested.

## Task 5: Isolate vendor compatibility contracts

**Files:** Modify `apps/server/src/modules/assets/asset-library-service.ts` and its `.test.ts`, `apps/server/src/modules/music/pear-music-source.ts` and its `.test.ts`. Create `apps/server/src/http/schema-validation-error.ts` and its `.test.ts`; migrate existing Zod compatibility checks in `apps/server/src/http/routes/alerts.ts`, `collections.ts`, `screen-effects.ts` and `timers.ts` to that adapter without changing validation responses. Keep SQLite/Pear classification helpers module-local unless multiple real consumers require sharing.

- [ ] Test actual disposable SQLite foreign-key deletion on declared Node 24.16.0: assert `code === "ERR_SQLITE_ERROR"` and `errcode === 787` classify as foreign-key conflict. Test unrelated unique/check constraints and a fabricated matching message are not classified. Replace the message regex with the verified vendor adapter.
- [ ] Parameterize Pear protocol tests over documented ws codes: WS_ERR_EXPECTED_FIN, WS_ERR_EXPECTED_MASK, WS_ERR_INVALID_CLOSE_CODE, WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH, WS_ERR_INVALID_OPCODE, WS_ERR_INVALID_UTF8, WS_ERR_UNEXPECTED_MASK, WS_ERR_UNEXPECTED_RSV_1, WS_ERR_UNEXPECTED_RSV_2_3, WS_ERR_TOO_MANY_BUFFERED_PARTS, WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH, WS_ERR_UNSUPPORTED_MESSAGE_LENGTH. Unknown network codes retain transport classification. Remove protocol-message inference; preserve authentication close 1008, bounded reconnect, and the deliberate exclusion of token-bearing raw socket causes.
- [ ] Consolidate only existing Zod compatibility checks in the server adapter. Accept local ZodError identity and existing cross-realm values with a validated issues shape; reject name-only lookalikes. Document this bounded vendor exception rather than banning legitimate schema compatibility.
- [ ] Run `corepack pnpm exec vitest run apps/server/src/modules/assets/asset-library-service.test.ts apps/server/src/modules/music/pear-music-source.test.ts apps/server/src/http/schema-validation-error.test.ts` plus tests of migrated routes; run typecheck and provenance gate. If actual vendor behavior differs, resolve the adapter against the locked runtime before calling the slice complete.

**Exit:** SQLite and ws use verified codes; retained Zod name compatibility is explicit, narrow and tested. No new credential disclosure or network retry behavior.

## Task 6: Enforce and close the audit

**Files:** Modify `scripts/error-provenance-check.mjs`, `scripts/error-provenance-check.test.mjs` and existing runner `scripts/check-error-provenance.mjs` only if cross-file class resolution needs runner support. Document conventions in `docs/ai/error-contracts.md`, linked from `docs/README.md`. Extend existing `tests/e2e/screen-effects.spec.ts` only for observable safe failure/operator-recovery assertions; deterministic between-read races belong in inject tests, not timing-dependent browser tests.

- [ ] Add checker fixtures for unnamed direct Error subclasses, explicit stable naming, imported/aliased NamedError, SafeHttpError and indirect domain inheritance, private PolicyError, and the subscription family's fixed compatibility-name map. Preserve all current provenance-rule fixture outcomes.
- [ ] Add minimal naming enforcement using existing TypeScript AST infrastructure. Reject generic/no name and unstable constructor-derived naming in newly changed declarations; recognize existing explicit patterns and supported shared bases. Avoid a regex-only name test or blanket exception list.
- [ ] Run `node --test scripts/error-provenance-check.test.mjs` and `corepack pnpm check:error-provenance`; rescan all production custom declarations and reconcile each baseline action. Confirm the single definition constructor, deleted three subscription leaves, 24 stable names and no unintended loss of payload fields or inheritance chains.
- [ ] Record conventions: stable names/codes, module ownership, local identity versus transport guards, safe copy, cause/redaction, leaf-first dispatch, justified vendor adapters and no duplicate logging. Include the E1–E5 completion matrix and evidence locations.
- [ ] Run final relevant repo gates once: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test:unit`, `corepack pnpm build`. For publication also run existing `corepack pnpm build-storybook` and `corepack pnpm test:storybook:ci` gates as required; no new stories are needed for unchanged visual UI. Run `corepack pnpm exec playwright test tests/e2e/screen-effects.spec.ts tests/e2e/provider-connection-security.spec.ts tests/e2e/provider-security-runtime.spec.ts` against rebuilt disposable services, including updated safe-error/operator recovery scenarios. Reload the rebuilt UI and verify those affected workflows. Never use a normal profile or real provider credential.
- [ ] Validate OpenSpec, reconcile implementation to every scenario, and mark tasks complete only with passing evidence. Before any later PR/publication, follow repository approval/verification instructions; no commits, PR or publication are part of the current planning request.

**Exit:** All E1–E5 findings have concrete passing regressions and no relevant failing gate is reported green. If dependencies/runtime prevent execution, report the exact blocker and leave the corresponding tasks open.

## Current planning validation and implementation dependencies

This checkout has no installed workspace dependencies. The earlier disposable source probes used Node 24.15.0 and are audit evidence, not the full acceptance gate. Implementation must provision the manifest-declared Node/pnpm environment and frozen-lockfile dependencies before the tests above. Do not report planned tests as executed. Review current main for drift before carrying over the baseline. Planning artifacts can be validated without installing application dependencies.
