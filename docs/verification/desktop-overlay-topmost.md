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

The isolated native fixture must demonstrate a covered negative-control baseline, then candidate recovery within its one-second measurement deadline while the competitor remains foreground. Inspect its attachments for User32 rank, styles, focus, actual desktop composition and native input delivery. Missing interactive session, capture or input evidence is a limitation, never physical acceptance. See `tests/desktop/overlay-topmost.spec.ts` for fixture evidence and launch requirements.

For ordering-only evidence when the session is locked, use `corepack.cmd pnpm test:desktop:topmost --grep 'background native order'`. This separate scenario creates non-activating owned windows and checks relative native ordering, styles, unchanged foreground and teardown. It sends no input, takes no screen capture, and does not replace the full interactive fixture. Successful runs retain `native-topmost-evidence.json` in their Playwright output directory.

## Automated results — 2026-10-02

The candidate is on `codex/desktop-overlay-topmost-recovery`. Production recovery uses a single 100 ms non-activating fallback while ready and visible, plus recovery before valid playback-start dispatch. Hidden, loading, interrupted and disposed surfaces are guarded; these checks do not promise exclusive-fullscreen visibility.

| Check | Result |
| --- | --- |
| Regression-first focused tests | Three new regressions failed before implementation; final focused pair 20 passed |
| Affected desktop unit suite | 16 files, 176 passed |
| Game-runner unit tests | 17 passed, including observer crash/early-exit/cancellation and owned cleanup |
| Workspace build and Windows packaging | Passed |
| Desktop test TypeScript, touched-code ESLint, error provenance, strict OpenSpec validation | Passed |
| Packaged production overlay-host test | Passed: isolated silent playback, original lifetime and normal native exit |
| Background native order | Passed: baseline remained covered across 63 observations; six actual overtakes recovered in 29.35–100.30 ms, foreground unchanged |
| Interactive native focus/input/compositor checks | **Blocked:** foreground was Windows `LockApp`; no unlocking or input bypass attempted |
| Control DX11/DX12 physical acceptance | **Pending:** user unavailable |

The native measurements are six observations on this machine with the session locked, not a performance guarantee or evidence of physical game visibility. The first fixture attempt exposed an Electron startup deadlock from top-level await; the next exposed the difference between Playwright's launcher PID and Electron's native window-owner PID. Both test defects were corrected and narrow identity checks passed. The later foreground failure was traced to `LockApp`; full interactive checks remain pending. One independent review found an observer-interruption false-success bug; terminal-state handling and four regression tests corrected it.

Local evidence is retained under `.superpowers/sdd/2026-10-02-desktop-overlay-topmost-recovery/`: `native-order-evidence.json`, `packaged-host-evidence.json`, `packaged-host-shutdown.jsonl`, worker reports, and identity/foreground diagnostics. The packaged host exited with code 0; no owned candidate or probe process remained. The tested `resources/app.asar` SHA-256 is `a9a288b735b245bff0b3cef27c526ccafd353dc35fbc7f40422debcaa07f626c`; the staged and tested `overlay-window.js` hashes matched. The package is available locally under `apps/desktop/out/Stream Jams-win32-x64`; the installed application was not replaced.

## Prepared Control runner

No Control test or live effect was run unattended. Launch an isolated candidate with its own profile/database and explicit loopback port. Preserve the installed app and game. Record the candidate build identity and its overlay process PID from the candidate launch; do not infer the candidate from the title alone. Use the candidate's port, not the installed baseline port. The exact overlay title is `Stream Jams desktop overlay`; supported game executables are `Control_DX11` and `Control_DX12`.

The candidate folder is `apps/desktop/out/Stream Jams-win32-x64`, produced by `corepack.cmd pnpm desktop:package`. Use this launch block from the worktree to keep its data isolated. It selects a free loopback port and prints the launch information. Configure the candidate's desktop display and save a neutral Screen Effect there before the game run. The launcher PID can differ from Electron's main/window-owner PID; use the observer's matching window PID, verified against this executable path.

```powershell
$candidateExe = (Resolve-Path 'apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe').Path
$candidateRoot = Join-Path (Get-Location) ('.superpowers/candidate-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $candidateRoot -Force | Out-Null
$portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$portProbe.Start()
$candidatePort = $portProbe.LocalEndpoint.Port
$portProbe.Stop()
$candidateConfig = Join-Path $candidateRoot 'config.json'
$candidateSettings = @{
  server = @{ host = '127.0.0.1'; port = $candidatePort }
  storage = @{ dataDirectory = (Join-Path $candidateRoot 'data'); assetDirectory = (Join-Path $candidateRoot 'assets') }
} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($candidateConfig, $candidateSettings, [Text.UTF8Encoding]::new($false))
$oldConfig = $env:STREAM_JAMS_CONFIG_PATH
$oldProfile = $env:STREAM_JAMS_DESKTOP_USER_DATA_PATH
try {
  $env:STREAM_JAMS_CONFIG_PATH = $candidateConfig
  $env:STREAM_JAMS_DESKTOP_USER_DATA_PATH = Join-Path $candidateRoot 'electron'
  $candidateProcess = Start-Process -FilePath $candidateExe -WindowStyle Hidden -PassThru
  [pscustomobject]@{ launcherPid = $candidateProcess.Id; port = $candidatePort; profile = $candidateRoot; executable = $candidateExe }
} finally {
  $env:STREAM_JAMS_CONFIG_PATH = $oldConfig
  $env:STREAM_JAMS_DESKTOP_USER_DATA_PATH = $oldProfile
}
```

Observe-only example (replace the candidate port and PID with the launch values):

```powershell
node scripts/desktop-overlay-game-check.mjs --base-url http://127.0.0.1:39188 --overlay-pid 12345 --timeout-ms 30000 > game-order.json
```

Observe-only requests `/health` and reads its owned native observer; it creates no management session, triggers no effect, and does not query protected playback state. Without `--overlay-pid`, multiple matching overlay windows fail ordering evidence and prevent triggering. A selected PID is revalidated by the native observer each sample.

Explicit one-effect test (replace identifiers with a saved, enabled candidate effect and variant; no local IDs are committed):

```powershell
node scripts/desktop-overlay-game-check.mjs --base-url http://127.0.0.1:39188 --overlay-pid 12345 --timeout-ms 30000 --trigger --effect-id SAVED_EFFECT_ID --variant-id SAVED_VARIANT_ID > game-effect.json
```

Focus Control yourself during the finite window. The runner never focuses, sends input to, kills or reconfigures the game or app. After a focused live game and unambiguous overlay sample it authenticates, then checks another focused sample whose monotonic timestamp is beyond a conservative post-authentication process-launch threshold before issuing one normal saved-effect test. Buffered pre-authentication samples cannot trigger playback. Credentials stay in memory and are omitted from reports/errors. The HTTP origin must be literal loopback HTTP without credentials, path, query or fragment; redirects are rejected. Timeout is 1–300 seconds, native sampling approximately 100 ms, HTTP calls at most three seconds, and observer reaping at most two seconds per attempt. On completion, cancellation or failure, the observer is stopped. Only the created screen-effects occurrence can be stopped: `/skip` if current, `/remove` if queued. Other playback and queues are untouched. A cleanup failure is explicit and requires checking that single occurrence manually.

`ordering.status=pass` requires every focused game sample to have exactly one visible, live, overlapping selected overlay above it in User32 order with no-activate and transparent input styles. Handles, owning PIDs and process start identity are rechecked each native sample. Reports include bounds, ranks, foreground handle, styles, game executable and monotonic relative time, without unrelated window titles or command lines. Any sample with the selected overlay as foreground fails focus preservation, even if other samples show the game focused. Every focused sample must satisfy ordering; a transient occlusion can therefore fail the run despite eventual recovery. No focused game means `incomplete`; no matching overlay or ambiguous overlays cannot pass. This sampling can miss brief transitions and is not a latency guarantee. `playback` separately records only the triggered occurrence status. Successful admission or `playing` does not prove video/audio delivery. `playbackOutcome.status=pass` requires the own occurrence observed `playing` or `completed`; only queued/not-observed/skipped evidence is incomplete, and failed/cancelled evidence fails even after an earlier playing observation. The production operation enum currently has queued, playing, completed, skipped and failed; cancelled is defensively treated as failure. Any incomplete/failed trigger outcome exits nonzero.

## Remaining physical acceptance

After unlocking, run `corepack.cmd pnpm test:desktop:topmost` to complete the interactive fixture. Then run **DX11 borderless and DX12 borderless** separately with the built candidate. During each run, confirm the actual effect is visible over Control on the monitor, audible on the intended device, and gameplay keyboard/mouse input continues uninterrupted. Include an already-focused reorder/Alt-Tab cycle and note perceptible flicker or delay. This physical observation remains pending even after native fixture or runner success. Exclusive fullscreen is optional investigation and has no promised support; protected desktops and exclusive scanout may bypass normal desktop composition.


Observer lifecycle is part of the result: `observerTerminal` records its code, signal, elapsed time and termination reason. A nonzero exit or clean exit before the requested observation deadline fails the run even if earlier samples passed. Explicit Ctrl+C/SIGTERM cancellation also fails. The runner's expected deadline shutdown can succeed only with the required native/playback evidence; it never turns an observer crash or incomplete observation into success.
