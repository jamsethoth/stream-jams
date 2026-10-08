## 1. Scope and implementation preparation

- [ ] 1.1 Obtain written proposal/design review, confirm the proposed scope/limits and independently reviewable slices, and commit the implementation spec before or with implementation; do not treat artifact readiness as implementation authorization.
- [ ] 1.2 Fetch remote state, verify worktree/branch and still-unimplemented scope, and create the implementation branch from origin/main according to repository policy.
- [ ] 1.3 Read frontend routing documents and inspect existing layer/layout/module/output primitives; record a focused editor fit assessment and any justified dependency choice before adding it.
- [ ] 1.4 Create a requirement-to-test/acceptance trace covering all seven delta capabilities and the documented failure/recovery boundaries.

## 2. Shared values and goals

- [ ] 2.1 Add strict browser-compatible value, money/currency, goal, mutation and formatting schemas with shared limits; test coercion, precision, overflow, invalid targets and text handling.
- [ ] 2.2 Implement fixed-target and saved-baseline projections and explicit goal restart; test decreases, zero/full/over-target, money units and provider-owned restrictions.
- [ ] 2.3 Add typed SQLite repositories/migrations with foreign keys for values/goals, revision/epoch and reference-safe lifecycle; test rename, deletion impact, transactional correction and restart/manual reset.
- [ ] 2.4 Add thin management APIs with existing auth/CSRF and maintenance guards; test unauthorized requests, stale corrections, referenced deletes, provider read-only state and invalid types.
- [ ] 2.5 Add Data management for value/goal creation, current state, deliberate set/add/subtract/reset, references and source status with keyboard access and representative Storybook states.

## 3. Rules and transactional ingestion

- [ ] 3.1 Implement flat versioned custom source schemas, bounded AND filters, typed field selection/multipliers and deterministic rule evaluation; test invalid schema edits, order, type mismatch and all-or-nothing effects.
- [ ] 3.2 Add a data event consumer to existing normalized-event fan-out without changing alert/timer admission; test hidden/disabled canvases, data-rule failure isolation and normalized-provider filters.
- [ ] 3.3 Add subscription/Prime/gift-recipient and batch-only starters with explicit renewal/unit policy; test aggregate-plus-recipient inputs and overlap guidance.
- [ ] 3.4 Implement atomic persisted receipts and canonical effect hashes with seven-day/100000-record bounds; test concurrent duplicates, changed-payload conflicts, restart, rollback, post-commit response loss and saturation without premature eviction.
- [ ] 3.5 Add the visual source/schema/rule editor with sample-field picker, explicit enablement, validation, failure states and isolated rule simulation; add production-component stories and interaction/accessibility coverage.

## 4. Scoped HTTP and WebSocket inputs

- [ ] 4.1 Extend pairing/grant metadata, management approval and discovery with explicit data scopes and approved source IDs; test unchanged legacy/current grants and missing read/source consent.
- [ ] 4.2 Add guarded data state, direct command, event submit and caller-owned receipt routes; test validation, stale runtime/revision, retained duplicates before guards, revoked grants, capacity and maintenance.
- [ ] 4.3 Implement one-use short-lived ticket issuance and first-frame WebSocket authentication with strict loopback/Host/Origin checks and redaction; test ticket expiry/replay, auth timeout and pre-auth access denial.
- [ ] 4.4 Route correlated WebSocket commands/events through the HTTP domain service and enforce grant revocation, socket/rate/backpressure limits; test cross-transport duplicates, slow clients, reconnect and no buffered replay.
- [ ] 4.5 Document complete JSON schemas, endpoints/messages, status/errors, authorization scope breadth, receipt retention/lookup and unknown-outcome guidance with executable fixture-backed HTTP/WebSocket examples.

## 5. Twitch data sources

- [ ] 5.1 Add capability-specific follower/goal readiness and missing-scope reconnect UX without regressing existing provider readiness; test changed broadcaster and source selection.
- [ ] 5.2 Implement follower snapshot/reconciliation with rate-limit backoff and connection-epoch protection; test decreases, disconnect, stale responses and follow-triggered refresh.
- [ ] 5.3 Implement Creator Goals snapshot/lifecycle reconciliation and pinned goal/unit handling; test initial-read races, bounded buffering, ended/replaced goals and subscriber/sub-point distinctions using recorded sanitized fixtures.
- [ ] 5.4 Add source selection/read-only value presentation and stale status stories; document the distinction between authoritative sources, received-event counters and external custom inputs.

## 6. Canvas authoring and output

- [ ] 6.1 Register disabled-by-default data-overlays module and persist multiple canvases/elements/output assignments with strict bounds, geometry/layer order and independent presentation/input enablement.
- [ ] 6.2 Implement shared safe text/image/shape/progress renderers and core formatting; test currency, overflow, missing binding, text escaping/moderation, stale policy and parity across output types.
- [ ] 6.3 Build canvas list/editor with layer controls, pointer/numeric/keyboard positioning, resize, styling, binding picker and explicit save/apply; add empty/loading/error/success and representative layout stories.
- [ ] 6.4 Implement isolated sample store and preview controls for update/decrease/completion/over-target/long text/missing source; verify no live data, receipts or output keys change.
- [ ] 6.5 Add coherent scoped snapshots and ordered updates to module/unified/private-desktop surfaces; test initial subscription races, stale runtime/revision discard, bounded reconnect and preservation of other modules' active media.
- [ ] 6.6 Integrate existing global safety/display suppression and output management without a new scheduler/audio channel; verify hiding/deletion/re-enabling never resets shared data.

## 7. Templates and backup

- [ ] 7.1 Add four bundled canvas/group starters and saved user templates with typed slots, preview metadata and local asset references; exclude live data and credentials.
- [ ] 7.2 Add explicit map-existing/create-custom flows, atomic ID/reference rewriting and flattened group insertion; test incompatible types/currencies, unresolved provider/assets and independent-copy editing.
- [ ] 7.3 Extend versioned backup/restore with complete typed data state and reference validation; test new epoch, authority invalidation, input/canvas disablement and failed-restore preservation including prior receipts.
- [ ] 7.4 Add template and restore review Storybook/Playwright workflows and document WAL-aware backup/rollback and older-build limitations.

## 8. Integrated verification and handoff

- [ ] 8.1 Add disposable-service Playwright acceptance for two canvases sharing a counter, visual rules, paired HTTP/WebSocket producers, templates, manual resets, isolated preview and reference-safe deletion.
- [ ] 8.2 Add process-crash acceptance before/after commit, receipt lookup after restart, reconnect races, revocation, input saturation and invalid events while Alerts/Timers continue; classify failures without weakening coverage.
- [ ] 8.3 Reconcile the scenario trace against code/tests, then run required lint, typecheck, tests, build, Storybook interaction/accessibility and Playwright gates plus strict OpenSpec validation.
- [ ] 8.4 Rebuild/restart affected disposable services, wait for health, reload and verify the actual author/update/display workflow; record isolated OBS browser-source and Windows private-desktop acceptance separately from automated results.
- [ ] 8.5 Update runbook/API/UX notes and any manual acceptance blockers, synchronize completed canonical specs through the appropriate workflow, and remove BL-055 only after implementation/spec sync/required acceptance complete. Keep BL-020 for undelivered donation adapters.
