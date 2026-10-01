# Native decoder body-stall automation checkpoint

Date: 2026-09-30. Scope: task 5.5 and the native streaming portion of task 3.6 only.

## Durable regression

`tests/desktop/media-streaming-stall.spec.ts` exercises the actual packaged Electron private selected-device player with normal Chromium sandboxing. It uses an isolated temporary config/data/assets/Electron profile, hidden windows, authoritative global mute and layer gain zero. Test-owned native error dialogs are recorded instead of opening a modal. It changes no installed runtime or user data.

The test authors deterministic silent stereo 48 kHz 16-bit PCM WAV buffers at runtime: 120 seconds / 23,040,044 bytes for the stalled layer (below the audio import limit), and 30 seconds for the independent healthy layer. No binary fixture, remux/parser, dependency or production debug API is added. PCM WAV is a supported native audio decoder container; this establishes shared audio-player stall policy and cleanup, not a WebM video decoder stall observation or physical audio acceptance.

Main-process global fetch instrumentation is installed before AudioWindow captures fetch. It calls the real owned-service fetch, preserves the returned HTTP status and headers, and wraps only the unique large PCM response body. Deliveries are paced at at most 16 KiB per 40 ms. The test observes both real native currentTime values above 0.1 seconds, then observes further advancement before holding deliveries. It verifies that incomplete body reads are still active at the hold boundary. The decoder is never replaced and play/currentTime are not simulated.

Assertions cover bounded stall classification after the last observed native progress; failed-layer pause, detached element and removed source; cancelled/aborted held upstream reads returning to baseline; continued healthy-layer media time and configured completion; stage `stall` / completion reason `stalled` from real renderer reply IPC; and successful fresh playback with exactly three total native starts, excluding replay of either original layer.

The test releases every wait and cancels every owned upstream reader in finally before Quit, clears its renderer sampler, captures only this launched application's main and metric PIDs, and uses the shared exit-confirmed profile cleanup. The evidence JSON includes owned-PID exit, process exit code, Quit duration and profile removal after cleanup completes. A unique shutdown JSONL log is retained outside the disposable profile, and the regression requires `service-stop-completed` with no `service-stop-failed`; exit code zero alone is insufficient.

## Verification

Focused commands:

```powershell
node node_modules/typescript/bin/tsc -b tests/desktop --pretty false
node node_modules/eslint/bin/eslint.js tests/desktop/media-streaming-stall.spec.ts
node node_modules/@playwright/test/cli.js test --config playwright.hardware.config.ts tests/desktop/media-streaming-stall.spec.ts
```

Desktop/server typecheck and focused lint passed. Native playback/stall assertions initially passed twice (30.9 seconds each), but retaining the shutdown log subsequently exposed a 10-second owned-service stop timeout despite process exit zero. Those earlier passes did not establish normal service shutdown. The strict retained-log native regression must pass against the rebuilt package before this checkpoint is complete. Native launches require the sandbox escalation used by the existing package tests because restricted filesystem execution prevents GPU startup; the Electron Chromium sandbox remains enabled.

First passing run: actual native onset advanced to approximately 1.2135 seconds before holding; 802,422 of 23,040,044 bytes had been delivered; failed layer stopped at 4.0201 seconds, 2,145 ms after its last observed progress. It detached while the healthy layer remained connected and continued past 7.09 seconds. The healthy original occurrence and subsequent fresh occurrence completed with configured-duration diagnostics. The held read was aborted/cancelled. Captured processes exited and the profile was removed; later retained-log verification showed that this original package had timed out service shutdown, so normal Quit was not established by the first run.

The original observed Forge ASAR SHA-256 was `2e48f9e5c110eb9db902054692fb0b4caee12c13f2b0fbf451dad9a4e2c77870`. A no-hold control and then a control with no fetch wrapper both reproduced abnormal shutdown. Closing the main-process media HTTP connection avoided it, narrowing the problem to HTTP drain; no connection-header workaround remains in the regression.

`apps/server/src/runtime/runtime-media-shutdown.test.ts` reproduced the relevant ownership bug with a real paused 16 MiB HTTP reader: runtime close did not finish while the client remained paused. Runtime composition now registers once-only media cleanup both at construction (partial-startup fallback) and ahead of HTTP draining in reverse cleanup order. The focused regression passed after this correction, with owners/grants/readers zero, the old grant rejected and the remote response truncated/aborted. SQLite closes after readers and HTTP. Repackaged strict native shutdown validation is pending the parent thread's final gate.

`test:desktop:media-streaming:hardware` now includes this spec alongside formats, resources and recovery. Evidence is written to `apps/desktop/out/streaming-automation-stall/native-stall.json` and native observations are attached to Playwright as `native-decoder-body-stall`.

The first media-cleanup fix passed the real paused-reader regression but did not resolve native HTTP-pool shutdown. A second real runtime regression connected a TCP socket without sending an HTTP request; default HTTP drain remained pending until the client destroyed it. The application now uses Fastify's supported `forceCloseConnections: true` option after runtime-owned playback/media cancellation. This closes remaining connections, including unused pool sockets, without a custom socket registry. Both shutdown regressions pass. Explicit shutdown can truncate in-flight HTTP responses; it retains the runtime cleanup sequence and SQLite fence instead of waiting for the supervisor to terminate the entire worker after ten seconds.

Root affected verification after both fixes: **18 suites / 110 tests pass**, project-reference typecheck and scoped lint pass. Logs: `apps/desktop/out/streaming-automation-root/stall-shutdown-final-regressions.log`. The streaming command also selects this two-case runtime regression; it now runs eight server acceptance cases before the existing benchmark. Final rebuilt native evidence is recorded below once available.

Physical output, WebM/video-specific stalled decoding, OBS coexistence, installed-runtime replacement and true OS-cold-cache acceptance remain outside this checkpoint. No unrelated acceptance task is checked here.

## Final rebuilt-package acceptance

Root final native command `corepack pnpm test:desktop:media-streaming:hardware`: **four tests pass in 47.7 seconds**, including the strict decoder-body stall case in 20.4 seconds. Final ASAR SHA-256: `14c343e31dff3a7c44efe831acbe823830f9e6984433641bedf5d6f6fb23ca14`. Original HTTP pooling is retained; there are no test-only connection headers or extra fetch controllers.

At the hold boundary, only 802,422 of 23,040,044 bytes had been delivered and actual native playback had advanced. The stalled layer stopped at 4.020139 seconds, 2,179 ms after its last observed progress, detached and cleared its source; the held upstream request closed. Healthy original playback and a fresh one-second occurrence completed without replay. Strict cleanup reports **Quit 134 ms, exit 0, every captured PID exited, profile removed, `service-stop-completed` present and `service-stop-failed` absent**. This supersedes the initial insufficient exit-only evidence and the intervening failed package runs.

Root final software format command: **five tests pass** against the same rebuilt package. Updated `corepack pnpm test:media-streaming`: **eight server cases plus the resource benchmark pass**. Project typecheck, changed-file lint, error provenance, whitespace and strict OpenSpec validation pass. Logs are under `apps/desktop/out/streaming-automation-root/`: `desktop-stall-final.log`, `desktop-software-stall-final.log`, `stall-server-final.log`, `stall-package-final-build.log` and `stall-shutdown-final-regressions.log`. Tasks 3.6 and 5.5 are complete within their software/native-audio scope; other acceptance remains unchanged.
