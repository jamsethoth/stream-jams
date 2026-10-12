# Data Overlays Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute the units below. The user explicitly selected GPT-6.1-sol at medium effort for implementation and authorized planning followed by execution. Repository policy limits independent review to one final review.

**Goal:** Implement the four approved data-overlay slices in dependency order, with usable Management, Operator, browser and desktop surfaces and documented verification limits.

**Architecture:** Core owns typed values, goal calculations, declarative rules and safe projections. Typed SQLite repositories commit shared state atomically; thin management/Operator routes and existing output transports expose the state. The central event bus owns all event ingestion and replay; the data module must not create a replacement intake.

**October 11 integration note:** This dated plan preserves its October 8 baseline and evidence. The [main integration reassessment](../../verification/data-overlays-main-reassessment.md) supersedes its missing-bus blocker: event rules and follower hints are ready for implementation, and live Creator Goals need source integration. Only Streamer.bot globals remain fixture-blocked. Data migrations now append as 042/043 (backup schemas 41/42), replacing this plan's original candidate numbering.

**Tech Stack:** Existing strict TypeScript/ESM, Zod, Node SQLite, Fastify, React, Mantine and Playwright/Vitest/Storybook. Use the locked pnpm runtime and no new dependency for canvas editing.

**Specs:** `openspec/changes/add-custom-data-overlays/`, `add-data-overlay-event-rules/`, `add-twitch-overlay-data/`, `add-data-overlay-templates/`. Read the assigned slice's design and normative specs before changing code. The revised main spec supersedes the earlier proposal branch.

## Global Constraints

- Base: freshly fetched `origin/main` at `55d29f2b`; implementation branch `codex/data-overlays-implementation`, existing Windows worktree `cba2/stream-jams`.
- All four slices are authorized. Each is a separate implementation/verification checkpoint. Implementing dependent slices atop a locally committed predecessor is authorized; merging to main or publishing is not required to develop them and is not implied by this request.
- Central bus is absent: PR #160 merged planning only, 0/29 implementation tasks. Automatic rules and Twitch live-event integration remain blocked until that prerequisite exists or the user authorizes including it. Complete independent work while resolving this dependency.
- Integer and plain text only; text maximum 2 KiB UTF-8. Values1000, goals250, canvases50, elements100 per canvas. Names compare after JavaScript trim/lowercase; immutable value kinds.
- Manual reset by default; shared values persist independently of canvases. Management edits definitions; Operator changes live content. Set uses expected value revision; deltas serialize without a revision precondition.
- Group reset changes all members and restarts dependent saved-baseline goals atomically, with one aggregate revision/publication.
- Output projections carry runtime identity and data revision, contain only referenced data and no credentials/raw paths, preserve other modules' media, and use existing shared surfaces.
- Default stale policy retains last good data for ten minutes, then hides. Ended/invalid sources hide immediately; manual values never become stale.
- No arbitrary code, remote assets, new producer API, money/decimal types or implicit activity replay. Preserve all existing provider/security/runtime boundaries.
- No normal user data/profile changes. Real Twitch/Streamer.bot and physical output acceptance require concrete isolated candidates and explicit safe access. Never fabricate captured fixtures or hardware success.

## Review Focus

- Safe inputs can overflow intermediate goal arithmetic: unit1 pins extreme baseline/current/target behavior.
- A stale asynchronous image lookup can supersede current output: unit3 pins snapshot revision and registration ordering.
- A group reset can partially write or increment the aggregate revision multiple times: unit2 pins transaction rollback and notification count.
- Operator polling can erase a failed set draft: unit4 pins retained draft plus refreshed current content.
- Imported references, pins or normalized-name collisions can corrupt restoration: unit3 pins prevalidation and exact rollback.

## Editor Fit and UX Routing

Use DOM/CSS production renderer for text, images, rectangles, ellipses and progress bars. Reuse `management/editor/snapping.ts`, registered `AssetPicker`, RGBA controls, Mantine forms/modals, module layout sections and dirty-navigation guards. MusicLayoutEditor has fixed roles and Shadow DOM behavior, so reuse its interaction patterns, not the component itself. A data-specific geometry helper must give pointer, keyboard and numeric input the same bounds and deliberate snapping; do not change Music's pointer-only snapping policy.

Applicable UX: Product Surfaces, Information Architecture, Visual Foundation, Cross-Cutting UX Rules, Assets, Canvas, Inspector/Layers, Preview and Target Profiles. These are approved post-MVP features. Current implemented Operator/Mantine conventions override historical docs describing Operator as future work. Live rendering stays browser-compatible and Mantine-free; authoring remains lazily loaded.

## Unit 1: Core data and presentation contracts (slice 1)

**Files:** Create `packages/core/src/data-overlays/{types,schemas,limits,goals,formatting,projection,module-definition}.ts` and adjacent focused tests. Export from `packages/core/src/index.ts`. Module registry/presentation registration belongs to unit3 to avoid half-wired outputs.

**Interfaces:** Export `DataValue`, `DataGoal`, `DataResetGroup`, `DataCanvas`, `DataCanvasElement`, `DataOverlayState`, `DataOverlayProjection`, strict input/document schemas, `dataOverlayLimits`, `projectDataGoal(goal,value)`, and a pure canvas projection/formatting API. Pin the exact DTO field names in a short `contract.md` in the execution workspace before handing off. State has independent aggregate and per-value revisions. Provider source status is an optional typed projection input; no provider adapters in this unit.

- [x] Write and run failing tests for strict integer/text values, UTF-8 limit, fixed kinds, limits, bindings and geometry; names are validated by service later.
- [x] Define goals with fixed positive target or safe baseline plus positive additional amount; test restart math, decreases, raw values, remaining/clamped fill and intermediate overflow.
- [x] Implement deterministic formatting/projection with plain text, compatible bindings, missing assets, stale boundary/ended/manual policy and output assignment filtering. Assets resolve through injected IDs, never paths.
- [x] Run `corepack.cmd pnpm exec vitest run packages/core/src/data-overlays --maxWorkers=1` and `corepack.cmd pnpm --filter @stream-jams/core build`; commit unit after focused checks.

## Unit 2: Durable domain service and APIs (slice 1)

**Files:** Core `data-overlays/repository.ts`, `value-service.ts` and tests; server `modules/data-overlays/sqlite-data-overlay-repository.ts`, migration `033-custom-data-overlays.ts`, `modules/db/database.ts`, `http/routes/data-overlays.ts` and tests; `app.ts` dependency declaration/route registration. Coordinate runtime construction in unit3.

**Interfaces:** `DataOverlayRepository` provides synchronous typed state reads and atomic transactional mutations. `DataOverlayService` exposes catalog reads; value/goal/group/canvas definition CRUD; pin settings; `commandValue(id, command)`; `resetGroup(id)`; `restartGoal(id)`; and `setCanvasVisibility(id,enabled)`. Successful mutations return committed state and publish once after commit. Define concrete route/client contracts in `contract.md`: Management `/data-overlays` definitions, Operator `/operator/data-overlays` state/commands using existing session+CSRF middleware. No credential/input API.

- [x] Write failing repository/service tests for reopening persisted state, trim/lowercase name collisions, fixed kind, pin/reference-safe deletion, stale set and serialized delta updates.
- [x] Implement FK-backed value/goal/group/canvas/binding references (styling can be schema-validated JSON), per-value and aggregate revisions, and synchronous transaction boundaries. Never await in SQLite transaction callbacks.
- [x] Test and implement all-or-nothing group reset, baseline restart after resetting members, one revision/publication, safe arithmetic and canvas deletion retaining data.
- [x] Add thin CRUD and Operator route handlers with authorization, CSRF, maintenance, typed errors and conflict current state. Test overlay-key rejection, invalid binding/type and missing resources.
- [x] Run focused core/server data-overlay tests and affected typecheck/build, document DTOs and commit.

## Unit 3: Runtime, outputs, assets and backup (slice 1)

**Files:** Core `overlay-modules/{module-registry,presentation}.ts`, `management/contracts.ts`; server `runtime/runtime-composition.ts`, new `modules/data-overlays/data-overlay-output-runtime.ts`, `http/routes/overlays.ts`, `websocket/overlay-gateway.ts`, `modules/overlay-surfaces/{desktop-module-snapshot-sink,desktop-visual-asset-resolver}.ts`, `modules/assets/asset-library-service.ts`, backup repository/service and adjacent tests.

**Interfaces:** Data runtime joins the existing module-runtime map and outputs the unit1 projection. Subscribe after service construction; publish committed snapshots on mutation and stale expiry. Initial WebSocket composition is delivered after client registration with revision guards. Use existing output auth, media grants and surface layer reconciliation.

- [x] Add disabled module registration and hidden bottom surface row; test existing enabled modules/order survive.
- [x] Wire service/routes/runtime, module/browser/unified/private desktop presentations and registered image asset resolution with snapshot consistency.
- [x] Test initial HTTP/WS race, late asset completion, reconnect, output privacy, missing images, visibility/global suppression and unrelated video identity continuity.
- [x] Add backup contracts/capture/restore/rollback ordering, legacy defaults, full reference/name validation and disabled restored canvases. Test roundtrip and injected restore failure leaves prior enablement/content unchanged.
- [x] Run affected runtime/composition/gateway/desktop/asset/backup tests, build/typecheck and commit.

## Unit 4: Management, Operator and live renderer (slice 1)

**Files:** New `apps/web/src/management/data-overlays/` typed API, DataPage, DataOverlaysPage, DataCanvasEditor, geometry and preview helpers; management route/API/ManagementApp; new `operator/OperatorDataSection.tsx`, data API; OperatorApp; `overlay/components/DataOverlayCanvases.tsx`/CSS and OverlaySurface; private desktop asset mapping; adjacent tests/stories.

**Interfaces:** Consume contract.md DTOs and unit1 formatter/projection; use existing authenticated HTTP client. Rendering is pure and uses stable canvas/element IDs. Operator loads independently of other modules and does not clear failed drafts on polling refresh. Templates/source additions come later.

- [x] Build definition management for values/goals/groups/pins and read-only current values, with reference errors; add module enablement/output links/canvas CRUD.
- [x] Build Operator controls (+1/-1/set/reset, group reset confirmation, show/hide) and test cancelled reset, failed/conflicting set retention, current-content refresh and 540x960 no horizontal scrolling.
- [x] Build layer editor with pointer/keyboard/numeric geometry, styling, compatible binding picker, image picker, order/hide/duplicate and explicit save/dirty navigation. Test 101st-element rejection and geometry parity.
- [x] Add isolated sample store/simulations and production renderers; test markup literal rendering, missing binding/image, stale expiry, outputs and preview separation.
- [x] Add proportional stories and disposable-service `tests/e2e/data-overlays.spec.ts` for two canvases sharing a counter, Operator/group resets, persistence, scoped browser/private output and preview isolation.
- [x] Run focused web tests/build (including bundle boundary gate), Storybook build/interactions, disposable live acceptance; commit slice1 candidate.

## Unit 5: Event rules and Streamer.bot state (slice 2; dependency gate)

**Files:** Follow `add-data-overlay-event-rules`; new core data rule/schema/effect helpers and server data consumer/repositories; shared selector editor integration; StreamerBotClient typed globals methods, source sync, Data rule/source UI and Operator pause.

**Interfaces:** Consume the actual central bus's `BusEvent`, shared selector, transactional checkpoint and no-expiry state consumer contracts only after prerequisite implementation. No local substitute dispatch, custom intake or separate receipt store. Globals use the existing authenticated provider client and fixture-verified response types.

- [x] Verify bus code/consumer/shared-selector availability and predecessor baseline; record missing dependency precisely if absent.
- [ ] Capture real sanitized globals response/event fixtures with explicitly safe read-only provider access; if unavailable leave real-provider work blocked, not guessed.
- [ ] Test/implement versioned flat schemas, limits, typed payload filters/actions, integer multipliers, ordering and atomic effects; starters avoid gift recipient/batch overlap and exclude resubs.
- [ ] Wire checkpoint+value transaction, poisoned-event cursor advance, moderation, opt-in stream-online group reset, persisted Operator pause that advances/skips; test crash before/after commit and long replay.
- [ ] Implement globals snapshot/update/delete/reconnect/read-only/copy behavior from fixtures; extend backup and rule/source management with isolated simulation.
- [ ] Run affected tests, stories, disposable-service event workflows and documented real-provider acceptance; commit slice2 and maintain evidence trace.

## Unit 6: Authoritative Twitch data (slice 3)

**Files:** Follow `add-twitch-overlay-data`; extend Twitch API client/OAuth/EventSub/source lifecycle, new data source/binding service, Data source picker/status and tests/stories.

**Interfaces:** Required scopes remain today's required list; goal read scope is optional. Helix client returns validated totals/goals and status/rate-reset metadata. Follower/goal runtime updates provider-owned values/goals through internal service methods that reject manual/rule writes. Event-triggered paths require the actual bus contract.

- [x] Add sanitized documented fixtures (label synthetic versus live recordings honestly) and optional-scope regression; avoid touching actual accounts automatically.
- [x] Implement 60-second follower refresh, ten-second early-refresh throttle, epoch protection, failure status, exponential backoff and server rate-reset compliance. Rate-reset deadline takes precedence if later than five-minute nominal cap; record ruling. The throttle hook is tested; production event wiring remains blocked below.
- [ ] Implement goal list/snapshot-after-subscription, 100-event bound/resnapshot, latest-by-type and pinned binding, units and broadcaster invalidation; test progress race and replacement.
- [ ] Add Management source/binding/readiness controls, stories and disposable-provider acceptance; integrate event paths only when bus dependency is present.
- [x] Complete source tests/build and record real-account acceptance separately; commit verified independent scope, retain unchecked blockers.

## Unit 7: Templates (slice 4)

**Files:** Core data template/slot schemas and starters; typed SQLite template repository/migration and template service/routes; DataTemplatePicker, TemplateSlotMapping, SaveDataTemplateDialog and tests/stories; backup extension; `tests/e2e/data-overlay-templates.spec.ts`.

**Interfaces:** Templates hold schema-validated document/style/asset references and typed slots only. `instantiateTemplate` atomically creates new IDs, compatible mappings and optional new custom values; `insertTemplateGroup` flattens elements. Provider slots use configured source metadata; no partial client POST loops.

- [x] Test/implement Counter badge, Goal bar, Latest supporter and Combined goals panel with sample previews; saving never captures live counts or source credentials.
- [x] Implement saved canvas/selection templates, atomic compatible mapping/new values, unique IDs/reference rewriting and flattened insertion; test failed mapping creates nothing and later edits do not alter copies.
- [x] Build picker/map/create/save flow and source-not-ready guidance, missing asset behavior, stories and Playwright for all starters and saved reuse.
- [x] Extend backup roundtrip with user templates only, verify live and commit slice4.

## Unit 8: Integration, one independent review and handoff

- [x] Reconcile every OpenSpec scenario against tests and evidence; do not mark missing bus/provider/hardware tasks complete.
- [x] Run lint, typecheck, full tests/build, Storybook and relevant Playwright gates. Diagnose failures before rerun; classify environment versus regression and repair relevant failures without weakening coverage.
- [x] Rebuild/restart isolated services, health-check, reload and verify authored/Operator/browser/private-desktop workflow. Preserve normal profiles.
- [x] Run one independent review subagent (GPT-6.1-sol, low effort per repository review policy), fix verified findings and rerun affected checks.
- [x] Sync only implemented canonical requirements, update docs/OpenSpec tasks/backlog accurately, commit completion evidence and report exact remaining blockers. Do not merge/push without current publication authorization.

## Execution rulings

- The user's explicit plan-then-execute request supersedes the optional workflow's second plan approval prompt. Link the concrete plan and proceed with the selected model/effort.
- One final independent review follows repository policy rather than per-task review agents. Implementers still self-check each unit and report tests.
- User authority for all four slices permits sequential development on this isolated branch with slice commits; it does not claim prerequisite merges occurred.
- Shared files/interfaces are changed in dependency order; do not assign overlapping files. After unit1 fixes the core contract, unit4's isolated renderer, geometry and preview helpers can proceed alongside unit2. Once unit2 pins routes and DTOs, Management components can implement against that contract while runtime wiring proceeds. Full live integration waits for units2 and3. Serialize commits or commit only explicitly owned paths.
