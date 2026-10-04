# Native Music Widget Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the standalone widget's display behavior into Stream Jams with authenticated Pear Desktop, replaceable provider adapters, saved appearance controls, Advanced CSS, and uploaded branding images.

**Architecture:** Framework-independent Music contracts and projection rules in core; provider registration, pairing, transport, artwork and runtime ownership on the server; one production React renderer for preview, browser sources and private desktop. Reuse provider registrations, module configuration, SecretStore, assets and output authorization.

**Tech Stack:** Existing strict TypeScript/ESM, Zod, React/Vite, Fastify, SQLite, Node fetch, ws, OS keyring, Vitest, Storybook and Playwright. Resolve exact dependency versions from manifests and the lockfile. Task 1 evaluates the small number of missing primitives before adding anything.

**Spec:** [Approved design](../../../openspec/changes/add-music-widget-module/design.md), [provider requirements](../../../openspec/changes/add-music-widget-module/specs/music-source-providers/spec.md), [widget requirements](../../../openspec/changes/add-music-widget-module/specs/music-widget-overlay/spec.md), [OpenSpec checklist](../../../openspec/changes/add-music-widget-module/tasks.md).

Approved for implementation planning on October 4, 2026. This document records intended work, not completed implementation. Source baseline: Stream Jams `1d9dfe7`, standalone widget `91dcee0327eb97a75860a892a92630c32e0f9e3e`. Working branch: `codex/add-music-widget-module`. Preserve the committed proposal and user changes when refreshing the baseline.

Recommended execution: Native, sequentially, with one whole-branch review. The skill header does not itself authorize agent spawning or override the repository's single-agent default. These are ordered commit-sized implementation checkpoints within one OpenSpec slice, not separate product launches. Complete and validate a checkpoint before advancing; split an oversized checkpoint into smaller commits without changing its interfaces or acceptance conditions.

## Global Constraints

The approved design is authoritative. Centralize these values in tested schemas/constants; consumers must not independently approximate them.

| Area | Required values and behavior |
| --- | --- |
| Scope | `music` defaults disabled; `pear-desktop` / `music-source`; one selected source per capability. No Spotify/Plex adapters, playback controls, audio, requests/history, source mixing, plugin loader, standalone edits, or LAN listener changes. |
| Pear | Baseline 3.12.0; default `http://127.0.0.1:26538`; loopback literals or localhost only, normal TLS validation for HTTPS/WSS. POST `/auth/{id}` with explicit approval. REST bearer header; server-only WS `/api/v1/ws?token=...`. No credential-bearing redirects. |
| Timing | Pairing 60 s, ordinary requests/first validated PLAYER_INFO 5 s, serialized polls 3 s, WS reconciliation 15 s, stale after 45 s; retry 1/2/5/10/30 s with bounded jitter and Retry-After respected. WS open is not readiness. 1008/401/403 stops retries and requires explicit reconnect/pair. |
| Bounds | WS frames 256 KiB; title/artist/album 1,024 characters; at most 32 artists; provider/track IDs 512 characters. Finite nonnegative milliseconds or null; never fabricate unknown duration/position. |
| Ownership | One live generation, request, retry timer and latest pending snapshot per registration; abort and discard obsolete work. Clear live output on disconnect, auth failure, empty, stale, disable or source switch. Persist configuration, never live playback. |
| Artwork | Pear HTTPS hosts `i.ytimg.com`, `lh3.googleusercontent.com`; validated/pinned DNS destinations, no private/link-local/loopback remote destinations or unapproved redirects. Raster only, 2 MiB/image, 4096 px/side, 5 s fetch, 16 MiB/32-item cache. Opaque generation-scoped references only. |
| Display | Full/compact; dark/light; eight edge/corner alignments from the design; default full/dark, 84% background opacity, bottom-left. Idle none/hide/compact, 1..600 s, default none/30 s. Appearance epoch changes on a new track or genuine recovery, not polling or pause/resume. |
| Geometry | Width 160..1920, height 48..1080; profile cap; art 0..512 (0 hides), padding per axis/gap 0..128, radius 0..128, border 0..32, content inset per edge 0..512 with positive remaining area. Full 640x178, art144/padding16/gap22/radius8. Compact 480x118, art0, padding14 vertical/18 horizontal, title22/details14. |
| Appearance | RGBA alpha 0..1, font sizes 8..144, weight100..900 by100, spacing -20..100, shadow offset -128..128, blur0..128, spread -64..64. Separate title/details font assets and styling. Colors: two gradient stops, title, details, artwork placeholder, border, progress fill/track. |
| Branding | Existing image assets, PNG/JPEG/WebP, existing 10 MiB upload policy; independent Landscape/Vertical and full/compact settings. Nullable assetId, contain/cover/fill, x/y0..100, opacity0..100; defaults none/contain/50/50/100. Managed order: fill, image, content. No logo remains when the widget is hidden. |
| CSS | Saved source/enabled/styleContractVersion; defaults empty/false/version1. Max32 KiB UTF-8, 512 rules, 4096 declarations, nesting8. AST validation shared by preview/save/restore; permitted at-rules only media/supports/container/keyframes; namespace animations. Reject host/global/slot selectors, unparsed nodes, executable/resource-loading syntax, escaped equivalents and unsafe var indirection. |
| Recovery | CSS disable preserves text; theme reset preserves CSS/branding; clear CSS/remove image are separate. Invalid draft preserves last valid preview. Corrupt saved CSS falls back to native; missing brand falls back to fill/content; source failures hide everything. |
| Security/portability | No tokens, credential refs, pairing identity, raw provider URLs or remote artwork descriptors in public state/logs/exports. Backup config/CSS/version/branding/fonts; restore requires fresh pairing. Management, live/test overlay and private desktop grants remain distinct. |

## Review Focus

1. Late pairing success or a late transport callback recreates an abandoned source: cancellation and credential compensation tests in Tasks 5–7.
2. Desktop timer-only validation accepts Music incorrectly or drops Timers: union, profile and asset-grant regressions in Tasks 3 and 10.
3. CSS escapes or custom-property indirection initiate requests or break managed visibility: parser tests in Task 4 and intercepted-network browser tests in Task 15.
4. Polls, recipient reconnects or pause/resume reset idle timing: fake-clock projection/runtime tests in Tasks 2 and 7, real browser observation in Task 15.
5. Restore/replacement misses a compact/vertical brand or font reference, or deletes still-needed secrets on rollback: full reference matrix and fault-injection tests in Tasks 9 and 14.

---

## Interfaces And File Ownership

Paths below are repository-relative. **New** means create; **modify** means extend the existing owner, not introduce a parallel subsystem. Test files use adjacent `*.test.ts`/`*.test.tsx` unless an exact integration path is specified.

**Core — new `packages/core/src/music/`:** `types.ts`, `schemas.ts`, `module-definition.ts`, `projection.ts`, `style-policy.ts`, `asset-references.ts`. Export through existing `packages/core/src/index.ts`.

- `MusicSnapshot`: providerId/generation/revision, nullable track, playbackState, nullable positionMs/durationMs, observedAtEpochMs, nullable selected session. Track holds id/title/ordered artists/nullable album/opaque artworkRef and optional safe attribution. Define `MusicStatus` with state, stale flag and redacted diagnostic reference; `MusicCapabilities` with artwork/position/duration/sessionSelection booleans.
- `MusicSourceAdapter.testConnection(signal: AbortSignal): Promise<MusicConnectionTestResult>`; `start(onSnapshot: (snapshot: MusicSnapshot) => void, onStatus: (status: MusicStatus) => void, signal: AbortSignal): Promise<void>`; `getSnapshot(): MusicSnapshot | null`; `stop(): Promise<void>`. `MusicConnectionTestResult` reports selected transport and capabilities, never credentials. Server construction supplies providerId/generation; the adapter emits bounded complete snapshots with monotonically increasing revision. Runtime checks ownership before publication.
- `MusicModuleConfig`: versioned profiles keyed by existing target-profile IDs; each profile has initial view/theme/alignment/idle settings and full/compact view appearance, branding and insets. Config owns optional CSS source/enabled/styleContractVersion. Use existing profile/color/font types where compatible; no new parallel asset model.
- `MusicWidgetProjection`: targetProfileId, snapshot, appearanceStartedAtEpochMs, validated profile configuration and versioned public asset references. `projectMusicWidget(snapshot: MusicSnapshot | null, status: MusicStatus, config: MusicModuleConfig, targetProfileId: TargetProfileId, appearanceStartedAtEpochMs: number | null, nowEpochMs: number): MusicWidgetProjection | null`; `getMusicPositionMs(snapshot: MusicSnapshot, nowEpochMs: number): number | null`. Null projection means fully transparent.
- `validateMusicCss(source: string, styleContractVersion: number): MusicCssValidationResult`, discriminated by `valid`; failures include one-based line/column/message; success returns validated canonical CSS, not stripped CSS. `compileMusicCss(source: string, styleContractVersion: number, instanceId: string): MusicCssValidationResult` additionally namespaces keyframes and animation references. Runtime revalidates persisted input before compilation.
- `collectMusicAssetReferences(config: MusicModuleConfig): readonly ModuleMediaReference[]` enumerates every profile/view brand and font, including currently hidden views.

**Shared presentation — new `packages/core/src/overlay-modules/presentation.ts`:** owns `OverlayModulePresentation` and its Zod discriminated union: existing `{kind: "timer-stack", stack}` plus `{kind: "music-widget", widget: MusicWidgetProjection}`. Modify `timers/types.ts` and `timers/schemas.ts` to re-export compatibility aliases; update internal imports to the new owner, avoiding cycles.

**Server — new `apps/server/src/modules/music/`:** `pear-config.ts`, `pear-pairing-service.ts`, `pear-music-source.ts`, `pear-normalization.ts`, `music-runtime-coordinator.ts`, `music-artwork-service.ts`, `music-management-service.ts`. Do not create another provider table, secret store, persistent track repository or HTTP server.

- `PearPairingService.begin(config: PearConfiguration): Promise<MusicPairingAttemptView>` returns an opaque management-bound attempt ID; `get(attemptId: string): MusicPairingAttemptView`; `cancel(attemptId: string): Promise<void>`; `dispose(): Promise<void>`. Views contain pending/approved/denied/expired/cancelled status only. Keep approved token consumption server-internal and single-use, attached to validated registration; exclude it from shared interfaces.
- `PearMusicSource implements MusicSourceAdapter`, constructed with validated config, server-only credential access, source ownership, clock and transport factories. `normalizePearObservation(input: unknown, previous: MusicSnapshot | null, context: PearObservationContext): MusicSnapshot`; context supplies ownership/revision/time and event type, never browser-controlled values. Define its upstream schemas locally.
- `MusicRuntimeCoordinator.reconcile(): Promise<void>` reads selected registration and enabled module, invalidates old generation before awaiting shutdown, then starts the current source; `getStatus(): MusicStatus`; `getProjection(targetProfileId: TargetProfileId): MusicWidgetProjection | null`; `stop(): Promise<void>`. Inject current-clock, module-config/provider repositories and presentation sink; no React or Fastify dependency.
- `MusicArtworkService.resolve(descriptor: PrivateArtworkDescriptor, owner: MusicArtworkOwner, signal: AbortSignal): Promise<string | null>` returns an opaque ID; `read(ref: string, owner: MusicArtworkOwner): Promise<MusicArtworkRead | null>` returns verified bytes/MIME; `clearGeneration(owner: MusicArtworkOwner): Promise<void>`. Private types stay server-only. Authorization occurs before read; no caller-supplied fetch URL route.
- `MusicManagementService.getStatus(): MusicStatus`; `reconnect(providerId: string): Promise<void>`; `preview(config: MusicModuleConfig, targetProfileId: TargetProfileId): MusicWidgetProjection`. Explicit test-output delivery uses existing test-purpose output services; preview is a pure fixture projection and never starts an adapter.

**Web — new** `apps/web/src/management/music/{music-api.ts,MusicSourcesPage.tsx,MusicPage.tsx,MusicAppearanceEditor.tsx,MusicCssEditor.tsx,MusicBrandingEditor.tsx,music.css}` and `apps/web/src/overlay/components/{MusicWidget.tsx,music-widget.css}`. Components receive typed clients/projections/resolvers; transport, authentication, CSS policy and business rules stay outside React.

`MusicWidget({projection, nowEpochMs, resolveAsset, reducedMotion})` uses a shadow root and a React portal for documented inner parts; shared typed `MusicAssetResolver` resolves versioned uploaded media and opaque provider art without exposing credentials. Managed visibility/clipping/layers live outside user-style reach. Reuse existing clock synchronization; do not create a second clock protocol.

## Task 1 — Refresh Baseline And Verify Dependency Choices

**OpenSpec:** 1.2–1.3. **New:** `docs/verification/music-widget-module.md`. **Read:** reference widget sources listed in the design; `docs/ai/frontend-agent-guide.md`, routed UX/token/error documents; active provider/module/secret/backup specs. **Potential dependency edits:** `packages/core/package.json`, `apps/server/package.json`, `pnpm-lock.yaml` only after evaluation.

- [x] Fetch origin with authorized network access, inspect branch/status and confirm Music remains unimplemented. Preserve proposal commits and any user edits; refresh this branch against current main before code work. If the scope has landed, reconcile instead of duplicating it.
- [x] Record source SHAs, Pear baseline and feature mapping: transports, metadata/art, progress/seeks, full/compact, themes, opacity, alignment, scrolling/reduced motion, idle and test mode. Note the three reproduced standalone defects as required regressions, not behavior to preserve.
- [x] Evaluate CSS Tree first against ESM/browser/Node support, license, maintenance/security history, custom-property AST handling and error locations. Inspect existing image metadata validation and safe fetching; identify whether pinned DNS connections and raster dimensions require a maintained dependency. Use official documentation/current package metadata; record the selected exact versions and concrete gaps before install. A parser is not a sanitizer.
- [x] Run small disposable fixtures for escaped URL functions, custom-property parsing, malformed CSS, raster dimensions and DNS pinning against selected primitives. Record expected rejection/parsed location/pinned destination, then choose the minimal working primitives. This is a feasibility checkpoint, not an extra framework.
- [x] Verify `corepack.cmd pnpm typecheck` after any dependency-only changes; commit the dependency decision/evidence and exact lockfile changes with a human-readable per-file explanation. Do not upgrade unrelated dependencies.

## Task 2 — Define Music State, Configuration And Projection

**OpenSpec:** 2.1, part of 4.1/5.2–5.3/5.10. **New:** core Music types/schemas/module-definition/projection plus `schemas.test.ts` and `projection.test.ts`.

- [x] Add failing schema tests for every Global Constraints boundary at below/min/max/above, malformed numbers, strict normalized fields, all display combinations and older config defaults. Assert `musicModuleDefinition.defaultEnabled === false`, `durationMs === null` remains null, artists length33 fails, width159 fails and insets consuming the entire content box fail.
- [x] Run `corepack.cmd pnpm exec vitest run packages/core/src/music/schemas.test.ts packages/core/src/music/projection.test.ts`; expect missing exports first, then behavior failures until implemented.
- [x] Implement the Core interfaces and schemas above. Define `musicModuleDefinition` using the existing module definition shape; define all eight alignment literals explicitly. Keep server-only transport configuration out of renderable config.
- [x] Test/implement progress and visibility: playing position1000 observed at10000 projects2000 at11000; paused stays1000; seek-back replaces the anchor; duration1500 clamps1500; unknown staysnull; stale/disconnected/empty projection isnull. Cover profile bounds and shared appearance epoch across recipients, pause/resume and repeated observations.
- [x] Rerun focused tests and `corepack.cmd pnpm typecheck`; commit `feat: define Music contracts and projection` with changed-file reasons.

## Task 3 — Generalize Presentation And Extend Provider Persistence

**OpenSpec:** 2.2–2.4. **New:** shared `presentation.ts`, `apps/server/src/modules/db/migrations/031-music-source-providers.ts`, `apps/server/src/modules/db/music-source-migration.test.ts` (renumber only if main gained migrations). **Modify:** `packages/core/src/{management/contracts.ts,management/provider-contracts.test.ts,overlay-modules/types.ts,timers/types.ts,timers/schemas.ts,overlays/types.ts,overlays/schemas.ts,overlays/desktop-visual-transport.ts,index.ts}`; `apps/server/src/modules/db/database.ts`; existing provider repository/service/activation-impact/adapters and module-config service integration.

- [ ] Test old registrations and selected event/TTS sources surviving migration; two active Music rows must violate the unique capability index, while Music plus event plus TTS remains valid. Fault injection leaves original rows/secret refs intact. Test missing Music config loads disabled defaults.
- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/management/provider-contracts.test.ts apps/server/src/modules/db/music-source-migration.test.ts`; expect new kind/capability rejection before changes.
- [ ] Add the migration through the existing transaction runner; rebuild only necessary constraints/indexes, retain foreign keys and all rows. Extend `providerCapabilityForKind` and setup schemas. Use existing registration/config repositories; add an optional Music source-change callback to provider management rather than reusing event-source side effects.
- [ ] Move the union to its shared owner. Narrow every consumer by `kind` before accessing `.stack`; extend browser and private desktop schemas together. Timer aliases remain compatible. Do not enable Music delivery until Task 10.
- [ ] Add union tests accepting both valid variants and rejecting wrong profile, malformed Music payloads and cross-variant fields. Run `corepack.cmd pnpm exec vitest run packages/core/src/overlays packages/core/src/timers apps/server/src/modules/providers apps/server/src/modules/db`; run typecheck and commit the persistence/shared-contract checkpoint.

## Task 4 — Implement The Shared CSS Policy

**OpenSpec:** 5.7, policy portions of 5.8/7.4. **New:** core `style-policy.ts`, `style-policy.test.ts`; `docs/music-styling.md` contract section.

- [ ] Add table-driven tests: valid grid/flex/position/pseudo-elements and each allowed at-rule pass; host/global/slot selectors, imports/font-face, Raw/unparsed AST, escaped `url`, string image-set, nested custom-property resource references and inherited unapproved variables fail with line/column. UTF-8 byte counts, rule/declaration/nesting maxima must be enforced. Example assertions: `validateMusicCss('.sj-title { color: red; }', 1).valid === true`; `validateMusicCss('.sj-title { background: u\\72l(https://example.invalid/x); }', 1).valid === false`.
- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/music/style-policy.test.ts`; verify failures, then implement validation/compilation with the selected parser AST and lexer. Parse custom properties too; reject unknown resource-bearing or unparsed constructs, not just named disallowed strings. Restrict variables to validated locally declared values and documented safe native variables; detect cycles and reject unsafe indirection.
- [ ] Define version1 selectors `.sj-content`, `.sj-artwork`, `.sj-title`, `.sj-artists`, `.sj-album`, `.sj-progress-track`, `.sj-progress-fill`, `.sj-time`, `.sj-brand-image`; data attributes view/theme/playback-state on the inner content root. Keep outer host/managed wrappers unselectable. Namespace keyframe identifiers and references structurally, including animation shorthands; reject constructs the parser cannot validate safely.
- [ ] Add compilation tests for two widget instances using identical keyframe names without collisions, quoted/escaped names, container rules and invalid runtime input. Document native styles < saved controls < enabled custom CSS precedence and standalone `#app`/`:root` migration. CSS errors block save/restore; no silent stripping.
- [ ] Run focused tests plus typecheck and commit `feat: validate scoped Music custom styles`. Browser enforcement is completed in Tasks 11/15; do not claim AST tests prove isolation.

## Task 5 — Pair Pear And Commit Credentials Safely

**OpenSpec:** 3.1–3.2, 3.6. **New:** server `pear-config.ts`, `pear-pairing-service.ts` and tests. **Modify:** provider-management-service/adapters, `apps/server/src/modules/security/redactor.ts` and tests, management setup contracts; existing `apps/server/src/http/routes/management-providers.ts` and new `music-management.ts` route tests.

- [ ] Write tests for loopback IPv4/IPv6/localhost, matching schemes and rejected userinfo/paths/nonloopback endpoints/redirects. Pair allow/deny/60-second timeout/cancel/late success; assert a cancelled attempt cannot register or write a secret. Store/database failures must leave no usable orphan and preserve an existing credential on failed replacement.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/music/pear-config.test.ts apps/server/src/modules/music/pear-pairing-service.test.ts apps/server/src/modules/security/redactor.test.ts`; verify missing behavior.
- [ ] Implement PairingService and management-authorized POST/GET/DELETE `/management/music/pairing[/:attemptId]`. POST returns202 and an attempt view; polling reads status; DELETE cancels. Bound provisional credentials to attempt lifetime and management ownership. Provider creation consumes an approved attempt ID through the existing registration service, validates first, then saves SecretStore/config with compensation. Never send the token back for the browser to resubmit.
- [ ] Test first successful music registration selected, later ones inactive, test connection nonactivating, explicit replacement/reconnect and pairing after process restart. Persist stable client identity locally with provider configuration, exclude it from export. Disabled Music must remain stopped after registration.
- [ ] Test a secret sentinel through WS/WSS/HTTP URLs, Authorization, nested cause serialization, diagnostics and management JSON: no response/log contains it or credential references. Run tests/typecheck and commit the authenticated setup checkpoint.

## Task 6 — Build Authenticated Pear Transport And Adapter Harness

**OpenSpec:** 2.5, 3.3–3.5, 6.1. **New:** server `pear-music-source.ts`, `pear-normalization.ts` and tests; `packages/test-support/src/music-source-contract.ts`, `packages/test-support/src/pear-protocol-fixture.ts`, exports in `index.ts`; server `pear-protocol.integration.test.ts`.

- [ ] Implement disposable loopback HTTP/WS fixture with programmable pairing approval, first frame, `/song`, revocation, Retry-After and transport failures. Use throwaway tokens and ephemeral ports; close all handles in teardown. Contract harness accepts an adapter factory and source-control driver and asserts complete snapshots, empty readiness, selected sessions, cancellation and idempotent stop. Run it against push/poll/session fixtures and the Pear adapter.
- [ ] Add failing transport tests: WS open without PLAYER_INFO fails at5s; valid empty first frame succeeds; WS1008/REST401/403 produces auth-required with zero fallback/retries; ws-only never qualifies using REST alone; polling-only opens no socket. Verify token/header use at the actual fixture boundary.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/music/pear-music-source.test.ts apps/server/src/modules/music/pear-normalization.test.ts apps/server/src/modules/music/pear-protocol.integration.test.ts`.
- [ ] Implement normalization and transport using the interfaces above: serialized requests, bounded reconnect/reconciliation and payload parsing; auto fallback only for transport unavailability; cancellation races cannot publish. Distinguish absent metadata from explicit empty, retain partial metadata only for the same track, and discard raw frames after normalization.
- [ ] Add fake-clock tests for cadence, reconciliation, Retry-After, malformed/oversized frames and repeated stop. Port the three regressions explicitly:204 clears track, completion after stop publishes nothing, repeated polling does not emit false recovery. Rerun harness/protocol tests/typecheck and commit the adapter checkpoint.

## Task 7 — Own Runtime State And Appearance Epoch

**OpenSpec:** 4.1, remaining 2.4. **New:** server `music-runtime-coordinator.ts` and test. **Modify:** `apps/server/src/runtime/runtime-composition.ts`, module registry/config callbacks, provider activation callbacks and relevant runtime tests.

- [ ] Test disabled startup opens no connection, enable starts selected source, switching immediately clears old projection, and an old source completing after switch cannot overwrite it. Assert snapshots never persist as restart truth. At most one request/retry timer/latest pending publication survives a slow consumer.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/music/music-runtime-coordinator.test.ts` and confirm failures before implementing coordinator ownership and sink publication.
- [ ] Track accepted generation/revision plus server-owned appearance epoch. Increment publication identity for clear/config changes too; never reuse an old generation. Repeated polling, pause/resume and new recipients retain epoch; new track or genuine recovery resets it. Arm stale expiry even if no additional events arrive; clear immediately on disconnect/auth failure.
- [ ] Test abort during shutdown/source switch/config update, rejection of out-of-order revisions and reconciliation after management activation. Register shutdown with existing tracked runtime lifecycle; awaited stop removes requests/sockets/listeners/timers.
- [ ] Run focused tests, runtime composition tests and typecheck; commit `feat: coordinate Music runtime lifecycle`.

## Task 8 — Bound And Authorize Provider Artwork

**OpenSpec:** 4.2–4.3. **New:** server `music-artwork-service.ts`, `music-artwork-service.test.ts`, `apps/server/src/http/routes/music-artwork.ts` and tests. **Modify:** existing media/private-grant boundaries only where the new reference kind requires it.

- [ ] Add tests for valid allowlisted rasters, unsupported host/scheme/userinfo, redirect hop to private IP, DNS rebinding, streamed body overflow, malformed image, dimensions4097, fetch cancellation and both cache caps. Assert failure yields null art while safe text remains available.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/music/music-artwork-service.test.ts apps/server/src/http/routes/music-artwork.test.ts`; implement the Interfaces API with selected safe-fetch/image primitives, validated connection destinations and bounded decoding. Avoid raw URLs in cache keys exposed to clients.
- [ ] Add thin authorized delivery by opaque reference. Resolve requester context using existing management, purpose-scoped overlay or private desktop authorization; the same bytes need no new universal bearer credential. Reject arbitrary URL inputs, wrong purpose/output/source generation and revoked keys before returning bytes.
- [ ] Test stale generation completion/access, cache eviction, empty-state clearing and private-desktop grant expiry. Set verified raster content type/nosniff; never proxy raw upstream errors. Run focused tests/typecheck and commit the artwork checkpoint.

## Task 9 — Integrate Saved Branding And Font Assets

**OpenSpec:** 4.5, asset portions of 5.10. **New:** core `asset-references.ts` and tests. **Modify:** `apps/server/src/modules/assets/asset-library-service.ts`, `local-media-service.ts`, `media-preview-service.ts`, corresponding tests, module config validation and existing retirement/replacement integration.

- [ ] Test all four profile/view brand references plus title/detail fonts, including hidden compact settings. Referenced assets cannot be retired/deleted; replacement reports every Music owner and rejects image-to-audio/font-to-image before changing content. Image IDs must exist, be available and be supported raster formats.
- [ ] Run `corepack.cmd pnpm exec vitest run packages/core/src/music/asset-references.test.ts apps/server/src/modules/assets/asset-library-service.test.ts`; implement `collectMusicAssetReferences` and inject module-config access into the existing asset owner enumeration.
- [ ] Preserve transparent raster uploads and existing10MiB policy. Use versioned authorized asset delivery for preview/outputs; source changes do not mutate branding. Refresh changed versions on replacement and invalidate outstanding old-version resolutions.
- [ ] Test missing/deleted-after-load assets produce management errors and safe render fallbacks, while invalid save references are rejected. Run affected asset tests/typecheck and commit `feat: track Music branding and font assets`.

## Task 10 — Wire Browser And Private Desktop Outputs

**OpenSpec:** 5.4–5.5, 6.3. **Modify:** core `overlay-modules/overlay-composition-service.ts`, `overlay-modules/surface-configuration.ts`, `overlays/desktop-visual-transport.ts`; server `websocket/overlay-gateway.ts`, HTTP `overlay-modules.ts`, `overlays.ts`, `overlay-output-management.ts`, `overlay-surfaces.ts`; `modules/overlay-surfaces/{desktop-module-snapshot-sink.ts,desktop-visual-asset-resolver.ts,surface-settings-service.ts}`; desktop `src/overlay/{worker-overlay-client.ts,overlay-ipc.ts}` only as needed for the typed variant; web `desktop-overlay/DesktopOverlayApp.tsx` and `overlay/overlay-client.ts`.

- [ ] Add tests registering live/test module routes for Landscape/Vertical and unified Music composition. Invalid/revoked/wrong-purpose keys fail; new recipient receives full current state. Existing Timer snapshots and grants remain unchanged. Desktop starts with Music opted out.
- [ ] Run focused tests for the listed existing composition/gateway/desktop transport owners; expect new Music dispatch assertions to fail. Update discriminated union handling and per-module revisions, retaining existing profile rules (including landscape-only private desktop validation where applicable).
- [ ] Extend desktop asset resolution to Music branding/fonts and ephemeral provider artwork through appropriately scoped grants. Do not put artwork into permanent uploaded-asset tables to satisfy a resolver. Test explicit surface membership, grant expiry, generation changes, layer hiding and clearing on shutdown.
- [ ] Add tests that pause/mute/skip/replay/DND for transient modules do not affect Music or issue player commands. Test fixture state can reach test outputs only, and no widget path emits audio. Run `corepack.cmd pnpm exec vitest run packages/core/src/overlay-modules packages/core/src/overlays apps/server/src/modules/overlay-surfaces apps/server/src/websocket apps/desktop/src/overlay`; typecheck and commit output wiring.

## Task 11 — Render The Shared Widget And Managed Style Boundary

**OpenSpec:** 5.3, 5.6, 5.8, rendering part of 5.10. **New:** `MusicWidget.tsx`, `music-widget.css`, `MusicWidget.test.tsx`, `MusicWidget.stories.tsx` under overlay/components. **Modify:** `OverlaySurface.tsx`/test/stories and desktop presentation dispatch. Use tiny existing Storybook assets; add a small transparent branding fixture only if absent.

- [ ] Add production component tests for full/compact defaults, long/missing text, unknown duration, pause/seek, invalid/empty projection, reduced motion and art fallback. Assert unknown duration has no percentage/total, and null projection renders no branding/content.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/web/src/overlay/components/MusicWidget.test.tsx`; implement the `MusicWidget` interface using native geometry, existing font loading and clock reference. Safely render metadata as text, not HTML; safe attribution links must use the validated metadata contract.
- [ ] Implement the managed outer frame, shadow root/portal and fill/image/content wrappers. Mount only validated native/custom sheets; do not interpolate CSS into HTML. Inner content supports documented selectors; outer clipping, pointer behavior, visibility, stacking and reduced-motion enforcement remain outside editable rules. Cover animation overrides, not just native marquee.
- [ ] Test CSS enable/disable/clear/reset precedence and runtime invalid-style fallback. Test contain/cover/fill, independent image/fill opacity, transparent images, per-view settings, content insets and missing brand fallback. Preserve image dimensions until explicit aspect-ratio action; derive `round(width * imageHeight / imageWidth)`, clamp to schema bounds and show the adjusted result before save.
- [ ] Add scenario stories for baseline/compact, brand overlay, custom grid/container animation, missing image/font, long text/reduced motion and safe fallback. Run component tests/typecheck and Storybook build; commit shared renderer. Real-browser boundary checks follow in Task15.

## Task 12 — Add Music Source Setup And Status UI

**OpenSpec:** 5.1, setup part of 5.6. **New:** server `music-management-service.ts` and tests; web `music-api.ts`, `MusicSourcesPage.tsx` and tests/stories. **Modify:** management-providers/music-management routes, runtime composition, web `management/{ManagementApp.tsx,routing/management-route.ts,navigation/ManagementNavigation.tsx,management-api.ts}` and provider page integration.

- [ ] Add Fastify inject tests for management-only pairing/status/reconnect and generic registration/activation; overlay credentials must fail. Assert responses validate against shared schemas and contain no credential data. `GET /management/music/status` and `POST /management/music/providers/:providerId/reconnect` use existing authorization/error conventions.
- [ ] Add typed client tests and role/label component tests for empty/loading, approve-in-Pear, deny/timeout/cancel, transport test, save, selection, auth-required, reconnecting and stale data. Visible-page status refresh is at most5s and cancels on unmount; late responses cannot overwrite a new selection.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/http/routes/music-management.test.ts apps/server/src/modules/music/music-management-service.test.ts apps/web/src/management/music/music-api.test.ts apps/web/src/management/music/MusicSourcesPage.test.tsx` before implementation.
- [ ] Implement management service/client/page, preserving generic provider setup/validation and independent capability activation. Pair/test/save are explicit actions. Label loopback transport and Pear approval requirements; validation and status are distinct. Reuse existing shell, masked display, dirty navigation, errors/toasts and accessible focus patterns.
- [ ] Add production stories for the tested states; rerun tests/typecheck and commit setup/status UI.

## Task 13 — Add Appearance, Advanced CSS And Branding Editors

**OpenSpec:** 5.2, 5.4, remaining 5.6, 5.9–5.10. **New:** web `MusicPage.tsx`, `MusicAppearanceEditor.tsx`, `MusicCssEditor.tsx`, `MusicBrandingEditor.tsx`, `music.css` and corresponding tests/stories. **Modify:** typed Music client and generic module config/output integration as necessary.

- [ ] Add tests for saved controls round-trip, profile/view independence, font picker, enablement and output links. Unsaved config affects preview only; navigating dirty requires the existing decision flow. Preview uses production `MusicWidget` with a typed fixture, never a registered mock provider.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/web/src/management/music`; verify new editor assertions fail. Implement editors as controlled components over `MusicModuleConfig`, using Task2 schemas for bounds and Task4 validation for CSS.
- [ ] Test CSS draft error line/column and last valid preview, explicit save, disable preserving source, clear removing source, theme reset preserving both CSS and image. Keep Disable custom CSS outside the shadow root and reachable by keyboard even if user CSS hides all content.
- [ ] Implement branding picker/upload with existing asset controls, fit explanations, position/opacity, dimensions/insets, explicit aspect action and independent full/compact assets. Test image removal preserves other settings and replacing the live provider changes album art only.
- [ ] Add loading/empty/dirty/saved/error stories and keyboard/a11y interactions. Run affected tests/typecheck, Storybook build/test and commit editors.

## Task 14 — Make Backups And Restore Music-Aware

**OpenSpec:** 4.4. **Modify:** `apps/server/src/modules/backup/{configuration-backup-service.ts,sqlite-configuration-snapshot-repository.ts,runtime-maintenance-gate.ts}` and tests, relevant backup/config schemas in core, runtime maintenance integration. **New:** `apps/server/src/modules/backup/music-backup.test.ts`.

- [ ] Add round-trip fixture with four brand references, fonts, CSS source/enabled/version and nonsecret provider config. Assert archive omits token/secretRef/client pairing identity/cache/playback. Missing Music restores disabled defaults; supported older appearance fields default to no CSS/no brand. Unsupported archive schema still fails existing compatibility checks.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/backup/music-backup.test.ts`; implement mappings and schema-drift checks using existing snapshot/asset packaging infrastructure.
- [ ] Validate CSS and every asset reference before mutation; malformed CSS/missing media cannot partly restore. Cancel Music before replacement. Restore generates fresh local pairing identity, requires fresh auth and publishes no saved track. Only clean superseded secrets after successful replacement.
- [ ] Fault-inject database swap, asset install, startup and secret cleanup. Failed replacement restores prior config/runtime/credentials; post-success cleanup failure reports remediation without pretending restore rolled back. Verify WAL companion backup and document binary+database rollback, not an unverified down migration.
- [ ] Run `corepack.cmd pnpm exec vitest run apps/server/src/modules/backup`; typecheck and commit backup integration.

## Task 15 — Exercise Real Service, Browser And Desktop Boundaries

**OpenSpec:** 6.1–6.3, 6.7–6.8. **New:** `tests/e2e/music.spec.ts`, `tests/e2e/music-security.spec.ts`, `tests/e2e/music-test-runtime.ts`, `tests/desktop/music.spec.ts`. Reuse the disposable Pear fixture and existing desktop/overlay harnesses; isolate temp databases and ports. The end-to-end Music path must use the actual service/provider adapter, not only `page.route` mocks.

- [ ] Build with `corepack.cmd pnpm build`. Add browser tests starting an isolated built server plus Pear fixture and loading actual management/output pages. Cover pair/test/save/select, module disabled default, restart, source switch, empty204, pause/seek, revoked credentials, authenticated auto fallback and ws-only refusal.
- [ ] Run `corepack.cmd pnpm exec playwright test tests/e2e/music.spec.ts tests/e2e/music-security.spec.ts`; first capture missing behavior, repair the owning implementation, rerun to pass. Check live/test/unified/profile routes, key revocation, new-recipient snapshot and idle unchanged across repeated polls.
- [ ] Intercept outbound browser requests to prove rejected CSS creates none. Exercise escaped/indirect resource attempts, supported layout/animation/container CSS, sibling/management scope isolation, reduced motion, always-reachable disable and invalid-draft preservation. Assert no auth data in browser network/state or captured console output.
- [ ] Compare the same branded layout in preview, module/unified outputs and private desktop: layer order, crop/stretch/contain, independent opacity, font/image authorization, replacement/missing fallback, no logo after hide/disconnect. Include reload and backup round-trip in the real-service fixture.
- [ ] Run `corepack.cmd pnpm test:desktop tests/desktop/music.spec.ts tests/desktop/timers.spec.ts`. Cover opt-in membership, grant validation, clear/shutdown and Music independence from alert commands; preserve click-through/focus/no-audio policies. Hardware-only checks remain explicitly separate. Commit acceptance tests and any scoped fixes.

## Task 16 — Reconcile, Verify And Document Delivery

**OpenSpec:** 6.4–6.6, 7.1–7.4. **New:** `docs/music-providers.md`, `docs/examples/music-branding.css`. **Modify:** `docs/music-styling.md`, `docs/verification/music-widget-module.md`, `docs/README.md`, active OpenSpec checklist/specs and `docs/backlog.md` at completion only.

- [ ] Document Pear AUTH_AT_FIRST/version/transport/pairing recovery, output setup and secret-free troubleshooting. Document an adapter onboarding checklist (typed setup, descriptor, normalization/auth, artwork policy, lifecycle harness); identify Plex/Spotify as future BL-054 work. Include the checked-in branded CSS example in policy validation tests.
- [ ] Map every scenario from both approved specs to a test name or separately recorded physical acceptance. Reconcile the feature inventory from Task1 and all41 original OpenSpec tasks; no unchecked implementation requirement may disappear behind a summary claim.
- [ ] Run `corepack.cmd pnpm lint`, `corepack.cmd pnpm typecheck`, `corepack.cmd pnpm test`, `corepack.cmd pnpm build`, `corepack.cmd pnpm --filter @stream-jams/web build-storybook`, `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci`, `corepack.cmd pnpm test:e2e`, applicable desktop suites from Task15, and `openspec.cmd validate add-music-widget-module --strict`. Classify failures as regression/test defect/environment; repair relevant failures at their root and record actual results.
- [ ] Rebuild/restart affected services against a disposable profile, wait for health and reload the UI. Verify the built workflow, not stale dev code. Run real installed Pear pairing with AUTH_AT_FIRST, restart, revocation, track/pause/seek/reconnect; record actual version. Verify OBS browser source and Windows desktop visually/input-wise. Mark unavailable checks `[blocked]` with the exact missing app/version/device/session or user action; do not claim fixture success proves physical acceptance. Do not change the user's production Pear settings without authorization.
- [ ] Perform one whole-branch review according to the chosen execution method, focused on the five Review Focus risks and auth/asset/CSS boundaries. Resolve in-scope findings, rerunning only affected checks when fixes justify them. Record UX sections, states, keyboard/a11y and Storybook/Playwright evidence.
- [ ] Sync canonical specs only for completed behavior through the OpenSpec workflow; remove BL-028 only when implementation and spec sync are complete. Keep BL-054. Commit docs/spec/evidence with per-file reasons. Push, PR creation and merge are separate actions requiring task authorization; this plan does not schedule them.

## Requirement Traceability

| Approved requirement | Implementation / acceptance tasks |
| --- | --- |
| Music Sources Use Existing Provider Registration | 3, 5, 7, 12, 15 |
| Music State Is Normalized And Transport Independent | 2, 6, 7 |
| Pear Pairing And Transport Require Credentials | 5, 6, 12, 15, 16 |
| Authentication Failures Never Downgrade Transport Security | 6, 7, 15 |
| Adapter Lifecycles Reject Obsolete Work | 5, 6, 7, 8 |
| Empty And Stale Playback Cannot Persist Live | 2, 6, 7, 11, 15 |
| Artwork Is Served Through Authorized Bounded Access | 8, 10, 15 |
| Configuration Is Durable And Portable Without Secrets | 3, 5, 9, 14, 15 |
| Music Secrets Are Redacted At Every Boundary | 5, 6, 8, 12, 14, 15 |
| Music Is A Native Disabled-By-Default Overlay Module | 2, 3, 7, 10, 12 |
| Widget Presentation Preserves Existing Display Options | 1, 2, 11, 13, 15 |
| Custom Appearance Uses Saved Validated Controls | 2, 9, 11, 13 |
| Advanced CSS Is Saved Previewable And Reversible | 4, 11, 13, 14, 15 |
| Custom CSS Is Confined And Validated | 4, 11, 14, 15 |
| Branding Image Renders Beneath Music Components | 2, 11, 13, 15 |
| Branding Assets Share The Existing Asset Lifecycle | 9, 10, 14, 15 |
| Progress Uses Fresh Authoritative Observations | 2, 6, 7, 11, 15 |
| Idle Appearance Is Independent Of Polling | 2, 6, 7, 15 |
| Music Participates In Authorized Shared Outputs | 3, 10, 15 |
| Live Failures Are Transparent And Preview Is Isolated | 7, 8, 10, 11, 13, 15 |
| Music Management Uses Existing UX Conventions | 12, 13, 15, 16 |

## Plan Verification

Before committing this plan, self-review requirement coverage, exact existing paths, interface/type consistency, Review Focus test ownership and document proportion. Validate OpenSpec and whitespace. This planning checkpoint does not run or claim product tests and does not complete implementation checklist items.
