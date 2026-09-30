# Desktop Shutdown CI Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans. The user explicitly assigned implementation to GPT-6.1 Sol low after Astra root-cause investigation; no further approval gate or additional delegation is needed.

**Goal:** Remove the identified Windows shutdown-test race and retain useful evidence on genuine failures.

**Architecture:** Keep the production quit controller unchanged. Separate healthy and crashed renderer scenarios, observe actual guard readiness in test code, and reuse the existing primary-error-preserving cleanup helper.

**Tech Stack:** TypeScript, Electron, Playwright, pnpm, OpenSpec.

**Spec:** `openspec/changes/fix-desktop-shutdown-ci/specs/production-entrypoint-validation/spec.md`; read the sibling `design.md` for the causal chain and evidence.

## Global Constraints

- Work in this Windows worktree on `codex/fix-desktop-shutdown-ci`, based on current main b1cb27b.
- Preserve existing native-exit deadline, no-force-kill diagnostic cleanup, persistent isolated profiles, and Cancel/Discard assertions.
- No production/UI changes, new dependencies, retries, timeout inflation, CI scheduling changes, push, PR creation, or remote workflow dispatch are needed for this bounded repair.
- Use per-command `git -c safe.directory=C:/Users/James/.codex/worktrees/93e6/stream-jams`; escalate networked gh commands if any.
- Treat downloaded `test-results/ci-investigation` and any remaining `.tmp/ci-36446821534` binaries as evidence only, never commit them. Some downloaded files were briefly locked during relocation; leave them alone if still busy.

## Review Focus

- A settings checkbox click completing does not guarantee the React effect's ready IPC reached main.
- Observers must identify the actual trusted management sender and detach on both success and failure.
- Renderer-loss coverage must retain the `err_` reference and reason/exitCode checks using the existing real crash.
- A cleanup error must not replace the primary error or prevent phase attachment.
- An unexpected native quit dialog must fail healthy coverage while allowing ordinary owned-fixture cleanup.

## Task 1: Repair The Desktop Validation Scenario

**Files:**
- Modify `tests/desktop/shutdown-diagnostics.spec.ts` (scenario, readiness, cleanup, attachments).
- Modify `tests/desktop/windows-lifecycle.spec.ts` (extend existing real renderer-crash log assertion).
- If needed, add a small focused test-only helper and its behavioral tests under `tests/desktop/`; reuse `withCleanup` from `audio-harness.ts` instead of reimplementing aggregation.
- Update this plan's verification record and OpenSpec tasks/spec.

- [x] Install locked dependencies with `corepack.cmd pnpm install --frozen-lockfile`; build a fresh packaged executable with `corepack.cmd pnpm desktop:package`. These need normal-user permissions if Corepack/cache or Electron launch is blocked in the sandbox.
- [x] Capture a controlled packaged reproduction of the original failing sequence: observe/intercept only the isolated fixture's native dialog, ensure the synthetic crash occurs after readiness, hold or suppress the next ready delivery, then request Quit. Assert native confirmation is selected and service remains alive until an explicit native reply. Use test-only instrumentation; do not leave the original blocking dialog unresolved or force-kill it. The dependency-free source probe at `test-results/ci-investigation/guard-race-probe.mjs` already proves the two orderings in the production class.
- [x] Remove synthetic crash/authenticated query lines from the healthy test. Keep Crashpad upload-disabled and persistent-session assertions. Extend `windows-lifecycle.spec.ts`'s existing real renderer crash to require a matching stable reference (`/^err_/`), reason `crashed`, and numeric exit code in its runtime JSONL log entry.
- [x] Install a test-only observer for `desktop:guard-ready` before unchecking the checkbox. Match management sender id/main frame/origin. Wait for the actual resulting IPC before calling `app.quit()`. Clean up the observer even if the edit or wait fails. Do not manufacture ready messages or rely on sleeps.
- [x] Add proportional behavioral coverage for the readiness observer: it waits when the expected event has not arrived, ignores another sender, and releases only after the real matching event; cover listener cleanup if a helper is introduced. Use a controlled delayed IPC in packaged verification to prove the fixed sequence waits instead of choosing native fallback.
- [x] Wrap the test action/cleanup using existing `withCleanup`. Put phase attachment and root/PID evidence logging in an outer finally so they run even when cleanup fails. Attach only bounded JSONL and safe metadata under `testInfo.outputPath`, preserving the original error if evidence collection also fails. Keep the profile for diagnosis and keep native exit/listener assertions.
- [x] If needed for failure cleanup, observe the isolated test's native confirmation from startup and resolve its pending Quit only during cleanup. Assert healthy action saw no native fallback. Prefer the existing held-dialog pattern, keep helpers small, and avoid changing unrelated test behavior.
- [x] Verify error aggregation with the existing `audio-harness.spec.ts` tests and add focused attachment failure-path coverage only where new behavior needs it.

## Task 2: Verify And Finish

- [x] Run focused helper tests and `corepack.cmd pnpm lint`, `corepack.cmd pnpm typecheck`, and `openspec.cmd validate fix-desktop-shutdown-ci --strict`.
- [x] Use the newly packaged runtime for `corepack.cmd pnpm test:desktop tests/desktop/shutdown-diagnostics.spec.ts --repeat-each=10 --workers=1 --retries=0`; record ten passes, health closure, native exit and retained evidence. Run only isolated profiles and no hardware output tests.
- [x] Run `corepack.cmd pnpm test:desktop` once (non-hardware) to check renderer-crash coverage and test interactions. Stop and diagnose any failure; do not label failures green or expand into unrelated fixes.
- [x] Sync the spec addition into `openspec/specs/production-entrypoint-validation/spec.md`, update OpenSpec task checkboxes and this verification record, and run `git diff --check`.
- [x] Inspect the final diff and commit only planned files. Include a human-readable intent and per-file change list. Report the commit and precise verification results to the parent. Do not publish remotely.

## Investigation Evidence

- Failing run 36446821534 / job 109011174730: 23 passed, shutdown diagnostics failed after 49.4 seconds; cleanup close timeout masked the original failure; worker teardown then timed out at 240 seconds.
- Run 36635121466 repeats the same failure with 24 other tests passing.
- PR #133 adds the synthetic crash block; current main retains it. Recent green runs skip desktop testing following PR #136's manual-only change.
- Current production-class probe passed both assertions: crash then Quit => native unavailable confirmation; crash then ready IPC then Quit => renderer quit request.
- The historical failure artifact contains only the masked error context for this test, not its phase log. Preserve this uncertainty: exact historical native-dialog state was not recorded.

## Verification Record

Implementation completed inline by GPT-6.1 Sol low. Production code, dependencies, timeout budgets, CI scheduling, and remote state are unchanged.

- Locked dependency install and fresh `desktop:package`: passed. Corepack cache required normal-user execution after sandbox EPERM.
- Controlled packaged original-sequence probe: passed. After trusted initial readiness, synthetic renderer loss plus held real next registration selected native confirmation. Service remained healthy until explicit native reply. The exact implemented observer waited for actual release; renderer Cancel/Discard then exited normally. Initial startup-observation probe was corrected by reloading under observation; it was an instrumentation issue.
- Controlled initial-registration probe: passed. A clean helper fixture with genuine initial registration held selected native fallback; releasing it enabled renderer decisions.
- Final corrected shutdown repeat: 10/10 passed, one worker, zero retries (40.4 seconds). Each run checked Cancel/service survival, expected phase ordering, Discard/service closure, captured process exit, and exit code zero. Earlier repeat also passed 10/10.
- First full desktop run: 25 passed, 3 failed. Diagnosed test assertion defect (raw JSONL uses `correlationId`), intermittent dialog-helper initial-registration ordering, and malformed MP4 fixture duration units. All three were corrected and independently checked.
- Metadata regression: failed at 207 vs expected 9941 ms before fixture repair; final 2/2 passed. Both silent codec cases passed after repair (2/2, 1.0 minute).
- Full non-hardware desktop suite after defect repairs: 28/28 passed (3.0 minutes). Final review then hardened the reload observer against stale pre-navigation IPC; final affected helper/lifecycle subset passed 16/16 (33.9 seconds).
- Final explicit output-file retention check: shutdown 1/1 passed (7.6 seconds); bounded JSONL and safe fixture metadata exist under `testInfo.outputPath` and are attached by path. Body-only passing attachments were not persistent with the list reporter, so explicit files close that evidence gap.
- Final lint, TypeScript, strict change/canonical-spec validation, and diff whitespace checks: passed. Canonical spec synchronized. Parent reviewed the scoped diff; no further production work required.
- Durable ignored probe/results are under `dist/ci-investigation/`; current bounded shutdown files and summary are under `test-results/`. Historical downloaded `test-results/ci-investigation` was cleared by Playwright; original findings remain recorded above and in the design. Remaining `.tmp` binaries were left alone and excluded from the commit.


Ruling: The full suite identified a second initial guard-registration race in the clean native-dialog helper fixture. Synchronize only that fixture using an observed deliberate reload; do not change production or other lifecycle quit helpers.

Ruling: Correct malformed neutral MP4 fixture headers discovered by full-suite validation. The production metadata parser is unchanged. Its precise regression failed at 207 ms before the correction and passed at 9941 ms afterward; trackless metadata remains null under the existing audio metadata parser.

### Fixture Repair Provenance

Apple's [media header duration definition](https://developer.apple.com/documentation/quicktime-file-format/media_header_atom/duration) uses media timescale units. Both version 1 video `mdhd` fields at byte offset 316 changed from 9833 to 294990 ticks (timescale 30000); the with-audio audio field at offset 864 changed from 9941 to 477168 ticks (timescale 48000). Offsets are zero-based starts of the 8-byte unsigned duration fields. Validated original values/version before writing. File lengths and `mdat` sample payload SHA-256 hashes stayed unchanged. No remux, re-encoding, or parser changes.

- `neutral-with-audio.mp4`: old SHA-256 `1afe7322ef981e6a16c7af6a1f05dd9dcdd020e64c9fdd65b582e936cf439e6b`; corrected SHA-256 `20955ba4df68ade4b91a4361b254ce5a0037611c02c5f043fb510e92edfba5dd`; unchanged sample SHA-256 `6172dfc9c355c72024870d00a519687e29cce6a6c32531f744ea830497d3a94f`.

- `neutral-trackless.mp4`: old SHA-256 `cf398880138b64b5d432b828398fd92aabc2f329402ee16384197f32a26f5193`; corrected SHA-256 `cba2e7a415393d5b4ea6149da4988f12ee35b6657567bf35f9fe347191b1e3c6`; unchanged sample SHA-256 `7b56e4307eabd6142d3dfdeaf1f7ac9623326e8acf1a81c6f66ad50650bd6d82`.
