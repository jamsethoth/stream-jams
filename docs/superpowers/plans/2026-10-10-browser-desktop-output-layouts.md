# Browser and Desktop Output Layouts Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for sequential implementation. Use `superpowers:subagent-driven-development` only if the user chooses delegated execution. Steps use checkboxes; the matching OpenSpec `tasks.md` is the authoritative completion ledger.

**Goal:** Deliver independent browser content canvases and desktop placement, Timer profile appearance, and one ordinary output path for subscribed and manually submitted events.

**Architecture:** Keep normalized content and renderers shared. Choose presentation at trusted recipient boundaries, and route explicit manual submissions through the existing journaled bus. Deliver additive foundations first, complete each module vertically, then retire public test/unified sources with transactional upgrade and restore compatibility.

**Tech Stack:** Existing strict TypeScript/ESM pnpm monorepo, Zod, Fastify, SQLite repositories, React/Mantine, Electron, Vitest, Storybook and Playwright. Use versions in manifests; add no dependencies.

**Spec:** [Approved design](../../../openspec/changes/separate-browser-desktop-output-layouts/design.md), [proposal](../../../openspec/changes/separate-browser-desktop-output-layouts/proposal.md), and all deltas below that change's `specs/` directory.

**Status:** Specification approved by the user on 2026-10-10. Implementation authorized and in progress on `codex/browser-desktop-output-implementation`; accepted slices are tracked in the task ledger and verification record. Source baseline is local commit `37bc1891`; remote state must be refreshed at implementation start. The user authorized per-slice commit/push and final PR creation; deployment, merging and real user-data changes remain outside this task.

## Global constraints

- Keep landscape identifiers internally. Alerts, Music and Timers retain landscape and vertical sources; Videos and Screen Effects retain one ordinary source each.
- Music/Timers/Videos have fixed local CSS-pixel content canvases. Alerts/Effects and private desktop retain full-scene positioning. No OBS streaming detection or automatic OBS resizing.
- Preserve desktop placement, ordinary keys, exact profile authorization, selected audio destinations and timer lifecycle semantics. Do not apply the historical restore worktree or unpublished Data implementation.
- Manual provenance is not a provider registration. Manual events never impersonate a subscribed source or share its cross-source correlation key. Local editor previews do not publish.
- Preserve auth/CSRF/origin/rate limits, scoped automation grants, runtime/item/revision guards, replay-age limits, bounded reconnect/queues, redaction and transparent production failure.
- Append migrations; never alter historical migrations. Each persisted change includes restore/export compatibility in its own slice. Use disposable databases and WAL-aware backups for acceptance.
- The private desktop composition may retain internal unified terminology. Remove public capabilities, not private transport by a global text replacement.
- Single video queue means one primary/mirror session when desktop hosts playback. Service-only browser fallback remains per connected browser as today; do not claim a new universal single decoder.
- Frontend work follows `docs/ai/frontend-agent-guide.md` and the repository frontend-change skill. Use production components and tiny checked-in media for stories. No Mantine dependency in public/private overlay bundles.
- No numeric performance improvement is promised. Geometry work occurs on saved configuration changes, not timer ticks or video frames.

## Review focus

These cross-cutting risks have explicit owning tests below, rather than being left for manual review:

1. An old backup recreates a retired key/surface: S10 repeated import/restart tests.
2. A crash after video insertion creates a duplicate on bus redelivery: S04 durable admission tests, rerun after S09 migration.
3. An empty module or late response restores obsolete canvas dimensions: S05 revision/reconnect tests, exercised by S06-S08.
4. Fractional Timer slots near the right/bottom edge change desktop appearance: S07 pre/post migration fixture comparison.
5. Manual test payloads claim source identity, escape scoped grants or bypass playback admission: S02/S03/S04 negative boundary tests.

## Delivery graph and release policy

| Slice | Deliverable | Required predecessors | Delivery character |
| --- | --- | --- | --- |
| S01 | Explicit private desktop composition capability | None | Additive, behavior-preserving prerequisite |
| S02 | Typed manual bus events and bounded submission outcomes | None | Additive, no existing send path switched yet |
| S03 | Alert/Effect test sends use the shared bus | S02 | Independently usable event-flow change |
| S04 | Durable ordinary video admission through the bus | S02 | Independently usable; legacy test lane temporarily remains |
| S05 | Trusted presentation and versioned canvas metadata | S01 | Additive; existing modules remain scene-sized until opted in |
| S06 | Music content canvas and source dimensions | S05 | Independently usable module change |
| S07 | Timer appearance, geometry and migration | S05 | Independently usable module change |
| S08 | Video content geometry independent of desktop | S05 | Independently usable module change |
| S09 | One video queue/player and legacy test migration | S04, S08 | Atomic breaking cutover for Videos only |
| S10 | Retire all public test/unified sources safely | S01, S03, S06, S07, S09 | Atomic public-output inventory/auth/restore cutover |
| S11 | Integrated acceptance, performance evidence and spec sync | S10 and all earlier slices | Final delivery gate |

Recommended linear delivery: **S01 → S02 → S03 → S04 → S05 → S06 → S07 → S08 → S09 → S10 → S11**. S02 can precede S01; S03/S04 and S06/S07/S08 are logically independent after their prerequisites. They nevertheless share runtime/client/backup owners: default to sequential execution. Do not concurrently edit shared integration files or allocate migration numbers.

Each slice is one reviewable branch/PR candidate based on refreshed `origin/main` after dependencies have landed. If dependencies have not landed, prepare an explicitly stacked branch against the predecessor and record that fact; do not misrepresent it as independently mergeable. Do not split S09 or S10's migration, authorization, runtime and UI changes into independently released commits. Intermediate releases intentionally still expose legacy capabilities until their named cutover; do not describe them as the finished product.

## Agent execution protocol

- [ ] Before S01, fetch remote state, verify worktree/branch and whether another change already implements any requirement. Record exact baseline SHA, environment and relevant existing failures in `docs/verification/browser-desktop-output-layouts.md` (new). Stop only on material conflicting requirements, not routine filename drift.
- [ ] Before the first behavior-changing slice, capture S11's baseline measurements using disposable fixtures and save the fixture recipe/load parameters in that record. Keep the baseline revision reproducible for later comparison; do not infer old performance from a candidate-only run.
- [ ] Before each slice, read its predecessors' evidence, approved design, owning delta specs and applicable AGENTS/skill instructions. Record the slice ID and dependency SHAs. Use a `codex/` branch; do not copy uncommitted work from another worktree.
- [ ] Inspect existing owners below, write focused behavior tests, run them to confirm the expected missing behavior, then implement. Do not weaken unrelated tests or create a second implementation of an existing service.
- [ ] Allocate the next available migration number at integration time and register it in `apps/server/src/modules/db/database.ts`. The next number observed today is not reserved by this plan. A slice owns its pure upgrader, DB migration, export/import adapter and disposable fixtures together.
- [ ] Finish each slice with focused tests, strict typecheck, applicable build/lint and browser gates below. Rebuild/restart affected disposable services, await health and exercise the changed workflow. Record exact commands and results; distinguish automated, native and unperformed evidence.
- [ ] Commit scoped changes with a human-readable intent and per-file change/reason list. Update OpenSpec checkboxes only for verified work, and append evidence/deviations to the verification record. A PR must state dependencies, UX contract and migration behavior. Publishing/merging follows the user's separate authorization.
- [ ] Handoff payload: slice ID, SHA, changed interfaces, migrations, tests/results, known limitations, next eligible slice, and any blocker with exact dependency. Do not mark a slice complete with unresolved relevant failures.

Paths below are relative to repository root. Existing owners are listed explicitly; files marked **new** are planned additions. Companion test/story names are exact proposed locations when not already present. Search callers when changing a public TypeScript type; do not restrict edits to this inventory if compilation identifies a required adapter.

## S01 — Decouple desktop membership from public unified outputs

**Owns:** `shared-overlay-surfaces` prerequisite. No source retirement or configuration removal.

**Files:** `packages/core/src/overlay-modules/{types.ts,module-registry.ts,surface-configuration.ts}`; module definitions in `packages/core/src/{alerts,music,timers,videos,screen-effects}/` (resolve Alerts' registered definition through the registry); `apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.ts`; their adjacent tests.

**Interface:** Add explicit `renderer.supportsDesktopComposition: boolean` to `OverlayModuleRendererDefinition`. Registry validation requires it; surface membership reads it. Keep `supportedOutputs` and all current public outputs intact until S10. No database schema change is needed merely to change membership inference.

- [ ] Add `desktop_membership_does_not_depend_on_public_unified_support` to `sqlite-surface-repository.test.ts`: a desktop-capable module with only module public output remains in desktop composition; a non-capable module is excluded.
- [ ] Implement registry flags and replace the `supportedOutputs.includes("unified")` membership inference. Preserve desktop layer order/opacity/visibility, display binding, media occurrence identity and audio independence.
- [ ] Extend `surface-configuration.test.ts` for restart reconciliation preserving saved desktop rows. Run those tests plus `module-registry.test.ts`; expect no changes to existing public inventory.
- [ ] Record the explicit capability contract and commit S01 after package checks.

## S02 — Manual event contract, journal and submission service

**Owns:** `central-event-bus`, `runtime-log-operations`. Additive infrastructure; do not switch existing HTTP test handlers in this slice.

**Files:** `packages/core/src/event-bus/{types.ts,schemas.ts,selector.ts,correlation.ts}`; **new** `packages/core/src/event-bus/manual-submission.ts`; package exports; `apps/server/src/modules/events/{event-bus.ts,sqlite-event-bus-journal-repository.ts}`; **new** `apps/server/src/modules/events/manual-event-service.ts` and adjacent tests; activity DTO/rendering callers located through event-bus schemas; existing `tests/e2e/event-bus-diagnostics.spec.ts`.

**Interfaces to freeze here:**

- `ManualBusEvent` is a `BusEvent` variant with `kind: "manual"`, `sourceKind: "manual"`, null registration/correlation, server identity/time and a discriminated `action`. Do not expand `IngestProviderId`.
- `ManualEventAction` distinguishes source simulation (canonical normalized input or declared external identity/payload), selected alert draft/saved test, selected effect test, and video request. Reuse bounded module input schemas; references are validated before journaling. No raw callback, arbitrary recipient list or user-selected authorization context.
- `ManualEventService.submit(input: ManualEventSubmission, context: TrustedManualSubmissionContext): Promise<ManualSubmissionReceipt>`. Context is built by authenticated adapters, carries channel and existing permission scope, and cannot come from payload. Receipt separates journal acceptance (`busId`) from per-consumer outcomes; a pending outcome is not a queued item.
- Preserve server-assigned event IDs. Once an accepted submission has an ID, redelivery uses it; deliberate new actions get fresh IDs. No transparent retries after uncertain HTTP results. Reuse the journal's dedupe/retention machinery rather than adding an unbounded request ledger.

- [ ] Add tests `manual_origin_is_not_provider_delivery`, `manual_does_not_correlate_with_twitch`, `duplicate_delivery_is_not_a_new_submission`, and `two_intentional_submissions_are_distinct`. Assert old canonical/external rows still validate and retain cursor continuity.
- [ ] Add bounded schema/authorization cases: oversized or invalid action, forged source registration, forged recipients, arbitrary event type under a video-only automation grant; all reject before journal insertion.
- [ ] Implement manual schema, selector extraction and service using existing bus sequencing/outcomes. Simulation uses normal consumer selectors; targeted actions remain explicitly distinguished. Preserve external payload subscription/validation limits and consumer retry/expiration policy.
- [ ] Update journal/activity DTOs and diagnostics to display manual origin without raw URLs/payloads/credentials. If storage constraints require a migration, append it and test old journal replay; otherwise document why schema-only validation is sufficient.
- [ ] Run `corepack pnpm exec vitest run packages/core/src/event-bus apps/server/src/modules/events`, typecheck and applicable diagnostics UI checks. Commit S02 with the final typed interfaces for S03/S04.

## S03 — Route Alert and Screen Effect sends through the bus

**Owns:** `alert-configuration-management`, manual dispatch portion of `overlay-output-management`, and `overlay-browser-resilience`.

**Files:** `apps/server/src/http/routes/{management-alerts.ts,screen-effects.ts}`; `apps/server/src/modules/events/event-pipeline.ts`; Alert/Effect test services reached by those handlers; `apps/web/src/management/alerts/{AlertSetsPage.tsx,editor/AlertEditorPage.tsx}`; `apps/web/src/management/screen-effects/ScreenEffectsPage.tsx`; `apps/web/src/overlay/components/OverlaySurface.tsx`; matching tests/stories. **New:** `tests/e2e/manual-event-delivery.spec.ts`.

**Consumes:** S02 service/action/receipt. **Produces:** Existing Test draft/Test saved/Effect send adapters publish once and await/report the relevant consumer outcome using existing response/error conventions. Consumer performs ordinary validation/admission; no direct parallel enqueue. Preserve request/response compatibility where possible and change typed clients atomically if outcome states require it.

- [ ] Add route/service tests `test_send_journals_once_and_admits_once`, `invalid_draft_never_journals`, `disconnected_provider_does_not_block_manual_send`, `local_preview_never_publishes`, and `one_consumer_failure_does_not_block_others`.
- [ ] Move validated targeted dispatch into the existing consumers, reusing matching/test services without circular publish calls. Preserve selected saved profile eligibility, live-impact confirmation, device-only delivery, explicit audio/TTS inclusion and partial-destination outcomes. Ordinary module disablement and safety rules still apply.
- [ ] Test a supported source simulation matching Alerts, Effects and Timers together. Queue/history labels say manual; selected-alert tests target the chosen alert rather than accidentally becoming broad simulations.
- [ ] Remove provenance-dependent on-stream audio activation prompts and automatic replay. Test denied audio is transparent and reported; local editor gesture activation still works. Keep existing private/public credential separation.
- [ ] Add production stories and disposable E2E for preview vs send, successful ordinary delivery, unavailable destination and failure correction. Rebuild and check both browser and private desktop recipient behavior. Commit S03 after affected server/web gates.

## S04 — Durable video admission through the shared bus

**Owns:** Video manual intake and crash idempotency, without queue consolidation yet.

**Files:** `apps/server/src/modules/videos/{video-request-intake.ts,videos-bus-consumer.ts,video-queue-service.ts,video-queue-repository.ts,channel-point-video-intake.ts,streamerbot-video-intake.ts}`; `apps/server/src/http/routes/videos.ts`; automation submission adapter located from `/automation/v1/videos` route registration; `apps/server/src/runtime/start-local-runtime.ts`; adjacent tests. **New:** `apps/server/src/modules/videos/video-bus-admission.test.ts`.

**Consumes:** S02 manual video action and trusted channel. **Produces:** One ordinary video enqueue per accepted bus identity, stable result/receipt and unchanged guarded playback commands. Existing test lane remains operational through its legacy adapter until S09; do not route old test callers to ordinary playback early.

- [ ] Write `crash_after_insert_before_ack_does_not_duplicate`, `provider_event_is_not_republished`, `journal_acceptance_is_not_queue_acceptance`, and automation permission/revision tests. Use a persistent disposable DB and reopen it; a process-local last-sequence assertion is insufficient.
- [ ] Implement durable idempotency using the existing `EventBusDeliveryContext.checkpoint()` in the same synchronous DB transaction as admission where feasible. Otherwise persist a unique bus-ID admission receipt in the queue transaction and replay its outcome. Document the choice; do not hold a SQLite transaction across metadata network I/O.
- [ ] Route ordinary management/automation requests through S02, then the Videos consumer and shared validated intake. Preserve module enablement, provider allowlist, capacity, max-length holds, channel-point no-autoplay, Streamer.bot autoplay policy and asynchronous enrichment.
- [ ] Preserve HTTP caller semantics: return an admitted item only after the consumer's committed admission result. If waiting cannot complete within the existing bounded request lifetime, return explicit pending/unknown outcome under a documented typed contract; never return a fabricated queue item or retry insertion. Update client/docs together and test late outcome handling.
- [ ] Keep pause/skip/clear/seek commands as guarded commands. Run Videos module, route and automation tests, typecheck and rebuild. Commit S04; carry the crash fixture into S09.

## S05 — Trusted presentation and authoritative canvas metadata

**Owns:** Shared rendering/metadata foundation. Modules remain scene-sized until their respective S06-S08 opt-in.

**Files:** `packages/core/src/overlay-modules/{overlay-composition-service.ts,types.ts,presentation.ts}`; `packages/core/src/overlays/{types.ts,schemas.ts}`; **new** `packages/core/src/overlay-modules/output-canvas.ts` and test; `apps/server/src/websocket/overlay-gateway.ts`; HTTP composition and private snapshot adapters; `apps/web/src/overlay/{OverlayApp.tsx,components/OverlaySurface.tsx}`; `apps/web/src/desktop-overlay/DesktopOverlayApp.tsx`; `apps/web/src/management/foundation/{BrowserSourcesPanel.tsx,BrowserSourceRow.tsx}`; adjacent tests/stories.

**Interface:** Add trusted `recipientKind: "browser" | "desktop"` to internal `OverlayModuleSnapshotRequest`; populate it in server adapters, never from public input. Add composition `canvas: OutputCanvas` with `schemaVersion: 1`, `kind: "content" | "scene"`, positive integer `width/height`, finite `origin: { x: number; y: number }`, nonnegative `insets: { top: number; right: number; bottom: number; left: number }`, and `configRevision`. Reuse the existing config ordering mechanism if one exists; otherwise define `configRevision` as a nonnegative safe-integer counter paired with the server runtime identity. Freeze this choice in S05's handoff for S06-S08. Do not sort opaque IDs or wall-clock timestamps to resolve asynchronous races. Reconnect resets ordering under the new runtime identity.

- [ ] Test `empty_disabled_snapshot_has_canvas`, `late_old_config_cannot_replace_new_geometry`, `reconnect_initializes_current_canvas`, and `public_request_cannot_select_desktop`. Reject invalid dimensions before publishing.
- [ ] Implement atomic metadata+projection refresh with saved-config revision caching. Preserve playback/occurrence identities and media element keys across canvas refresh. Runtime ticking does not increment config revision.
- [ ] Implement content-mode top-left 1:1 CSS pixels; larger viewport is transparent, smaller viewport clips. Keep scene-mode fitting unchanged. Add component tests using a synthetic content snapshot and viewport changes; do not prematurely convert module projections.
- [ ] Add optional exact width/height display to source rows using authoritative server metadata, not a second browser calculation. Scene-sized modules show their true dimensions; module slices later switch them to content sizes. Diagnostics stay off-stream.
- [ ] Run composition/schema, OverlayApp lifecycle, OverlaySurface and DesktopOverlayApp tests; check Storybook and route bundle boundaries. Commit S05 only with all existing scene-mode tests still passing.

## S06 — Music content canvas

**Owns:** `music-widget-overlay` and Music part of `output-specific-module-rendering`.

**Files:** `packages/core/src/music/{projection.ts,component-layout.ts,style-policy.ts}`; **new** `packages/core/src/music/output-geometry.ts` and test; `apps/server/src/modules/music/music-output-runtime.ts`; `apps/web/src/overlay/components/MusicWidget.tsx`; `apps/web/src/management/music/{MusicPage.tsx,MusicLayoutEditor.tsx,MusicDesktopPlacement.tsx}`; existing Music stories/tests and `tests/e2e/music-desktop-placement.spec.ts`.

**Interface:** `resolveMusicOutputGeometry(config, targetProfileId)` returns validated local geometry and S05 canvas fields without desktop coordinates. Use existing exported Music config/profile types. Full/compact views share the max left/top inset anchor and union envelope. Private recipient applies the existing desktop placement afterward.

- [ ] Test full/compact/hidden/artwork missing/long text at identical canvas bounds. Native shadow extent per side is `max(0, ceil(2 * blur + spread +/- offset))`, transparent shadows contribute zero; take maxima across states and round final envelope outward once.
- [ ] Implement the pure resolver and use it for initial/refresh/empty runtime metadata and advertised dimensions. Preserve provider epoch, artwork authorization and playback/polling lifecycle; changing geometry does not restart providers.
- [ ] Keep placement wrappers outside validated custom CSS scope. Clip arbitrary overflow; preserve native-positioning conflict guards. Verify CSS cannot translate/resize the outer canvas and full/compact anchors agree.
- [ ] Update placement/source copy and stories. E2E saves desktop x/y/scale, asserts unchanged browser bounds/pixels, then saves visual size and asserts new advertised dimensions. Cover both profiles and hidden reconnect. Commit S06 after focused core/server/web and live gates.

## S07 — Timer profile appearance and placement migration

**Owns:** `timer-overlay-module`, Timer config/restore portion of `configuration-backup-restore`, and Timer geometry requirements.

**Files:** `packages/core/src/timers/{types.ts,schemas.ts,projection.ts,module-definition.ts}`; **new** `packages/core/src/timers/{output-geometry.ts,config-upgrade.ts}` with tests; `apps/server/src/modules/timers/timer-runtime-coordinator.ts`; new numbered DB migration/registration; backup snapshot/service adapters; `apps/web/src/overlay/components/TimerStack.tsx`; `apps/web/src/management/timers/{TimerStackEditor.tsx,TimersPage.tsx,timers-api.ts}`; corresponding tests/stories. Extend `tests/e2e/timers.spec.ts` and `persistent-event-timers.spec.ts`.

**Interface:** Version Timer module config; each profile owns `appearance` and `desktopPlacement`. Appearance covers card width/height, orientation/capacity, gap/padding, border/corner/background, label/value font preset/size/weight/color, icon size and state accents. Desktop placement owns x/y/z-order/scale. `upgradeTimersConfig(raw: unknown)` validates old/new inputs and returns current typed config or bounded failure; `resolveTimerOutputGeometry(profile)` computes slots plus fixed overflow reserve. No per-definition style or second runtime.

- [ ] Capture current default and saved fixtures before changing the renderer. Test `fractional_slots_preserve_desktop_geometry`, `edge_fit_becomes_desktop_only_scale`, both orientations, both profiles, and overflow hidden/visible. Keep fractional slots; only final canvas dimensions round outward.
- [ ] Implement pure upgrade materializing current size-derived font/card defaults and old edge-fit scale. Append DB migration and use the same upgrader for legacy backup preflight. Invalid compound geometry blocks upgrade/save; it does not reset to defaults. Test rollback, repeated upgrade, new export/reimport and unchanged timer run identities/deadlines/recovery.
- [ ] Implement profile rendering from typed appearance with single-line label ellipsis, right-aligned values and fixed overflow badge/tabular abbreviated counts. Preserve landscape desktop appearance and stored vertical placement without enabling portrait desktop output.
- [ ] Implement bounded appearance controls and representative running/paused/completed/overflow previews. Profile switch retains drafts; save is atomic; reset affects only selected profile. Use existing font presets, no new custom-font asset lifecycle. Resolve the design's loose “ellipsized/wrapped” wording in favor of its explicit single-line requirement.
- [ ] Test all listed controls round-trip independently, invalid input retains saved config, keyboard/error focus and no timer commands from editing. Browser pixels stay unchanged after desktop movement; saved capacity changes dimensions once, timer count changes do not.
- [ ] Run Timer projection/schema/runtime/editor tests plus persistent timer and automation regressions. Rebuild, verify disposable browser+desktop workflow and commit S07 with migration/backup/UI as one deliverable.

## S08 — Video content geometry and desktop placement

**Owns:** Video geometry portion of `video-request-queue`, config upgrade/restore, stable caption reserve.

**Files:** `packages/core/src/videos/{types.ts,layout.ts,layout-schema.ts,placement-geometry.ts}`; **new** `packages/core/src/videos/config-upgrade.ts` and test; `apps/server/src/modules/videos/videos-runtime.ts`; DB migration and backup adapters; `apps/web/src/overlay/components/VideosOverlay.tsx`; `apps/web/src/management/videos/{VideoPlacementEditor.tsx,VideosPage.tsx}`; adjacent tests/stories. **New:** `tests/e2e/video-output-placement.spec.ts`.

**Interface:** Version layout into `content: { width, height }` and `desktopPlacement: { x, y, scale }`, retaining any existing layer metadata at its current owner. `upgradeVideosLayout(raw: unknown)` maps old width/height into content and x/y into placement with scale 1. Reuse `videosPlacementGeometry` for the fixed 16:9 picture and two-line caption reserve; do not introduce a second aspect-fit algorithm.

- [ ] Add fixtures covering minimum `240 × 180`, current default layout, caption absent/two lines, varied media aspect ratio, notice/no-clip, idle and disabled. Assert stable content canvas and preserve old desktop footprint.
- [ ] Implement upgrade/validation/restore and trusted recipient projection. Desktop drag/scale updates only placement; explicit content sizing affects appearance and advertised OBS dimensions. Validate scaled footprint within the `1920 × 1080` desktop scene.
- [ ] Keep primary player, provider capture, mirror signals and item/seek identities unchanged; test geometry save never creates a new player or reconnects healthy peers. Until S09, both legacy lanes retain their existing ownership.
- [ ] Update placement editor controls/copy/stories, E2E for browser independence, invalid placement and restart/import. Run layout/runtime/renderer/mirror tests and live checks; commit S08.

## S09 — Atomic Videos single-queue cutover

**Owns:** Remaining `video-request-queue` behavior, video test routes/mappings/UI/host removal. Does not retire other modules' public sources yet.

**Files:** S04 queue/intake/consumer/routes; `packages/core/src/videos/{types.ts,schemas.ts,source-schema.ts,contract.ts,mirror.ts,mirror-receiver.ts}`; `apps/server/src/modules/videos/{videos-runtime.ts,video-mirror-director.ts}`; runtime `syncVideoOutputs` callers; `apps/desktop/src/videos/{video-player-host.ts,video-player-window.ts,video-player-preload.cts}`; `apps/web/src/management/videos/{VideoQueuePanel.tsx,VideosPage.tsx}`; Videos overlay/mirror clients; new numbered queue migration; backup adapters; `docs/automation-api.md` and Streamer.bot examples located by purpose payload references.

**Interface:** Public typed video submission/config contracts have no destination-purpose selector. Existing `/videos/live/...` and `/automation/v1/videos/live/...` resolve the sole queue. Legacy test routes and `purpose=test` submissions return bounded migration errors with no mutation. Internal queue/host/mirror APIs identify the sole ordinary session plus current runtime/item/generation guards, never a client-selected test session.

- [ ] Test migration on live pending/active/history plus test pending/active/completed/failed fixtures. Preserve live order; append actionable test rows in prior order held for explicit review, autoplay false. Preserve identities/history with migration provenance. Explicit Play releases this migration hold separately from max-length holds; Play all/autoplay cannot release it.
- [ ] Preflight capacity and duplicate-ID conflicts before writes; block with actionable diagnosis. Migration is transactional, repeat-safe, preserves WAL-aware rollback backup, clears obsolete test run/gap state and invalidates stale revisions/receivers. Restart requires explicit playback. Portable backup excludes queue runtime as before; do not accidentally export it to preserve local migration data.
- [ ] Normalize persisted source/reward mappings to ordinary with upgrade disclosure. Reject old external test payloads rather than silently rerouting them. Preserve live callers' authorization and require refreshed queue state after upgrade.
- [ ] Remove Live/Test UI selection and second primary/mirror session. Retire Videos test key/route/media access in this slice so an old authenticated test browser cannot receive ordinary content. Ensure output enumeration/key regeneration does not recreate Videos test while other modules await S10.
- [ ] Verify one desktop primary across all ordinary recipients, stale report/signaling rejection, unchanged server clock/seek controls, selected audio policy and service-only fallback. Rerun S04 crash admission test after consolidation; test unknown outcomes are not automatically retried.
- [ ] Update typed clients, Operator controls, examples and stories atomically. Add migration/retired-caller E2E and desktop-host regression coverage; commit S09 only when UI/server/host/schema all agree.

## S10 — Atomic public test/unified retirement and restore safety

**Owns:** `overlay-output-management`, `local-app-serving`, `overlay-safe-assets`, `shared-overlay-surfaces`, output metadata restore, `production-entrypoint-validation`, and cross-module audio/automation preservation.

**Files:** `apps/server/src/http/routes/{overlays.ts,overlay-route-params.ts,assets.ts,overlay-output-management.ts}`; `apps/server/src/websocket/overlay-gateway.ts`; `apps/server/src/modules/overlays/overlay-output-management-service.ts`; core overlay key/surface schemas and registry definitions; `apps/server/src/modules/overlay-surfaces/sqlite-surface-repository.ts`; `apps/server/src/modules/backup/{configuration-backup-service.ts,sqlite-configuration-snapshot-repository.ts}`; new numbered migration/registration; module source panels and `apps/web/src/management/settings/OverlaySurfacesPanel.tsx`; `tests/e2e/production-web-shell.spec.ts`. **New:** `tests/e2e/output-retirement-restore.spec.ts`.

**Interface:** Only approved ordinary module outputs can be created/listed/regenerated. Reuse ordinary route/key identities. Hidden existing profileless ordinary keys retain prior behavior (Music/Timers landscape, Alerts legacy eligibility), cannot be minted anew, and remain explicitly revocable. The private desktop snapshot adapter consumes S01/S05 directly, independent of public unified eligibility.

- [ ] Add a table-driven authorization matrix across shell/composition/WebSocket/media/artwork: retired key+route rejected, wrong module/profile rejected, ordinary exact key accepted, management credentials never exposed, public key cannot request private composition.
- [ ] Stop public test/unified enumeration/creation/regeneration and remove Settings unified controls. Revoke/deactivate keys without retagging or redirecting them. Remove only unified-browser surfaces; preserve desktop display binding/follow consent and saved layer order/visibility/opacity. Reconciliation must not recreate retired rows.
- [ ] Normalize legacy backup output/surface metadata before validation and fresh-key generation. Use S07/S08 pure config upgrades; ignore no malformed ordinary data. Preflight discloses removed outputs without secrets. New exports exclude retired entries. Portable restore still clears desktop binding/consent and disables it; in-place upgrade retains local desktop choices.
- [ ] Test import twice, restart twice, failed restore rollback and active socket revocation. Retire recipients/media leases before publishing restored state. Restore rollback preserves destination credentials/maintenance state without starting queues/timers; ordinary in-place key IDs/secret references survive.
- [ ] Update all source panels with accurate dimensions, ordinary inventory and OBS migration guidance. Check Alerts/Effects retain full-scene dynamic placement, local Music/Timer preview fixtures never become ordinary fake playback, and management manual sends still work.
- [ ] Replace production smoke success on unified URLs with ordinary-output success and retired-route failure. Verify desktop multi-module timing survives timer refresh/layer changes and hiding desktop does not mute independent browser/device destinations. Run security/backup/routes/UI tests and rebuilt E2E; commit S10 as one cutover.

## S11 — Integration evidence, performance and canonical spec sync

**Owns:** Final coverage across all 16 delta capabilities; no new feature scope.

**Files:** **new** `tests/e2e/browser-desktop-output-layouts.spec.ts`; extend preceding disposable fixtures rather than duplicate a test server; **new** `docs/verification/browser-desktop-output-layouts.md` begun at baseline; module/setup and automation docs; canonical specs through the OpenSpec sync workflow after implementation matches deltas; `docs/backlog.md`.

- [ ] Run the integrated matrix: all five modules, supported profiles, browser/private desktop, empty/disabled/reconnect, config save race, manual/subscribed mixed events, no duplicated admission, restart and legacy/new restore. Use render bounds and deterministic content captures for placement independence; do not compare moving video frames as static pixels.
- [ ] Compare baseline and candidate with identical saved disposable fixtures, output counts/resolutions, event load and environment. Record idle CPU/memory/message rate, max Timer stack and text/track changes, video CPU/GPU/frame pacing/audio, admission latency and duplicates. Then separately measure new compact dimensions. Distinguish browser evidence from native OBS/GPU observations, including any not performed. Investigate material regression rather than asserting a speedup from smaller dimensions alone.
- [ ] Assert no extra primary/encoder, new per-frame canvas work, provider restart from placement, unbounded journal/receiver growth or changed timer cadence. Verify actual OBS setup and native desktop behavior in an authorized disposable scene/profile; if unavailable, mark this exact gate blocked, not passed.
- [ ] Run final lint/typecheck/unit/build, affected Storybook interaction/accessibility/console and rebuilt Playwright gates below. Classify failures and repair in-scope regressions; do not rerun broad suites absent changed code or a diagnosed environmental failure.
- [ ] Obtain at most one independent whole-change review through the invoking chat's review subagent (`gpt-6.1-sol`, low), as repository instructions require for independent review. Scope it to migration/auth, manual bus semantics, player ownership and spec coverage. Resolve findings and rerun affected checks. Do not request GitHub-hosted review unless asked.
- [ ] Reconcile every delta requirement with code/tests/evidence; sync canonical specs only for completed implementation. Remove BL-068 only after implementation and spec sync; archive the change only when authorized/complete under the matching workflow. Record remaining physical acceptance explicitly.

## Verification commands and stop conditions

Use PowerShell and the repository-pinned toolchain. Commands below are current root scripts, not claims they have run for implementation.

| Gate | Command | Expected evidence |
| --- | --- | --- |
| Focused unit | `corepack pnpm exec vitest run <owning test files/directories>` | All selected tests pass; no skipped acceptance assertions |
| Strict types | `corepack pnpm typecheck` | Exit 0 with project references intact |
| Affected build | `corepack pnpm --filter @stream-jams/core --filter @stream-jams/server --filter @stream-jams/web --filter @stream-jams/desktop build` | Successful builds of affected packages (narrow filters to changed packages/dependencies) |
| Lint | `corepack pnpm lint` | ESLint and error-provenance checks pass |
| Full final unit | `corepack pnpm test:unit` | Vitest and root Node script checks pass |
| Full final build | `corepack pnpm build` | All production packages compile |
| Storybook | `corepack pnpm build-storybook` then `corepack pnpm test:storybook:ci` | Production stories build and interaction/a11y/console gates pass; follow frontend guide server setup |
| Disposable browser | `corepack pnpm exec playwright test <affected spec paths>` after build | Tests use rebuilt service/health checks and isolated data |
| Desktop | `corepack pnpm test:desktop -- <affected spec paths>` after required packaging/build setup | Separate automated desktop evidence; hardware gates reported distinctly |
| Specification | `openspec validate separate-browser-desktop-output-layouts --strict` | Valid deltas/tasks; canonical sync checked when performed |
| Hygiene | `git diff --check` | No whitespace errors; status contains only intended files |

Every independently published slice must satisfy applicable repository publishing gates, not defer broken tests until S11. An authorization, migration integrity, duplicate playback, data-loss or transparent-overlay failure blocks its owning slice and all dependent delivery. A materially changed upstream interface requires updating this plan and affected slice tests before continuing; do not silently fork contracts.

## Requirement-to-slice coverage

| Delta capability | Owning slices |
| --- | --- |
| output-specific-module-rendering | S05-S08, S11 |
| central-event-bus | S02-S04 |
| alert-configuration-management | S03 |
| runtime-log-operations | S02-S04 |
| overlay-browser-resilience | S03 |
| overlay-output-management | S03, S05-S10 |
| local-app-serving | S09-S10 |
| overlay-safe-assets | S09-S10 |
| shared-overlay-surfaces | S01, S05, S10 |
| timer-overlay-module | S07 |
| music-widget-overlay | S06 |
| video-request-queue | S04, S08-S09 |
| configuration-backup-restore | S07-S10 |
| production-entrypoint-validation | S10-S11 |
| scoped-automation | S04, S09-S11 |
| multi-module-playback-operations | S03, S09-S11 |

Plan self-review: all delta capabilities mapped; every data-shape change owns its migration/restore tests; breaking cutovers have prerequisites and rollback boundaries; five cross-cutting risks have named tests; no implementation or physical performance result is claimed by this planning artifact.
