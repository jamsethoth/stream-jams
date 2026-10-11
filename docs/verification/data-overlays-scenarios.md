# Data overlay scenario trace

Implementation evidence for the four approved slices. Evidence below records focused unit checkpoints; final integrated gates are recorded separately. Planned rows are not verified. Provider and physical acceptance remain separate from automated fixtures.

**Historical checkpoint: October 8, 2026.** The missing-bus blockers and schema 33/34 references below describe the pre-merge candidate. The [October 11 main integration reassessment](data-overlays-main-reassessment.md) supersedes those dependency statuses and records the new migration versions and merged verification. Unimplemented scenarios below remain unverified.

## add-custom-data-overlays

| Capability | Requirement | Scenario | Evidence/status |
| --- | --- | --- | --- |
| configuration-backup-restore | Data overlay backup | Round trip | SQLite backup repository roundtrip and rollback tests; source provenance included |
| configuration-backup-restore | Data overlay restore safety | Invalid reference | Backup preflight rejects missing nested references before mutation; original state retained |
| configuration-backup-restore | Data overlay restore safety | Canvases start disabled | Portable import disables canvases; operational rollback preserves original enabledness |
| data-overlay-canvases | Freeform canvas authoring | Several goals on one canvas | Canvas editor binding/style tests and six Management Chromium stories |
| data-overlay-canvases | Freeform canvas authoring | Incompatible binding | Core strict contracts, authenticated data routes and compatible editor options reject invalid bindings |
| data-overlay-canvases | Keyboard-accessible editing | Move with the keyboard | Shared geometry and editor tests cover pointer/keyboard/numeric bounds and snapping |
| data-overlay-canvases | Canvas bounds | Element limit reached | Core schema and editor tests reject the 101st element using shared limits |
| data-overlay-canvases | Shared formatting | Markup in a text value | Core formatting and production DataOverlayCanvases tests render literal text |
| data-overlay-canvases | Shared formatting | Same goal as text and bar | Core projection tests and disposable browser/private text/bar parity |
| data-overlay-canvases | Isolated preview | Simulate completion | Private preview-store tests and disposable Management preview-isolation workflow |
| data-overlay-canvases | Coherent output projections | Browser source and desktop agree | Disposable service E2E uses actual browser/private bundles; physical Electron/OBS acceptance not performed |
| data-overlay-canvases | Coherent output projections | Reconnect after an update | Gateway/runtime and browser-client revision/epoch tests; disposable unified browser reload |
| data-overlay-canvases | Output scope | Unreferenced value | Production composition test verifies scoped projection and purpose/profile asset authorization |
| data-overlay-canvases | Data updates preserve other media | Update during an alert video | Browser surface/client and private renderer tests retain unrelated media identity across Data updates |
| data-overlay-canvases | Fail-closed bindings | Missing image asset | Core projection hides unavailable images; Management flags missing references; registered canvas image deletion is guarded |
| data-overlay-canvases | Stale value policy | Brief source outage | Core retains through 600000ms; Data output runtime handles status updates and scheduled expiry |
| data-overlay-canvases | Stale value policy | Long source outage | Core/runtime hide at 600001ms and reject invalid/future stale timestamps |
| data-overlay-canvases | Display suppression keeps data | Disable while values change | Service/runtime suppression tests preserve content; disposable Operator visibility workflow |
| data-overlay-operator-controls | Operator value controls | Increment from Operator | Operator tests and disposable service workflow update both bound canvases |
| data-overlay-operator-controls | Operator value controls | Unpinned value | Operator section tests expose commands only for pinned values |
| data-overlay-operator-controls | Confirmed destructive actions | Cancelled reset | Operator tests and disposable service confirmation cancellation leave state unchanged |
| data-overlay-operator-controls | Retained correction input | Set conflicts with a newer change | Operator retained-draft regression and real HTTP409 E2E refresh current revision before retry |
| data-overlay-operator-controls | Operator group reset | Reset the session group | Atomic core/SQLite reset tests and disposable Operator group/baseline reset |
| data-overlay-operator-controls | Operator canvas visibility | Hide a canvas live | Operator visibility tests and disposable module/unified output workflow |
| data-overlay-operator-controls | Accessible compact controls | Small workspace | Operator stories and disposable 540x960 workflow without horizontal scrolling |
| shared-overlay-values | Shared typed values | One value on two canvases | Disposable Operator E2E and SQLite backup roundtrip share one committed value |
| shared-overlay-values | Shared typed values | Integer overflow | Core service/schema tests reject unsafe input/delta/goal target with rollback |
| shared-overlay-values | Shared typed values | Text coerced to a number | Strict discriminated schemas and service tests reject cross-kind writes |
| shared-overlay-values | Shared typed values | Duplicate name | Service and backup tests enforce trim/lowercase uniqueness |
| shared-overlay-values | Values persist without implicit resets | Restart restores the count | SQLite reopen and disposable production service restart preserve content/baselines |
| shared-overlay-values | Values persist without implicit resets | Hidden canvas keeps its value | Service hide/delete tests and runtime suppression preserve shared values |
| shared-overlay-values | Guarded value changes | Stale set | Core CAS and HTTP conflict tests return current value; Operator preserves correction |
| shared-overlay-values | Guarded value changes | Concurrent increments | Repository transaction tests serialize commuting deltas |
| shared-overlay-values | Guarded value changes | Reset to default | Service reset and Operator command tests restore typed saved default |
| shared-overlay-values | Goals over integer values | Saved-baseline progress | Core contracts check baseline950/current970/target1000 |
| shared-overlay-values | Goals over integer values | Value below baseline | Core contracts preserve negative achieved and cap remaining at full amount |
| shared-overlay-values | Goals over integer values | Value over target | Core contracts preserve raw current and clamp fill/remaining |
| shared-overlay-values | Restarting a saved-baseline goal | Restart after completion | Core restart and Operator confirmation tests capture current baseline |
| shared-overlay-values | Reset groups | Reset a session group | Service group reset changes member contents and dependent baselines with one publication |
| shared-overlay-values | Reset groups | Group reset fails | Safe-arithmetic and actual SQLite trigger failures roll back all data/revisions |
| shared-overlay-values | Reference-safe lifecycle | Delete a referenced value | Service/API/editor reference guards and real HTTP409 E2E |
| shared-overlay-values | Reference-safe lifecycle | Delete a canvas | Service and disposable Management workflow retain shared values |

## add-data-overlay-event-rules

| Capability | Requirement | Scenario | Evidence/status |
| --- | --- | --- | --- |
| configuration-backup-restore | Data rule backup | Rules round trip | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| configuration-backup-restore | Data rule backup | Rule references a missing value | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Data overlays consume the central event bus | Crash after commit | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Data overlays consume the central event bus | Crash before commit | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Data overlays consume the central event bus | Long outage | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Data overlays consume the central event bus | New consumer | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Rule actions | Text field into an integer add | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Rule actions | Field multiplier | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Deterministic all-or-nothing evaluation | Second rule overflows | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Rules run independently of display | Counting while hidden | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Payload filters stay in the consumer | Filter on a custom field | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Subscription starters | Gift batch with recipients | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Subscription starters | Resubscription | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Moderated event text | Blocked username | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Reset on stream online | New stream starts | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Operator pause for automatic updates | Pause during testing | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Operator pause for automatic updates | Resume | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| data-overlay-event-rules | Rule editor | Simulate a rule | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| streamerbot-data-sources | Custom data event types | Valid custom event | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| streamerbot-data-sources | Invalid custom payloads are rejected | Unknown field | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| streamerbot-data-sources | Invalid custom payloads are rejected | Oversized text | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| streamerbot-data-sources | Schema changes disable dependent rules | Field removed | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| streamerbot-data-sources | Streamer.bot global-variable values | Variable changes in Streamer.bot | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| streamerbot-data-sources | Streamer.bot global-variable values | Reconnect after missed updates | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| streamerbot-data-sources | Streamer.bot global-variable values | Type mismatch | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |
| streamerbot-data-sources | Provider-backed values are read-only | Pinned in Operator | [blocked] Central event bus implementation; Streamer.bot globals additionally require real sanitized fixtures |

## add-twitch-overlay-data

| Capability | Requirement | Scenario | Evidence/status |
| --- | --- | --- | --- |
| twitch-overlay-data | Authoritative follower total | Followers decrease while disconnected | Twitch source runtime tests and disposable production restart accept authoritative990/980 totals |
| twitch-overlay-data | Authoritative follower total | Follow event | [blocked] Central event bus follow hint wiring; independent10s throttle helper tested |
| twitch-overlay-data | Authoritative follower total | Late response from an old connection | Twitch source runtime connection epoch, maintenance and delayed-response regressions |
| twitch-overlay-data | Rate-limit-aware refresh | Rate limited | API/runtime tests honor rate-reset and retry-after; later provider deadline overrides nominal5min cap |
| twitch-overlay-data | Creator Goals as a list | Progress during the initial load | Pure snapshot-buffer helper tested; [blocked] production bus/subscription integration |
| twitch-overlay-data | Creator Goals as a list | Two active goals | Pure list validation tested; [blocked] live goal list and Management binding flow |
| twitch-overlay-data | Active-goal-of-type binding | Next follower goal | Pure latest-type helper tested; [blocked] production goal bindings and events |
| twitch-overlay-data | Active-goal-of-type binding | No goal of that type | Pure ended/latest-type helper tested; [blocked] production goal bindings and events |
| twitch-overlay-data | Pinned goal binding | Pinned goal ends | Pure pinned/end helper tested; [blocked] persisted production goal bindings |
| twitch-overlay-data | Provider goals keep Twitch units | Sub-point goal | Pure units helper tested; [blocked] live goal Management/Operator integration |
| twitch-overlay-data | Goal scope does not affect alerts | Existing account without goal scope | OAuth/EventSub regressions preserve existing alert readiness; source UI optional-scope story |
| twitch-overlay-data | Broadcaster change invalidates bindings | Account switch | Runtime and backup tests invalidate source provenance, including A→B→A; source UI flags old bindings |

## add-data-overlay-templates

| Capability | Requirement | Scenario | Evidence/status |
| --- | --- | --- | --- |
| configuration-backup-restore | Template backup | Templates round trip | Schema34 backup tests preserve user templates; schema33 legacy absence restores empty; rollback retains exact template state |
| data-overlay-templates | Bundled starters | Start from Goal bar | Core template tests and disposable E2E create all four starters with new or existing compatible data |
| data-overlay-templates | Saved user templates | Save a canvas as a template | Core sanitized-save tests and production API/browser reuse exclude content, baselines and broadcaster IDs |
| data-overlay-templates | Independent copies | Edit the template later | Core independent-copy tests and disposable saved-template replacement workflow |
| data-overlay-templates | Compatible slot mapping | Reuse an existing goal | Core atomic mapping and disposable Goal bar reuse preserve the existing value |
| data-overlay-templates | Compatible slot mapping | Incompatible mapping | Strict schemas/service/HTTP tests reject wrong kinds and leave revision/catalog unchanged |
| data-overlay-templates | Provider slots need a source | No Twitch connection | Configured follower-kind slots tested in core, production API and UI stories; native Twitch goal-kind slots remain [blocked] by the central bus/source integration |
| data-overlay-templates | Missing assets | Asset deleted | Disposable image-metadata removal creates hidden identifiable placeholder; editor replacement and backup tests pass |
| data-overlay-templates | Flattened group insertion | Insert a badge group | Core insertion and disposable dirty-editor workflow add ordinary independent elements with fresh IDs |

## Baseline and acceptance limits

- Base: origin/main 55d29f2b; locked dependencies installed successfully.
- Focused pre-change tests: timer event rules 2/2 and management route 21/21 passed with one worker.
- Broad pre-change unit run stopped on missing core build artifacts. After building core, the same Management API collection passed32/32. Final integrated full-suite status is recorded below.
- Central event bus implementation is absent. Bus-dependent scenario evidence remains blocked pending that prerequisite; a proposal is not a runtime contract implementation.
- No real Twitch account, Streamer.bot globals or physical OBS/desktop acceptance has been performed.

## Evidence index

- Core schema, arithmetic, formatting and projection: `packages/core/src/data-overlays/contracts.test.ts`.
- Durable commands, references and rollback: `apps/server/src/modules/data-overlays/sqlite-data-overlay-repository.test.ts` and `apps/server/src/http/routes/data-overlays.test.ts`.
- Backup: `apps/server/src/modules/backup/sqlite-configuration-snapshot-repository.test.ts` and `configuration-backup-service.test.ts`.
- Runtime privacy, expiry and publication: `apps/server/src/modules/data-overlays/data-overlay-output-runtime.test.ts`, `apps/server/src/runtime/runtime-composition.test.ts`, overlay gateway/route and private asset resolver tests.
- Management geometry, drafts and preview: adjacent tests in `apps/web/src/management/data-overlays/`; production renderer tests in `apps/web/src/overlay/components/`.
- Operator commands and browser/private freshness: `OperatorDataSection.test.tsx`, `overlay-client.test.ts`, `DesktopOverlayApp.test.tsx`, `desktop-overlay-controller.test.ts`.
- Real disposable service/browser workflows: `tests/e2e/data-overlays.spec.ts`. Final rebuilt combined run passed all five Data/template/Twitch workflows after review (20.0 seconds), including the final preview-fit correction.
- Twitch validation, source lifecycle and future goal helpers: `apps/server/src/modules/twitch/twitch-data-api-client.test.ts`, `twitch-data-source-runtime.test.ts`, `twitch-goal-snapshot.test.ts`, OAuth tests and production composition regression.

## Final integrated gates

- Full repository lint and error provenance: pass after correcting one template preview catch boundary.
- Strict workspace typecheck: pass after correcting the base private-renderer E2E request's module ID.
- Full workspace build: pass, including desktop packages/private renderer and unchanged gzip route budgets (bootstrap72.43/100, overlay138.56/150, Operator179.64/190, Management244.01/250 KiB).
- Combined rebuilt disposable Chromium workflows: 5/5 pass (20.0s), with real isolated server/SQLite/auth, health checks and restart. No normal profile or real provider account used.
- Final static Storybook build and full interaction/accessibility/console gate: 425/425 scenarios across 50 files pass (269.1s).
- Full unit/script suite: 3,422 tests across 381 files pass, followed by 120 script tests. One independent review completed; its single P2 finding is fixed and reproduced below.
- Strict validation: all four Data changes and all 52 canonical capabilities pass, including template and partial Twitch source synchronization.

The final template preview-fit correction passed its focused regression, affected rebuild and two template workflows; the reviewed full rebuild and five-workflow run include it. Canonical template provider examples use the implemented follower-total source. Native Creator Goal slots and stream events remain pending with their source dependency.

## Independent review and failure diagnosis

One independent GPT-6.1-sol review at low effort covered base `55d29f2b` through `1023bb4d`. It found one P2 desktop image-owner race: a delayed clear acknowledgement could revoke the owner installed by a newer visible frame. Commit `56c0252b` captures the prior owner and rechecks request/generation/ownership after the await. The deferred-clear regression passes with the affected sink/output suite (15 tests). The parent reran the reviewer's isolated built-code reproduction and observed only `owner-1` released while active `owner-2` remained retained. No second review was performed.

The first full unit run recorded 3,416 passes and four failures. All four were exact fixture expectations: two module inventories omitted the newly registered Data module, the OAuth start scope list omitted optional goals, and an old-schema Screen Effects migration fixture retained migrations 033/034. Commit `5dfecc64` updates those expectations and rewinds all corresponding tables/history; 42 affected tests pass. Production code and the required OAuth scope list were unchanged by those fixture repairs. The complete rerun after these corrections and the desktop race fix passes 3,422 tests and 120 script tests.

The first full Storybook run recorded 422 passes and three timeouts in unchanged Alerts/Music stories. Those three files pass unchanged in isolation (37 scenarios). A later broad run was interrupted by a concurrent build regenerating `dist-desktop-overlay/desktop-overlay.html`; the Vite server logged page reloads, and the runner lost `globalThis.__getContext`. Final verification used a completed static Storybook artifact, avoiding watched-build reloads; all 425 scenarios passed. No timeout or accessibility/console gate was weakened.
