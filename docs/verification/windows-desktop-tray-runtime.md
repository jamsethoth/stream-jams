# Windows desktop tray runtime verification

Change: `add-windows-desktop-tray-runtime`. Execution dates: 2026-09-03–2026-09-04. Branch: `codex/desktop-audio-routing`, based on `bf03358` with planning commit `f922340`.

This is an execution record, not a release certification. Unperformed checks remain gaps. No live provider profile, live overlay URL, signing, publication, or installer was used.

## Evidence so far

- Focused runtime/config/backup checks: 16 files, 96 tests passed (thread pool).
- Desktop supervision/close policy plus Operator Console: 3 files, 24 tests passed.
- Settings and dirty-quit UI checks: 4 files, 50 tests passed before the later Operator Console addition.
- Credential-store probe concurrency regression: 4 tests passed. Each probe now creates and cleans only its own uniquely named temporary entry.
- Playback shutdown and shared startup checks: 2 files, 24 tests passed.
- Strict workspace build/typecheck and ESLint passed at intermediate checkpoints; final all-change gates are pending.
- Staging copied 139 production packages without source-tree symlinks; Forge produced the unsigned Windows executable successfully.
- Complete Node-project suite: 129 files, 932 tests passed (`vitest run --project=node --pool=threads`).
- Focused Settings/Operator browser suite: 7 tests passed. The shared browser fixture now explicitly returns desktop capability unavailable for CLI-mode tests.
- Final ASAR-packaged Electron Node-mode checks passed: native SQLite create/query/close, uniquely named keyring set/get/delete, and packaged server composition startup/health/close (2 tests). These do not replace utility-process/window acceptance.
- The two existing Twitch polling tests initially failed due to wall-clock timing/React commit races. Their checks now advance a fake clock inside `act`, retaining exact polling bounds; both focused regressions passed. No provider production behavior changed.
- The combined root `pnpm test` command stalled during Vitest collection and was stopped rather than called green. Running the configured projects independently completed successfully: Node 129 files/932 tests and web 35 files/437 tests passed with the thread pool.
- Full Storybook acceptance passed: the static build completed and 17 suites/184 interaction and accessibility tests passed. Generated desktop output folders remain excluded from Jest's module scan.
- Real runtime restore regression: 19 smoke tests passed, including restored `closeToTray: false` reaching the host callback after a saved true value while health remains available.
- Native UI smoke: Robocopy resolved slow setup. The unpacked application missed the 20-second startup deadline. The ASAR package subsequently opened management and passed health, renderer isolation/preload, default preference, dirty hide/reopen, Cancel, and explicit preference-save assertions. The test then stalled waiting for application exit. A test-only dynamic import in the inspector evaluator was also invalid and was removed; native dependencies are checked separately.
- Direct bundled utility-worker assertions passed startup, authoritative persisted mute, and worker exit after stop. A combined post-package run once received no worker message inside its 20-second startup observation after many native launches; no process remained and a clean focused rerun passed in 10.0 seconds. This is recorded as a transient failed combined run, not a green full desktop-suite invocation.
- Initial no-debugger Windows `CloseMainWindow` attempts could not find a visible main window or missed startup health. After explicitly allowing the test window to show, the user's separate PowerShell execution reached native close but did not observe process exit within 15 seconds; temporary-directory cleanup also failed. The user observed the window briefly appear and disappear. That observation alone does not establish hide versus destruction.
- September 4 native-close diagnostics first captured one pass, then two passes and one failure. In that failure, the native window no longer existed (`IsWindow: false`), `/health` was unreachable, and Windows still reported the exact owned main process present and not exited. A temporary minimal Electron harness then reproduced the delay without Stream Jams service, tray, configuration, or renderer content. `before-quit`, `will-quit`, Electron `quit`, and Node `process exit: 0` all occurred in the same millisecond, after which the native main/GPU/utility/renderer processes remained. In a later delayed sample, only main and GPU remained; the GPU process entered a terminating state that `Get-Process` could still see but `taskkill` reported as having no running instance. No-window startup exited 10/10; creating a `BrowserWindow` was the trigger. `app.exit(0)` and Electron 44.2.0 comparison runs rejected those proposed fixes.
- The implemented mitigation calls `app.disableHardwareAcceleration()` before readiness, keeping this management-only renderer off the problematic hardware-GPU path. After rebuilding the actual Electron 44.1.1 package, all ten native X runs stopped the owned listener and exited the main process with code 0. The first verification attempt was 9/10 because one already-terminating Chromium child retained the disposable profile past the original 5.5-second cleanup retry. Cleanup was kept failing but extended to a bounded native-release window; the fresh ten-run acceptance then passed 10/10 in 1.6 minutes. This changes desktop management rendering only; OBS browser-source rendering and the server remain outside this Electron GPU process.
- The rebuilt packaged UI smoke passed in 27.4 seconds: outside-checkout startup, built UI/preload isolation, dirty hide/reopen, Cancel, preference save, native close-policy shutdown, restart with the saved false preference, and explicit Quit. Focused desktop-test TypeScript and ESLint checks also passed.
- The expanded rebuilt packaged UI smoke passed again and now drives every dirty-quit outcome through the desktop bridge: Cancel keeps the service/draft alive, Save and leave persists false before shutdown, Discard quits without changing the saved value, and an injected save failure leaves the draft and service alive until the operator explicitly discards.
- Native lifecycle acceptance passed 4/4 against isolated profiles: a duplicate executable launch reopened the existing hidden window without a second service/window, an occupied port produced an error without changing the config or terminating its owner, a crashed renderer required native unsaved-change confirmation before shutdown, and a synthetic Windows `query-session-end` event stopped the owned listener without ending the user's Windows session.
- Desktop injected-boundary coverage now passes 15 tests across close policy, supervision and tray. It explicitly covers occupied-port failure, worker startup/exit/timeout failures, stale generations/request IDs, owned-worker-only termination, shared duplicate shutdown, menu enablement, authoritative Mute/Unmute labels, Open and Quit actions.
- Browser E2E initially failed 9/31 with the local default of ten workers; all 31 passed with one worker, proving the suite's shared service/state was not isolated for concurrency. The default is now one worker and the unchanged repository command passes 31/31. A separate overlay-image flake was a test defect: its eight-byte PNG signature triggered the production fail-closed path and its four-second lifetime raced a five-second assertion. A valid one-pixel image with a non-racing test duration passed 10/10, followed by the green full run.
- The final combined packaged desktop invocation passed all 10 tests in 50.2 seconds, including native SQLite/keyring, packaged composition, built UI/quit decisions, utility worker, no-debugger native X, duplicate launch, port conflict, unavailable renderer and session-end cleanup.
- Windows reported a residual test process with `HasExited: true` while its temporary profile directory remained locked (`EBUSY`). This is evidence of a process/handle cleanup problem on this host, not proof that every native failure is environmental. No system settings, unrelated processes, or live application profile were changed.
- Native computer-control discovery returned no app surfaces even while an exact isolated Stream Jams process was healthy, so the tray icon/context menu could not be clicked by automation. A final isolated instance was presented for human acceptance: X hid the window, the Stream Jams tray icon/menu showed Open Stream Jams, Mute alerts and Quit, Open restored the window, and tray Quit closed it. The exact disposable process and profile were removed afterward.

## Packaging decisions and diagnosis

Electron 44.1.1 and Forge 7.11.2 are exactly pinned. Forge uses its documented `@electron-forge/core` packaging API against a plain dependency closure, avoiding a repository-wide pnpm hoisting change. The latest successful package uses `app.asar`, with native `.node` binaries unpacked as real files. This follows Electron's [ASAR packaging guidance](https://www.electronjs.org/docs/latest/tutorial/asar-archives); the original no-ASAR cold start missed the fixed startup deadline. The direct native-binary checks passed against the final archive-based package.

Forge's Node-gyp Git subdependency is overridden to Electron's published `10.2.0-electron.2` package, retaining pnpm's exotic-subdependency protection. The ZIP reader is scoped to `yauzl` 3.4.0 under `extract-zip` 2.0.1: the old reader reproduced [Node 24.16 ZIP extraction failure](https://github.com/nodejs/node/issues/63487) and exited with an unsettled promise before copying the application. The updated reader retains the callback API and modernizes stream cleanup. The repository Node pin remains unchanged.

## Required final acceptance

- [x] Packaged executable launches outside the checkout; built UI and native SQLite/keyring work.
- [x] Hide/reopen preserves the draft; both X policies and explicit Quit release only the owned service.
- [x] Save/Discard/Cancel and failed-save behavior verified in the built desktop UI.
- [x] Duplicate launch, port conflict, tray menu/icon, worker failure/retry, and unavailable renderer checked.
- [x] Windows session-end handling checked without terminating the user's live session.
- [x] Windows CI job added and local equivalent passes; hosted CI itself requires later publication.
- [x] Final lint, typecheck, unit tests, build, Storybook build/tests, browser E2E, desktop tests, and strict OpenSpec validation pass.

Physical-device audio playback is not part of this foundation's acceptance and has not been exercised.

## Paused execution / next gate

Desktop foundation is partially complete, not accepted. Audio routing has not started because its approved plan requires verified desktop acceptance first. Keep both changes unarchived and do not publish this work as ready.

The desktop foundation is accepted: the native shutdown mitigation, automated failure/duplicate/session-end/frontend matrices, final gates, and human tray interaction all passed. Preserve the 20-second startup and 10-second service-stop bounds. Distribution residuals remain deferred to BL-030; the dependent audio-routing change can now proceed.

Residual temporary directories use only these test-owned prefixes under the Windows temporary directory: `stream-jams-desktop-smoke-`, `stream-jams-utility-test-`, and `stream-jams-native-close-`. Some contain locked files from exited processes; remove only verified test paths after their handles are released. No live user profile or credential entry is an authorized cleanup target.

## Opt-in shutdown evidence (September 8)

The local desktop build supports `STREAM_JAMS_SHUTDOWN_LOG`. Leave it unset for normal use. To investigate a future slow Quit, choose a **new absolute JSONL filename in an existing directory** and start the app from that shell. A running instance must first quit normally: a duplicate launch cannot enable logging in its already-running owner. For example, from the repository root in a normal, non-administrator PowerShell session:

```powershell
$diagnosticLog = Join-Path $env:TEMP ("stream-jams-quit-" + [guid]::NewGuid().ToString() + ".jsonl")
$env:STREAM_JAMS_SHUTDOWN_LOG = $diagnosticLog
& '.\apps\desktop\out\Stream Jams-win32-x64\Stream Jams.exe'
```

Exercise the normal workflow and choose Quit when ready. Afterwards, remove only the shell's opt-in setting with `Remove-Item Env:\STREAM_JAMS_SHUTDOWN_LOG`; this does **not** remove the evidence file. Use a different filename for each launch. Do not change the live profile or remove its files to enable diagnostics.

Records contain only a version, random launch identity, PID, quit-attempt number, sequence, UTC/monotonic timestamps and fixed phase names. `quit-requested` without an accepted/cancelled decision can mean the user or renderer has not answered; it is not consent to stop. Service completion reflects the existing worker-exit promise. `electron-quit` is a JavaScript lifecycle event, **not proof the native processes exited**. Missing/truncated records remain unknown evidence, including when final asynchronous writes do not reach disk.

Logging opens exclusively, never overwrites existing evidence, silently disables on unavailable/relative paths or write errors, and accepts at most 256 records / 64 KiB per launch including queued writes. It does not await disk completion, create directories, rotate/delete logs, recover old attempts or force exit. Developers manage retention manually after confirming exact profiles/process ownership. Existing persistent sessions, edit decisions, tray policy and worker timeout are unchanged.

### Silent staged developer comparison

After `corepack.cmd pnpm desktop:package`, run `corepack.cmd pnpm exec node scripts/diagnose-desktop-shutdown.mjs` in the known-working normal-user launch context. Default outputs are the exact labels `System (Elgato Virtual Audio)` and `SFX (Elgato Virtual Audio)`. To use another pair, set `STREAM_JAMS_AUDIO_TEST_OUTPUTS` to two exact labels separated by `|`, as for existing desktop audio tests. Missing/ambiguous/default-only outputs fail; no device fallback or Windows mixer change is made.

The runner creates isolated profiles under ignored `dist/diagnostics/bl044-staged-*`, launches plain Electron at the manifest version, and compares `windows → audio → service → service → audio → windows`. Both windows remain hidden and persistent; hardware acceleration remains disabled and Chromium sandboxing enabled. Each sample dwells seventy seconds. Audio samples use one second of all-zero PCM **and volume zero**, individually on each endpoint and combined. They do not test audibility or channel meters.

The first two stages import no application runtime; the third adds the real bundled utility service with lifecycle-only audio acknowledgements, not the production alert coordinator. Management is a static local page, not the product UI. The packaged `shutdown-diagnostics.spec.ts` separately checks actual Cancel/Discard cleanup and the phase log. The runner records captured process IDs, native exit timing, listener refusal and DIPS file metadata; a failure stops subsequent launches, retains evidence and never invokes forced cleanup. A passing sample does not resolve BL-044. This command is deliberately not part of routine CI and requires the two configured audio endpoints.

### Next evidence needed for BL-044 closure

The [debugger-free retained-profile controls](alert-audio-routing.md#september-8-debugger-free-retained-profile-controls) also passed, but no matching slow exit occurred. The next useful check is a representative real-use streaming session with the opt-in log enabled, not another identical short synthetic batch. Record the build, session duration, workflow/output selections and UTC time of the normal Quit request. Do not log secret overlay URLs, credentials or provider payloads.

If Quit is slow, retain the log and identify the owned native processes by PID, executable path and start time; a final `electron-quit` record alone cannot establish exit. Separate a pending user decision, failed/incomplete service stop and post-Electron native delay. Preserve the instance for a separately approved targeted trace when practical; do not force-stop it or change vendor/security settings without permission. Missing log records are inconclusive. Closure requires evidence connecting a reproducible failure to a specific cause, followed by a focused fix and verification under those conditions plus state-preservation/lifecycle regressions. The diagnostics PR itself does not satisfy that gate.
