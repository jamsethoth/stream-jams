# Shutdown Diagnostics Implementation Plan

**Goal:** Separate application cleanup from native exit delay and reduce BL-044 to a staged reproduction.

**Architecture:** Opt-in asynchronous phase logger in the existing main process; developer-only Electron fixtures and an external non-destructive runner.

**Spec:** [design.md](design.md) and both delta specs.

**Constraints:** Persistent sessions, sandboxing, edit decisions, ten-second worker timeout and fifteen-second native observation deadline remain unchanged. Silent isolated data only. No forced cleanup. The original implementation excluded publication; the subsequent user-approved PR handoff below supersedes only that restriction.

## 1. Scope and logger

- [x] 1.1 Confirm revised approval, refresh origin/main, preserve the isolated worktree/dirty work and replace the unimplemented recovery proposal.
- [x] 1.2 Add real-file tests in `apps/desktop/src/shutdown-log.test.ts` for opt-out, invalid paths, fixed fields, attempt/monotonic ordering, exclusive creation, unavailable paths, bounds and close. Observe missing behavior before implementing.
- [x] 1.3 Implement `ShutdownLog` in `apps/desktop/src/shutdown-log.ts`: `record(phase)` returns immediately; `close()` requests completion without awaiting it. Run focused Vitest and desktop typecheck.
- [x] 1.4 Instrument existing `main.ts` boundaries. Add a packaged `tests/desktop/shutdown-diagnostics.spec.ts` regression for Cancel then Quit, separate attempts and correct cleanup order. Verify old-package failure and rebuilt-package success without changing decision policy.

## 2. Staged reproduction

- [x] 2.1 Add developer local HTML/Electron fixtures and `scripts/diagnose-desktop-shutdown.mjs`. Validate explicit stage/output selection, runtime identity, silence, captured native PIDs and first-failure batch stop. Preserve all profiles; never force cleanup.
- [x] 2.2 Run two reversed-order rounds with seventy-second hidden dwells in the known-working normal-user context. Inspect outcomes/DIPS metadata and independently verify captured processes/listeners absent. Pause further launches on a failure.

## 3. Verification and handoff

- [x] 3.1 Run affected desktop unit tests, focused lint, desktop/test typechecks, builds, packaged regression and strict OpenSpec validation. Self-review against both delta specs; report failures honestly.
- [x] 3.2 Update the backlog, investigation evidence and desktop runbook with research, usage/limits and staged outcomes. Keep BL-044 unresolved unless matching evidence identifies the trigger. No archive, commit or publication in this execution.

Commands: `corepack.cmd pnpm exec vitest run apps/desktop/src`; `corepack.cmd pnpm exec node --test scripts/desktop-shutdown-fixture-data.test.mjs scripts/desktop-shutdown-exit.test.mjs`; `corepack.cmd pnpm --filter @stream-jams/desktop typecheck`; `corepack.cmd pnpm exec tsc -p tests/desktop/tsconfig.json`; `corepack.cmd pnpm desktop:package`; `corepack.cmd pnpm test:desktop shutdown-diagnostics.spec.ts`; `openspec.cmd validate add-desktop-shutdown-diagnostics-recovery --strict`. The standard `test:unit` command also runs the Node fixture/exit-observer tests after Vitest so the silence/output-selection and native-exit-result invariants are exercised in CI.

## Publication handoff (subsequently authorized September 8)

Publish the completed diagnostic capability, reusable fixtures, dialog-test repair and sanitized investigation/runbook documentation on `codex/bl044-shutdown-diagnostics`, based on freshly fetched `origin/main`, as a PR to `main`. Reconcile the diff with both delta specs, run repository lint/typecheck/unit/build gates and the isolated packaged desktop suite, obtain one read-only review, and verify CI before marking the PR ready. Keep generated packages, raw traces/dumps, local profiles, device inventories and machine-specific one-off scripts outside the commit. No merge or spec archive is included. BL-044 remains open pending a representative recurrence, cause-specific evidence and a verified fix; delivery of diagnostics is not defect closure.
