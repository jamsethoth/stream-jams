# Desktop overlay topmost verification

The candidate uses non-activating order recovery. Automated native order, desktop compositor capture, playback bookkeeping, and physical monitor/audio/input observations are separate evidence. A native topmost flag alone does not prove visibility.

## Owned native regression

From the worktree after building the desktop package:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
corepack.cmd pnpm test:desktop:topmost
node --test scripts/desktop-overlay-game-check.test.mjs
node node_modules/eslint/bin/eslint.js scripts/desktop-overlay-game-check.mjs scripts/desktop-overlay-game-check.test.mjs
```

The isolated native fixture must demonstrate a covered negative-control baseline, then candidate recovery within its one-second measurement deadline while the competitor remains foreground. Leave keyboard and mouse idle during this short interactive test. It may activate its own competitor using a native click only after checking the target HWND and owner PID; it restores the cursor afterward. The input assertion clears earlier activation events before testing click-through and F8 delivery. Inspect its attachments for User32 rank, styles, focus, actual desktop composition and native input delivery. Missing interactive session, capture or input evidence is a limitation, never physical acceptance. See `tests/desktop/overlay-topmost.spec.ts` for fixture evidence and launch requirements.

For ordering-only evidence when the session is locked, use `corepack.cmd pnpm test:desktop:topmost --grep 'background native order'`. This separate scenario creates non-activating owned windows and checks relative native ordering, styles, unchanged foreground and teardown. It sends no input, takes no screen capture, and does not replace the full interactive fixture. Successful runs retain `native-topmost-evidence.json` in their Playwright output directory.

## Automated results — 2026-10-02

The candidate is on `codex/desktop-overlay-topmost-recovery`. Production recovery uses a single 100 ms non-activating fallback while ready and visible, plus recovery before valid playback-start dispatch. Hidden, loading, interrupted and disposed surfaces are guarded; these checks do not promise exclusive-fullscreen visibility.

| Check | Result |
| --- | --- |
| Regression-first focused tests | Three new regressions failed before implementation; final focused pair 20 passed |
| Affected desktop unit suite | 16 files, 176 passed |
| Game-runner unit tests | 20 passed, including observer crash/early-exit/cancellation and owned cleanup |
| Workspace build and Windows packaging | Passed |
| Desktop test TypeScript, touched-code ESLint, error provenance, strict OpenSpec validation | Passed |
| Packaged production overlay-host test | Passed: isolated silent playback, original lifetime and normal native exit |
| Background native order | Passed: baseline remained covered across 63 observations; six actual overtakes recovered in 29.35–100.30 ms, foreground unchanged |
| Native compositor capture | Passed in a narrow owned-window check: covered baseline `#123456`, candidate `#ff00ff`; all owned PIDs exited |
| Interactive native focus/input fixture | **Passed:** covered baseline, six candidate trials, compositor pixels, preserved competitor focus, native click/F8 delivery, and teardown |
| Control DX12 borderless physical acceptance | **Passed:** user confirmed “Video visible; input worked normally” |
| Control DX11 and exclusive fullscreen | Not tested |

The background native measurements are six observations on this machine with the session locked, not a performance guarantee or evidence of physical game visibility. Fixture defects found and corrected include Electron startup blocked by top-level await, launcher PID differing from native window-owner PID, background activation denied by Windows, and .NET rejecting combined screenshot flags. The capture helper now uses native GDI `BitBlt(SRCCOPY | CAPTUREBLT)` with balanced DC cleanup. One independent review found an observer-interruption false-success bug; terminal-state handling and four regression tests corrected it.

The attended DX12 run automatically triggered one silent neutral effect in the isolated candidate. The runner recorded playback playing/completed, ordering pass in two assessed focused-game samples, and completed-occurrence cleanup. The user independently confirmed visible video and normal gameplay input; the candidate then exited. The original observer took roughly eight seconds per pass because it queried processes for every desktop HWND. Its sparse samples do not establish recovery latency or absence of brief flicker. After moving process lookup outside the HWND callback, a separate three-second read-only check produced 20 samples, mean interval 145.29 ms and maximum 187.73 ms. These are measured observer intervals, not a production recovery guarantee. The physical run was not repeated with the faster observer.

Local evidence is retained under `.superpowers/sdd/2026-10-02-desktop-overlay-topmost-recovery/`: `native-order-evidence.json`, `packaged-host-evidence.json`, `packaged-host-shutdown.jsonl`, worker reports, and identity/foreground diagnostics. The packaged host exited with code 0; no owned candidate or probe process remained. The tested `resources/app.asar` SHA-256 is `a9a288b735b245bff0b3cef27c526ccafd353dc35fbc7f40422debcaa07f626c`; the staged and tested `overlay-window.js` hashes matched. The package is available locally under `apps/desktop/out/Stream Jams-win32-x64`; the installed application was not replaced.

The full interactive fixture passed after the user switched to Codex and left input idle. Earlier runs could not retain the owned competitor's foreground while Control was active; those failures were retained without relaxing assertions. In the passing run the baseline stayed covered for 64 samples. All six candidate trials ended above the competitor with unchanged foreground, five observed actual occlusion before recovery (35.60–87.26 ms), and one had already recovered at the first 10.80 ms observation. The compositor crops show the expected covered blue baseline and visible magenta candidate. Fresh renderer events confirmed a native left click and F8 through the overlay; teardown remained absent after the delayed check. These controlled measurements do not promise a worst-case recovery bound for games.

Attended evidence is also retained in the local ledger: `interactive-native-topmost-evidence.json`, `interactive-*-compositor.png`, `control-run-1790977500063.json`, `control-dx12-user-acceptance.json`, and `control-observer-cadence.jsonl`.

## Prepared Control runner

The Control test was attended. Launch an isolated candidate with its own profile/database and explicit loopback port. Preserve the installed app and game. Record the candidate build identity and its overlay process PID from the candidate launch; do not infer the candidate from the title alone. Use the candidate's port, not the installed baseline port. The exact overlay title is `Stream Jams desktop overlay`; supported game executables are `Control_DX11` and `Control_DX12`.

The candidate folder is `apps/desktop/out/Stream Jams-win32-x64`, produced by `corepack.cmd pnpm desktop:package`. The attended run used Playwright's `_electron.launch` with this executable, an isolated `STREAM_JAMS_CONFIG_PATH`, isolated `STREAM_JAMS_DESKTOP_USER_DATA_PATH`, and `ELECTRON_RUN_AS_NODE` removed from the child environment. The actual owner PID came from `desktop.evaluate(() => process.pid)`. Startup waited for the isolated service's `/health`; shutdown called the candidate's `app.quit()` and verified exit. The generic PowerShell `Start-Process` launch exited before health in this session and is not a verified handoff path.

The prepared profile and tested launch/trigger script are retained locally in `.superpowers/sdd/2026-10-02-desktop-overlay-topmost-recovery/`; see `USER-RETURN.md` and `run-control-candidate.mjs`. The latter automatically runs one saved neutral effect after Control is focused and closes the candidate afterward. For a new profile, select a free loopback port, keep the config/database/assets/Electron user data isolated, configure its desktop display, and save a neutral Screen Effect before running the observer. The launcher PID can differ from Electron's main/window-owner PID.

Observe-only example (replace the candidate port and PID with the launch values):

```powershell
node scripts/desktop-overlay-game-check.mjs --base-url http://127.0.0.1:39188 --overlay-pid 12345 --timeout-ms 30000 > game-order.json
```

Observe-only requests `/health` and reads its owned native observer; it creates no management session, triggers no effect, and does not query protected playback state. Without `--overlay-pid`, multiple matching overlay windows fail ordering evidence and prevent triggering. A selected PID is revalidated by the native observer each sample.

Explicit one-effect test (replace identifiers with a saved, enabled candidate effect and variant; no local IDs are committed):

```powershell
node scripts/desktop-overlay-game-check.mjs --base-url http://127.0.0.1:39188 --overlay-pid 12345 --timeout-ms 30000 --trigger --effect-id SAVED_EFFECT_ID --variant-id SAVED_VARIANT_ID > game-effect.json
```

Focus Control yourself during the finite window. The runner never focuses, sends input to, kills or reconfigures the game or app. After a focused live game and unambiguous overlay sample it authenticates (explicit `--overlay-pid` also permits zero current overlay windows because the candidate creates its first overlay lazily), then checks another focused sample whose monotonic timestamp is beyond a conservative post-authentication process-launch threshold before issuing one normal saved-effect test. Buffered pre-authentication samples cannot trigger playback. Credentials stay in memory and are omitted from reports/errors. The HTTP origin must be literal loopback HTTP without credentials, path, query or fragment; redirects are rejected. Timeout is 1–300 seconds, native sampling with a 100 ms sleep plus process/window enumeration time, HTTP calls at most three seconds, and observer reaping at most two seconds per attempt. On completion, cancellation or failure, the observer is stopped. Only the created screen-effects occurrence can be stopped: `/skip` if current, `/remove` if queued. Other playback and queues are untouched. A cleanup failure is explicit and requires checking that single occurrence manually.

`ordering.status=pass` requires every focused game sample to have exactly one visible, live, overlapping selected overlay above it in User32 order with no-activate and transparent input styles. Handles, owning PIDs and process start identity are rechecked each native sample. Reports include bounds, ranks, foreground handle, styles, game executable and monotonic relative time, without unrelated window titles or command lines. Any sample with the selected overlay as foreground fails focus preservation, even if other samples show the game focused. Observe-only checks every focused sample. Trigger mode retains all samples but begins ordering assessment at the first visible matching candidate overlay, reported as `ordering.assessmentStartMs`; precreation absence does not fail ordering. Once assessment begins, every focused sample must satisfy ordering; a transient occlusion can therefore fail the run despite eventual recovery. A preexisting visible covered overlay starts assessment immediately and remains a failure even if later samples recover. If no matching visible overlay ever appears, trigger ordering is incomplete; a wrong/nonexistent selected PID can never pass. No focused game means `incomplete`; no matching overlay or ambiguous overlays cannot pass. This sampling can miss brief transitions and is not a latency guarantee. `playback` separately records only the triggered occurrence status. Successful admission or `playing` does not prove video/audio delivery. `playbackOutcome.status=pass` requires the own occurrence observed `playing` or `completed`; only queued/not-observed/skipped evidence is incomplete, and failed/cancelled evidence fails even after an earlier playing observation. The production operation enum currently has queued, playing, completed, skipped and failed; cancelled is defensively treated as failure. Any incomplete/failed trigger outcome exits nonzero.

## Remaining physical acceptance

DX12 borderless video and gameplay input passed with the user, and the separate interactive native fixture passed. The neutral effect was silent, so this run supplies no audio-delivery evidence. DX11 borderless, a deliberate game Alt-Tab/reorder cycle and flicker observation remain untested. Exclusive fullscreen is optional investigation and has no promised support; protected desktops and exclusive scanout may bypass normal desktop composition.


Observer lifecycle is part of the result: `observerTerminal` records its code, signal, elapsed time and termination reason. A nonzero exit or clean exit before the requested observation deadline fails the run even if earlier samples passed. Explicit Ctrl+C/SIGTERM cancellation also fails. The runner's expected deadline shutdown can succeed only with the required native/playback evidence; it never turns an observer crash or incomplete observation into success.
