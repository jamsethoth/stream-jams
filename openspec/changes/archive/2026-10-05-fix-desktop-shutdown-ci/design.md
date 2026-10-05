## Context

Investigation on 2026-09-30 used current `origin/main` b1cb27b and two failing GitHub runs: [36446821534](https://github.com/jamsethoth/stream-jams/actions/runs/36446821534/job/109011174730) and 36635121466. Both fail in `shutdown-diagnostics.spec.ts` after about 49 seconds, reporting the cleanup close timeout at line 92, followed by a 240-second worker teardown timeout. The downloaded artifact contains that masked error, but no shutdown phase log: the log is outside `test-results` and the evidence console message is after the throwing cleanup await.

PR #133 (b14a6be) inserted a synthetic `render-process-gone` event into the healthy shutdown test. `ManagementWindow` responds by clearing `#guardReady`. `requestQuit()` then opens the native unavailable-renderer dialog unless another `desktop:guard-ready` IPC arrives. Changing the settings checkbox changes the dirty source; the React effect in `dirty-navigation.tsx` re-subscribes through `management-preload.cts` and sends that IPC asynchronously. The test immediately requests Quit after collecting process metrics, without waiting for this registration. Depending on ordering, it receives the expected HTML dialog or an unanswered native dialog. The existing `quitPending` operation prevents cleanup's second Quit from replacing that pending decision.

A local boundary probe exercised the current production ManagementWindow class with Electron doubles: crash followed directly by Quit selected native confirmation; inserting guard-ready between crash and Quit selected renderer IPC. Both outcomes were asserted. This establishes the ordering defect; the historical artifact does not retain the original click error or native-dialog observation. The implementer should confirm the same path in the packaged application with controlled IPC timing.

## Goals / Non-Goals

**Goals:** deterministic lifecycle tests; preserved crash diagnostic coverage; useful failure evidence; unchanged bounded native-exit checks.

**Non-Goals:** production changes, new dependencies, changing CI job scheduling/publication, retries, larger timeouts, forced app termination, or resolving the separate BL-044 issue.

## Decisions

1. Remove the synthetic management crash and related diagnostic query from the healthy Cancel/Discard test. Extend the existing real crashed-renderer test in `windows-lifecycle.spec.ts` to verify the stable `err_` reference and crash reason/exitCode already checked by the removed block. Keep the Crashpad upload-disabled assertion.
2. Observe actual trusted `desktop:guard-ready` IPC in the Electron main process before changing the checkbox; wait for the resulting registration before Quit. Only test code may observe it. Do not send a fake ready IPC, read private class state, or insert sleeps. Match the management webContents/main frame and remove observation listeners even on failure.
3. Use the existing `withCleanup` helper to preserve both primary and cleanup failures. Ensure test-specific evidence retention runs even if cleanup throws. Copy/attach the bounded shutdown JSONL into `testInfo.outputPath` and record the retained root and captured PIDs; never copy the whole profile or credentials.
4. Control native quit confirmation in this isolated test with a test-only dialog observer if necessary to reproduce or clean up the failure route. Unexpected native confirmation must fail the healthy-path assertion. Cleanup may answer Quit only for this owned test's exact unavailable-renderer confirmation; it must not turn a native fallback into a passing healthy-path test. Reuse existing native-dialog patterns where useful without broad harness restructuring.

## Risks / Trade-offs

- A passing repeated run alone would not prove removal of a timing race. Use a controlled delayed-ready reproduction and check the explicit readiness barrier.
- Crash coverage must remain real: extend the existing `forcefullyCrashRenderer()` scenario, including raw runtime log reference validation.
- Cleanup can fail independently: report both errors and retain evidence before returning; maintain the no-force-kill policy of this diagnostics test.
- Current CI runs desktop tests only on workflow_dispatch. Local package verification is required; a new remote run is not assumed from ordinary CI success.

## Additional Validation Defects Found During Implementation

The first full suite exposed an initial quit-guard ordering defect in the native-dialog helper fixture. A controlled packaged probe held genuine initial registration: ordinary Quit selected native confirmation and kept the service alive; releasing the real registration enabled renderer decisions. That clean fixture now observes a deliberate reload before Quit. Other lifecycle fixtures are unchanged.

The same suite exposed malformed neutral MP4 fixture media-header durations. `mdhd` version 1 durations must use the track timescale, but the fixture stored movie milliseconds. The with-audio header made MusicMetadataProbe report 207 ms while the browser decoded about 9.93 seconds, allowing production completion before the soundtrack poll observed it. Correct only the three known duration fields; keep sample bytes, production parser, and codec assertions unchanged. A precise 9941 ms metadata assertion failed at 207 ms before repair and passed afterward. The trackless parser currently returns null because it has no audio metadata; its corrected video header is verified by existing decoder coverage.
