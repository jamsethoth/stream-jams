# Screen Effects implementation and verification

## Status

Implementation started on 2026-09-13 from `f2bb518692121eaa9b6f4230a250176bab9a766f`, the fetched `origin/main`, on `codex/add-screen-effects-module`. This record is incremental: unchecked OpenSpec tasks and physical-output gates remain incomplete until their named evidence is added.

## Foundation gate

Both required foundations are present on the implementation baseline:

- `add-shared-desktop-overlay-surface` is archived with every task checked, its capability is synced at `openspec/specs/shared-overlay-surfaces/spec.md`, and packaged Windows/OBS acceptance is recorded in `docs/verification/shared-desktop-overlay.md`.
- `add-routed-video-audio-controls` is archived with every task checked, its capabilities are synced at `openspec/specs/routed-video-audio/spec.md`, `openspec/specs/alert-audio-routing/spec.md`, and `openspec/specs/alert-playback-operator-controls/spec.md`, and packaged/physical-device/OBS acceptance is recorded in `docs/verification/routed-video-audio.md`.
- The Screen Effects Operator and audio-route deltas retain the inherited routed soundtrack, authoritative mute, occurrence-scoped stop, and route-binding snapshot scenarios.
- The latest baseline migration is `021-alert-video-audio`; Screen Effects will use `022-screen-effects`. The configuration backup archive envelope remains version 2.

## Existing adapter map

| Boundary | Existing owner and reusable contract | Screen Effects extension |
| --- | --- | --- |
| Event validation and ingress dedupe | `EventIngestionService` validates `NormalizedStreamEvent`, rejects malformed input, and deduplicates transport message IDs before calling one `EventSink`. | Add a trusted effect-trigger facet/fan-out without weakening ingress validation; effect admission keeps a separate module-scoped dedupe namespace. |
| Alert event processing | `EventPipeline` logs one received event and delegates to `PlaybackCoordinator.enqueueEvent`. | Fan accepted events to independent Alert and Screen Effects sinks, preserving independent failure results and one receipt log. |
| Provider ownership | Provider registration/activation and `StreamerBotRuntimeService` retain one active event provider. `ExternalStreamEvent` and `StreamerBotSubscriptionSelection` already define the custom-event boundary. | Add explicit Streamer.bot subscription configuration and trusted source/type adaptation; effect editing must never switch providers or subscribe implicitly. |
| Asset inventory and deletion | `AssetLibraryService` derives Alert usage and stages recoverable file deletion around repository mutation. SQLite foreign keys provide the final reference guard. | Include module-qualified effect/variant owners and perform effect reference checks in the same DB transaction as deletion. |
| Named audio routes | `AudioOutputService` snapshots explicit bindings at occurrence start. `SqliteAudioOutputRouteRepository` owns transactional Alert reference checks and deletion. | Extend reference results and restrictive checks to effect variants while preserving compatible Alert fields. |
| Module registration and composition | `createDefaultOverlayModuleRegistry`, `DefaultOverlayModuleConfigService`, and `DefaultOverlayCompositionService` own registered modules, per-module sources, unified composition, and surface order. | Register `screen-effects`; reconciliation will add it hidden at the bottom without changing existing Alerts visibility/order. |
| Shared visual/audio delivery | `PlaybackCoordinator` already prepares Browser Source, desktop visual, and device-audio obligations with timing, mute, stop, and failure bounds. | Reuse its recipient contracts through an effect-owned coordinator/adapter; do not fabricate Alerts or fork media-audio/surface transports. |
| Alert queue | `DefaultPlaybackQueue` owns Alert priority/FIFO order, current/pending/recent state, and global safety flags. | Add an independent bounded effect queue; do not merge schedulers or persist runtime occurrences. |
| Operator API and UI | Protected playback routes expose the Alert coordinator, and `/operator` uses `apps/web/src/operator/playback-api.ts` separately from management editing. | Introduce a queue-owner projection and module-qualified commands, then retain the legacy Alert-shaped adapter during migration. |
| Runtime and maintenance | `runtime-composition.ts` constructs the single Alert queue/coordinator and currently reports only its queue to maintenance and module snapshots. | Compose the effect owner, aggregate both queues for maintenance and operations, and restore safety before either accepts new work. |

## Security and scope invariants

The implementation retains management-session authorization, CSRF/origin checks and mutation rate limits; overlay credentials cannot authorize Operator or management calls. Provider payload text cannot select local media, routes, URLs, or commands. `/operator` remains separate from authoring, and no second simultaneous provider, marketplace, remote upload/fetch, arbitrary code, graphics injection, cloud delivery, or cross-platform desktop promise is introduced.

## Core document checkpoint

Task 2.1 is complete. The red run of `corepack.cmd pnpm exec vitest run packages/core/src/screen-effects` failed because the new schema/resolver modules did not exist. After the minimal implementation, the focused suite passed 24 tests across two files. It covers disabled 10-second/priority-0 construction, invalid empty saved content, audio-only effects, independent video soundtrack and explicit sound controls, duration/weight/cooldown/layout/animation bounds, safe IDs, strict unknown-field rejection, duplicate variants/bindings, deterministic weighted boundaries, disabled-weighted fallback, and deep snapshot isolation.

`corepack.cmd pnpm typecheck` passed after the implementation. Focused ESLint initially rejected a control-character regular expression under `no-control-regex`; the validator was replaced with the equivalent character-code predicate, after which focused ESLint and all 24 tests passed.

Task 2.2 is complete. The core now provides bounded immutable edit history, Undo/Redo/Revert, explicit validated save settlement, safe variant copying and whole-effect duplication with caller-supplied stable IDs. Copies never share nested media/output state and duplicated effects remain disabled. A narrow 1920×1080 contain-fit helper centers effects on landscape, wider, taller and portrait outputs without stretching; it is the shared calculation for later browser and desktop delivery, not a general composition engine. The complete core Screen Effects suite passed 34 tests across four files, with focused lint and workspace typecheck passing.

## Persistence checkpoint

Task 2.3 is complete. Migration `022-screen-effects` adds effect metadata, ordered validated variant and binding rows, restrictive asset and audio-route references, durable module settings, and supporting indexes. `SqliteEffectRepository` validates the full document before replacing its children inside one nested-safe transaction, checks referenced media types and routes, and reconstructs every read through the core schemas.

The focused repository red run failed on the absent repository. The green repository cases passed restart round-trip, exact list/find behavior, route deletion protection, removal, and a forced binding-insert failure that left the original metadata, variant, binding, and route rows unchanged. The initial database regression then identified two test-fixture assumptions introduced by schema 22: its expected table/migration lists were stale, and its schema-17 recovery fixture left migration 22 applied. After updating those expectations and dropping all schema-22 tables in dependency order, the combined database/repository suite passed 23 tests. Focused ESLint and workspace typecheck passed.

## Shared reference-safety checkpoint

Task 2.4 is complete. Asset and named-route impact checks now report module-qualified Alert and Screen Effect owners while retaining the legacy Alert reference shape for existing clients. The management HTTP client validates the new owner envelope, and Audio settings identifies each blocking module instead of presenting effect references as Alerts. Runtime asset management receives the effect repository, and persisted asset deletion executes inside one synchronous SQLite transaction; restrictive foreign keys serialize both save-first and delete-first races.

The initial focused runs failed because the web client discarded `owners` and runtime composition omitted the effect repository. The race test was tightened after its first version accidentally accepted a missing-method `TypeError`; it now asserts the specific missing-reference and foreign-key failures. The final focused set passed 53 tests across repositories, services, HTTP and UI, the live-composition owner regression passed independently, and repository lint plus workspace typecheck passed.

## Portable backup checkpoint

Task 2.5 is complete. The existing archive version remains 2 and its explicit SQLite allowlist now includes effect metadata, variants, bindings, route references and module playback settings. Portable snapshots force every effect disabled, clear local audio device IDs through the existing route projection and clear desktop display bindings through the existing surface projection. Restore retains stable effect/variant/route identities for review while leaving physical bindings unresolved; rollback points still retain the exact pre-restore local state. Runtime queues, recent history, connected clients, sessions and credentials remain outside the configuration allowlist.

Schema-22 preflight requires the complete Screen Effects table set, validates row/document consistency and references, and rejects enabled portable effects. Supported schema 19, 20 and 21 archives may omit the new tables and restore an empty effect inventory with default module settings. The combined current/legacy snapshot and backup-service suites passed 53 tests; focused backup lint, workspace typecheck and strict OpenSpec validation passed.
