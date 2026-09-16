# Screen Effects implementation and verification

## Status

Implementation and automated acceptance completed on `codex/add-screen-effects-module` and merged to `main` as `f6faf7a` in PR #102. Authorized physical acceptance completed on 2026-09-14 with neutral local media and the isolated acceptance profile described below. All implementation and OpenSpec acceptance gates are complete, the four delta specs are synchronized, and the change is archived at `openspec/changes/archive/2026-09-15-add-screen-effects-module`.

## Foundation gate

Both required foundations are present on the implementation baseline:

- `add-shared-desktop-overlay-surface` is archived with every task checked, its capability is synced at `openspec/specs/shared-overlay-surfaces/spec.md`, and packaged Windows/OBS acceptance is recorded in `docs/verification/shared-desktop-overlay.md`.
- `add-routed-video-audio-controls` is archived with every task checked, its capabilities are synced at `openspec/specs/routed-video-audio/spec.md`, `openspec/specs/alert-audio-routing/spec.md`, and `openspec/specs/alert-playback-operator-controls/spec.md`, and packaged/physical-device/OBS acceptance is recorded in `docs/verification/routed-video-audio.md`.
- The Screen Effects Operator and audio-route deltas retain the inherited routed soundtrack, authoritative mute, occurrence-scoped stop, and route-binding snapshot scenarios.
- The prior baseline migration was `021-alert-video-audio`; Screen Effects uses `022-screen-effects`. The configuration backup archive envelope remains version 2.

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

## Event admission checkpoint

Task 3.1 is complete. The trusted trigger facet admits only normalized Twitch broadcaster/reward identities or exact Streamer.bot provider/source/type selections. Direct Twitch events require the normalized broadcaster ID; Streamer.bot reward events require the explicitly verified configured Twitch broadcaster and never derive it from actor or title fields. Renamed rewards continue to match by stable ID, missing/replaced rewards do not match, unsubscribed custom events are ignored, and one subscribed envelope may intentionally yield both reward and custom facets without changing the single active provider.

Streamer.bot subscription edits are protected management operations with exact advertised source/type validation, explicit live-impact confirmation in the management UI, and live/persistence rollback. Vanished selections remain visible as unresolved configuration instead of being silently replaced. Trigger summaries use a small allowlist, strip controls and cap length; provider payload paths, URLs, route IDs, asset IDs and commands cannot enter the trusted trigger shape or select playback resources.

The initial focused runs failed on the absent matcher, adapter, event fan-out, runtime subscription controls and protected route. The completed focused set passed 169 tests across 13 files, including direct and Streamer.bot normalization, exact matching, malformed/custom-only ingress, independent Alert failure handling, provider selection rollback, route authorization and management authoring. Workspace lint and typecheck passed, the focused Playwright subscription workflow passed, and the production Storybook build passed. The full Storybook interaction run initially exposed a stale `AudioOutputsPanel` deletion-conflict assertion that could not match text split across list-item nodes. The assertion now scopes to the affected list item and verifies its text content; the rerun passed all 211 Storybook interaction tests.

## Bounded admission checkpoint

Task 3.2 is complete. Screen Effects now reserves upstream event IDs synchronously in its own bounded dedupe namespace before repository work, while Alerts retain their independent namespace. Enabled matching definitions are deduplicated by effect ID and evaluated by priority descending then stable effect ID. A module cooldown is checked once per event batch so intentionally co-bound effects can be admitted together; per-effect and module cooldown ledgers are committed only after at least one corresponding queue insertion succeeds.

The effect queue accepts at most 100 pending occurrences and returns a local full result without evicting current or pending work. Capacity and cooldown checks happen before weighted selection, and variants without a selected output are rejected without consuming cooldown. Each successful admission clones the selected variant, media switches, volumes, route IDs, duration, priority and sanitized trigger summary. Explicit test and recent replay use separate entry points; replay reuses the retained snapshot under a new occurrence ID, reruns reference validation and never invokes weighted selection.

The queue regression was first red because the owner did not exist, and the module-settings regression was red on its absent repository. The completed focused queue/admission/runtime set passed 40 tests across seven files; the narrower queue/replay set passed 18 tests. Workspace lint and typecheck passed. Runtime composition now restores the durable module pause setting, reads the durable module cooldown, uses the shared namespaced dedupe/cooldown primitives and logs only effect IDs plus bounded rejection reasons.

## Independent playback and shared-output checkpoint

Tasks 3.3 and 3.4 are complete. `DefaultEffectQueue` owns one current occurrence, deterministic priority/FIFO pending work and a 25-item recent history without persisting runtime items. Global and module safety prevent advancement without dropping intake. Admission snapshots the selected variant, media switches, volumes, route IDs, duration and priority once; replay creates a new occurrence from that retained snapshot, does not reroll, revalidates assets/routes and fails closed when history or references are unavailable.

Tasks 4.1 through 4.5 are complete. Screen Effects is registered disabled and reconciles into every existing shared surface hidden at the bottom. Its coordinator maps immutable snapshots to the existing browser, desktop-visual and named-device adapters using one timing envelope. Visual surface membership and explicit Browser Source audio remain separate, so hiding or reordering a visual layer does not restart or mute its audio. Existing setup guidance still warns that module-specific plus unified browser sources can duplicate browser audio and that OBS Desktop Audio or monitoring may recapture an explicitly selected device.

Transport ownership is now module-qualified for both Alerts and Screen Effects while legacy Alert API item IDs remain unchanged. Skipping an effect can stop only that effect's browser instructions, desktop batch and named-device batch; an Alert with the same local item ID is unaffected. Missing recipients, preparation cancellation, browser disconnect/failure, stale completions and duration-plus-five-second expiry settle the affected obligation without advancing twice. Shared desktop/audio sink tests retain bounded generation invalidation, monitor/device loss and host-failure behavior, while other recipient classes continue independently.

The completed delivery checkpoint passed 241 focused tests across 22 files, including both coordinators, queues, module registration/composition, overlay gateway, shared desktop/audio sinks and runtime composition. Workspace lint, typecheck and `git diff --check` passed.

## Merged authoritative operations checkpoint

Tasks 5.1 through 5.4 are complete. Alerts and Screen Effects expose narrow queue-owner adapters to one read-only merged projection. Rows carry both module and occurrence identity, their actual owner queue position, sanitized summaries and normalized timestamps. Display ordering uses enqueue chronology plus stable module, sequence and occurrence tie-breakers without feeding the independently owned schedulers. The Alerts projection accepts its existing queue length rather than imposing the Screen Effects 100-pending limit on another module.

Global pause, mute and DND now pass through one persistence-first operations service. A failed configuration write leaves runtime state untouched, while a post-write output-application or reporting failure cannot misrepresent a durable state change as rejected. Alerts and Screen Effects pauses persist separately; clearing global pause leaves either module pause in force. Restore reapplies both module pauses and the durable global state before ingress becomes available.

Protected management routes now qualify skip, pending removal, recent replay, pending clear and module pause by module plus occurrence identity. Stale current/recent/pending state returns a conflict with a fresh authoritative snapshot, and clear requires both the observed revision and exact pending count. The original Alerts-shaped endpoints remain as compatibility adapters over the same service, so they cannot bypass centralized safety writes.

The separate `/operator` UI displays simultaneous current rows, merged pending/recent rows, module labels and real module queue positions. It offers only operational actions: module-qualified skip/remove/replay, per-module pause/clear and global safety. Clear confirmation names the module and pending impact, stale responses replace local state, focus and status announcements remain accessible, polling remains visibility-aware, and authoring stays in management.

The focused operations, route, runtime and Operator regressions passed 119 tests across 12 files. The expanded affected regression passed 317 tests across 35 files, and the final focused rerun passed 316 tests across 36 files after lint identified and removed two unused fixture parameters. Workspace lint, typecheck, production Storybook build, three focused Playwright workflows and all 211 Storybook interaction tests passed. `git diff --check` passed.

## Management authoring checkpoint

Tasks 6.1 and 6.2 are complete. The management shell now exposes Screen Effects as a nested Modules route and a focused editor route. The inventory supports disabled draft creation, editing, copying, explicit enable/disable and deletion confirmation, trigger-setup navigation, and module enablement controls. Its Browser Source panel can create, reveal, copy and explicitly regenerate the module-scoped URL/key while preserving redaction by default. It does not add a standalone shared-audio page or expose an overlay route key without an explicit user action.

The focused editor keeps new work local until an explicit valid save and transitions a created draft to update semantics after that first save. It provides immutable Undo/Redo, retained drafts after failed saves, bounded variants, the shared asset picker and video soundtrack controls, separate sound, independent browser/desktop visual destinations, explicit browser/device audio destinations, preset animation/layout controls, and trusted Twitch reward or configured Streamer.bot binding choices. Unresolved saved bindings and routes remain visible instead of being silently changed.

Silent Preview renders only the selected local visual. Live Test is available only for a saved, enabled, clean definition, names every affected destination, refuses an empty destination set, requires explicit confirmation, and queues the exact saved enabled variant without rerunning weighted selection. Runtime composition starts an idle effect queue after a successful test admission, and definition mutations now share the configuration maintenance/transaction boundary. Protected request parsing rejects unknown command-like fields.

The focused management/API regression passed 66 tests across eight files. Workspace typecheck and focused ESLint passed. Production stories cover inventory, empty/loading/error states, new disabled authoring, audio-only and video-plus-sound configurations, weighted variants, missing triggers, no outputs, retained failed saves, and neutral live-test confirmation. Their interaction results are recorded in the final Storybook gate below rather than claimed at this checkpoint.

## UI and packaged recovery checkpoint

Tasks 6.3 and 6.4 are complete. The full production Storybook interaction gate passed 223 tests in 22 suites. This includes the new neutral Screen Effects inventory loading/empty/error states and focused authoring states, plus the existing Operator stories for simultaneous Alert/effect current items, interleaved real queue positions, empty/error/stale views, module pauses, stale scoped commands and keyboard focus.

The Screen Effects browser workflow covers local disabled creation, valid media selection, first save, reload, copy with new stable IDs, explicit enable confirmation, silent Preview, exact-variant Live Test confirmation and destination naming. A second workflow proves no-output Test refusal and failed enabled-save draft retention. The multi-module Operator workflow covers concurrent current rows, effect-scoped skip/pause/clear and exact retained effect replay. The surface workflow now uses the registered `screen-effects` layer rather than a placeholder and preserves explicit order/visibility after reload. The typed restore workflow shows a restored effect disabled after confirmation. These focused Playwright runs passed three authoring/Operator cases and two surface/restore cases; production event-to-queue, snapshot, concurrency and restart semantics remain backed by the previously recorded server/runtime integration suites rather than browser-only fixture behavior.

`corepack.cmd pnpm desktop:package` built the current workspace successfully. The new isolated packaged desktop workflow used a temporary config, database, asset directory and Electron profile; it enumerated a real desktop display, enabled the Screen Effects surface, uploaded the checked-in neutral trackless video, created/enabled/tested the effect, observed video progress in the private `stream-jams-overlay://surface/` renderer, and shut down. Relaunching the same isolated profile retained the enabled definition while Operator reported zero current, pending and recent occurrences. The focused desktop test passed and removed its owned temporary profile after native exit. Because display enumeration and physical composition are host-dependent, this workflow now runs only in `test:desktop:hardware` when `STREAM_JAMS_SCREEN_EFFECTS_TEST=1`; ordinary CI excludes it. This is automated renderer evidence, not human confirmation of physical display composition, OBS capture, click-through behavior or audible routing.

## Independent review remediation

The completed implementation received an independent code review before final verification. The resulting runtime and management hardening was implemented with red/green regression coverage:

- Module enablement is now an authoritative kill switch. Admission rejects disabled-module work before dedupe/cooldown consumption, playback rechecks the setting before dispatch, and disabling the module stops the current effect and clears its pending queue. The management page exposes the guarded enable/disable control.
- Streamer.bot custom-event identity trusts only the transport envelope ID. Envelopes without one receive a deterministic SHA-256 identity derived from canonical transport source/type/timestamp/data fields; provider payload `id`, `eventId` and `messageId` values cannot choose the dedupe key.
- Saved asset and route references, exact media types (including GIF versus image), and actual selected-recipient readiness are checked at admission and again immediately before dispatch. An unavailable destination fails closed without invoking that transport, while another healthy selected destination may continue independently.
- Explicit Live Test uses the real live Browser Source recipient, and Screen Effects browser delivery is limited to the module-specific and unified sources that can actually render it. The management Browser Source controls no longer redirect users to the Alerts module.

The new focused tests were first run red with eight expected failures covering those review findings. After the fixes, the focused backend set passed 33 tests, the focused web set passed six tests, and the expanded Screen Effects/runtime set passed 74 tests. The first post-fix Storybook interaction run found one stale story assertion after the no-destination copy was clarified; the assertion was updated without weakening behavior, and the complete rerun passed 223 interactions in 22 suites.

## Final automated acceptance

The final repository gates passed on 2026-09-13:

- `corepack.cmd pnpm lint`
- `corepack.cmd pnpm typecheck`
- `corepack.cmd pnpm test`: 231 files and 1,978 Vitest tests, plus four native-exit/audio-fixture Node tests
- `corepack.cmd pnpm build`
- `corepack.cmd pnpm build-storybook`
- `corepack.cmd pnpm test:storybook:ci`: 223 interactions in 22 suites
- `corepack.cmd pnpm test:e2e`: 37 browser workflows
- `corepack.cmd pnpm test:desktop`: 24 packaged-desktop tests
- `corepack.cmd pnpm test:desktop:hardware`: two physical-output tests discovered and explicitly skipped without their approval environment gates

The first full browser run encountered `net::ERR_NO_BUFFER_SPACE` before one pre-existing Alert editor navigation. Its focused rerun passed, and the complete 37-test browser suite then passed unchanged; this was classified as transient Windows socket exhaustion rather than a product regression. A stale module-registry unit expectation initially listed Alerts as the only registered module; it was corrected to assert both registered modules, its focused regression passed, and the full unit gate then passed.

Canonical specs now include Screen Effects, multi-module playback operations, and the Screen Effects extensions to named audio routes and Operator controls. The product plan and runbook describe the delivered behavior, and the implemented BL-047 row has been removed from the deferred backlog. Marketplace, cross-platform/cloud delivery, exclusive-full-screen injection and unrelated overlay modules remain deferred.

## Follow-up parallel-review remediation

Six findings left open after the parallel review and its prerequisite merge were repaired on 2026-09-14 with focused red/green regressions:

- Screen Effect admission now serializes the cooldown check-through-commit path across distinct concurrent events. One event batch can still intentionally admit all of its matching effects, while a second event cannot pass the same effect or module cooldown during asynchronous reference/output validation.
- Browser output readiness now evaluates visual and audio obligations separately. A connected unified source satisfies Screen Effects visual readiness only when its Screen Effects layer is visible, while explicitly selected Browser Source audio remains eligible when that visual layer is hidden.
- Effect definition create/update/delete operations now serialize their complete asynchronous conflict-check and persistence work and participate in the runtime maintenance drain. The previous synchronous SQLite transaction wrapper no longer commits before asynchronous repository work settles.
- Module-qualified Operator conflicts retain and validate the server's authoritative snapshot. The Operator applies that snapshot immediately before presenting the safe conflict message, so a stale command cannot leave a known-obsolete current or pending row on screen.
- Alert queue snapshots now expose their immutable enqueue sequence. The merged owner projection uses that value rather than deriving a sequence from the priority-sorted array position.
- The Screen Effect editor retains every successfully loaded context source, names failed asset/audio/Twitch/Streamer.bot sources inline, and offers a keyboard-operable retry. Production Storybook includes the partial-context failure state.

The focused affected set passed 128 tests across 13 files. Workspace lint, typecheck, the production build, and the production Storybook build passed. The full unit gate passed 232 Vitest files and 1,998 tests plus four native Node tests. The first Storybook interaction run passed 21 suites and 221 interactions but its last unrelated suite could not connect to Chromium over an ephemeral IPv6 loopback WebSocket; an unchanged full retry passed all 22 suites and 225 interactions, classifying the first result as a temporary browser-launch environment failure. All 37 Playwright browser workflows passed against the rebuilt local runtime.

These repairs added no physical-output evidence at review time. The subsequently completed human acceptance is recorded below.

## Human physical acceptance

Use the packaged app and neutral local media; do not use a live provider account or a secret production Browser Source URL in evidence. Before starting, explicitly approve the two exact physical audio-output labels if audible routing will be tested.

1. Create and enable one neutral Screen Effect with OBS visual, desktop visual, Browser Source audio and the approved named-device routes selected. Confirm that merely selecting or saving remains silent.
2. Add the Screen Effects module Browser Source to OBS and bind the desktop surface to the intended physical monitor. Trigger **Live Test**, then confirm the same occurrence appears in Operator while OBS and the desktop show the effect in their configured layer order without stretching. The gated `STREAM_JAMS_SCREEN_EFFECTS_TEST=1` packaged workflow may support the desktop portion of this observation.
3. Confirm the approved audio routes independently. Check that an unselected device stays silent and that OBS Desktop Audio/monitoring does not accidentally recapture a route intended to be private. The separate `corepack pnpm test:desktop:hardware` tone suite may support this observation only after its environment gate is intentionally enabled.
4. While an Alert is active, trigger and then skip a Screen Effect. Confirm only the effect stops and the Alert's healthy visual/audio playback continues.
5. Make the selected monitor unavailable or temporarily bind a known-unavailable display. Confirm the desktop effect fails closed, does not move to another display and does not replay when the display returns; independently confirm healthy OBS/audio recipients continue.
6. Close management to the tray during an effect, reopen it, and confirm playback ownership persists. Then use tray **Quit** and confirm the effect clears, the listener stops and the packaged process exits within the existing bounded shutdown policy.
7. Restart the same profile. Confirm the definition and safety settings persist, hardware bindings are unchanged unless a portable restore was performed, and Operator has no restored current, pending or recent occurrences.

### Recorded result — 2026-09-14

- The freshly packaged Windows app used an isolated configuration, database, asset directory and Electron profile. The selected desktop was **LG ULTRAGEAR** at 2560×1440. The module-specific **Screen Effects Live** source ran in OBS 32.2.2. No Browser Source URL or route key is recorded here.
- The explicitly approved named-device routes were **SFX (Elgato Virtual Audio)** and **System (Elgato Virtual Audio)**. Selecting, editing and saving the neutral effect remained silent. During live playback, the OBS Browser Source, System and SFX meters were active and no unintended output was observed elsewhere.
- The same live occurrence rendered on the LG desktop overlay and in OBS. A static-image control exposed a desktop startup race: the overlay canvas retained the 2560×1392 work area after the transparent window expanded to 2560×1440. `OverlaySurface` now observes its root content box, and its regression proves the canvas updates without relying on a `window.resize` event. The rebuilt package filled the LG from top to bottom with the expected equal horizontal image margins and no visible distortion; the OBS control also filled its source from top to bottom.
- With a neutral Alert and Screen Effect playing concurrently, Operator showed both current items. Skipping the Screen Effect removed only its static image; the Alert remained current and its audio continued. Operator then reported the effect as skipped independently of the Alert.
- Disconnecting the selected LG during the combined 30-second effect produced no desktop fallback on another monitor and no replay after reconnect. The OBS visual and Browser Source audio plus the System and SFX device routes continued for the whole occurrence. Operator correctly recorded the occurrence as failed because the selected desktop recipient became unavailable; that runtime result is distinct from the passing fail-closed acceptance scenario.
- The first monitor-loss attempt also exposed a stalled OBS renderer: its WebSocket still appeared connected, but it returned no playback reports and the occurrence expired at duration plus five seconds. OBS **Refresh cache of current page** established a fresh connection; both a static control and the video-plus-embedded-audio control then rendered and reported successful completion before the corrected monitor-loss run.
- Closing management to the tray during the effect and reopening it preserved playback ownership. Tray **Quit** was observed against the verified packaged executable: main PID 69044 and listener-owner PID 66504 exited, port 39187 was released, and the measured shutdown upper bound was 2,367 ms.
- Restarting the same isolated profile produced a healthy packaged runtime with main PID 7844 and listener-owner PID 72524. Both effect definitions, the enabled LG surface and Screen Effects layer, the ready SFX/System bindings, and the global/module safety settings persisted. Operator restarted with zero current, pending and recent items.

### Post-acceptance publication gates — 2026-09-14

- The focused `OverlaySurface` regression passed 27 tests, including the content-box resize case that reproduces the packaged desktop race.
- Strict OpenSpec validation, workspace lint and workspace typecheck passed.
- The full unit gate passed 232 Vitest files and 1,999 tests plus all four native Node tests.
- The production workspace build and production Storybook build passed with only the existing bundle-size warnings.
- The Storybook interaction gate passed all 22 suites and 225 interactions; Playwright passed all 37 browser workflows.
- The ordinary packaged desktop suite passed all 24 tests. The separate hardware suite discovered its two opt-in cases and skipped them without their approval environment gates; the authorized physical observations above supply the corresponding real-output evidence.
- `git diff --check` passed after the final documentation update.

Task 7.2 is complete. This change is ready for human pull-request approval without a remaining implementation or acceptance gate.
