# Desktop Overlay Failure Logging Plan

**Objective:** Preserve enough safe, structured evidence to distinguish desktop renderer crashes, load and command timeouts, display loss, and lease expiry when an otherwise configured output becomes unavailable.

## Completed sub-slices

- [x] Extend the internal desktop status contract with a bounded diagnostic payload.
  - Areas: `packages/core/src/overlays/` and core exports.
  - Positive coverage: accepts a renderer failure with an operation, exit code, timestamp, and consecutive failure count.
  - Negative coverage: rejects unknown diagnostic fields that could leak paths or private data.
  - Assertion: diagnostics remain strict, bounded, nullable, and backward-compatible for callers that omit them.

- [x] Capture native renderer and host lifecycle failures.
  - Areas: `apps/desktop/src/overlay/overlay-window.ts` and `overlay-host.ts`.
  - Positive coverage: renderer exit details, load rejection, command timeout, lease expiry, and explicit Retry recovery.
  - Negative coverage: display loss does not consume the renderer crash budget, stale callbacks remain ignored, and interrupted content is not replayed.
  - Assertion: Retry clears the latched diagnostic only after a replacement renderer initializes successfully.

- [x] Emit deduplicated readiness and recovery logs.
  - Areas: `apps/server/src/modules/overlays/output-readiness-service.ts` and runtime composition.
  - Positive coverage: one detailed warning per unique failure and one recovery event after readiness returns.
  - Negative coverage: repeated readiness checks do not flood logs; logger failures do not alter fail-closed output behavior.
  - Assertion: metadata contains only bounded status details, never asset paths, bytes, route keys, or media content.

## Validation

- [x] Focused diagnostics: 47 tests passed across core, desktop, and server.
- [x] Workspace typecheck passed: `corepack.cmd pnpm typecheck`.
- [x] Workspace lint passed: `corepack.cmd pnpm lint`.
- [x] Workspace production build passed: `corepack.cmd pnpm -r build`.
- [x] Full unit validation passed: 250 Vitest files / 2,183 tests plus 14 Node script tests.
- [x] `git diff --check` passed.
- [x] Canonical `shared-overlay-surfaces` requirements reconciled with the implemented diagnostic and deduplication behavior.

## Acceptance criteria

- [x] A future latched desktop-overlay failure identifies the native failure category and relevant safe details.
- [x] Alert admission records the detailed failure without requiring Settings to be opened.
- [x] Repeated checks are deduplicated and recovery is observable.
- [x] Existing fail-closed playback, bounded retry, and no-replay behavior remain unchanged.

No in-scope gaps remain. Installing or restarting the live `C:\StreamingTools\stream-jams` runtime is intentionally outside this PR.
