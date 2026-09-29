## 1. Core Timer Contracts And Pure Behavior

- [x] 1.1 Add failing core tests for timer definition validation, runtime-state schemas, command results, duration formatting, generation identity, and normalized timer overlay payloads.
- [x] 1.2 Implement exported core timer types/schemas and register a schema-backed `timers` overlay module definition without adding a dependency.
- [x] 1.3 Add failing pure projection tests for completed/running/paused ordering, stable tie-breaks, vertical/horizontal equal slots, configured visible capacity, ellipsized-label metadata, and `+N more` counts.
- [x] 1.4 Implement pure timer ordering and per-profile stack projection with bounded region/orientation/capacity validation.

## 2. Durable Definitions And Module Configuration

- [x] 2.1 Add the next additive SQLite migration for timer definitions and timer automation verifier metadata, including foreign-key/index/check constraints and migration-from-prior-schema coverage.
- [x] 2.2 Add repository contract tests and implement a typed SQLite timer-definition repository that round-trips stable IDs, assets, outputs, timestamps, and explicit transactions.
- [x] 2.3 Extend module config defaults and persistence tests for Landscape and Vertical timer stack regions, orientation, and visible capacity, including rejection of unknown/out-of-bounds fields.
- [x] 2.4 Add a timer management service with atomic asset/media compatibility and named-route validation, active-delete rejection, definition snapshotting, and positive/negative/failure tests.

## 3. Server-Authoritative Timer Runtime

- [x] 3.1 Add fake-clock/fake-scheduler tests for independent concurrent definitions and the full idle/running/paused/completed lifecycle, including idempotent commands and explicit restart.
- [x] 3.2 Implement `TimerRuntimeCoordinator` with injected clock/scheduler, immutable admitted definition snapshots, generation guards, bounded long-delay scheduling, and three-second completion hold.
- [x] 3.3 Test and implement runtime subscription/snapshot APIs so management, Operator, late browser clients, and desktop recipients observe the same state without per-second server broadcasts.
- [x] 3.4 Prove shutdown cancels coordinator timers/cue work and a fresh runtime restores definitions but no running, paused, or completed generations.

## 4. Cue Admission And Explicit Audio Routing

- [x] 4.1 Add failing tests for start/restart/end cue admission, no cue on pause/resume/stop/idempotent start, physical-route deduplication, and independent recipient failures.
- [x] 4.2 Integrate timer cues with normalized Browser Source and named-device audio routing before visual-profile expansion, preserving generation-scoped cancellation and existing mute/unavailable-device behavior.
- [x] 4.3 Extend audio-route usage/impact transactions and tests so timer references block deletion, rebind safely, and keep active-run binding snapshots while future runs use saved changes.

## 5. Management And Automation HTTP Boundaries

- [x] 5.1 Add protected management CRUD/config/control routes for timer definitions, stack settings, runtime state, and credential lifecycle with session, CSRF, origin, rate-limit, and structured-error tests.
- [x] 5.2 Add credential-service tests and implement create/rotate/revoke with one active protected verifier, raw bearer returned only on create/rotate, constant-time verification, and complete redaction.
- [x] 5.3 Add automation route tests for loopback-only bearer access, browser-Origin rejection, management/overlay credential separation, dedicated rate limits, allowlisted discovery responses, and malformed/unknown requests.
- [x] 5.4 Implement `GET /automation/timers` and POST start/pause/resume/stop/restart endpoints with exact approved paths, retry-safe `changed` responses, and rejection of authoring/duration override fields.

## 6. Overlay Composition And Rendering

- [x] 6.1 Extend composition/WebSocket tests and runtime wiring so the registered Timers module contributes current normalized snapshots to module-specific and unified outputs and respects module/surface visual visibility independently of timer/audio state.
- [x] 6.2 Add browser overlay component tests for absolute-deadline countdowns, frozen paused values, three-second zero hold, late join, missing icon fallback, label truncation, equal boxes, both orientations, and overflow badge.
- [x] 6.3 Implement timer rendering in the shared browser overlay using client-local display ticks derived from authoritative snapshots, with complete timer/listener cleanup and production-transparent failures.
- [x] 6.4 Extend desktop visual transport/controller/renderer tests and implementation so desktop output validates and renders the same timer payload, ordering, layout, and remaining time without management credentials.

## 7. Timers Management Experience

- [x] 7.1 Add typed web API client tests for timer inventory, CRUD, module presentation, state-aware controls, and credential create/rotate/revoke responses without persisting raw bearer material.
- [x] 7.2 Build the Timers page using established management patterns for list/create/edit/delete, asset pickers, explicit audio outputs, state-aware controls, and active-snapshot editing disclosure.
- [x] 7.3 Add the draggable/resizable per-profile stack editor and exact preview for orientation, capacity, equal sizing, truncation, ordering, overflow badge, and legibility warnings.
- [x] 7.4 Add focused Testing Library coverage for loading, empty, validation, save success/failure, missing assets, active-delete conflict, keyboard controls, stable focus, and semantic announcements.
- [x] 7.5 Add production-component Storybook stories with tiny checked-in assets for idle inventory, running, paused, completed, horizontal/vertical layouts, overflow, long labels, missing icon, loading, and error states; pass accessibility and interaction checks.
- [x] 7.6 Present explicit Timers module enabled/disabled status and a confirmed module action independently from overlay-layout saving.

## 8. Operator Active-Timer Controls

- [x] 8.1 Extend the Operator typed snapshot/client contract with a separate active-timers section and timer-specific pause/resume, stop, and restart commands rather than queue-owner operations.
- [x] 8.2 Implement running/completed timers first and paused timers second using authoritative urgency order, with idle definitions omitted and accessible module-qualified actions.
- [x] 8.3 Add Operator tests and stories for concurrent timers, paused ordering, completed hold, command conflicts/failures, refresh/reconnect, stable focus, and live-region announcements.

## 9. Asset Usage And Portable Configuration

- [x] 9.1 Extend asset usage discovery/filter/navigation and impact tests for timer icon, start-cue, and end-cue references with compatible replacement and guarded deletion.
- [x] 9.2 Extend versioned configuration snapshot/export/preflight/restore schemas and schema-drift checks for timer definitions, profile presentation, route IDs, and referenced assets.
- [x] 9.3 Add backup tests proving active runs and automation credential/verifier material are excluded, restored timers start idle, automation requires a new credential, invalid references block preflight, and rollback restores prior destination credential state.

## 10. Integrated Browser And Desktop Acceptance

- [x] 10.1 Add Playwright management coverage that creates a timer, selects icon/cues/routes, configures both profile regions/orientations/capacities, saves, reloads, edits, and exercises every manual command.
- [x] 10.2 Add Playwright overlay coverage for concurrent sorting, paused-below-running order, late connection, equal dynamic sizing, ellipsis, `+N more`, module/unified visibility, natural completion, and reconnect continuity.
- [x] 10.3 Add an end-to-end HTTP scenario that creates/rotates/revokes a timer bearer and invokes every command as a generic Stream Deck-style loopback client without exposing the token in output artifacts.
- [ ] 10.4 Extend packaged desktop tests for simultaneous browser/desktop countdown agreement, management hidden, explicit cue destinations, mute, missing output, renderer recovery, and bounded Quit.
- [ ] 10.5 Rebuild and restart the affected local service/desktop package, wait for health, reload management and overlays, and manually verify one real generic Stream Deck HTTP button for start plus pause/resume/stop/restart actions.

## 11. Documentation And Release Gates

- [x] 11.1 Update current product/runbook/API documentation for the implemented Timers module, Stream Deck HTTP setup, token rotation/revocation, Browser Source/device-audio duplication guidance, and explicit non-goals without exposing a real credential.
- [x] 11.2 Record exact automated and live verification evidence, including test counts, target profiles, timer IDs, output routes, packaged artifact identity, manual limitations, and any environment-only failures.
- [x] 11.3 Run focused timer/core/server/web suites, then `corepack.cmd pnpm lint`, `corepack.cmd pnpm typecheck`, `corepack.cmd pnpm test`, `corepack.cmd pnpm build`, Storybook build/CI, browser Playwright, desktop Playwright, `git diff --check`, and `openspec.cmd validate add-timer-overlay-module --strict`; resolve every relevant failure without weakening tests.
- [x] 11.4 Reconcile every proposal/spec requirement against code and evidence, check only completed tasks, and leave the change ready for user review before any publication or merge action.
