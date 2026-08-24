# Durable Alert Moderation Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing rendered-text and TTS moderation policy durable, consistently enforce it across preview, test, live, browser-speech, and Speaker.bot paths, and expose it through an explicit-save `Alert safety` management route.

**Architecture:** Keep `DefaultModerationService` as the one framework-independent policy engine and give it an optional typed settings repository so it can validate a complete next policy, persist it, and only then swap its in-memory state. A single SQLite row is loaded during runtime composition before event-source intake starts; the same service instance remains shared by alert resolution, editor test delivery, TTS providers, moderation routes, and post-restore reload. The web app adds one Alerts child route and uses a protected server preview contract instead of duplicating moderation rules in React.

**Tech Stack:** TypeScript 6 strict mode, Node 24 `node:sqlite`, Fastify 5, Zod 4, React 19, existing Stream Jams management components and CSS tokens, Vitest, Testing Library, Storybook 10, and Playwright.

**Spec:** `openspec/changes/add-durable-alert-moderation-controls/` (proposal, design, `alert-moderation-management` delta spec, and tasks)

## Global Constraints

- Start implementation from current `origin/main` only after re-fetching and confirming the prerequisite changes remain complete and present.
- Follow `openspec/changes/add-durable-alert-moderation-controls/` as the requirements source. Do not expand BL-005 beyond its proposal, design, delta spec, and tasks.
- Preserve current defaults exactly: rendered text `{ maxLength: 240, blockedTerms: [], stripUrls: false }`; TTS text `{ maxLength: 180, blockedTerms: [], stripUrls: true }`.
- Preserve current maximum-length validation exactly: integer values from 1 through 10,000 inclusive.
- Preserve the existing authenticated `GET /moderation/settings` and partial `PATCH /moderation/settings` contracts. The UI sends a complete policy, while older callers may continue sending partial updates.
- Every durable update must validate and normalize the complete next policy, write it successfully, and only then replace the active in-memory policy.
- Use one shared production moderation service. Do not create separate resolver, preview, test, browser-speech, or Speaker.bot policy instances.
- Keep provider-owned TTS voice, volume, rate, and other provider-registration settings on `TTS providers`; do not change the provider registration schema in this slice.
- Preserve the current text `textStyle`/`boxStyle`, animation, variation-authoring, event-inspector, and per-profile canvas behavior while substituting only moderated text values in Preview and Send test.
- Do not add a new dependency, event-payload field, raw-text log, moderation-history table, manual approval queue, user blocklist, heuristic classifier, provider AutoMod integration, or live moderation surface.
- Production overlays continue to receive only normalized playback instructions and fail closed/transparent on errors.
- Blocked terms may be included only in user-requested configuration backups. Viewer text, moderation samples, credentials, route keys, raw provider payloads, sessions, and operational logs remain excluded.

---

## Verified Baseline

Planning inspection was performed after:

```powershell
git -c safe.directory=C:/Users/James/.codex/worktrees/b01a/stream-jams fetch origin main --prune
```

Originally verified on 2026-07-26 and revalidated after fetching on 2026-08-23:

- Branch `codex/add-durable-alert-moderation-controls`, `HEAD`, `origin/main`, and their merge base are all `d1875944fa5557c9f81281717ca00d124f01e6b5`.
- The only worktree change at revalidation is this untracked planning document.
- `refactor-management-ui-ux` is 87/87 tasks complete and passes strict OpenSpec validation.
- `improve-management-ui-ux-audit-followups` is 56/56 tasks complete and passes strict OpenSpec validation.
- `add-speakerbot-tts-provider` is 19/19 tasks complete and passes strict OpenSpec validation.
- `add-alert-visual-style-controls` is 29/29 tasks complete on `origin/main`; it added text/box styles and migration 017.
- `improve-alert-variation-authoring` is 17/17 tasks complete on `origin/main`; it expanded the editor, variation workflow, event inspector, management contracts, and alert E2E coverage.
- `add-durable-alert-moderation-controls` contains all four planning artifacts, is 0/17 implementation tasks, and passes strict OpenSpec validation.
- `.codegraph/` contains no usable index, so the current-state trace used direct repository search.
- SQLite schema version is 17 and configuration backup archive version is 2.

Implementation must repeat the fetch/status/validation gate because this evidence is planning-time only.

### 2026-08-23 revalidation outcome

The OpenSpec proposal, design, delta spec, and 17 tasks remain correct and need no scope edits. The implementation plan did need these current-main corrections:

- Renumber the additive moderation migration from 017 to 018 and advance backup/database compatibility expectations from schema 17 to schema 18.
- Treat `017-alert-text-style-defaults` as immutable current history and prove an 017-to-018 upgrade preserves its document changes.
- Preserve styled text/box instructions, animation timing, selected variation identity, event-inspector samples, and profile canvas state while routing only text values through moderation.
- Extend the now-larger alert editor and Playwright regressions rather than replacing their visual-style or variation-authoring coverage.

No production contract has made the core approach obsolete: local Preview and server Send test still bypass the shared moderation service, persistence and backup support still do not exist, and no Alert safety route has been implemented.

## Current State And Reconciled Gaps

### Current production flow

```text
Twitch / Streamer.bot
        |
        v
provider normalization -> NormalizedStreamEvent
        |
        v
EventIngestionService -> EventPipeline -> PlaybackCoordinator
                                           |
                                           v
                                 DefaultAlertResolver
                                  |               |
                                  v               v
                         rendered SafeTemplate   TTS SafeTemplate
                                  |               |
                                  v               v
                              overlay         browser speech
                                                   |
                                                   +-> remote-trigger -> DefaultTtsService -> Speaker.bot
```

`createRuntimeAppComposition()` currently constructs one `DefaultModerationService` from defaults and injects it into both `DefaultAlertResolver` and `DefaultTtsService`. Live resolved text is therefore moderated, browser speech receives the resolver's moderated TTS instruction, and Speaker.bot passes through `DefaultTtsService` before its client call.

The active service is runtime-only:

- No moderation table or repository exists.
- Runtime composition always starts from `defaultModerationSettings`.
- `GET /moderation/settings` and `PATCH /moderation/settings` are protected and rate-limited, but PATCH changes memory only.
- Configuration backup owns an explicit SQLite table allowlist that does not include moderation policy.
- Restore replaces allowlisted tables but has no callback to reload the in-memory policy.

### Preview and test gaps

Two current editor paths bypass the shared policy:

1. `AlertEditorPage.previewLocally()` and `AlertCanvas` interpolate the sample in the browser and may pass raw TTS sample text to `speechSynthesis`.
2. `AlertEditorService.sendTest()` uses `DefaultTemplateRenderer` directly when creating text and TTS test instructions.

These are root boundaries, not isolated UI symptoms. The implementation must route both through the shared server policy; adding a filter only in `AlertSafetyPage` would leave real preview/test siblings inconsistent.

The two gaps still exist at `d1875944`: the expanded editor continues to render local samples in `AlertCanvas` and browser speech directly, and `AlertEditorService` still constructs `DefaultTemplateRenderer`. The new style/variation work changes the surrounding contracts but not this moderation diagnosis.

### UI and contract gaps

- `ManagementApi` still exposes moderation GET/PATCH methods, but no current production page calls them.
- `storyModerationSettings` and mock API methods survive from the removed Settings form.
- Alerts navigation has only the main `Alerts` child and focused editor route.
- No moderation preview endpoint exists.
- Provider pages own TTS provider configuration. BL-005 does not move those settings; `Alert safety` owns only global viewer-controlled rendered/TTS text transformation.

### Privacy boundary

The new moderation preview and action summaries must not echo original input. Existing normalized event diagnostics are a separate retained diagnostic contract and are not redesigned by BL-005. This slice adds no new event retention and no moderation history; it guarantees that new moderation API responses, errors, summaries, persistence, backups, and logs do not add original or removed viewer text.

## Locked Implementation Decisions

### 1. Single-row SQLite model

Add migration `018-alert-moderation-settings` after the existing `017-alert-text-style-defaults` migration:

```sql
CREATE TABLE alert_moderation_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  rendered_max_length INTEGER NOT NULL CHECK (rendered_max_length BETWEEN 1 AND 10000),
  rendered_blocked_terms_json TEXT NOT NULL,
  rendered_strip_urls INTEGER NOT NULL CHECK (rendered_strip_urls IN (0, 1)),
  tts_max_length INTEGER NOT NULL CHECK (tts_max_length BETWEEN 1 AND 10000),
  tts_blocked_terms_json TEXT NOT NULL,
  tts_strip_urls INTEGER NOT NULL CHECK (tts_strip_urls IN (0, 1)),
  updated_at TEXT NOT NULL
);

INSERT INTO alert_moderation_settings (
  id,
  rendered_max_length,
  rendered_blocked_terms_json,
  rendered_strip_urls,
  tts_max_length,
  tts_blocked_terms_json,
  tts_strip_urls,
  updated_at
) VALUES (1, 240, '[]', 0, 180, '[]', 1, CURRENT_TIMESTAMP);
```

Export the existing complete-policy normalization as `normalizeModerationSettings()` and reuse it in both `DefaultModerationService` and the SQLite adapter. The adapter parses JSON as unknown, constructs a candidate policy, and normalizes it before returning or replacing a row; this avoids duplicating validation without making the repository depend on a service that is itself loading the repository. `replace()` uses one `INSERT ... ON CONFLICT(id) DO UPDATE` inside `runInTransaction()`. There is no policy history, per-provider row, per-alert row, soft delete, or generic settings table.

### 2. Repository-backed core service

Create the framework-independent boundary:

```ts
export interface ModerationSettingsRepository {
  read(): ModerationSettings | null;
  replace(settings: ModerationSettings): void;
}
```

Extend the existing service without a second implementation:

```ts
export interface ModerationService {
  getSettings(): ModerationSettings;
  updateSettings(input: ModerationSettingsUpdate): ModerationSettings;
  reloadSettings(): ModerationSettings;
  preview(input: ModerationPreviewInput): ModerationPreviewResult;
  moderate(input: ModerationInput): ModerationResult;
}
```

`DefaultModerationService` receives `repository?: ModerationSettingsRepository`. Its constructor loads and normalizes the stored row. A defensive `null` read normalizes and persists canonical defaults before activating them; migration 018 normally guarantees this path is unnecessary. `updateSettings()` merges the partial input into the current policy, normalizes the complete result, calls `repository.replace(next)`, and assigns `#settings = next` only after the write returns. `reloadSettings()` follows the same valid-row/default-repair rule and swaps only after any required write succeeds.

This preserves the synchronous service/API surface because production persistence already uses synchronous `node:sqlite`; no async wrapper, second service class, queue, cache, or event emitter is needed.

### 3. Protected preview contract

Add:

```ts
export interface ModerationPreviewInput {
  readonly target: ModerationTarget;
  readonly text: string;
  readonly settings?: ModerationTargetSettings | undefined;
}

export interface ModerationPreviewResult extends ModerationResult {
  readonly target: ModerationTarget;
  readonly settings: ModerationTargetSettings;
}
```

Add `POST /moderation/preview` under the existing management rate-limit and auth hooks.

- If `settings` is omitted, preview uses the active target policy. Alert editor local preview uses this form.
- If `settings` is supplied, preview normalizes and uses that candidate for this call only. `Alert safety` uses this form before save.
- The result contains only target, normalized target settings, sanitized text, and action types/counts/bounds.
- The response has no original-input field. Its only text field is the sanitized result, which can naturally equal the input when no rule changes it; altered previews never include removed content. The service never changes active settings during preview.

### 4. API and backup compatibility

- Keep GET and PATCH paths, response shape, auth behavior, and partial PATCH semantics.
- The new UI submits both complete target objects so explicit save is atomic from the user's perspective.
- Migration 018 seeds existing databases with current defaults, so upgrading does not change output.
- Keep archive version 2 because the archive envelope does not change. The manifest schema version advances to 18.
- Preserve the existing exact-schema restore rule: schema-17 backups remain blocked by preflight with the current actionable compatibility error instead of being silently rewritten. A newly exported schema-18 backup contains the moderation row.
- Keep all provider-registration TTS fields unchanged. BL-005 does not redefine provider-specific limits or migrate provider settings into the global policy.

### 5. Backup reload

Add one optional `reloadRuntimeConfiguration(): void` callback to `ConfigurationBackupServiceOptions`.

- Invoke it after database replacement and config-file update succeed.
- If later work in the guarded replacement block fails and the database restore point is restored, invoke it again so runtime state matches the restored old row.
- Runtime composition supplies `() => moderationService.reloadSettings()`.
- Do not reload before the database transaction commits.

### 6. Alert safety form

`/manage/modules/alerts/safety` is an Alerts child route, not global Settings and not `/operator`.

The page has:

- Live-impact copy explaining that Save immediately affects local Preview, Send test, live rendered alerts, browser speech, and provider TTS.
- Separate `Rendered text` and `TTS text` fieldsets.
- A number input with `min=1`, `max=10000`, and `step=1` for each maximum length.
- A textarea with one blocked term per line, preserving spaces inside terms.
- An independent `Strip web links` checkbox for each target.
- `Save` and `Revert` actions plus the existing dirty-navigation `Save and leave`, `Discard`, and `Cancel` flow.
- A session-only example textarea and `Preview moderation` action.
- Normalized unique blocked-term lists, sanitized output, and safe action summaries returned by the preview endpoint.
- A link to `TTS providers` explaining that provider connection/voice/rate/volume configuration remains there.

The session-only example is not part of dirty policy state and is never sent on Save.

## File Map

### Create

- `packages/core/src/moderation/repository.ts` — typed persistence boundary.
- `apps/server/src/modules/db/migrations/018-alert-moderation-settings.ts` — additive table/default row migration after text-style defaults.
- `apps/server/src/modules/moderation/sqlite-moderation-settings-repository.ts` — one-row SQLite adapter.
- `apps/server/src/modules/moderation/sqlite-moderation-settings-repository.test.ts` — adapter normalization, replacement, failure, and restart evidence.
- `apps/web/src/management/alerts/safety/AlertSafetyPage.tsx` — explicit-save form and session preview.
- `apps/web/src/management/alerts/safety/AlertSafetyPage.test.tsx` — component behavior and failure coverage.
- `apps/web/src/management/alerts/safety/AlertSafetyPage.stories.tsx` — requested visual states.
- `apps/web/src/management/alerts/safety/alert-safety-page.css` — token-based dense form layout.
- `tests/e2e/management-alert-safety.spec.ts` — route, preview, save, reload, dirty navigation, and restore UI workflow.

### Modify

- `packages/core/src/moderation/moderation-service.ts`
- `packages/core/src/moderation/moderation-service.test.ts`
- `packages/core/src/index.ts`
- `packages/core/src/alerts/alert-resolver.test.ts`
- `packages/core/src/tts/tts-service.test.ts`
- `apps/server/src/modules/db/database.ts`
- `apps/server/src/modules/db/database.test.ts`
- `apps/server/src/runtime/runtime-composition.ts`
- `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- `apps/server/src/http/routes/moderation.ts`
- `apps/server/src/http/routes/moderation.test.ts`
- `apps/server/src/modules/alerts/alert-editor-service.ts`
- `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`
- `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- `apps/server/src/modules/backup/configuration-backup-service.ts`
- `apps/server/src/modules/backup/configuration-backup-service.test.ts`
- `apps/web/src/management/management-api.ts`
- `apps/web/src/management/management-api.test.ts`
- `apps/web/src/management/routing/management-route.ts`
- `apps/web/src/management/routing/management-route.test.ts`
- `apps/web/src/management/navigation/ManagementNavigation.test.tsx`
- `apps/web/src/management/navigation/ManagementNavigation.stories.tsx`
- `apps/web/src/management/ManagementApp.tsx`
- `apps/web/src/management/ManagementApp.test.tsx`
- `apps/web/src/management/ManagementApp.stories.tsx`
- `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- `apps/web/src/management/alerts/editor/AlertCanvas.tsx`
- `apps/web/src/management/alerts/editor/AlertCanvas.test.tsx`
- `apps/web/src/stories/story-fixtures.ts`
- `apps/web/src/stories/mock-apis.ts`
- `apps/web/src/App.test.tsx`
- `tests/e2e/management-alerts.spec.ts`
- `openspec/changes/add-durable-alert-moderation-controls/tasks.md` — check off only after each implementation task has evidence.
- `docs/backlog.md` — remove BL-005 only after implementation is complete and the delta spec has been synchronized.

No change is planned for provider registration contracts, event normalizers, event-log tables, overlay WebSocket contracts, operator controls, or global Settings.

---

### Task 1: Reconfirm The Implementation Gate

**Files:**
- Read: `AGENTS.md`
- Read: `docs/ai/frontend-agent-guide.md`
- Read: `openspec/changes/add-durable-alert-moderation-controls/`
- Read: current moderation, database, backup, alert editor, TTS, route, and management files listed above
- Modify only for verified requirements drift: this plan and the target OpenSpec artifacts

**Interfaces:**
- Consumes: current `origin/main` and the complete target/prerequisite OpenSpec sets.
- Produces: a clean feature branch whose base and task contracts match current code.

- [x] Fetch `origin/main`, confirm a clean worktree, and record `HEAD`, `origin/main`, and merge base.
- [x] Confirm the three prerequisite changes still have complete task sets, pass strict validation, and have their implementations on `origin/main`.
- [x] Confirm `add-alert-visual-style-controls` and `improve-alert-variation-authoring` remain complete and present, then preserve their migration 017, styled text instruction fields, variation identity, event-inspector sample flow, and expanded browser tests while adding moderation.
- [x] Confirm BL-005 is still unimplemented: no `alert_moderation_settings` table, repository-backed moderation service, `/manage/modules/alerts/safety` route, or backup allowlist entry.
- [x] Run:

```powershell
openspec.cmd validate add-durable-alert-moderation-controls --strict
```

Expected: `Change 'add-durable-alert-moderation-controls' is valid`.

- [x] Reconcile this plan first if current names or contracts drifted; do not add compatibility shims for a stale plan.
- [x] Commit implementation-session planning drift only if files changed: `docs(alerts): reconcile moderation implementation plan`.

### Task 2: Make The Core Policy Durable

**Files:**
- Create: `packages/core/src/moderation/repository.ts`
- Create: `apps/server/src/modules/db/migrations/018-alert-moderation-settings.ts`
- Create: `apps/server/src/modules/moderation/sqlite-moderation-settings-repository.ts`
- Create: `apps/server/src/modules/moderation/sqlite-moderation-settings-repository.test.ts`
- Modify: `packages/core/src/moderation/moderation-service.ts`
- Modify: `packages/core/src/moderation/moderation-service.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/server/src/modules/db/database.ts`
- Modify: `apps/server/src/modules/db/database.test.ts`

**Interfaces:**
- Consumes: `ModerationSettings`, `ModerationSettingsUpdate`, `defaultModerationSettings`, and `runInTransaction`.
- Produces: `ModerationSettingsRepository`, repository-backed `DefaultModerationService`, migration 018, and `SqliteModerationSettingsRepository`.

- [ ] Add failing core tests for persisted initialization, normalized replacement, write-before-swap, previous-policy retention when `replace()` throws, `reloadSettings()`, and a second service instance recovering the same stored policy.

Representative failure assertion:

```ts
it("keeps the previous active policy when persistence fails", () => {
  const repository = new RecordingRepository(defaultModerationSettings);
  const service = new DefaultModerationService({ repository });
  repository.replaceError = new Error("database is read-only");

  expect(() => service.updateSettings({
    renderedText: { blockedTerms: ["spoiler"] }
  })).toThrow("database is read-only");

  expect(service.getSettings()).toEqual(defaultModerationSettings);
});
```

- [ ] Add a failing migration assertion that schema 18 contains exactly one moderation row with canonical defaults and that re-running migrations does not duplicate it.
- [ ] Add a failing valid-prefix upgrade test by removing only migration 018 and `alert_moderation_settings` from an in-memory schema-18 database, re-running migrations twice, and checking that migration 017 text-style data remains intact while migration 018 restores defaults in exact order.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run packages/core/src/moderation/moderation-service.test.ts apps/server/src/modules/db/database.test.ts apps/server/src/modules/moderation/sqlite-moderation-settings-repository.test.ts
```

Expected: FAIL because migration, repository, and durability contracts do not exist.

- [ ] Add migration 018 after `017-alert-text-style-defaults` and update `expectedMigrations`, `expectedTables`, and `currentSchemaVersion` expectations without renumbering or editing migration 017.
- [ ] Add the repository interface and SQLite adapter. Export the current complete-policy normalization as `normalizeModerationSettings()`; parse both blocked-term JSON columns as unknown, construct a complete candidate, and normalize it through that shared function before returning or replacing.
- [ ] Extend `DefaultModerationService` exactly as locked above. Do not catch repository write errors or assign the candidate before persistence succeeds.
- [ ] Export only the new public types needed by server and web through `packages/core/src/index.ts`.
- [ ] Re-run the focused command; expect all tests to pass.
- [ ] Commit as `feat(moderation): persist alert text policy`.

### Task 3: Wire Startup And Protected Moderation APIs

**Files:**
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/server/src/http/routes/moderation.ts`
- Modify: `apps/server/src/http/routes/moderation.test.ts`
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-api.test.ts`
- Modify: `apps/web/src/stories/story-fixtures.ts`
- Modify: `apps/web/src/stories/mock-apis.ts`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: Task 2 repository/service and existing management HTTP client.
- Produces: one startup-loaded shared service, backward-compatible GET/PATCH, and protected POST preview.

- [ ] Add failing route tests for:
  - GET returning the stored normalized policy.
  - partial PATCH persisting the complete merged policy.
  - persistence failure returning the standard 500 response with an error ID while leaving the prior policy active.
  - POST preview with active settings.
  - POST preview with unsaved candidate settings.
  - preview returning normalized settings, sanitized text, and safe actions without original input.
  - missing management session and overlay bearer key rejection before GET, PATCH, or preview service work.
  - rate limiting before preview work.
- [ ] Add failing management-client tests that assert:

```ts
await api.previewModeration({
  target: "rendered",
  text: "Spoiler https://example.test",
  settings: { maxLength: 100, blockedTerms: [" spoiler "], stripUrls: true }
});
```

sends `POST /moderation/preview` with management auth/CSRF headers and parses only the safe result.

- [ ] Add a failing runtime smoke test that writes a non-default policy, recreates composition on the same database, reads it through GET, and proves the custom policy is active before `syncEventSourceRuntime()` can connect intake.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/http/routes/moderation.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts apps/web/src/management/management-api.test.ts
```

Expected: new durability and preview assertions fail.

- [ ] Construct `SqliteModerationSettingsRepository` immediately after opening the migrated database and pass it to the single `DefaultModerationService`.
- [ ] Keep that service injected into `DefaultAlertResolver`, `DefaultTtsService`, and `createServerApp`.
- [ ] Add `POST /moderation/preview` using the same `preHandler` array as GET/PATCH. Parse target/text/candidate settings at the boundary and map `InvalidModerationSettingsError` to the existing safe 400 response.
- [ ] Keep PATCH partial for compatibility; let the service merge and persist the complete next policy.
- [ ] Add `previewModeration()` to `ManagementApi`, use the existing HTTP client, and update only compile-required mocks/fixtures.
- [ ] Re-run focused tests; expect pass.
- [ ] Commit as `feat(moderation): expose durable policy preview`.

### Task 4: Close Server Playback And Provider Enforcement Gaps

**Files:**
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `packages/core/src/alerts/alert-resolver.test.ts`
- Modify: `packages/core/src/tts/tts-service.test.ts`
- Modify if the integration assertion belongs there: `apps/server/src/modules/playback/playback-coordinator.test.ts`

**Interfaces:**
- Consumes: shared `ModerationService`, `SafeTemplateRenderer`, alert editor test request, resolver, and TTS service.
- Produces: moderated Send test instructions plus browser-speech and Speaker.bot regression evidence.

- [ ] Add a failing alert editor service test with different rendered/TTS policies and a sample containing a blocked term, URL, and excess length. Assert enqueued text and TTS instructions contain only their independently sanitized outputs.
- [ ] In the same Send test coverage, assert the text instruction retains the candidate layer's current `textStyle`, `boxStyle`, layout, animation timing, target profile, and selected variation identity; moderation changes only rendered text.
- [ ] Add a failing assertion that omitted TTS/audio layers remain omitted and moderation does not change the existing target-profile/connectivity blockers.
- [ ] Extend resolver coverage so a live browser-speech instruction receives the active TTS policy while visual text receives the rendered policy.
- [ ] Extend TTS service coverage so a provider named `speakerbot` receives sanitized text and safe actions; assert the raw removed string is absent from the provider input and serialized action list.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/alerts/alert-editor-service.test.ts packages/core/src/alerts/alert-resolver.test.ts packages/core/src/tts/tts-service.test.ts apps/server/src/modules/playback/playback-coordinator.test.ts
```

Expected: Send test assertions fail because `AlertEditorService` still uses `DefaultTemplateRenderer`.

- [ ] Add `moderationService` to `AlertEditorServiceOptions` and create rendered/TTS `SafeTemplateRenderer` instances over its existing template renderer.
- [ ] Select the rendered renderer only for text layers and the TTS renderer only for TTS layers inside `createLayerInstruction`.
- [ ] Inject the same runtime moderation service into `AlertEditorService`; do not construct a production fallback instance.
- [ ] Leave event normalization, matching, queueing, provider payload structure, and diagnostic event persistence unchanged.
- [ ] Re-run focused tests; expect pass.
- [ ] Commit as `fix(alerts): moderate editor test playback`.

### Task 5: Add Backup, Restore, And Runtime Reload

**Files:**
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.ts`
- Modify: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.ts`
- Modify: `apps/server/src/modules/backup/configuration-backup-service.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`

**Interfaces:**
- Consumes: Task 2 table/repository, current explicit table allowlist, restore point, and runtime moderation service.
- Produces: schema-18 backups containing policy, invalid-policy preflight blocking, transactional replacement, and post-restore active reload.

- [ ] Add failing snapshot tests that require `alert_moderation_settings` in exported tables with only configuration columns and no sample/viewer data.
- [ ] Add failing validation tests for missing row, duplicate row, wrong singleton ID, invalid bounds, invalid blocked-term JSON/value types, and secret-shaped extra columns.
- [ ] Add failing replace/restore-point tests proving the policy participates in the same transaction and prior policy returns after rollback.
- [ ] Add failing backup service tests proving:
  - policy contributes one configuration record.
  - preflight blocks invalid policy before `replace()`.
  - successful restore invokes `reloadRuntimeConfiguration()` after replacement.
  - replacement/config failure restores the database row and reloads prior runtime state.
  - exported JSON contains configured blocked terms but no preview sample, original viewer text, credentials, route keys, or logs.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts apps/server/src/modules/backup/configuration-backup-service.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts
```

Expected: allowlist, validation, and reload assertions fail.

- [ ] Add the new table definition with deterministic singleton ordering and blocked-term JSON columns.
- [ ] Add singleton/domain validation without loosening unknown-table, missing-table, exact-column, reference, checksum, or exact-schema checks.
- [ ] Include the table in capture/restore-point and replace order automatically through `tableDefinitions`.
- [ ] Add and invoke `reloadRuntimeConfiguration()` only at the committed-success and restored-rollback points described above.
- [ ] Pass `() => moderationService.reloadSettings()` from runtime composition.
- [ ] Re-run focused tests; expect pass.
- [ ] Commit as `feat(backup): include alert moderation policy`.

### Task 6: Add The Alert Safety Route And Explicit-Save UI

**Files:**
- Create: `apps/web/src/management/alerts/safety/AlertSafetyPage.tsx`
- Create: `apps/web/src/management/alerts/safety/AlertSafetyPage.test.tsx`
- Create: `apps/web/src/management/alerts/safety/AlertSafetyPage.stories.tsx`
- Create: `apps/web/src/management/alerts/safety/alert-safety-page.css`
- Modify: `apps/web/src/management/routing/management-route.ts`
- Modify: `apps/web/src/management/routing/management-route.test.ts`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.test.tsx`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.stories.tsx`
- Modify: `apps/web/src/management/ManagementApp.tsx`
- Modify: `apps/web/src/management/ManagementApp.test.tsx`
- Modify: `apps/web/src/management/ManagementApp.stories.tsx`
- Modify: `apps/web/src/stories/story-fixtures.ts`
- Modify: `apps/web/src/stories/mock-apis.ts`

**Interfaces:**
- Consumes: Task 3 management GET/PATCH/preview methods and existing dirty navigation/toast/error components.
- Produces: route ID `alert-safety`, `/manage/modules/alerts/safety`, explicit-save form, and requested Storybook states.

- [ ] Add route/navigation tests for parse, format, breadcrumbs, `Modules > Alerts > Safety` selection, internal-link routing, and preservation of the focused editor route.
- [ ] Add failing component tests for:
  - loading saved rendered/TTS values.
  - one-term-per-line editing and normalized duplicate preview.
  - independent bounds and URL toggles.
  - preview using candidate settings without saving.
  - sanitized output plus action counts/bounds.
  - Save sending a complete policy and adopting the normalized response.
  - Revert restoring the last saved policy.
  - dirty navigation Save and leave, Discard, and Cancel.
  - invalid bounds blocking Save/preview with inline field errors.
  - save failure preserving the draft and showing safe actionable error/reference data.
  - initial-load failure.
  - provider-safety separation link/copy.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/alerts/safety/AlertSafetyPage.test.tsx apps/web/src/management/routing/management-route.test.ts apps/web/src/management/navigation/ManagementNavigation.test.tsx apps/web/src/management/ManagementApp.test.tsx
```

Expected: FAIL because the route/page do not exist.

- [ ] Implement the page with controlled draft state. Use numeric field validity plus explicit integer/range checks; split blocked-term text only on line breaks.
- [ ] Compute `dirty` from saved versus complete draft policy. Register `useDirtyNavigationSource({ id: "alert-safety-policy", ... })`.
- [ ] On preview, call `previewModeration()` once for rendered and once for TTS with the same session sample and each candidate target settings object. Adopt returned normalized settings only in the displayed preview, not the unsaved form, until Save succeeds.
- [ ] On Save, send both complete targets through `updateModerationSettings()`, replace saved/draft with the normalized response, clear dirty state, and show the shared success toast.
- [ ] Use semantic `form`, `fieldset`, `legend`, `label`, `textarea`, number inputs, checkboxes, headings, status lists, and buttons. Do not add a tab library or custom ARIA widget.
- [ ] Add Storybook scenarios named:
  - `CanonicalDefaults`
  - `EditedUnsavedPolicy`
  - `NormalizedDuplicateTerms`
  - `ModeratedExample`
  - `InvalidBounds`
  - `SaveFailure`
  - `NarrowViewport`
- [ ] Add/update the full-shell story at `/manage/modules/alerts/safety` so navigation/breadcrumb context is inspectable.
- [ ] Re-run focused tests; expect pass.
- [ ] Commit as `feat(alerts): add durable safety settings`.

### Task 7: Moderate Alert Editor Local Preview

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.test.tsx`
- Modify compile-required management mocks: `apps/web/src/stories/mock-apis.ts`, `apps/web/src/App.test.tsx`, `apps/web/src/management/ManagementApp.test.tsx`

**Interfaces:**
- Consumes: active-policy preview API from Task 3 and the existing client-side template context.
- Produces: sanitized visual/TTS local preview without duplicating policy logic in the browser.

- [ ] Add failing tests proving Preview renders server-sanitized text on the canvas and speaks only server-sanitized TTS text.
- [ ] Add a failing test proving preview waits for all moderation responses and does not start or speak when moderation fails.
- [ ] Add regressions for audio/TTS opt-in defaults, replay, sample validation, preview timing, and Send test separation.
- [ ] Add regressions for the current variation selector, event inspector/custom sample, profile-specific canvas state, text/box styling, and animation timing so server-moderated preview text does not roll back the visual-style or variation-authoring work now on `origin/main`.
- [ ] Add an `AlertCanvas` test proving authoring mode still shows ordinary template interpolation while preview mode uses `previewTextByLayerId`.
- [ ] Run:

```powershell
corepack.cmd pnpm vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/AlertCanvas.test.tsx
```

Expected: sanitized-preview assertions fail because the browser currently interpolates raw text.

- [ ] Make `previewLocally()` asynchronous. Render each visible text/TTS template to a local string, call `previewModeration({ target, text })`, and index returned sanitized strings by layer ID.
- [ ] Start visual timing and optional media only after all required moderation calls succeed.
- [ ] Pass a `previewTextByLayerId` map to `AlertCanvas` only while preview is active. `CanvasLayer` selects the mapped string for text content while continuing to apply `alertTextLayerStyle()` from the layer's unchanged `textStyle` and `boxStyle`; authoring mode keeps current template interpolation.
- [ ] Pass sanitized TTS results to `SpeechSynthesisUtterance`; never speak the locally rendered raw string.
- [ ] Keep sample text in component state only. Do not persist it, put it in a URL, add it to a story error, or log it on failure.
- [ ] Update editor stories for a moderated preview and a safe preview failure.
- [ ] Re-run focused tests; expect pass.
- [ ] Commit as `fix(alerts): moderate local alert previews`.

### Task 8: Browser, Live, Privacy, And Completion Verification

**Files:**
- Create: `tests/e2e/management-alert-safety.spec.ts`
- Modify: `tests/e2e/management-alerts.spec.ts`
- Modify only for verified requirement evidence: tests/stories above
- Modify after implementation evidence exists: `openspec/changes/add-durable-alert-moderation-controls/tasks.md`
- Modify after spec synchronization: `docs/backlog.md`

**Interfaces:**
- Consumes: Tasks 1-7.
- Produces: browser/live evidence for every OpenSpec scenario and synchronized completion artifacts.

- [ ] Add Playwright coverage with mocked management endpoints for:
  - opening `Alert safety` from nested Alerts navigation.
  - loading canonical values.
  - editing both policies independently.
  - previewing a sample with a URL, duplicate blocked term, and truncation.
  - checking sanitized text and safe action summaries.
  - Save, page reload, and persisted values.
  - dirty navigation Save and leave, Discard, and Cancel.
  - invalid bound and save-failure states.
  - schema-18 backup restore returning the saved policy to the page.
- [ ] Extend the existing focused alert editor E2E case to mock `/moderation/preview` and assert canvas/TTS preview uses its sanitized response before Send test.
- [ ] Run focused gates:

```powershell
corepack.cmd pnpm vitest run packages/core/src/moderation apps/server/src/http/routes/moderation.test.ts apps/server/src/modules/moderation apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/backup apps/web/src/management/alerts/safety apps/web/src/management/alerts/editor
corepack.cmd pnpm exec playwright test tests/e2e/management-alert-safety.spec.ts tests/e2e/management-alerts.spec.ts
```

Expected: all focused tests pass with no skipped in-scope cases.

- [ ] Run repository/frontend gates:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test:unit
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate add-durable-alert-moderation-controls --strict
git -c safe.directory=C:/Users/James/.codex/worktrees/b01a/stream-jams diff --check
```

Expected: every command exits 0. A relevant failure blocks completion; do not call a partially failing suite green.

- [ ] Rebuild and restart the local service, wait for `/health`, and reload `/manage/modules/alerts/safety`.
- [ ] Save a non-default policy, reload the page, restart the service, and confirm the same policy loads before event intake resumes.
- [ ] Preview a sample containing a blocked term, URL, and over-limit content. Confirm only sanitized output and action type/count/bound appear.
- [ ] Open the alert editor with a sample containing the same content. Verify local visual preview, optional browser speech, Send test overlay delivery, and a normalized live/test event all receive the target-specific sanitized output.
- [ ] With a disposable configured Speaker.bot instance, verify its captured `message` is sanitized and no raw sample appears in application logs. If the provider is unavailable, record the environment limitation and rely on the required provider-service/integration tests without claiming a live Speaker.bot check.
- [ ] Export a schema-18 backup, inspect it for the moderation row and exclusions, change policy, restore the backup, and confirm the restored policy becomes active without an application restart.
- [ ] Force or simulate persistence and restore failures. Confirm the previous policy remains active and the UI shows actionable safe errors with reference IDs.
- [ ] Inspect runtime logs, Diagnostics, browser console/network response bodies, and the exported archive. Confirm no preview input, original/removed viewer text, credential, route key, session, or raw provider payload was added by this change.
- [ ] Reconcile each delta-spec scenario to a named test/live check and check off the 17 OpenSpec tasks only when its evidence exists.
- [ ] Use the `openspec-sync-specs` workflow to synchronize `alert-moderation-management` into main specs after implementation approval.
- [ ] Remove BL-005 from `docs/backlog.md` only after implementation and spec synchronization are both complete.
- [ ] Complete one independent frontend review using `.agents/skills/stream-jams-frontend-review`; fix actionable in-scope findings and rerun affected gates.
- [ ] Commit completion evidence as `test(moderation): verify durable alert safety`.

## OpenSpec Task Reconciliation

| OpenSpec task | Plan ownership | Current-code reconciliation |
| --- | --- | --- |
| 1.1 prerequisite gate | Task 1 | Revalidated on the feature branch at `d187594`; the formal prerequisites and the later visual-style/variation changes are on current `origin/main`, but the gate must be repeated if main advances before implementation. |
| 1.2 boundary reconciliation | Tasks 1-7 | Live resolver/TTS share a service; local Preview and Send test bypass it and are explicit tasks here. |
| 2.1 migration defaults | Task 2 | New schema version is 18 because `017-alert-text-style-defaults` is now on main; seed exact current defaults. |
| 2.2 typed repository | Task 2 | One core sync interface and one `node:sqlite` adapter; no second service class. |
| 2.3 durability tests | Task 2 | Includes normalization, write-before-swap, failure retention, restart, and privacy. |
| 2.4 shared composition | Tasks 3-4 | Load during composition before intake sync; inject into resolver, editor test, TTS, and routes. |
| 3.1 backup tests | Task 5 | Adds policy inclusion, strict invalid blocking, exclusions, and reload/rollback checks. |
| 3.2 allowlist/reload | Task 5 | Add table definition and one runtime reload callback after commit/rollback. |
| 3.3 path consistency | Tasks 4 and 7 | Live/browser/provider coverage exists partly; add explicit Send test and local Preview enforcement. |
| 4.1 route/client tests | Task 3 | Preserve GET/PATCH and add protected POST preview plus persistence failure coverage. |
| 4.2 Alert safety route | Task 6 | Add stable route ID and nested Alerts navigation. |
| 4.3 component tests | Task 6 | Includes all listed state, normalization, separation, and failure cases. |
| 4.4 Storybook | Task 6 | Seven named scenarios plus full-shell route context. |
| 4.5 Playwright | Task 8 | Adds save/reload/preview/restore and editor preview integration. |
| 5.1 required gates | Task 8 | Uses current package scripts and frontend guide commands. |
| 5.2 requirements/review | Task 8 | Maps scenarios, strict-validates, syncs specs, and runs one frontend review. |
| 5.3 rebuilt live workflow | Task 8 | Covers restart durability, all text paths, backup/restore, privacy, and failure paths. |

## Migration And Backward-Compatibility Decisions

- Database upgrade is additive from schema 17 to 18 and seeds behavior-preserving moderation defaults without changing migration 017 text-style data.
- Existing settings HTTP callers keep working because GET/PATCH paths and partial updates remain.
- The new management form sends a complete policy; the service still persists one complete row after merging any partial caller input.
- Missing repository row falls back to canonical defaults and is reinserted by the service/repository path; invalid stored data fails startup rather than silently activating an unknown policy.
- Backup archive envelope remains version 2; schema version becomes 18.
- Existing exact-schema restore behavior remains authoritative. Older schema-17 archives are rejected with the existing compatibility blocker and are not silently upgraded.
- Provider registration and provider-owned safety JSON are neither migrated nor removed.
- Additive table rollback does not delete user policy. Application downgrade across an unknown migration remains unsupported by the existing exact migration-history guard.

## Security And Privacy Risks

| Risk | Required control and evidence |
| --- | --- |
| Unauthorized policy read/change | Existing management rate limit and auth hooks protect GET, PATCH, and POST preview; overlay keys fail before service work. |
| Live policy changes despite failed save | Repository write completes before `#settings` swap; failure test proves previous durable/active policy remains. |
| Preview sample retained or echoed | Sample exists only in request/component memory; response contains sanitized text/actions only; archive/log/network-response inspection proves exclusion. |
| Raw text reaches overlay/provider | Safe renderers enforce target policy before overlay instructions; TTS service enforces before provider call; tests assert raw strings absent. |
| Restore/runtime divergence | Reload occurs only after committed replacement and again after rollback restoration; integration test observes active policy immediately. |
| Blocked terms leak through support data | Terms are permitted only in user configuration backup, never diagnostics exports, errors, runtime logs, or Storybook args. |
| Regex injection from blocked terms | Existing `escapeRegExp` remains mandatory; normalized literal terms are the only pattern input. |
| Oversized/invalid policy | Existing Fastify body limit/rate limit plus integer 1-10,000 and array/string validation; SQLite checks guard stored scalar values. |
| Secret leakage in browser artifacts | No credentials, route keys, provider payloads, or secret refs enter client contracts, stories, screenshots, or docs examples. |
| Broken live overlay exposes diagnostics | Overlay receives normalized instructions only and retains transparent fail-closed production behavior. |

## Explicit Non-Goals

- Manual approval/rejection queues or review-before-playback.
- Per-user blocklists, bans, trust scores, spam throttles, repeated-character heuristics, or language detection.
- Machine-learning moderation, Twitch AutoMod, Streamer.bot moderation actions, or provider-specific classification.
- Moderation history, raw-text audit logs, new diagnostics tables, or changes to normalized event-log retention.
- Per-alert or per-variation moderation policies.
- Moving alert safety into global Settings, TTS provider setup, Home, Diagnostics, or `/operator`.
- Changing provider-owned voice/rate/volume controls or the provider registration schema.
- Changing template syntax, event normalization, matching, queue priority, cooldown, dedupe, overlay auth, or route-key behavior.
- Changing browser-source error presentation, overlay composition contracts, or introducing visible live fallback text.
- Import-time migration of older backup archives, backup merge, cloud sync, or policy version history.
- Additional Unicode normalization, whole-word-only matching, regex terms, category lists, or configurable replacement text.
