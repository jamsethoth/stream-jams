# Verification — scoped automation controls

Verified 2026-10-03 in the isolated `codex/automation-controls` worktree, based on `origin/main` at `1d9dfe7`. No live user data, plugin repository, or publication was changed.

- Final lint and TypeScript project checks passed.
- Production workspace build and Storybook build passed.
- Full unit run: 312 files, 2,679 tests passed; all 96 Node script checks passed.
- Full Storybook browser run: 32 suites, 288 tests passed.
- Affected Playwright acceptance: 17 of 18 passed in the batch; the remaining Operator assertion used the intentionally replaced mute label. Updated it to the Alerts/Effects labels and verified all three Operator tests passed. All 18 selected tests are verified across those runs.
- Acceptance covered scoped pairing/revocation, timer automation/recovery, operator queues/mute, audio routing, and overlay playback. New pairing acceptance starts a disposable real local runtime against the rebuilt web application, approves in Settings, exchanges once, reads state, and revokes in Settings.
- OpenSpec strict validation passed for this change and the synchronized scoped-automation and alert-playback-operator-controls canonical specs. Git whitespace check passed.
- One independent GPT-6.1 Sol review found that failed audio delivery could abort Effects/tray updates. Fixed independent delivery attempts and added a passing runtime regression.

The initial full unit run exposed a schema-31 backup compatibility regression and stale schema/mute fixtures. Fixed them and reran the complete suite successfully. The first Storybook attempt lost its preview process; the full rerun under a parent-owned preview passed. These failures are not represented as successful runs.

Raw command logs are retained locally in `.superpowers/sdd/automation-controls/` (ignored). The wire contract is `docs/automation-api.md`.

The separate Stream Deck adapter, SDK credential-storage/export checks, and physical key/audio acceptance remain separate plugin deliverables. Automated output tests verify policy delivery and routing; they do not prove physical audibility.

## Acceptance follow-up — 2026-10-04

Closed the four identified automation gaps:

1. Desktop test configs now explicitly persist both module flags. The worker-only fixture acknowledges module-policy lifecycle commands. Fresh desktop build/package passed. Native module-mute, packaged utility-worker, Timer and overlay-host acceptance passed. The first overlay-host attempt revealed a test defect: it measured the deadline from queue admission before asynchronous preparation. It now observes the production shared start/deadline over IPC and preserves the original full-duration and completion bounds; its focused rerun passed.
2. New `runtime-automation-queues.test.ts` uses real pairing and production runtime APIs for populated Alerts and Effects. It verifies successful skip and next-item progression, stale replaced-current rejection, same-count pending replacement conflict, successful clear preserving current, atomic denial of partially authorized All mute, and mixed/all authorized toggles. Only the external desktop recipient is held by a fixture.
3. `runtime-automation.test.ts` now closes and reopens the actual disposable persisted runtime, reuses a claimed grant, rejects the old runtime identity, performs management export/preflight/restore, verifies grant and approved-pairing invalidation, re-pairs, and rejects the pre-restore identity without timer mutation.
4. `scoped-automation-audio.spec.ts` uses a real local service, production browser app, WebSockets, native decoded PCM silence and the v1 mute endpoint. Concurrent Alerts/Effects/timer cues keep progressing, mixed/All mutes are correct, timer updates retain the same media elements, and fresh playback after reconnect receives the current policy. `module-mute.spec.ts` uses the production Electron audio host/window/preload/player, native media, current/future mute changes, terminal completion, forced renderer crash and policy reconciliation. Only device enumeration/binding and fixed fixture-grant resolution are simulated; native playback is zero-volume.

The browser acceptance caught a real defect: timer composition replacement discarded active streamed instructions. `OverlayApp` now retains streamed instructions for enabled modules across snapshots. The focused transport regression failed before the fix and passes afterward; explicit stop, module disable and subsequent re-enable do not resurrect playback.

Follow-up validation: affected runtime/overlay suite 75 tests passed; 7 browser workflows passed; 4 Electron/packaged workflows passed across the initial three successes and corrected overlay-host rerun. Strict workspace typecheck, lint, browser production build, desktop build/package, and Storybook build passed. Raw follow-up logs use the `acceptance-` prefix under the local ignored evidence directory.

UX scope: existing MVP browser-source transparency and playback continuity (Product Surfaces / Overlay UI), no new controls or visual styles. Existing Storybook module-mute render states remain applicable; the changed transport ordering is exercised by the production OverlayApp regression and real browser acceptance instead of an artificial new static story. Stop/disabled output still fails closed.

Remaining boundary: physical audibility/device selection and separate Stream Deck adapter/storage/export/key-gesture acceptance are not claimed. Hardware-only legacy fixtures were updated and typechecked, not executed against the user's devices. The packaged artifact tested here predates the subsequent browser-only OverlayApp fix; final browser acceptance uses the rebuilt fixed app.

Final affected OverlaySurface Storybook run: 19 tests passed with console and accessibility gates. Final lint and Git whitespace checks passed.

Publishing gate — 2026-10-04: user authorized push, PR creation and an independent PR review. Fresh full unit/script run, lint, strict workspace typecheck and workspace production build passed. OpenSpec strict validation and staged whitespace check passed. Follow-up frontend/browser/desktop acceptance above remains applicable.
