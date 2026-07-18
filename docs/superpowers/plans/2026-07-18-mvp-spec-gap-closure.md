# MVP Spec Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every material MVP gap found by the 2026-07-18 closed-spec audit without reintroducing workflows intentionally replaced by the approved UX refactor.

**Architecture:** Keep the existing alert rule/variant domain. The first variant remains the event default; later variants become independently routed variation editor items, while rule-level matching, cooldown, and priority remain shared. Extend the focused editor in place, reuse the existing log-retention and Speaker.bot WebSocket code, and finish by rerunning the spec audit before any completion claim.

**Tech Stack:** TypeScript, Node.js 24, Fastify, React 19, Zod, SQLite, WebSocket, Vitest, Testing Library, Storybook, Playwright, OpenSpec.

## Global Constraints

- Basic `Add alert` is already implemented; do not replace or duplicate it.
- Preserve approved replacements: alert sets, one live browser source per profile, provider-neutral canonical event matching, separate future operator UI, and listener state as secondary telemetry.
- Keep one active alert set and one active provider per capability. Multiple active sets/providers, bulk operations, custom profiles, keyframes/timelines, cloud sync, and alert-level TTS voice overrides remain backlog.
- TTS safety and default voice remain provider-level settings. Alert configuration owns enablement and template text only.
- Keep management authorization, CSRF handling, route-key authorization, redaction, and local-only binding unchanged.
- Every failure must include human-readable cause, next step, and reference ID tied to redacted diagnostics.
- Add no dependency unless an existing repo or platform API cannot satisfy a measured requirement.
- Each task must update its owning OpenSpec checklist only after focused tests pass.

---

### Task 1: Reopen Completion Tracking And Define Variant-Aware Contracts

**Files:**
- Modify: `openspec/changes/refactor-management-ui-ux/tasks.md`
- Modify: `openspec/changes/refactor-management-ui-ux/specs/alert-configuration-management/spec.md`
- Modify: `openspec/changes/add-speakerbot-tts-provider/design.md`
- Modify: `openspec/changes/add-speakerbot-tts-provider/specs/alert-tts-configuration/spec.md`
- Modify: `openspec/changes/add-speakerbot-tts-provider/tasks.md`
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `packages/core/src/alerts/alert-service.ts`
- Modify: `packages/core/src/alerts/alert-service.test.ts`

**Interfaces:**
- `AlertInventoryRow.id` is the editor route key: rule ID for the default, variant ID for a variation.
- Add `AlertInventoryRow.parentAlertId: string | null`; variations point to the default rule ID.
- Keep `AlertEditorDocument.conditions` as rule-wide conditions. Add `variantConditions`, `weight`, `priority`, `cooldownSeconds`, and `rulePriority`.
- Add `AlertService.createVariant(ruleId, input)` so ID generation stays in the existing domain service.
- Speaker.bot configuration stores provider kind and template per alert; voice alias remains in provider safety settings.

- [x] Add unchecked gap-closure sections to `refactor-management-ui-ux/tasks.md`; do not leave the change at 76/76 while its spec is unmet.
- [x] Replace the stale Speaker.bot dependency gate with an explicit dependency on Tasks 1-3 of this plan and record the provider-level voice decision.
- [x] Write failing contract tests for default/variation identity, parent linkage, rule/variant controls, and backward parsing of stored default documents.
- [x] Write failing `DefaultAlertService.createVariant` tests for generated IDs, duplicate-ID protection, and rule-not-found behavior.
- [x] Run `corepack.cmd pnpm test -- packages/core/src/management/contracts.test.ts packages/core/src/alerts/alert-service.test.ts`; expect failures from missing fields and method.
- [x] Add the minimum Zod fields and `createVariant` implementation, using schema defaults only for stored-document compatibility; server hydration in Task 2 restores actual rule values.
- [x] Rerun the focused command; expect all selected tests to pass.
- [x] Commit as `feat: define variant-aware alert editor contracts`.

### Task 2: Project Every Stored Variant Into One Editor Item

**Files:**
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-editor-document-repository.test.ts`
- Add: `apps/server/src/modules/db/migrations/010-variant-alert-editor-documents.ts`
- Add: `apps/server/src/modules/db/migrations/011-alert-variant-order.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-repository.ts`
- Modify: `apps/server/src/modules/alerts/sqlite-alert-repository.test.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- Modify: `apps/server/src/modules/providers/management-ui-service.ts`
- Modify: `apps/server/src/modules/providers/management-ui-service.test.ts`
- Modify: `apps/server/src/http/routes/management-ui.ts`
- Modify: `apps/server/src/http/routes/management-ui.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/server/src/modules/playback/playback-coordinator.ts`
- Modify: `apps/server/src/modules/playback/playback-coordinator.test.ts`
- Modify: `packages/core/src/alerts/alert-resolver.ts`
- Modify: `packages/core/src/alerts/alert-resolver.test.ts`
- Modify: `apps/server/src/app.test.ts`

**Interfaces:**
- Default editor key resolves to `rule.id` and `rule.variants[0]`; variation key resolves to its owning rule and exact variant.
- `AlertEditorDocumentRepository.delete(editorId)` removes obsolete variation/default documents.
- Editor-document persistence accepts rule IDs and variant IDs without weakening referential cleanup, and backup validation recognizes both identities.
- Live playback loads the saved editor document for the matched variant ID, falling back to the default rule document only for the default variant.
- Weighted variation selection happens once per event and is reused by every output target; resolved diagnostics retain the selected variant ID for every rendered layer.
- Variant order is persisted explicitly so the default remains first regardless of generated IDs, and async alert mutations serialize per SQLite connection.
- Add management commands `createAlertVariation`, `duplicateManagedAlert`, `resetManagedAlert`, and `deleteManagedAlert`.
- Add routes:
  - `POST /management/alerts/:alertId/variations`
  - `POST /management/alerts/:alertId/duplicate`
  - `POST /management/alerts/:alertId/reset`
  - `DELETE /management/alerts/:alertId`

- [x] Write failing editor-service tests proving all variants load separately, old stored default documents are hydrated from their current rule/variant, and saving one variant preserves every sibling.
- [x] Write failing migration, backup, and playback tests proving variant-keyed documents round-trip, restore safely, and render for matched variations.
- [x] Write failing management-service tests for create-from-default, duplicate disabled/needs-review, reset, variation deletion, rule deletion, per-variant enablement, and flattened inventory ordering.
- [x] Write failing route tests for valid commands, malformed input, missing IDs, last/default deletion impact, and live-output confirmation.
- [x] Run `corepack.cmd pnpm test -- apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/http/routes/management-ui.test.ts`; expect command failures.
- [x] Replace first-variant-only projection with one resolver returning `{ rule, variant, editorId, kind }`; update only the resolved variant on save.
- [x] Flatten each rule into one default row plus variation rows. Toggle a row's variant and derive `rule.enabled` from whether any variant remains enabled.
- [x] Persist copied profile documents for duplicates, delete their editor documents with their domain records, and keep set duplication disabled/needs-review.
- [x] Wrap domain, editor-document, and metadata writes in the existing runtime SQLite transaction boundary.
- [x] Rerun the focused command plus `apps/server/src/runtime/runtime-composition.smoke.test.ts`; expect all selected tests to pass.
- [x] Commit as `feat: support variant-aware alert persistence`.

### Task 3: Complete Alert And Variation Authoring Workflows

**Files:**
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-api.test.ts`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/alert-sets-page.css`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/editor-state.ts`
- Modify: `apps/web/src/management/alerts/editor/editor-state.test.ts`
- Modify: `tests/e2e/management-alerts.spec.ts`

**Interfaces:**
- Alert-set inventory groups rows by event type, with the default first and variations nested beneath it.
- `EventInspector` edits rule-wide conditions, variation conditions, variation weight/priority, rule priority, and cooldown.
- `copyAlertDesign(source, target)` copies layers, assets, animation, and both profile layouts only; identity, conditions, enablement, and sample data stay unchanged.

- [ ] Write failing API-client tests for all four management commands from Task 2.
- [ ] Write failing component tests for create variation, duplicate alert/variation, reset, delete confirmation, copy design, enable/disable, and condition editing.
- [ ] Add event-specific condition choices: raid viewer minimum, subscription tier/month minimum, cheer bits minimum, and explicit ingest-provider restriction.
- [ ] Render weight/priority only for variations; render shared cooldown/rule priority with clear shared-impact copy.
- [ ] Keep destructive and active-output actions behind impact confirmation; failures stay visible with reference ID and next step.
- [ ] Add Storybook states for default plus variations, destructive confirmation, duplicate needs-review, and invalid condition input.
- [ ] Add one Playwright flow creating a variation, editing its condition, saving it, duplicating it, and deleting only the duplicate.
- [ ] Run `corepack.cmd pnpm test -- apps/web/src/management/management-api.test.ts apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/editor-state.test.ts`; expect all selected tests to pass.
- [ ] Run `corepack.cmd pnpm test:e2e -- --grep "alert variation"`; expect the new workflow to pass.
- [ ] Commit as `feat: complete alert variation authoring`.

### Task 4: Complete Profile And Canvas Controls

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/editor-state.ts`
- Modify: `apps/web/src/management/alerts/editor/editor-state.test.ts`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`

**Interfaces:**
- Keep `CanvasViewState { zoom, scrollLeft, scrollTop }` per target profile for the editor session.
- Add pure `copyProfileLayout(document, sourceId, targetId)`; scale geometry by source/target dimensions and mark target `needs-review`.
- `Reset to template` calls Task 2's reset command after impact confirmation; do not invent a second template store.

- [ ] Write failing pure tests for cross-profile scaling, preserving source layout, target review state, and profile-specific view state.
- [ ] Write failing page tests for dirty profile switching with Save/Discard/Cancel and confirmation before overwriting an edited target profile.
- [ ] Add safe-area and grid toggles, neutral/checkerboard plus optional test background, fit-to-view, 100%, zoom controls, and scroll-based pan memory.
- [ ] Add animation duration, delay, and easing controls beside existing entrance/exit presets.
- [ ] Use the existing dirty-navigation modal semantics for profile switching; Discard reverts the document, Save persists it, and Cancel stays on the current profile.
- [ ] Add Storybook coverage for copied vertical layout, hidden guides/test background, and dirty profile switch.
- [ ] Run `corepack.cmd pnpm test -- apps/web/src/management/alerts/editor/AlertCanvas.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/editor-state.test.ts`; expect all selected tests to pass.
- [ ] Commit as `feat: complete alert canvas profile controls`.

### Task 5: Complete Preview And Sample Editing

**Files:**
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`

**Interfaces:**
- Add an event-type template-variable catalog in core and expose it through the editor document.
- Preview audio/TTS toggles default off and remain separate from Send test toggles, which default on.
- Preview clock owns `playing`, `elapsedMs`, and `durationMs`; replay resets to zero, pause freezes, and seek clamps to duration.

- [ ] Write failing schema tests for normal and edge-case built-in samples plus event-specific sample validation.
- [ ] Write failing page tests for template-variable insertion, sample reset, invalid sample blocking, preview replay/pause/seek, and preview audio/TTS opt-in defaults.
- [ ] Keep custom sample edits session-only. `Reset sample` restores the selected built-in payload without saving it to SQLite.
- [ ] Drive preset animation preview from one request-animation-frame clock and negative animation delay; do not add a timeline library.
- [ ] Reuse existing asset blob loading for optional audio preview and browser `speechSynthesis` for editor-only TTS preview; never call Speaker.bot from Preview.
- [ ] Add Storybook states for invalid sample, paused preview, edge-case sample, and optional preview media.
- [ ] Run `corepack.cmd pnpm test -- packages/core/src/management/contracts.test.ts apps/web/src/management/alerts/editor/AlertCanvas.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`; expect all selected tests to pass.
- [ ] Commit as `feat: complete alert preview and samples`.

### Task 6: Add Settings Maintenance Actions And Narrow-Screen Guard

**Files:**
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Create: `apps/server/src/modules/settings/local-maintenance-service.ts`
- Create: `apps/server/src/modules/settings/local-maintenance-service.test.ts`
- Modify: `apps/server/src/modules/providers/management-ui-service.ts`
- Modify: `apps/server/src/http/routes/management-ui.ts`
- Modify: `apps/server/src/http/routes/management-ui.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-api.test.ts`
- Modify: `apps/web/src/management/settings/SettingsPanel.tsx`
- Modify: `apps/web/src/management/settings/SettingsPanel.test.tsx`
- Modify: `apps/web/src/management/settings/SettingsPanel.stories.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`
- Modify: `tests/e2e/management-settings.spec.ts`
- Modify: `tests/e2e/management-alerts.spec.ts`

**Interfaces:**
- Add protected commands `POST /management/settings/open-data-folder` and `POST /management/settings/clear-old-logs`.
- `LocalMaintenanceService` receives the configured data directory, existing `LogRetentionService`, current log settings, and an injected platform path opener.
- At `max-width: 700px`, keep Back navigation and render a larger-screen message while hiding the interactive editor workspace.

- [ ] Write failing service tests for Windows/macOS/Linux open commands, spawn failure, bounded retention cleanup, missing log directory, and referenced cleanup failure.
- [ ] Implement the path opener with `node:child_process.spawn`: `explorer.exe` on Windows, `open` on macOS, and `xdg-open` on Linux. Pass only the configured data directory, never request input.
- [ ] Reuse `LogRetentionService.cleanupExpiredLogs`; return deleted count instead of adding another deletion path.
- [ ] Add Settings buttons, busy/success/error states, and Storybook coverage. Errors include cause, next step, and reference ID.
- [ ] Add the mobile message in the existing editor component and use the current `700px` CSS breakpoint; avoid JavaScript viewport branching.
- [ ] Add Playwright checks for both settings actions and the 390px editor guard.
- [ ] Run `corepack.cmd pnpm test -- apps/server/src/modules/settings/local-maintenance-service.test.ts apps/server/src/http/routes/management-ui.test.ts apps/web/src/management/settings/SettingsPanel.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`; expect all selected tests to pass.
- [ ] Commit as `feat: add local maintenance and mobile editor guard`.

### Task 7: Route Live Alert TTS Through Active Speaker.bot

**Files:**
- Create: `apps/server/src/modules/tts/speakerbot-client.ts`
- Create: `apps/server/src/modules/tts/speakerbot-client.test.ts`
- Create: `apps/server/src/modules/tts/speakerbot-tts-provider.ts`
- Create: `apps/server/src/modules/tts/speakerbot-tts-provider.test.ts`
- Modify: `apps/server/src/modules/providers/provider-management-adapters.ts`
- Modify: `apps/server/src/modules/providers/provider-management-adapters.test.ts`
- Modify: `apps/server/src/modules/tts/tts-provider-registry.ts`
- Modify: `apps/server/src/modules/tts/tts-provider-registry.test.ts`
- Modify: `packages/core/src/alerts/types.ts`
- Modify: `packages/core/src/alerts/alert-resolver.ts`
- Modify: `packages/core/src/alerts/alert-resolver.test.ts`
- Modify: `packages/core/src/tts/tts-service.ts`
- Modify: `packages/core/src/tts/tts-service.test.ts`
- Modify: `apps/server/src/modules/playback/playback-coordinator.ts`
- Modify: `apps/server/src/modules/playback/playback-coordinator.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `tests/e2e/management-alerts.spec.ts`
- Modify: `docs/mvp-runbook.md`

**Interfaces:**
- Extract the existing private `SpeakerBotClient`; both provider validation/voice test and live TTS reuse it.
- `SpeakerBotTtsProvider.id` is `speakerbot`; `createPlaybackInstruction` sends documented `Speak` and returns `mode: "remote-trigger"`.
- Editor TTS layers persist `providerId`, `enabled`, and `template`; voice resolves from the active provider's safety settings.
- Playback dispatch deduplicates remote TTS by source event, rule, variant/layer, provider, and rendered text before sending profile-specific overlay instructions.

- [ ] Update the OpenSpec design with the official WebSocket choice: default `127.0.0.1:7680/`, Auto Start guidance, and `Speak` request fields `id`, `request`, `voice`, `message`, and `badWordFilter`.
- [ ] Write failing client tests for successful Speak, timeout, malformed/error response, close/error, and redacted failures.
- [ ] Extract the tested client from `provider-management-adapters.ts`; keep the existing socket factory and add no WebSocket dependency.
- [ ] Write failing provider tests for active Speaker.bot resolution, inactive/wrong-kind registration, default voice alias, and successful remote-trigger instruction.
- [ ] Extend editor TTS controls with active provider and template only. Link to TTS Providers when none is active; keep per-alert voice override out of MVP.
- [ ] Make the resolver emit `browser-speech` only for that provider and `remote-trigger` for Speaker.bot.
- [ ] Dispatch each remote trigger once before profile-specific overlay delivery. On failure, continue visual/audio playback and write one referenced diagnostic.
- [ ] Add a Playwright test configuring an alert TTS layer and a runtime smoke test proving one Speaker.bot Speak request for one event delivered to two profiles.
- [ ] Run `corepack.cmd pnpm test -- apps/server/src/modules/tts apps/server/src/modules/playback/playback-coordinator.test.ts packages/core/src/tts packages/core/src/alerts/alert-resolver.test.ts apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`; expect all selected tests to pass.
- [ ] Commit as `feat: route alert TTS through Speaker.bot`.

**Primary protocol references:**
- [Speaker.bot WebSocket configuration](https://speaker.bot/api)
- [Speaker.bot WebSocket requests](https://speaker.bot/api/websocket/requests)

### Task 8: Prove MVP Closure And Correct Completion Claims

**Files:**
- Modify: `openspec/changes/refactor-management-ui-ux/tasks.md`
- Modify: `openspec/changes/add-speakerbot-tts-provider/tasks.md`
- Modify: `docs/design/ui-refactor-implementation-audit.md`
- Modify: `docs/mvp-final-review.md`
- Modify: `docs/product-plan.md`

**Interfaces:**
- Completion evidence maps every audited gap to production code, focused tests, Storybook state, Playwright workflow, and live runtime verification.

- [ ] Rerun the closed-spec audit against archived changes, both active completion candidates, current UX decisions, and current production code.
- [ ] Confirm no intentional UX replacement is reported as a gap and no open backlog item is promoted into MVP.
- [ ] Run `corepack.cmd pnpm lint`, `corepack.cmd pnpm typecheck`, `corepack.cmd pnpm test`, `corepack.cmd pnpm build`, `corepack.cmd pnpm test:storybook:ci`, and `corepack.cmd pnpm test:e2e`.
- [ ] Run `openspec.cmd validate refactor-management-ui-ux --strict` and `openspec.cmd validate add-speakerbot-tts-provider --strict`.
- [ ] Run `git diff --check`.
- [ ] Rebuild and restart every affected local service, wait for health, reload the management UI, and verify variation CRUD, editor controls, maintenance actions, narrow-screen guard, and live Speaker.bot playback.
- [ ] Update both task lists, the durable UI audit, stale final-MVP review, and product plan only after every prior step passes.
- [ ] Commit as `docs: record verified MVP spec closure`.

## Review Checkpoints

1. After Task 2: verify persisted identity and sibling preservation before UI work.
2. After Task 3: review complete variation workflow in the live management UI.
3. After Task 5: review focused editor parity against the approved UX spec.
4. After Task 7: validate Speaker.bot against a real local instance before completion.
5. After Task 8: archive completed OpenSpec changes in a separate reviewed operation.
