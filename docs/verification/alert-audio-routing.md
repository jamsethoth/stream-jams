# Alert audio routing capability evidence

Current implementation checkpoint (September 7): production routing, queue/player safety, authoring, backup/activity protection and diagnostics have been integrated. See the [authoring and acceptance record](alert-audio-routing-authoring-acceptance.md) for automated verification and the remaining final physical-device/OBS matrix. The evidence below remains historical capability evidence, not acceptance of the final integrated build. BL-044 remains separately owned and deferred; native shutdown deadlines are unchanged.

Latest shutdown update: the user subsequently reopened BL-044 investigation. See [September 7 resumed investigation](#september-7-resumed-shutdown-investigation-and-test-only-dialog-repair); the earlier deferral and raw-artifact retention statements below are historical. The previous machine-wide traces, kernel dump, and manual/assisted QA profiles were purged with user approval after the feature merge. Written findings and committed regressions remain; the original native cause is not resolved.

Capability decision (September 5 local / September 6 UTC): the initial packaged device-capability gate was accepted and OpenSpec tasks 1.3/1.4 completed. Earlier permission/isolation, background, independent/combined System/SFX and restart evidence was supplemented by two physical XLR Dock removal/reconnect runs with continuing SFX delivery, same-binding fresh playback and normal shutdown. The user confirmed the SFX meter and recovery tone on the repeat. The approved Electron implementation could continue; no alternate backend or fallback destination was required. See [physical removal and capability acceptance](#september-5-physical-removal-and-capability-acceptance) for that evidence and its limitations. Dated sections below preserve the status at each earlier checkpoint.

## September 4, 2026: packaged Windows capability gate

Status at this September 4 checkpoint: incomplete. OpenSpec tasks 1.3 and 1.4 remained open, blocking route persistence, queue integration and management controls. The current acceptance decision above supersedes this historical status.

Electron 44.1.1 with the isolated `stream-jams-audio://player/` session enumerated 11 explicit output endpoints without media/microphone permission. Electron supplies a trailing slash in the custom security origin; the permission allowlist was corrected to match the observed exact value. `selectAudioOutput` is unavailable in this build, but speaker-selection permission enables explicit enumeration and `setSinkId`.

The non-audible packaged test passed origin, preload isolation, sandbox, hidden window, disabled background throttling, and explicit output filtering. Sink failure, cancellation during sink selection, initial mute, and permission policy have five passing unit tests.

The user authorized gentle one-second tones on Headphones (Elgato XLR Dock) and SFX (Elgato Virtual Audio). The packaged playback test completed sink selection, play, ended, and media cleanup for each endpoint independently and for both together while native management close hid the window to tray. Actual audibility and isolation at the downstream endpoints still require user confirmation. Successful media promises alone are not physical-output proof.

The first audible attempt stopped before playback because the test used renderer `window.close()`; it now uses native `BrowserWindow.close()` and asserts that management remains alive and hidden. Subsequent playback attempts reached shutdown but failed the 15-second process-exit observation, before restarting or emitting the fourth tone.

The latest diagnostic run logged the first before-quit event at 5851 ms, all windows closed at 5894 ms, and will-quit/quit at 5926 ms. The service listener stopped within its 10-second bound. Native process exit was not observed within 15 seconds. This narrows the problem to the process-exit stage after Electron's application shutdown events; the underlying native cause is not yet established. Do not classify the restart check as passed or resolve it by merely increasing the timeout.

The user heard the three tones in headphones but noted that their mixer may route SFX there too. Audibility is confirmed; destination isolation remains unverified.

## Follow-up investigation

Diagnostic probes used isolated profiles and silent PCM samples at zero volume. No production code was changed during this investigation.

| Control | Observed exit |
| --- | --- |
| Full packaged app, no enumeration/playback | Success, about 13 seconds after Quit |
| Full packaged app, enumeration only | Success, about 2.8 seconds |
| Full packaged app, one silent SFX playback, first run | Still running after 20 seconds; probe cleanup required |
| Minimal hidden player, direct native launch without Playwright/server/management | Success, total runtime under 3 seconds |
| Same minimal player with Playwright | Success, total runtime about 3.1 seconds |
| Full packaged app, same single silent SFX playback, later run | Success, about 0.29 seconds after Quit |
| Full packaged app, hidden management, silent Headphones/SFX/combined sequence | Success, about 0.70 seconds after Quit |

Playwright's launched process is a Windows cmd.exe wrapper; Electron app metrics identify the actual browser-process PID. During the slow playback probe, the actual Electron process also remained, so the failure cannot be attributed solely to the wrapper or Playwright close-event bookkeeping. Subsequent inspection found the management renderer and video-capture utility still present while the audio utility had disappeared. Those remaining processes later disappeared as well. This rules out claiming that an audio-service process was proven to be the blocker.

Conclusion: intermittent native process teardown delay on this machine is reproduced, but its underlying native cause is not established. Neither device enumeration, playback, hidden management, nor Playwright alone consistently triggers it. The same packaged code completed the original hidden/two-output sequence and exited promptly in a later control. This is not a verified fix and does not justify increasing acceptance deadlines. A future failing run needs a timed process tree and native wait-chain or stack capture before cleanup to identify the blocked subsystem; current JavaScript lifecycle logs have reached their diagnostic limit.

Outstanding: diagnose intermittent native process exit; verify restart and stable explicit bindings; establish output isolation with mixer meters; perform coordinated unplug/replug verification. No OBS settings or live profile were modified. No downstream routing implementation has been started beyond this capability boundary.

## Five-repetition follow-up

At the user's request, the existing packaged two-device test was run five times sequentially with `--repeat-each=5 --workers=1 --retries=0`. The 15-second exit and 10-second listener-stop limits were unchanged. Total runtime was 6.7 minutes; Playwright reported one pass and four failures.

| Repetition | Result | Classification |
| --- | --- | --- |
| 1 | Failed before playback: the page selected as management had the hidden audio-player URL | Startup/window-selection failure, not evidence of the post-playback exit timeout |
| 2 | Three playback phases completed; service stopped; Electron emitted quit; process-close event exceeded 15 seconds | Original shutdown blocker reproduced |
| 3 | Independent and combined playback, shutdown, restart, and combined playback after restart completed | Test passed |
| 4 | Three playback phases completed; service stopped; Electron emitted quit; process-close event exceeded 15 seconds | Original shutdown blocker reproduced |
| 5 | No playback phase logged; final reported error was EBUSY removing the isolated test profile | Cleanup failure; not counted as a confirmed post-playback timeout |

The user's condition for recording the issue as not reproduced was not met. The original blocker recurred in two of five attempts (two of the three that reached playback). It remains an unresolved intermittent known issue, tracked as [BL-044](../backlog.md#known-issues). The other two failures are preserved separately rather than counted as shutdown reproductions or successful controls. No production code or test assertions were changed for this batch.

## Root-cause investigation: startup harness and native shutdown

### Startup and cleanup: confirmed harness defects

- `tests/desktop/audio-routing.spec.ts` treats `desktop.firstWindow()` as the management page. The installed Playwright 1.61.0 implementation returns the first page in its arrival-ordered window set, or the next `window` event. It does not identify the management window. With the additional hidden audio window, this is a race; the five-run batch actually selected `stream-jams-audio://player/` as management. Select by the expected management URL instead, including after restart.
- `audioPlayer()` waits for the page URL, but not for `streamJamsAudioCapability` to be initialized. A diagnostic probe observed the missing API. URL arrival is not an application-ready condition. This is a separate readiness race.
- The `finally` profile removal can throw EBUSY and replace the original test exception. That explains loss of diagnostic information, but does not prove which original failure occurred in repetition 5. Its exact initiating error cannot be recovered from that batch's output. Opt-in diagnostics now print the original error before cleanup and collect owned native process wait chains after playback failures.

### Shutdown: native blocking operation identified; storage trigger unresolved

Two instrumented repetitions reproduced the exit timeout. Windows wait-chain snapshots did not resolve a deadlock: one caught processes already in exit-status-zero rundown, another caught the browser still active while children were terminating. These are different stages of the same shutdown observation, not proof that the audio service caused it.

A subsequent bounded elevated Windows Performance Recorder CPU trace captured the failure with zero lost events. Recording was stopped and verified inactive. Its matching Electron Breakpad module ID was checked against the packaged executable: `E576D66B49E136884C4C44205044422E1`. Symbols came from the official Electron 44.1.1 symbol archive; Windows kernel and NTFS PDBs were matched to the installed images.

Concrete trace evidence (milliseconds relative to trace start):

- Browser PID 187688 began at 19649.036 and stopped with status 0 at 67388.674. The real Electron process, not just Playwright's cmd wrapper, remained alive.
- `CrBrowserMain` (TID 29824) was off CPU from 40880.997 until approximately 56265.725, a 15.385-second wait during Chromium thread-pool shutdown.
- The exact ready-thread event at **56265.7108** was caused by background worker TID **212744** calling `base::internal::TaskTracker::DecrementNumItemsBlockingShutdown()` -> `base::WaitableEvent::Signal()`. This directly identifies completion of a shutdown-blocking task as the event that released the browser thread.
- That worker's captured task stack was `content::BtmDatabase::SetTimerLastFired` -> `SetConfigValue` -> Chromium SQLite transaction commit -> `walFrames` / `winWrite`. Kernel stacks on the same worker show `NtfsWaitOnIo`, noncached writes and cache flushing. This is Chromium's internal database, **not Stream Jams' server SQLite database or an audio playback callback**.
- A separate foreground worker performed `ImportantFileWriter` atomic file replacement; its NTFS stacks included `NtfsCheckpointForLogFileFull`. This supplies additional filesystem-pressure evidence, but does not mean the disk itself was full or prove the cause of the background database write delay.

An intermediate interpretation that the long wait was joining `ThreadPoolServiceThread` was corrected: that thread had already reached native termination around 40880.96. A nearby join stack describes an adjacent shutdown step; the exact wake event identifies the later task-tracker wait. Likewise, Defender appears in a nearby process-open stack, but that alone does **not** establish an antivirus root cause.

Conclusion: the captured shutdown blocker is Chromium waiting for its internal database work to finish while that work encounters slow Windows filesystem I/O. The lower-level reason for the I/O delay, and whether every earlier timeout had this same cause, remain unproven. WPR itself adds I/O, so this trace must not be treated as a clean storage-performance benchmark. Do not disable security software, increase acceptance deadlines, or classify the feature as fixed based on these findings.

Local raw evidence and one-off analysis helpers are retained under ignored `dist/diagnostics/native-exit-trace-20260904/` (about 3.4 GiB for the ETL, plus symbols). They are outside Playwright's disposable results directory. The ETL is machine-wide and can contain unrelated process/file metadata: do not publish it without review. `focused-stacks.txt` and `electron-symbols.txt` preserve the relevant extracted stacks and symbol mappings. No production behavior was changed during this investigation.

Next diagnostic boundary: a narrowly scoped file-I/O capture or controlled storage-location comparison is needed to identify why those native writes stall, without changing security settings. The startup harness corrections can be implemented independently; neither correction resolves the native storage wait.

## September 5: harness corrections and file-I/O capture

Implemented test-only corrections in `tests/desktop/audio-routing.spec.ts` and `audio-harness.ts`: select windows by exact URL on both launches, wait for both audio API methods, preserve original and cleanup exceptions in an AggregateError, and retain isolated profiles when owned process exit cannot be confirmed. Native Quit retains its 15-second observation deadline; cleanup no longer converts a timeout into success by falling back to forced close. No production session or audio behavior changed.

Verification:

- The extracted old selection/cleanup behavior failed three of four targeted harness regressions for the expected reasons. The corrected helper passed all four, including a real child process preventing profile deletion.
- Focused ESLint and strict standalone TypeScript checks passed (`tsc --ignoreConfig --types node` with strict/null/index/optional checks). Initial standalone compiler invocations needed these TypeScript 6 command-line options; this was a verification-command issue, not a code failure.
- The packaged non-audible isolation/enumeration/hide check passed in 15.3 seconds, exercising URL selection and audio API readiness.
- The approved playback reproduction completed the three pre-restart phases but failed the original exit deadline. The report preserved both that exception and the cleanup timeout. It retained the profile in the operator's temporary directory as `stream-jams-audio-playback-bzKXJ2`. Restart acceptance remains failed/unperformed in this run.

Used an available Windows Performance Recorder custom file-I/O profile instead of installing Process Monitor: file/process/disk events only, no CPU or context-switch stack collection, buffered in 256 MiB of memory and saved after the bounded 60-second recording. The saved ETL is 223,346,688 bytes, with zero lost events. This reproduced the stall without continuously writing a multi-gigabyte trace to the same disk. Recorder transcript confirms successful stop; subsequent process inspection found none of the captured app PIDs or recorder remaining.

New evidence:

- Browser PID 133252 issued slow writes to **the default management session's `electron\DIPS-wal`**, not `electron\Partitions\stream-jams-audio\DIPS*` or the server database. Therefore changing only the audio partition to in-memory would not remove this observed operation.
- Correlating file operation starts/ends by IRP produced overlapping Write records lasting **7,478.425 ms** and **7,304.619 ms**, both success (`STATUS_SUCCESS`). These overlap and must not be added together; filter-stack nesting can produce multiple records for one logical write.
- The disk-level record identifies a **4,096-byte write on disk 0**, priority **Verylow**, elapsed **6,201.482 ms**, ending at trace time 39,874.174 ms. Of 293 disk writes completing in the 33-42-second interval, the next slowest was 12.097 ms; that was also a Verylow DIPS write. The raw operation report is retained locally.
- Disk 0 is a Samsung SSD 980 PRO 1TB, NVMe, firmware 5B2QGXA7. Windows reports Healthy/Online; no matching disk/NTFS/storage-provider errors were returned for the surrounding 20 minutes. Those checks do not certify the hardware or explain the delay.
- Native snapshots again caught multiple processes in exit-status-zero rundown. Slow DIPS I/O is confirmed across the two traces, but the complete post-I/O process-rundown delay is still not explained by the 6.2-second write alone.

Current hypothesis: very-low-priority background I/O is being delayed in the Windows storage path. Priority starvation, filter/driver scheduling, and device latency remain alternatives, not established causes. No antivirus exclusion, firmware/driver update, session-persistence change, timeout increase, or normal-Quit force kill was applied. A controlled storage-location comparison or a targeted storage/priority trace is the next diagnostic step if deeper OS-level attribution is required.

Artifacts remain local and ignored under `dist/diagnostics/file-io-20260905/`: `test.log`, `recorder.log`, `file-io.etl`, the capture profile/script, and `file-operations.txt`. These machine-wide diagnostics may contain unrelated filenames; do not publish without review. OpenSpec tasks 1.3/1.4 remain open.

## September 5: native kernel capture and machine contention

Ran the approved follow-up diagnostics without changing production behavior, physical outputs, or the 15-second native exit deadline. The same isolated-profile playback scenario was used for the control and instrumented runs.

### Execution results and capture limitations

- The uninstrumented control failed the initial exit deadline and the cleanup deadline (46.4 seconds total). Tracing is therefore not necessary to trigger this failure.
- The ProcDump run also failed (52.6 seconds). Three validated test-owned processes were selected using executable path and creation time, not PID alone. ProcDump reported `Target process no longer running` / `0x800707D1` while attempting dumps; no usable process/kernel snapshots survived. This diagnostic failure is not evidence of a broken storage driver. All ProcDump monitors exited.
- The first extended storage run failed the initial shutdown. Its 512 MiB circular kernel buffer wrapped, retaining roughly the final nine seconds rather than the needed complete interval. Removing repeated context-switch/minifilter stack captures extended retention, but the second trace still lacked early lifecycle metadata. Both traces report zero lost events; that does **not** mean a circular recording retained the whole run. Partial decoded records must not be used to certify the storage path or attribute every delay to a filter/driver. No definitive Storport/minifilter attribution was obtained.
- The reduced-volume storage run reached restart and played the post-restart tone, but failed its final cleanup shutdown deadline (57.5 seconds total). It is not a passing acceptance run.
- The live-kernel fallback reproduced the initial exit timeout (30.6-second test). Microsoft's signed LiveKD used Windows native live-dump support successfully; the protected local kernel dump is 7,147,524,096 bytes. Its snapshot time is `2026-09-05T04:31:54.688Z`. Matching Windows symbols were used with the installed Microsoft debugger, staged locally because direct execution of its packaged binary was denied.
- That last run also exposed a remaining cleanup edge case: Playwright's `desktop.process()` accessor threw after its underlying process reference had been cleared. The original shutdown timeout remains preserved as the first AggregateError member. No cleanup fix was made in this diagnostic-only follow-up; retaining the child-process reference before shutdown is a separate harness follow-up.

### New native evidence

Browser PID **114868** was waiting on the process object for Network Service PID **176408**, not on an audio-service completion callback. The browser main thread's wait started approximately 9.64 seconds before the snapshot. The Network Service main thread was itself waiting on an event.

Several browser/Network Service background workers were **READY**, queued on the shared ready queue for logical CPUs **16-19**, with priorities **4-5**. Examples include Network Service thread **20704** (`0x50e0`) and browser thread **202168** (`0x315b8`). The latter was inside filesystem request completion (`Ntfs` -> `FLTMGR` -> `KeSetEvent` -> scheduler). This establishes runnable background work in a congested scheduling group, not a disk-device wait for those particular threads. A thread's displayed wait-start age includes earlier waiting and must not be presented as its exact ready-queue duration.

The browser's containing job reported no active CPU/I/O rate control, freeze, or background-job flag. The live dump's processor-wide current-state view contains the dump collector's own DPCs; its "no idle processors" summary is not an independent CPU-utilization measurement.

Immediately beneath the capture interrupts, the threads on CPUs 16-19 belonged to:

- **Neewer Control Center**, PID 26468, on CPU 16.
- **svchost**, PID 4932, on CPU 17, performing registry work.
- **WmiPrvSE**, PID 8028, on CPUs 18 and 19, enumerating process/thread statistics through `NtQuerySystemInformation`.

A separate approximately five-second read-only sample, with no Stream Jams test running, measured:

| Process | Threads | Handles | CPU seconds consumed |
| --- | ---: | ---: | ---: |
| Neewer Control Center | 18,298 | 748,956 | 5.109 |
| OBSBOT_WebCam | 22,795 | 945,952 | 4.875 |
| WmiPrvSE | 9 | 553 | 4.000 |

These are unusually large thread/handle populations in the two control apps and substantial ongoing CPU use. They do not alone establish a leak or prove that closing either app fixes Stream Jams.

A separate 15-second WMI trace recorded `Operation_PollingQuery` events for **client PID 2268 (StreamDeck)**, query `select * from Win32_Process`, configured interval **1000 ms**. Provider events in the same recording identify **host PID 8028** running `CIMWin32` process enumeration. This identifies a concrete polling source; the short trace does not establish every WMI caller or prove that Stream Deck itself is defective. The interval field is configured cadence, not proof that each enumeration finished in one second.

### Conclusion and approval boundary

The stronger current hypothesis is **machine-level CPU scheduling contention delaying Chromium's low-priority background work and child-process exit**, with exceptionally large thread populations and WMI enumeration contributing to the surrounding load. This could also inflate apparent filesystem operation duration. It is not yet a demonstrated explanation for the earlier 6.2-second disk-write event or every later process-rundown delay.

The next discriminating experiment is to obtain approval to normally close Neewer Control Center and OBSBOT_WebCam, verify their process exit and the resulting thread/CPU counts, then repeat the same unchanged shutdown acceptance test. Keep Stream Deck initially unchanged so that reduced process-enumeration cost can be observed. Do not stop WMI, disable antivirus, change affinity/priority, alter firmware, force normal Quit, or relax the timeout as part of this comparison.

All test processes, dump utilities, offline debuggers, and owned WPR/WMI recording sessions were verified stopped after collection. No external applications were closed, no production code or OpenSpec task checkboxes changed, and no artifacts were published. Local ignored evidence is under `dist/diagnostics/shutdown-20260905/`; the kernel dump contains sensitive system memory and must not be uploaded without review. BL-044 and OpenSpec tasks 1.3/1.4 remain unresolved.

Primary references informing the diagnostics: [ProcDump capture modes](https://learn.microsoft.com/en-us/sysinternals/downloads/procdump), [LiveKD native live dumps](https://learn.microsoft.com/en-us/sysinternals/downloads/livekd), [Windows debugger process/wait inspection](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-process), [Windows QoS and scheduling](https://learn.microsoft.com/en-us/windows/win32/procthread/quality-of-service), and [Microsoft WMI high-CPU diagnosis](https://learn.microsoft.com/en-us/troubleshoot/windows-server/system-management-components/troubleshoot-wmi-high-cpu-issues).

## September 5: approved process-stop comparison

After normal window-close requests could not be delivered, the user explicitly approved force-stopping the two identified processes. Executable paths and creation times were checked again immediately before terminating only those process objects:

| Original process | PID | Threads immediately before stop | Handles immediately before stop |
| --- | ---: | ---: | ---: |
| Neewer Control Center | 26468 | 18,393 | 752,557 |
| OBSBOT_WebCam | 19032 | 22,906 | 950,421 |

The Neewer process is the separately installed Control Center application. Its installed Stream Deck plugin runs `index.html` and connects to Control Center over a local WebSocket. OBSBOT_WebCam is itself the installed OBSBOT Stream Deck plugin executable. This distinction was verified from the local manifests and Neewer client source, not inferred from process names.

Both stop requests were issued before waiting. Neither process signaled exit within its sequential 15-second observation window; they briefly remained listed with one thread and zero handles. A later direct Windows check confirmed both original process objects were signaled (`WaitForSingleObject(..., 0) == WAIT_OBJECT_0`), with termination exit code `0xffffffff`. Process-list presence/absence alone was not used as final proof of exit. No further force-stop was issued.

### Unchanged test results

Ran the approved packaged playback/restart scenario once, then four repetitions, using the same build and test code, new isolated profiles, original output labels, gentle tones, and unchanged 15-second native exit deadline. `STREAM_JAMS_AUDIO_DIAGNOSTICS=0`; no WPR, dump capture, priority/affinity changes, or production changes were used. Short read-only process/counter checks were taken separately; this was not a tightly controlled system-performance benchmark.

| Run | Test result | Test duration |
| --- | --- | ---: |
| 1 | Passed | 20.9 s |
| 2 | Passed | 20.8 s |
| 3 | Passed | 20.3 s |
| 4 | Passed | 20.8 s |
| 5 | Passed | 11.9 s |

All five completed independent/combined playback, the first native shutdown, same-profile restart, post-restart combined playback, and final cleanup shutdown. This contrasts with the earlier uninstrumented control's native exit timeout. It is passing evidence for this scenario after the intervention, not a full suite or complete device-capability acceptance.

Important qualification: **both apps did not remain absent for the entire five-run comparison**. Stream Deck PID 2268 remained running and automatically relaunched OBSBOT as PID 65940 at `2026-09-05T05:14:27.052592Z`, near the end of the repeated batch (`05:13:22Z`-`05:14:39Z`). The new process initially had 50 threads and 1,714 handles; a later sample had 82 threads and 3,145 handles. Its parent PID and executable path were verified. Neewer remained stopped. The original high-resource OBSBOT process did not survive the stop. No plugin was disabled/uninstalled and Stream Deck was not restarted.

A short post-stop performance-counter sample for the same WMI host PID 8028 measured about 29-31% of one logical processor, compared with the earlier approximately four CPU-seconds in five seconds. These differently timed samples support reduced surrounding load but do not establish a precise causal reduction or attribute every WMI query.

### Interpretation and remaining work

The reproducible result is **5/5 passes after removing the two accumulated high-resource process states**, including later success with a freshly restarted OBSBOT plugin. Together with the earlier native ready-queue evidence, this strengthens machine-level resource/scheduling contention as a contributing condition. It does not isolate Neewer versus OBSBOT, establish a vendor-specific thread/handle leak, prove a complete chain for the earlier 6.2-second DIPS write, or establish long-session reliability. Do not mark BL-044 fixed or claim the original failure never reproduces.

The next discriminating step would be an approved one-at-a-time application/load comparison and bounded thread/handle growth measurements. A fresh low-resource relaunch alone may not recreate the accumulated state. Keeping OBSBOT absent would require separate plugin-lifecycle coordination because Stream Deck relaunches it; do not repeatedly kill replacement processes or disable the plugin implicitly. The remaining Playwright cleanup-reference edge case is unchanged.

No Stream Jams processes remained after the batch. Neewer was left stopped; Stream Deck and its automatically relaunched OBSBOT plugin were left running. Existing application settings were not edited. OpenSpec tasks 1.3/1.4 remain open because device-loss behavior and actual destination separation still need acceptance evidence; no route implementation was started.

Evidence remains local and ignored under `dist/diagnostics/shutdown-20260905/`: `approved-stop-baseline.json`, `approved-stop-result.json` (the initial observation, not final exit proof), `approved-stop-waits.json`, `apps-stopped-native-state.json`, `apps-stopped-wmi-counters.json`, `apps-stopped-test-1.log`, and `apps-stopped-tests-2-to-5.log`. `check-stopped-apps.ps1` is a diagnostic-only native exit probe. No artifacts were published.

## September 5: investigation handoff and resumed implementation

The user explicitly requested a new conversation to investigate whether Neewer Control Center and the OBSBOT Stream Deck plugin normally accumulate the observed resources, and instructed the original conversation to drop that investigation and continue on the assumption it will be resolved later. The separate Codex conversation is `01a07009-1ff5-7e02-b353-8205afc5c9cf`. Its handoff includes the executable/plugin distinction, installed manifest versions, original process identities, thread/handle and CPU observations, native scheduling evidence, WMI caller attribution, intervention results, automatic OBSBOT relaunch confound, source references, exact local artifact locations, and read-only/disruptive-action boundaries. It owns vendor/resource diagnosis and must not edit this feature worktree.

BL-044 remains known and deferred, not fixed. No more external process sampling, termination or tracing is part of the resumed routing implementation. Native shutdown checks retain their 15-second deadline and actual future failures must still be reported accurately. The earlier five passing runs supply current conditional lifecycle evidence; they do not prove physical destination isolation or unplug/replug behavior.

Resumed the bounded capability-test work by correcting the separate Playwright cleanup-reference defect. `audio-routing.spec.ts` now retains the native `ChildProcess` immediately after each launch and supplies it to `finishDesktop`. Cleanup no longer calls Playwright's `desktop.process()` after the wrapper may have cleared it. If a native child was not captured, cleanup fails explicitly and retains the isolated profile. Existing original-error preservation and live-process deletion guards remain unchanged.

Verification for this test-only change:

- Two new focused regressions failed against the old helper for the expected cleared-process-reference error; the four existing regressions passed.
- After the correction, all six harness regressions passed, including a real exited child allowing cleanup and an unknown child retaining the profile.
- Focused ESLint and strict standalone TypeScript checks passed for all three affected test/helper files.
- The real packaged non-audible isolation/enumeration/hide/shutdown check passed in 1.7 seconds (2.2 seconds including runner overhead). Evidence: ignored `dist/diagnostics/shutdown-20260905/resumed-harness-packaged-smoke.log`.
- No packaged application code changed, so the existing binary was reused rather than rebuilt. This is not a full-suite or complete hardware-acceptance claim.

The remaining physical acceptance check needs the user to isolate the two chosen mixer destinations and participate in disconnect/reconnect testing. No mixer settings, devices, or OBS configuration were changed to manufacture that evidence. OpenSpec 1.3/1.4 remain unchecked pending those results.

## September 5: System and SFX meter check

The user selected `System (Elgato Virtual Audio)` and `SFX (Elgato Virtual Audio)` for the next capability run. Both are intentionally monitored through the same headphones; the user can distinguish delivery by watching the separate mixer-channel meters. Separate headphone audibility is therefore not the verification method for this run. The test selects the explicitly enumerated System endpoint, not Chromium's default-device alias, and does not change Windows default audio or mixer routing.

With those exact labels supplied through `STREAM_JAMS_AUDIO_TEST_OUTPUTS`, the unchanged approved packaged test passed in 9.6 seconds (10.0 seconds including runner overhead). It completed System-only playback, SFX-only playback, combined playback, and combined playback after restart, plus final native shutdown. Each phase used the existing gentle one-second fixture; no microphone permission or external app changes were introduced. Log: ignored `dist/diagnostics/shutdown-20260905/system-sfx-meter-check.log`.

Automated playback/lifecycle success is verified, but the user subsequently reported hearing four tones and seeing all four on SFX. Four sequential tones is expected because simultaneous copies form one phase; SFX-only delivery is not the expected routing result. Treat that original end-to-end check as failed/unconfirmed despite the automated test passing. Disconnect/reconnect acceptance also remains outstanding. No OpenSpec completion checkbox changed.

## September 5: Windows endpoint verification after SFX-only observation

Investigated the routing discrepancy only; the separate Neewer/OBSBOT resource investigation remains deferred. No production implementation, device/mixer settings, Windows default endpoint, or per-app routing assignment changed.

Read-only configuration evidence:

- Windows and Wave Link identify System and SFX as two distinct render endpoint IDs.
- Installed Wave Link version is `3.2.10.4073`. The saved System/SFX channel mappings reference the corresponding distinct Windows endpoints.
- No explicit Stream Jams/Electron assignment was found in Wave Link's saved input app assignments. This does not alone rule out an unsaved, Windows-level, or dynamic app-routing policy.
- Elgato documents persistent per-app channel routing in [One-click Audio Routing](https://help.elgato.com/hc/en-us/articles/30171343852817-Wave-Link-One-click-Audio-Routing). It was a hypothesis to check, not an established explanation.

A silent isolated-profile probe of the existing packaged player recorded distinct enumerated IDs, successful native `setSinkId` calls, matching `element.sinkId` values, and the correct sink immediately before every `play()` call. The per-element wrappers recorded state and delegated to the original methods; they did not change the selected sink. This rules out a simple label/ID mix-up in that probe, not downstream routing problems. Its first native-session snapshots had no matching sessions and were not used as destination proof.

The subsequent audible diagnostic replay used the existing player API, two isolated endpoint selections followed by both together, one-second 750 Hz fixtures at the previously approved low volume, and a native session snapshot approximately 250 ms after playback started. Microsoft's documented [IAudioSessionManager2](https://learn.microsoft.com/en-us/windows/win32/api/audiopolicy/nn-audiopolicy-iaudiosessionmanager2), [session process IDs](https://learn.microsoft.com/en-us/windows/win32/api/audiopolicy/nf-audiopolicy-iaudiosessioncontrol2-getprocessid), and [peak-meter interface](https://learn.microsoft.com/en-us/windows/win32/api/endpointvolume/nn-endpointvolume-iaudiometerinformation) were used through a diagnostic-only, read-only COM probe. Results were filtered to the isolated app's current process IDs, not unrelated audio applications.

| Diagnostic phase | System endpoint: owned session | SFX endpoint: owned session |
| --- | --- | --- |
| System only | Active; peak 0.0128177209 | No session |
| SFX only | Inactive; peak 0 | Active; peak 0.0128177209 |
| Both | Active; peak 0.0128177209 | Active; peak 0.0128177209 |

The active audio-session PID was 102532 and the session/meter queries returned success. This is observed Windows endpoint delivery, stronger than a resolved browser playback promise. However, this was a three-phase diagnostic replay, not native instrumentation of the original four-phase hidden/restart run. It does not retroactively invalidate the user's original SFX-only observation or establish that Wave Link's downstream channel meters/mixes receive the expected separation in all cases.

Current boundary: application/Chromium sink selection and Windows endpoint separation worked in the diagnostic replay. The remaining discrepancy is downstream Wave Link mapping/meter presentation or a run-specific difference; neither is yet established. Ask which meter surface the user observed and whether the diagnostic replay showed the same discrepancy before changing settings or declaring the gate passed. Physical disconnect/reconnect is still unverified. OpenSpec 1.3/1.4 remain open.

Local ignored evidence under `dist/diagnostics/shutdown-20260905/`: `sink-selection-trace.log`, `native-sink-selection-trace.log`, `native-audible-sink-trace.log`, and diagnostic-only `inspect-sinks.mjs`, `AudioSessionProbe.cs`, `read-audio-sessions.ps1`. The probe reads session metadata and peak levels; it does not capture audio content. The isolated app and probe shut down after collection; no new persistent service or recorder was installed.

### Louder replay for Wave Link channel meters

The user clarified that the observed meters were Wave Link's channel meters and requested louder signals. Increased only the diagnostic media-element gain from 0.12 to 0.35, keeping the one-second 750 Hz fixture unchanged, and added 1.5-second pauses between System-only, SFX-only, and combined playback. Wave Link levels, Windows audio settings, and production code were not changed.

The replay completed with exit code 0, including isolated app/probe shutdown. The owned Windows audio session (PID 111000) again showed System active with no SFX session for System-only playback, System inactive with zero peak and SFX active for SFX-only playback, and both active for combined playback. Each active endpoint's measured peak was 0.0373850167; all session/meter queries succeeded. Evidence: ignored `dist/diagnostics/shutdown-20260905/native-audible-sink-louder-trace.log`. The diagnostic script passed `node --check` before execution.

The user subsequently answered "yes" when asked whether Wave Link's channel meters showed System only, then SFX only, then both. Independent and combined delivery is therefore user-confirmed for this louder replay, consistent with the native Windows endpoint measurements. The original SFX-only observation did not recur in this replay. Higher signal level and added pauses improved the test's observability, but this result does not establish the cause of the earlier observation or demonstrate a routing-code fix.

This replay does not include restart or disconnect/reconnect checks. Earlier packaged runs supply separate restart/lifecycle evidence; device-loss and reconnect acceptance still require a coordinated user-assisted test. OpenSpec tasks 1.3/1.4 remain unchecked. No additional audio playback, device changes, or production edits were performed when recording this confirmation.

## September 5: limited virtual-output availability test

The user has one physical headphone output and approved testing the `Elgato Capture (Elgato Virtual Audio)` playback endpoint instead of disconnecting the XLR Dock. Windows identifies this as a virtual render endpoint, separate from the physical `Elgato 4K Pro Audio` capture/input endpoint. The approved procedure is to disable/re-enable only the virtual playback endpoint through Windows Sound, with user-assisted clicks; no adapter, driver, XLR Dock, mixer gain, default output, or microphone setting is changed by the diagnostic.

This is explicitly a limited unavailable-before-playback/recovery check, not physical removal during playback. Microsoft documents that [disabling an endpoint in Sound can leave existing streams playing](https://learn.microsoft.com/en-us/windows/win32/coreaudio/device-state-xxx-constants). The user agreed to keep physical-disconnect testing recorded as unverified. No capability-gate checkbox is marked complete on that basis.

The one-off ignored `dist/diagnostics/shutdown-20260905/test-unavailable-sink.mjs` uses the existing packaged player in an isolated profile, captures the native child immediately, hides management to tray, retains the original explicit device ID across stages, and logs delegated `setSinkId`/`play` calls plus read-only owned Windows audio-session peaks. It never changes device settings. Playback phases have a five-second diagnostic deadline; each user step has a ten-minute idle deadline. On cancellation/timeout it requests normal application shutdown with the existing 15-second native deadline and reminds the operator to re-enable the endpoint if necessary.

Baseline completed at 2026-09-05 22:41:46 UTC: the selected sink matched Elgato Capture, playback finished with no remaining audio elements, and owned native audio-session PID 134940 was active on Elgato Capture with peak 0.0373850167. SFX, System, and XLR Dock had no sessions owned by that isolated application in the snapshot. This is Windows endpoint evidence; baseline Wave Link meter/audibility confirmation is not yet supplied. The script passed `node --check` before launch.

That first run reached its ten-minute user-step deadline at 22:51:46 UTC, before the disable step was supplied, and the application and diagnostic stopped normally by 22:51:49 UTC. This was an incomplete user-assisted run, not an audio or native-shutdown regression. Evidence: ignored `dist/diagnostics/shutdown-20260905/unavailable-sink-1788648099427.jsonl`.

### Completed limited run after restart

At the user's request, the unchanged diagnostic was restarted at 2026-09-06 01:05 UTC (September 5, 21:05 local). The user then confirmed the disable and enable steps within the respective deadlines. All fixture phases used a one-second 750 Hz tone with media-element volume 0.35. The same isolated app/player and original cached explicit binding were retained throughout:

| Phase | Observed result |
| --- | --- |
| Baseline | Elgato Capture selected successfully; owned native session active with peak 0.0373850167; no owned sessions on SFX, System, or XLR Dock. |
| While disabled | Original ID absent from packaged-player enumeration; `setSinkId` rejected with `NotFoundError: Requested device not found`; zero `play()` calls and no remaining audio element. No fallback playback was attempted. |
| Healthy control while target disabled | SFX selected and played successfully; owned SFX session active with peak 0.0373850167; no owned sessions on System or XLR Dock. This was a subsequent control, not a simultaneous recipient-failure test. |
| After re-enable | Original ID returned without label-based rebinding; Elgato Capture played a newly requested tone with native peak 0.0373850167; SFX session inactive with zero peak; no owned sessions on System or XLR Dock. |

The active native audio-session PID was 104064. Every fixture settled within the five-second diagnostic deadline and left zero audio elements. The normal application shutdown completed at 01:08:00.949 UTC, the probe stopped at 01:08:00.970 UTC, and the test process exited with code 0. Elgato Capture was available again before shutdown. Evidence: ignored `dist/diagnostics/shutdown-20260905/unavailable-sink-1788656742415.jsonl`.

A preliminary raw registry `DeviceState` read still reported active after the user's disable action; it was not used as proof of actual availability. The packaged player's enumeration and actual sink-selection rejection established the disabled-stage behavior. Native session reads supplied positive playback evidence on the successful stages.

Result: the limited unavailable-before-playback and same-ID recovery check passed. After the recovery tone, the user answered "i did" when asked whether they heard it and saw it on Elgato Capture's Wave Link meter. Recovery delivery is therefore confirmed by both native endpoint measurements and the user's audible/meter observation; the earlier "enabled" message alone was only setup confirmation. No production code or mixer settings were changed, and no device setting was mutated by the diagnostic itself. Physical removal during active playback, simultaneous healthy-recipient behavior during removal, and changed-ID reconnect remain unverified. OpenSpec tasks 1.3/1.4 stay unchecked; do not treat this as full feature acceptance or a BL-044 fix.

## September 5: physical removal and capability acceptance

### Identify the removable device

Before playback testing, read-only all-state Windows MMDevice snapshots captured 98 unique playback/recording endpoint IDs. Unplugging the user-selected cable changed XLR Dock Headphones and Mic In from active to not-present, and the virtual Mic playback endpoint from active to disabled; no endpoint ID was deleted. Reconnecting restored every endpoint's original ID and state. This identified the removable device as the XLR Dock, not Elgato Capture or the 4K Pro recording input. This inventory step alone did not test playback.

### User-assisted active-playback runs

The user approved the physical test and explicitly started each run. The unchanged packaged Electron 44.1.1 player ran in a fresh isolated profile with management closed to tray, using explicit Headphones (Elgato XLR Dock) and SFX (Elgato Virtual Audio) bindings. The diagnostic emitted a 45-second 750 Hz fixture at the previously approved media-element volume 0.35, observed until completion or duration plus five seconds, then waited silently for reconnection. Recovery used a newly requested one-second fixture. No microphone permission, device/mixer setting, OS default, OBS configuration or production code changed.

The diagnostic delegated the existing player API and native media methods without changing their sink/play behavior. It recorded enumeration, media events and read-only session peaks for the isolated application's process IDs across all currently active native playback endpoints. User-step waits were capped at ten minutes and shutdown retained the existing 15-second native deadline.

| Observation (UTC, September 6; September 5 evening locally) | First run | Repeat |
| --- | --- | --- |
| Both endpoints measured before unplug | 02:24:22; peak 0.0373850167 on each | 02:27:26; peak 0.0373850167 on each |
| Dock absent from player enumeration during playback | 02:24:45; about 23 seconds after start | 02:27:43; about 17 seconds after start |
| Healthy SFX samples after loss and before clip end | 16 | 21 |
| Natural media completion and cleanup | Completed; zero elements; no forced cleanup | Completed; zero elements; no forced cleanup |
| Original explicit binding returned | 02:26:10 | 02:28:55 |
| Fresh XLR Dock recovery tone | Native peak 0.0373850167; SFX inactive | Native peak 0.0373850167; SFX inactive |
| Diagnostic stopped normally, exit code 0 | 02:26:13.593 | 02:28:59.184 |

After removal, the active native samples contained owned audible sessions only on SFX; its peak remained approximately 0.03738502, matching the pre-removal level. No additional destination playback or fallback sink request was observed. This is sampled endpoint/session evidence, not a recording of every downstream mix or a universal no-fallback guarantee. Both returned endpoints were silent before the explicitly requested recovery tone.

The user could not see Wave Link's meter during the first run and requested the repeat; that first run supplies automated evidence only. Following the repeat and recovery, the user answered "yes" to both continued SFX meter activity while the dock was disconnected and hearing the final recovery tone. The prior "reconnected" messages were setup confirmations, not audibility/meter evidence. Both isolated application instances and probes stopped normally; a subsequent check found no Stream Jams process and neither disposable profile remained.

### Capability decision and implementation consequences

The initial capability gate is now satisfied by the combined evidence: packaged permission/isolation and autoplay without microphone access, independent/combined System/SFX delivery, hidden-window and restart checks, unavailable-before-playback rejection, and confirmed physical removal with a continuing healthy output and same-ID fresh recovery. Mark only tasks 1.3/1.4 complete; proceed with the existing backend. Tasks 2-6 and full feature acceptance remain open.

Do not confuse natural media completion with implemented device-loss handling. In both physical runs, the disconnected XLR element produced no recorded media error and ended roughly three seconds later than SFX, at about 48 seconds after dispatch. The fixture settled inside its 50-second diagnostic bound without forced cleanup, but it does not enforce the production alert-duration stop or report destination failure. Enumeration detected the removal; the trace captured no `devicechange` event before completion. Task 4 must verify detection without relying solely on that event, explicitly stop/fail lost destinations, preserve healthy recipients, and enforce the planned duration/cancellation/watchdog rules.

Reconnection occurred after the original fixture had finished. Reconnection before that deadline, changed-ID rebinding, crash/service-loss behavior, integrated queue safety, live route controls and actual OBS capture still require the planned implementation tests and final acceptance. No full-suite rerun, feature-completion claim, OpenSpec archive, commit or publication is implied by this capability result. BL-044 remains deferred in its separate conversation.

## September 7: resumed shutdown investigation and test-only dialog repair

The user approved renewed investigation and then a narrowly scoped test-only readiness/dialog repair. The current merged application was rebuilt unchanged (Electron 44.1.1, Chromium 152.0.7977.65). Neither Neewer Control Center nor OBSBOT_WebCam was running during the initial controls. The unchanged silent packaged audio test passed 5/5 in 24.2 seconds; a separate native X-without-debugger batch passed 5/5 in 21.9 seconds, observing actual process exit with code zero and a stopped listener.

An intervening combined lifecycle batch failed: 3 cases passed, the second crashed-management case hit its existing 30-second app-close timeout, and 6 scheduled cases did not run. Its isolated service still returned HTTP 200 and only the first `before-quit` event had fired. This differs from the earlier native teardown captures, where service shutdown had already completed. The failed process remained alive after the test worker failed.

Read-only inspection of that process found two pending test dialogs: the unavailable-management quit confirmation and a later startup-load failure. The precise mechanism is:

1. `windowByUrl()` establishes the navigation URL, not completed initial page load.
2. Crashing the renderer before `ManagementWindow.load()` completes both requires quit confirmation and rejects the startup load, opening a separate failure dialog.
3. The test's single `releaseDesktopTestDialog` callback was overwritten by that second dialog. Replying to the latest dialog left the actual quit-confirmation promise unresolved.

An instrumented diagnostic retained both callbacks while preserving the old latest-callback behavior. Two of three URL-only repetitions reproduced the competing dialogs and a still-live service after answering only the latest. Answering the original retained confirmation let those two apps close in 440 ms and 749 ms. Five controls that waited for page load recorded management `did-finish-load` before the crash, produced one quit confirmation, and closed within the unchanged deadline. This establishes a test-harness defect; it does not identify the cause of the earlier native I/O/scheduling delay. Electron's [navigation and loadURL documentation](https://www.electronjs.org/docs/latest/api/web-contents#contentsloadurlurl-options) distinguishes a loaded URL from completed navigation.

The approved repair is confined to `tests/desktop/windows-lifecycle.spec.ts`: await page load before the intended post-startup crash; retain each dialog's resolver; require a unique pending message match; honor the selected response; reject missing, repeated, blank, and ambiguous matches; and attach rejection handlers immediately while retaining the close promise's original failure for its later await. Failure diagnostics now include observed dialogs. No application code, schema, output routing, or native deadline changed.

Verification:

- A new regression failed against the old helper because replying to the quit confirmation instead resolved the later startup-failure dialog. This is the expected behavioral failure, not a compilation or test-runner failure.
- The corrected crash test and dialog regression each passed five repetitions: 10/10 in 25.0 seconds.
- After final selector/error-path coverage, the complete desktop suite passed 18 tests with 1 intentionally audible-gated skip in 33.5 seconds. The earlier failing batch is not reclassified as passing.
- Focused ESLint and strict desktop-test TypeScript project checks passed. The already rebuilt production package was reused because the repair changes only test code and documentation.

The original stuck test process tree was identity-checked and force-terminated only after capture; this is failed-test cleanup, not successful Quit. Instrumented follow-up profiles and evidence were retained under the temporary directory and ignored `dist/diagnostics/bl044-20260907/`. External apps and device/mixer/security settings were not changed, and no audible test was run. Preserve forensic evidence separately from decisions about reusable unit fixtures.

After the repair, a diagnostic-only script ran three fresh-profile System/SFX cycles against the unchanged package: each played zero-signal PCM at volume zero on the two explicit outputs independently and together, hid management to tray for 60 seconds, requested normal Quit, restarted the same profile, and played the combined silent fixture before another normal Quit. All six shutdown observations completed within the original 15-second deadline, with elapsed times of 403/309 ms, 680/436 ms, and 214/221 ms. Each observed the app-close event, disappearance of the captured native process IDs, and a stopped service listener; no forced cleanup was used. The three profiles and per-launch metrics/lifecycle observations remain in the ignored evidence directory (`silent-restart.json` and `.log`). These are bounded silent controls, not audible-device acceptance, a long-session soak, or evidence that BL-044 is fixed. The native root cause remains open; a one-vendor-at-a-time comparison requires further approval before launching controllers or changing their lifecycle.

### Approved thirty-minute Neewer comparison

The user subsequently approved launching only Neewer Control Center for thirty minutes and requesting a normal close, after first reviewing all eight turns of the related resource investigation (`01a07009-1ff5-7e02-b353-8205afc5c9cf`). OBSBOT remained absent; the existing Stream Deck process was left unchanged. Neewer 3.4.6.0, PID 100448, started at `2026-09-07T21:51:02.2850238Z`. No lighting, device, driver, priority or security settings were changed. The current lights' power/connection state was asked but not confirmed.

Sixty-one samples over thirty minutes show reproducible background resource accumulation. From the first post-startup sample at 30.11 seconds to 1,800 seconds, Neewer grew from 41 to 1,220 threads, 1,535 to 51,089 handles, and 75.75 to 184.39 MiB private memory: approximately 40 additional threads and 1,680 handles per minute. CPU averaged only 0.0275 of one logical core over that interval. Stream Deck remained around 363–369 threads / 4,400 handles; sampled WMI processes remained small. These fresh counts are much lower than the historical high-resource state.

Read-only native thread-start snapshots narrow the allocation lead: the early snapshot contained 159 threads starting at `mfksproxy.dll+0x17BB0`; the midpoint contained 477; the late snapshot contained 1,196. All 159 early threads were still present at both later snapshots with matching IDs and creation timestamps. Their median creation interval in the early snapshot was about 1.5 seconds. The installed Microsoft DLL identifies itself as the DirectShow/Media Foundation bridge, version 10.0.26100.9278. This identifies accumulated threads' entry point, **not** their creating caller or the component responsible for release. The diagnostic uses Microsoft's documented, dynamically resolved [thread-start query](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntqueryinformationthread), without suspension or injection.

Only eight `CNWWifiHelper::ConfigConnect` markers appeared in the initial flushed log segment; no further log bytes were flushed during the sample. Thus repeated visible reconnect logging did not accompany this reproduction. Log buffering prevents treating that as proof of no internal network activity. The stronger next hypothesis is repeated media-device activation/enumeration. A separate application's [upstream DirectShow investigation](https://github.com/CapSoftware/Cap/pull/2129) and [subsequent merged lifecycle/polling fixes](https://github.com/CapSoftware/Cap/pull/2143) report a similar resource pattern. This is corroborating research, not proof that Neewer has the same code defect. Microsoft distinguishes reading device metadata from [creating its capture filter](https://learn.microsoft.com/en-us/windows/win32/directshow/selecting-a-capture-device).

The unchanged silent playback/restart scenario passed six early shutdown observations (440/262, 176/427, 476/262 ms) and six midpoint observations (314/449, 257/532, 276/227 ms), each confirming process disappearance and a stopped listener. A computer-use app-approval timeout delayed the late checkpoint; only one final pair was run. It passed in 278/340 ms, but its quit events occurred **23–27 seconds after** Neewer's thirty-minute window-close request, while Neewer remained alive. Keep those two observations separate from the twelve wholly within the sampling window; they are not an uncontaminated pre-close endpoint or a Neewer-off control.

At exactly thirty minutes, the identity-verified ordinary window-close request was accepted, but the held process handle did not signal exit within fifteen seconds. This may be close-to-tray behavior, not a demonstrated Neewer deadlock. No force-stop was performed. The user subsequently reported choosing normal Quit; read-only checks confirmed the original PID and all Neewer instances absent. A zero exit code is not claimed because the original held process handle was already disposed by then.

The Neewer-off comparison then completed three unchanged silent playback/restart pairs: 177/229, 202/217 and 195/302 ms, all confirming process disappearance and stopped listeners. Eight thirty-second-spaced external snapshots confirmed Neewer and OBSBOT remained absent and the original Stream Deck process remained running; final checks found no Stream Jams test instances. This completes twenty additional native shutdown observations (twelve in-window, two after the close request with Neewer still alive, six after user Quit). None reproduced BL-044. Do not treat this short, low-CPU vendor run as equivalent to the historical tens-of-thousands-of-threads state.

At the conclusion of this comparison, the optional sixty-second thread-creation trace was awaiting separate approval; it was not part of the thirty-minute authorization. The subsequently approved capture is documented below. BL-044's original native shutdown failure was **not reproduced or resolved** by these controls.

Private evidence remains under ignored `dist/diagnostics/bl044-20260907/`: `neewer-comparison.json`, `neewer-threads-{early,mid,late}.json`, `neewer-{early,mid,late,off}.json` / `.log`, `neewer-off-resources.jsonl`, diagnostic helpers and `neewer-research.md`. No raw vendor account/configuration data was copied and nothing was uploaded. Temporary Stream Jams profiles are retained for investigation.

### Approved Neewer thread-creation trace

The user separately approved a brief relaunch and sixty-second thread-creation capture. The first non-administrator attempt received WPR access denied before launching Neewer; its failure record is retained. A standard Windows administrator prompt then authorized the diagnostic helper. The custom profile recorded only process/thread, module-loader and `ThreadCreate` stacks, using a 32 MiB memory buffer rather than an unbounded recording. See Microsoft's [thread-creation stack support](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/systemprovider) and [WPR recording options](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/wpr-command-line-options).

Neewer 3.4.6.0, PID 212104, started at `2026-09-07T22:41:59.3007344Z`. At 30 seconds it held 40 threads / 1,519 handles; at 60 seconds it held 56 / 2,352. Stop was requested at `22:42:59.5364808Z`; WPR reported zero lost events immediately before stop, and saved the 29,884,416-byte ETL successfully. The trace includes a short stop/rundown tail beyond the requested sixty seconds. Subsequent status confirmed recording stopped. OBSBOT remained absent and the original Stream Deck instance was not changed. No Stream Jams test or audible playback was run during this capture.

Offline decoding found 80 Neewer thread-start events and 23 stops. **Forty-two starts used `mfksproxy.dll+0x17BB0`, with zero corresponding thread-stop events in the capture.** All forty-two were created from Neewer's main thread (102104) through `QCameraInfo::availableCameras()`. Forty followed a Qt timer callback, and thirty-nine shared an identical complete captured address stack. After startup, the median inter-creation interval was 1,497.7621 ms (range 1,466.5241–1,538.2347 ms). This independently reproduces the earlier retained-thread pattern and identifies its creating path:

```text
QTimer::timerEvent -> QMetaObject::activate
  -> Neewer Control Center.exe+0x18346C
  -> QCameraInfo::availableCameras
  -> Qt DirectShow backend (dsengine.dll)
  -> devenum!CCreateSwEnum::CreateClassEnumerator
  -> CreatePnpMonikers / CreateOnePnpMoniker
  -> CDeviceMoniker::BindToObject / CoCreateAndBindObject
  -> mfksproxy!CMFProxyFilter::Load
  -> CMFSRSource::CreateInstanceWithFilter / InitWithFilter / Init
  -> CreateThread
```

Windows functions were resolved using matching GUID/age public PDBs from [Microsoft's symbol server](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/microsoft-public-symbols); unsafe symbol matching was not enabled. The installed Qt 5.12.11 binaries' export tables and x64 unwind-function ranges independently identify `QCameraInfo::availableCameras` (captured offset `0x2B2B2`, inside `0x2B250–0x2B2CB`), `QTimer::timerEvent`, and `QMetaObject::activate`. Adjacent export names outside the enclosing function range are not treated as resolved symbols. The Neewer private function and intervening private Qt backend functions remain unnamed. Trace conversion emitted module-size warnings; the relevant media frames were mapped, and the raw ETL, module versions, PDB signatures and addresses are retained rather than hiding that limitation.

The matching upstream [Qt 5.12.11 camera-info source](https://github.com/qt/qtmultimedia/blob/v5.12.11/src/multimedia/camera/qcamerainfo.cpp), [service plugin](https://github.com/qt/qtmultimedia/blob/v5.12.11/src/plugins/directshow/dsserviceplugin.cpp), and [video-device enumeration implementation](https://github.com/qt/qtmultimedia/blob/v5.12.11/src/plugins/directshow/camera/dsvideodevicecontrol.cpp) corroborate the API route. The last implements a 500 ms listing cache and calls `CreateClassEnumerator(CLSID_VideoInputDeviceCategory)`, then reads device metadata. Neewer's observed 1.5-second timer exceeds that cache interval. Importantly, the captured `BindToObject` is **inside Windows enumeration**, not proof that Neewer itself explicitly opens a capture filter. Upstream source is explanatory context, not proof its binary is unmodified.

The creating mechanism is now identified as recurring **camera discovery**, rather than an inferred Wi-Fi reconnect loop. The precise release/lifetime defect remains unproven: this trace did not capture COM reference ownership, worker exit stacks, the implicated camera identity or driver state. It does not establish which of Neewer, Qt, Windows or a device driver must repair the underlying release behavior. Vendor fix directions are to avoid unnecessary periodic camera enumeration, cache results and refresh on device changes or explicit demand, stop polling while camera functionality is unused, and investigate lifecycle/release behavior on this recorded path. These are candidates, not tested fixes. No vendor binary or configuration was patched, and no device was disabled.

After saving, the ordinary window-close request at `22:43:17.2692227Z` returned true but did not produce native exit within fifteen seconds. The user was asked to choose tray Quit/Exit; at this analysis checkpoint that confirmation and process-absence verification remain pending. Do not infer successful Quit, an exit code, or a vendor deadlock from that window-close result. Do not relaunch, force-stop, change drivers/devices, or upload the trace without separate authorization.

Private artifacts are `neewer-thread-create-elevated.etl`, its derived ETLX, `.capture.json`, `neewer-thread-events{,-symbols,-exports,-final}.json`, the narrow WPR profile, isolated .NET trace reader and logs. Final decoding confirms zero lost events for the saved trace, spanning `22:41:59.1721264Z–22:43:01.6868607Z`; count/stack reconciliation passed. The final read-only checkpoint at `22:56:30.4100530Z` still found the original Neewer instance (603 threads / 25,083 handles), WPR stopped, OBSBOT and Stream Jams absent, and the original Stream Deck instance unchanged. Public symbol downloads did not upload these captures. This trace identifies the vendor resource-creation path; it **does not reproduce or resolve BL-044's original Stream Jams native shutdown delay**.

### Management-session experiment: initial startup blocker

After discussing persistence risks, the user approved an isolated management-session experiment, with production adoption conditional on preserved durable state and demonstrated benefit. A separate unpacked diagnostic copy of the existing package was prepared with a single environment-gated management partition change; audio remains persistent. The existing production executable/archive hashes were verified unchanged. Planned checks cover control/experimental same-profile restarts, zero-signal audio, saved alert/configuration/route state, authentication/CSRF boundaries and Chromium DIPS file metadata. Theme loss is an expected negative adoption gate until a migration exists. No production implementation, watchdog or specification change was made.

The first control failed before management readiness and before playback or session comparison. Its health endpoint was unavailable; the experimental arm never launched. The startup cause remains unresolved, so this is not a post-playback BL-044 reproduction or evidence for the proposed mitigation. Normal Quit did not confirm process exit. Read-only native inspection found the main thread in a Windows ApiPort/LPC wait, without establishing its cause; debugger inspection could not execute. An identity-verified ordinary window-close request was accepted but did not signal exit within fifteen seconds. The isolated diagnostic process (PID 132348, start `2026-09-08T01:45:12.7105702Z`) remained alive, and further launches paused pending approval for its forced cleanup. No force-stop, audible playback, vendor lifecycle change, reboot, credential copy or real-profile mutation occurred. Neewer's existing process continued accumulating resources and is a comparison confounder, not a proven cause of this startup failure.

The private plan, copy fingerprints, diagnostic code and failed-run evidence are retained under ignored `dist/diagnostics/mgmt-session-20260908/`. Production remains persistent. Neither restart/reboot preservation nor mitigation effectiveness is accepted from this incomplete attempt.

The user's subsequent screenshot identifies a native breakpoint exception (`0x80000003`) at `0x00007FF632F9D649`, with Windows waiting for acknowledgement to terminate the application. Read-only module inspection matched that address to the isolated PID 132348 executable: image base `0x7FF62BC90000`, relative address `0x730D649`. The PID, executable path and start time were reverified unchanged. At that checkpoint, a scoped Application event-log query for IDs 1000/1001 since `2026-09-08T01:44:00Z` returned no matching events, and no dump or termination had yet been authorized. The in-memory arm remains untested.

### Approved crash capture: GPU child DLL-loading failure

The user subsequently approved a local dump of only that diagnostic process and its termination. At `2026-09-08T02:16:04.6358740Z`, the debugger had successfully written a 455,745,127-byte full-memory dump; its MDMP header was verified before termination. The exact executable path and UTC start time were checked again before killing the held process object. Native exit was confirmed within fifteen seconds, with forced exit code `-1`, and PID 132348 was absent. This was forced cleanup, not a successful graceful-shutdown test. The diagnostic listener/debugger ports were also absent. No other application was stopped and no dump or memory contents were uploaded.

The saved stack identifies `NtRaiseHardError -> UnhandledExceptionFilter`, confirming the Windows error-dialog wait. The dump's synthetic debugger-wake exception (`0x80000007`) is not the original fault. The original screenshot address and saved exception-dispatch stack point to an actual `int 3` instruction. Matching official Electron 44.1.1 Breakpad symbols (GUID/age `E576D66B49E136884C4C44205044422E1`) resolve its address to `logging::LogMessage::HandleFatal`, `base/logging.cc:1012`. The caller chain is:

`GpuProcessHost::OnProcessCrashed -> RecordProcessCrash -> FallBackToNextGpuModeDueToCrash -> FallBackToNextGpuMode -> IntentionallyCrashBrowserForUnusableGpuProcess -> LogMessageFatal -> HandleFatal`.

The [exact Chromium 152.0.7977.65 source](https://github.com/chromium/chromium/blob/152.0.7977.65/content/browser/gpu/gpu_data_manager_impl_private.cc#L1678) corroborates that the fatal path runs when no GPU fallback modes remain. The recovered nonvolatile EDI register in `GpuProcessHost::OnProcessCrashed(int)` is `0xC0000135`; disassembly confirms the function copies its exit-code argument from EDX into EDI before calling `RecordProcessCrash`. Microsoft defines that value as `STATUS_DLL_NOT_FOUND` in its [error-code reference](https://winprotocoldoc.z19.web.core.windows.net/MS-ERREF/%5BMS-ERREF%5D.pdf). This identifies a GPU-child DLL-loading failure leading to deliberate browser termination, not a JavaScript Quit-handler stall or a reproduced DIPS shutdown wait. It does not identify the missing DLL or explain why the child could not load it.

A follow-up System/Application Popup event 26 at `2026-09-08T01:45:14.0455709Z` independently records the same breakpoint address, approximately 1.335 seconds after process creation. The Application log has no corresponding event 1000/1001 in the captured window. All ten checked top-level executable/DLL/runtime-data files in the diagnostic package exist and match production hashes, so an omitted or altered file in that checked set is not supported. Transitive dependency resolution, loader search/access context and the missing dependency remain unresolved. The application already disables hardware acceleration; this result is not evidence that a graphics driver is defective or that another hardware-acceleration toggle is the fix.

Private evidence is retained under `dist/diagnostics/mgmt-session-20260908/`: `failed-control-132348.dmp`, `crash-capture-cleanup.json`, debugger capture/stack/frame/GPU logs, `crash-symbols.json`, the narrow symbol resolver, `symbol-verification.json` and `native-file-comparison.json`. The official 59,871,534-byte symbol archive passed its published SHA-256 check before extraction; the 4.1 GB full PDB was not downloaded. Only containing function/line ranges from the exact matching symbols are accepted, not nearby export names. The next discriminating diagnostic is a bounded, isolated startup capture that records the GPU child's failed DLL lookup/load, before retrying the management-session comparison. No further launch, production change, security-policy change or vendor lifecycle action was performed in this capture step. BL-044 and the session experiment remain unresolved.

### Targeted loader trace: existing VERSION.dll denied to GPU children

The user approved a bounded, silent startup trace, then explicitly approved cleanup of its three captured process identities and one corrected trace. Both runs used the same isolated diagnostic executable with fresh profiles, the persistent management control, no playback and no copied credentials. Electron's documented [`--inspect-brk` entry pause](https://www.electronjs.org/docs/latest/tutorial/debugging-main-process) allowed the native debugger to attach before application JavaScript ran; startup resumed once per instance. These are startup diagnostics under instrumentation, not comparable shutdown-timing samples.

The first trace (parent PID 84360, start `2026-09-08T02:39:36.3176219Z`) captured six GPU-child exits with `0xC0000135` followed by the same fatal breakpoint. Its child `!gflag +sls` hook ran at process creation before ntdll's PEB type was available and therefore did not enable child loader snaps. This was a diagnostic instrumentation defect, not evidence of an absent DLL. The parent's initial command pipe was also closed by the non-TTY launcher; the existing paused instance was resumed through its identity-scoped inspector without a second launch. The corrected run used a persistent interactive pipe. The first parent and its two surviving children exited after debugger detachment, before the subsequently authorized force-stop checks ran; no Kill call was made. Parent exit code `3221225501` (`0xC000001D`) followed continuation of the fatal trap path, not a graceful Quit.

Before the second trace, matching installed ntdll symbols verified x64 `_PEB.NtGlobalFlag` at offset `0xBC`. The corrected process-creation hook ORed only the loader-snaps bit (`0x2`) into that field and read it back, avoiding reliance on not-yet-loaded child symbols. This changed only temporary diagnostic memory in owned processes, not registry settings, file permissions, DLL search paths or Chromium sandbox policy. The [debugger's child-process control](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-childdbg--debug-child-processes-) constrained the capture to the attached diagnostic app and its descendants. Debugging also adds overhead/debug-heap behavior to children; do not use this run for performance acceptance.

The corrected parent was PID 143372, start `2026-09-08T02:46:34.9271947Z`, resumed at approximately `02:47:27Z`. Its six failed GPU children (121372, 167684, 60868, 101600, 172296 and 62092) each show the same complete chain in `loader-native-2.log`:

1. Initializing the isolated working directory fails with `0xC0000022` (access denied).
2. Loading `C:\Windows\System32\apphelp.dll` fails with access denied.
3. Resolving the existing `C:\Windows\System32\VERSION.dll` explicitly returns access denied. Other search locations then miss the file.
4. The loader reports failure to load `VERSION.dll` for the diagnostic executable with final status `0xC0000135`; that child exits with the same status.
5. After the sixth GPU failure, the parent enters the previously symbolized no-fallback fatal path at the same breakpoint address.

`summarize-loader-trace.mjs` correlates loader events by PID/TID rather than adjacency in the interleaved log. It asserts six complete chains and writes exact source-line references to `loader-findings-2.json`; syntax checking and the full reconciliation passed. For example, the first child's System32 resolution is denied at log line 1752, its final VERSION.dll failure is at line 2587, and its native exit is at line 2604. The DLLs exist and were fingerprinted read-only: VERSION.dll is 55,192 bytes (SHA-256 `CEA99F212AF557A9613150C5509631403ED0F05F5D9A06AC42039BD59B40E39A`), apphelp.dll is 662,656 bytes (`91D9A77C5FE64F44542046A6B4BB614E2ACD1AD43B36DB98E4DF153008257CC4`). No DLL replacement or ACL repair is justified by this trace.

This identifies the startup block as **access denial to an existing required Windows DLL**, with a misleading final DLL-not-found status. It does not yet isolate which effective token, sandbox interaction or other access-control component imposed that denial. A launch-context interaction is a hypothesis, not a confirmed attribution to Codex, Chromium or another vendor. Microsoft documents that [restricted-token access checks](https://learn.microsoft.com/en-us/windows/win32/secauthz/restricted-tokens) can further constrain otherwise allowed access, but the failed GPU tokens were not captured here. The next discriminating control is an explicitly approved isolated launch in the normal desktop user context while retaining Chromium's sandbox and unchanged files; do not disable sandboxing or broaden file permissions as a speculative fix.

The loader-snaps bit was cleared in all three surviving second-run processes before detachment (other bits retained). The parent then exited abnormally with `0xC000001D` at `2026-09-08T02:48:41.223Z`; no force-stop was issued. The `02:49:30.9913941Z` cleanup check found parent 143372, its surviving children 93732/129380 and ports 55562/55563 absent. The first run's processes and ports were also confirmed absent. Local artifacts include `trace-loader-startup.mjs`, the run-specific debugger commands, `loader-startup-{1,2}.json`, stderr/native logs, identity records, cleanup JSON and the reconciled findings. There was no system-wide trace, registry/security change, vendor lifecycle change, audible playback, production-source change or upload. The in-memory management arm has still not run, and the original post-playback BL-044 shutdown issue remains unresolved.

### Approved normal-user startup control: sandbox retained, normal Quit passed

The user approved one control in the normal desktop user context. The launch preflight verified the expected signed-in user SID and a non-administrator token; running outside the diagnostic tool sandbox did not mean UAC elevation. The same diagnostic executable, persistent-management setting and direct-launch runner were retained, with a fresh isolated profile. No native debugger or loader-snaps attachment was used for this control. The inspector entry pause remained; its manual pause makes process-creation-to-ready timing unsuitable for startup-performance acceptance.

Run 3 parent PID 2928 started at `2026-09-08T03:09:48.7901259Z` and resumed at `03:10:10.239Z`. The service returned HTTP 200. Both management and audio web contents finished main-frame loading without crashing, with sandbox/context isolation enabled and Node integration disabled. This is an automated readiness observation, not manual UI or persistence acceptance. Neither `--no-sandbox` nor `--disable-gpu-sandbox` was present. Electron's [process metrics](https://www.electronjs.org/docs/latest/api/structures/process-metric) reported GPU PID 114292 as sandboxed with low integrity; both renderer processes were sandboxed with untrusted integrity. An identity-verified native module check at `03:11:10.1082317Z` found both `C:\Windows\System32\VERSION.dll` and `apphelp.dll` loaded in that same GPU process. The startup log contained no GPU-failure messages.

Ordinary `app.quit()` was requested at `03:11:10.261Z`; the parent exited with code 0 at `03:11:10.936Z`, **675 ms** later. The independent `03:12:02.6494484Z` cleanup validation found all eight recorded process IDs (2928, 114292, 155644, 125492, 47440, 116456, 173868 and 202592) and both ports (58192/58193) absent. Its assertions checked startup health, retained GPU/window sandboxing, no GPU-failure log, normal exit code and the existing fifteen-second deadline. No force-stop or playback occurred. Production executable/archive hashes were reverified unchanged.

This successful control, together with the prior repeated loader denials, strongly supports a launch-context/access-control explanation for the **new startup blocker**. It does not identify the exact restricting token or policy. The successful run also lacked native-debugger instrumentation; the original startup failure lacked that instrumentation too, but this is still one successful control, not a fully matched repeated causal experiment. No DLL/ACL, driver or sandbox-policy change is indicated by these results. The original BL-044 post-playback shutdown delay remains unresolved, and the in-memory management arm has still never run. The next step is the previously planned persistent-versus-in-memory comparison in this verified normal-user context, retaining the audio session's persistence and all state-preservation gates.

Private evidence under `dist/diagnostics/mgmt-session-20260908/` includes `normal-context-preflight.json`, `loader-startup-3.json`, its stderr/identity records, `normal-gpu-modules.json` and `normal-context-validation.json`. No production code, real user profile, credentials, vendor processes, device settings, registry/security policy or OpenSpec requirements changed; no diagnostic contents were uploaded.

### Completed management-session comparison: adoption not accepted

The user authorized continuing the comparison without further pauses unless permission was needed. The runs used the verified normal, non-administrator desktop context, the same isolated diagnostic executable and unchanged Chromium sandbox settings. Both arms retained their own fresh profile across restarts; only the management partition differed. Audio remained persistent. Every completed sample exercised zero-PCM, volume-zero playback through explicit System, SFX and combined outputs, followed by a seventy-second hidden-window dwell and normal Quit under the unchanged fifteen-second owned-process exit deadline.

Two diagnostic-script defects interrupted execution, and neither is a product regression or BL-044 reproduction. `comparison-normal-1` looked for the theme control on Home instead of navigating to Settings; startup health was 200 and ordinary cleanup exited with code 0. In `comparison-normal-2`, the first memory restart compared route creation order with the API's alphabetical order. Repository source confirms `ORDER BY name COLLATE NOCASE, id`; all returned route fields matched. The corrected assertion compares complete records by stable ID and a focused check confirms changed device IDs still fail. Rather than repeating completed work after two harness failures, the remaining restart checks resumed the retained profiles. The failed memory startup is retained as launch 2; its successful continuation is launch 3. This is an interrupted comparison with four completed samples, not an uninterrupted four-launch run or a failure-free initial suite.

| Completed sample | Owned-process shutdown verification | Default-session DIPS after Quit | Audio-session DIPS after Quit |
| --- | --- | --- | --- |
| Persistent management, first launch | 250 ms | Present | Present |
| In-memory management, first launch | 726 ms | Absent | Present |
| In-memory management, retained-profile restart (launch 3) | 577 ms | Absent | Present |
| Persistent management, retained-profile restart | 331 ms | Present | Present |

The service stopped in 56–68 ms in these samples. All four completed checks observed process exit, launcher exit code 0, a stopped health endpoint, sandboxed GPU/renderer processes, context isolation enabled and Node integration disabled. The in-memory management session reported `isPersistent() === false` and `storagePath === null`, consistent with Electron's [documented session semantics](https://www.electronjs.org/docs/latest/api/session); the audio session remained persistent. Default-session metadata inspection itself accesses `session.defaultSession`, but no default DIPS file appeared in the memory arm despite that access. File snapshots are not an instruction-level disk-I/O trace.

Both retained-profile restarts preserved the complete sampled disabled alert rule, both named route records/device bindings, the `closeToTray: false` setting and both explicit audio-device IDs. Authentication checks remained 401 without authorization, 201 for fresh management-session creation and 403 for a mutation without CSRF. The persistent arm retained the Dark theme and diagnostic browser-storage marker. The memory arm lost both and rendered System theme, as expected. No real credentials, production profile migration or actual reboot were tested; these observations do not establish comprehensive state-preservation acceptance.

The first launches' DIPS WAL files were consolidated into their database files around normal Quit. A post-cleanup, read-only SQLite query found `config.timer_last_fired` in both control databases and in the experimental audio database; the experimental default database was absent. Thus the management disk-backed path was avoided in these samples, but the same category of timer persistence still exists in the persistent audio session. This does not prove the audio database caused the historical delay. With only two completed post-playback samples per arm, no slow control, an interrupted restart sequence and increasing external resource load, no causal shutdown-performance benefit is established. The memory arm was not faster in these observations.

**Decision:** retain persistent management in production. Do not ship this partition switch as a BL-044 fix: it loses a user preference without migration, leaves audio-session Chromium disk persistence and has not demonstrated a shutdown benefit. The original native shutdown cause remains unresolved. A separate product proposal for durable shutdown diagnostics and tightly owned recovery is a possible next direction, not an implemented or accepted change. Real reboot/credential/migration gates remain outstanding if the partition approach is revisited.

The `2026-09-08T03:37:44.5537470Z` independent cleanup check found all 46 captured PID values absent, no process using the diagnostic executable and no listeners on the four allocated service ports. No force-stop occurred. An earlier restricted-context listener query returned access denied; its checkpoint is explicitly invalid and is superseded by `comparison-final-cleanup-verified.json`. Production/copy executable and original archive fingerprints remained unchanged. Diagnostic syntax checks, evidence reconciliation assertions and the route-order regression check passed. Production sources, dependencies, OpenSpec requirements, real user data, credentials, hardware, vendor lifecycles and security policies were not changed; no audio was audible and no evidence was uploaded.

Ignored local evidence under `dist/diagnostics/mgmt-session-20260908/`: `comparison-normal-1.json`, `comparison-normal-2.json`, `comparison-normal-2-resume.json`, `comparison-analysis.json`, `comparison-dips-config.json`, `comparison-final-cleanup-verified.json`, the corrected `compare.mjs` and `analyze-comparison.mjs`. Profiles and unsuccessful checkpoints are retained for audit.

Local ignored evidence is under `dist/diagnostics/shutdown-20260905/`: `audio-devices-baseline-20260906.json`, `audio-devices-after-unplug-20260906-0206.json`, `audio-devices-after-reconnect-20260906.json`, `active-device-loss-1788661422395.jsonl`, and `active-device-loss-1788661617311.jsonl`. The diagnostic-only `test-active-device-loss.mjs` and `read-device-loss-state.ps1` reuse the existing read-only inventory/session helpers; JavaScript syntax and PowerShell parsing passed before execution. Use a case-sensitive JSON parser (or PowerShell `ConvertFrom-Json -AsHashtable`) for the raw session rows: they retain both the outer `at` and native `At` timestamp keys.

### September 8: focused phase logging and staged reproduction

Following the source-backed research, the user approved lightweight logging and a minimal staged reproduction, **not** the previously proposed native recovery subsystem. The unimplemented `add-desktop-shutdown-diagnostics-recovery` proposal now reflects that narrower scope; its ID is retained for existing links. Production management/audio sessions remain persistent, and no timeout, edit decision, tray behavior, driver, vendor process or security setting changes.

Public evidence supports an upstream/platform mechanism as plausible, not a blanket conclusion that application code cannot contribute:

- Chromium documents a historical Windows shutdown hang involving low-priority background I/O and cache work in its [November 2021 performance investigation](https://blog.chromium.org/2021/11/searching-browsing-shutdown-chrome-performance-improvements.html). That is a mechanism precedent, not evidence of the same current defect.
- Electron's [Windows shell shutdown fix #52888](https://github.com/electron/electron/pull/52888) demonstrated native lingering processes in a different COM/shell path. Its change is already present in the inspected Electron 44.1.1 source, so adopting that fix again does not address the captured BTM/SQLite wait.
- The firsthand [Electron #41668 report](https://github.com/electron/electron/issues/41668) describes intermittent closed applications with residual Windows processes, but lacks a matching confirmed cause. Conversely, [#30167's reporter](https://github.com/electron/electron/issues/30167#issuecomment-885415520) traced their apparent Electron exit problem to their own native code. Similar symptoms do not establish common ownership.

**Task-trait clarification:** the inspected Chromium `152.0.7977.65` [BTM task-runner setup](https://chromium.googlesource.com/chromium/src/+/refs/tags/152.0.7977.65/content/browser/btm/btm_service_impl.cc) selects best-effort/background work without an explicit `BLOCK_SHUTDOWN` trait. The default is `SKIP_ON_SHUTDOWN`, whose [documented semantics](https://chromium.googlesource.com/chromium/src/+/refs/tags/152.0.7977.65/base/task/task_traits.h) still require **already-running** tasks to finish. Thus “shutdown-blocking” in the historical stack evidence describes its effect, not an explicitly selected blocking trait. The long underlying write/scheduling delay is still unexplained.

#### Implemented instrumentation and regression evidence

The main process now has an opt-in, asynchronously written fixed-field JSONL phase log. It distinguishes decision time, service cleanup, audio/window destruction and Electron quit events; it never treats those events as native exit. Exclusive creation, a 256-record / 64-KiB accepted-data bound and failure isolation prevent overwrite/unbounded logging. There is no forced-exit helper, automatic recovery, old-session scan or persistence migration. See the [operator/developer runbook](windows-desktop-tray-runtime.md#opt-in-shutdown-evidence-september-8).

TDD evidence: the initial no-op logger failed three behavioral assertions; all five real-file logger tests passed after implementation. The fixture's initially empty WAV/output functions failed both regression tests; the implemented all-zero PCM and explicit-output resolver passed both. The new packaged Cancel/Discard test failed against the old package because the decision record was absent, then passed against the rebuilt package in 2.8 seconds (3.4 seconds including runner overhead). That expected red run is a regression-test demonstration, **not** a BL-044 reproduction. Both runs used ordinary Quit for cleanup.

The rebuilt package's 17 records show a cancelled attempt with health still HTTP 200 and no service-stop request, followed by a separate accepted attempt. Service stop took 12.917 ms and accepted-decision-to-Electron-quit took 23.205 ms in this sample. All eight captured processes disappeared with launcher exit code 0 and the listener stopped. The log is retained at `%TEMP%/stream-jams-shutdown-phases-YfkSGQ/phases.jsonl`; the expected old-package failure profile is `%TEMP%/stream-jams-shutdown-phases-DTqQ1v`. These profiles contain only isolated QA state and are retained, not purged.

#### Bounded staged controls

The developer fixture uses plain Electron 44.1.1 / Chromium 152.0.7977.65, unchanged sandboxing and disabled hardware acceleration. Both windows use persistent sessions. The first two stages import no Stream Jams runtime; the third adds the real bundled utility service with correlated start/stop messages and lifecycle-only audio acknowledgements. It does not add the production alert coordinator or management UI. Audio requests use all-zero PCM **and volume zero**, targeting distinct explicit System and SFX outputs individually and together. They are silent capability controls, not physical audibility/meter acceptance.

Each fresh isolated profile dwells seventy seconds with both windows hidden. The fixed sequence is windows, audio, service, service, audio, windows, with a fifteen-second external native observation deadline and first-failure batch stop. The runner has no forced cleanup, uses no live credentials/profile and retains local evidence under ignored `dist/diagnostics/bl044-staged-2K7z4Z/`. Captured PID disappearance and listener refusal are checked separately from lifecycle events.

| Sample, in execution order | Captured native exit observation | Launcher | Service listener after Quit |
| --- | --- | --- | --- |
| 1: Persistent windows only | 109 ms | Exit 0 | Absent (not started) |
| 2: Windows plus explicit silent audio | 108 ms | Exit 0 | Absent (not started) |
| 3: Audio plus owned utility service | 203 ms | Exit 0 | Absent |
| 4: Audio plus owned utility service | 253 ms | Exit 0 | Absent |
| 5: Windows plus explicit silent audio | 108 ms | Exit 0 | Absent (not started) |
| 6: Persistent windows only | 261 ms | Exit 0 | Absent (not started) |

Both service samples recorded the matching stop acknowledgement, worker exit and service-stop completion before window destruction. System/SFX selections resolved to the intended distinct explicit endpoints with no fallback. Both DIPS database paths existed after every sample. In sample 6 the default database remained 4,096 bytes with a 45,352-byte WAL despite confirmed native exit; other sampled default/audio databases were 36,864 bytes with no WAL at observation. WAL presence alone is therefore not a native-exit failure criterion. These are file metadata observations, not a database-integrity test or instruction-level I/O trace.

The independent normal-user check at `2026-09-08T04:53:44.8428817Z` found all **62** captured PID values absent (46 across the staged batch plus 16 across the expected-red and rebuilt packaged checks). All eight allocated ports had no listening socket. The checking token was non-administrator. No native force-stop or diagnostic-profile deletion occurred.

Self-review added an explicit pre-Quit service-health/worker-state guard and broader owned-PID collection when fixture startup fails. These tighten future failed-run classification; the completed batch's service event sequences separately show both workers exited only after the requested stop. The no-force/first-failure branch was inspected, not exercised by deliberately inducing a native hang. No matching failure occurred to validate a native-failure capture end to end.

Final affected checks passed: 10 desktop unit files / 54 tests, both silent-fixture unit tests, focused ESLint, desktop and desktop-test TypeScript checks, workspace build/desktop packaging, the rebuilt packaged regression and strict validation of the narrowed OpenSpec. The build retained its existing large-web-chunk advisory; this change adds no frontend behavior. Full browser/Storybook/provider suites were not rerun for this diagnostic-only scope. The earlier dialog-test repair and investigation notes were preserved. No spec archive, commit, push or publication was performed.

**Conclusion:** the approved diagnostic implementation and bounded comparison are complete. BL-044 was **not reproduced and is not resolved**. Six short negative controls, fresh profiles, inspector instrumentation, a static management page and uncontrolled external machine load do not exclude Stream Jams-specific triggers or prove a platform cause. Persistent sessions remain the production choice. The proportionate next diagnostic is to enable the bounded phase log for a naturally recurring failure and correlate its last phase with native process evidence, not to ship automatic recovery or expand synthetic repetitions without a new hypothesis.

### September 8: debugger-free retained-profile controls

The subsequent bounded comparison exercised the actual packaged app for two five-minute sessions, reusing one isolated profile, configuration, database and asset directory across restart. Both launches used the verified normal, non-administrator user context without an inspector, remote-debugging switch or sandbox override. The executable and ASAR hashes matched before and after the comparison. No production code, vendor process, security setting or real user profile changed in this round.

Two preliminary attempts failed during diagnostic setup, before playback, and are not shutdown reproductions or passing samples:

- `run-nz9jxL`: the runner expected a nonzero .NET `MainWindowHandle`, but the diagnostic launch had hidden its windows. Exact-PID enumeration found the hidden management window. The helper was corrected to select the unique owned `Stream Jams` / `Chrome_WidgetWin_1` window, including hidden windows.
- `run-azw7FW`: the diagnostic alert lacked a collection, so the editor correctly returned HTTP 422: the alert was missing a set or default variation. The fixture now creates a disabled set. Before another launch, a narrower offline check reproduced the rejected input and validated the corrected editor document, explicit outputs and zero-volume audio layer against production code/schema.

Both attempts were cleaned up through ordinary window close, with their failure reports retained. The preliminary reporting code could save before Node received the native-exit callback; their reports therefore do not establish a native exit code. The completed comparison waits for that callback and captured-process disappearance within the existing deadline. No forced termination was used.

The completed comparison is retained locally under `dist/diagnostics/no-debug-retained-20260908/run-D459MQ/`, alongside its one-off helpers and the failed attempts. Each session completed six production-queue editor-test playbacks: explicit System-only, SFX-only and combined outputs, once near the beginning and once near the end. The asset contains all-zero PCM and its audio layer has volume zero; browser-source output and TTS were excluded. All twelve matching queue items completed, and neither runtime log contained an `audio.playback.failed` event. This tests delivery/control flow, not audible or physical-meter acceptance or live-provider ingestion.

| Session | Retained-profile dwell | Service stop | Accepted decision to Electron quit | Window-close request to native exit | Native exit |
| --- | --- | --- | --- | --- | --- |
| 1 | 302.571 s | 14.598 ms | 56.169 ms | 2,731 ms | Code 0 |
| 2 | 302.390 s | 22.444 ms | 41.476 ms | 1,728 ms | Code 0 |

Both native exits met the unchanged 15-second deadline. Timings were reconciled from raw JSON timestamps, not locale-converted PowerShell date strings. Restart preserved the complete saved editor document, explicit device bindings/output records and disabled close-to-tray policy. The retained WAV's SHA-256 matched its imported checksum after both sessions. Closing with tray mode enabled kept the service healthy without a Quit marker, but both management windows were already hidden; this is not new visible-to-hidden UI acceptance.

The helper revalidated the main PID, executable path, start time and window ownership before posting ordinary `WM_CLOSE` to that exact window. Microsoft documents [window-owner PID lookup](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid) and [posting a message to a specified window](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postmessagew). No broadcast, injected `app.quit()`, debugger close or process-tree kill was used.

An independent check at `2026-09-08T14:49:55.3144242Z` found all **32 distinct captured PIDs** across the three attempts absent and no listening sockets on the **three allocated ports**. Diagnostic profiles and evidence were retained, not purged. The fixture check and result-analysis assertions passed. This round did not rebuild the unchanged package or rerun unrelated suites, archive specs, commit or publish.

**Outcome and remaining evidence:** BL-044 remains open: **not reproduced in these controls, not resolved**. The debugger-free, production-page, retained-profile samples address limitations of the earlier short instrumented controls, but do not reproduce a full real-use profile, a long streaming session or the historical machine load. No matching slow exit occurred, so neither a native-failure capture nor a causal fix has been validated. The next useful step is a representative normal-use session with bounded phase logging; if slow Quit recurs, preserve the instance and correlate the last phase with native process evidence. Any invasive trace/dump or forced cleanup needs separate authorization. Only a cause-supported fix, verified under the failing conditions and checked for state-preservation/lifecycle regressions, would justify closing BL-044. Further identical short repetitions are not currently warranted.

### September 8: diagnostics PR handoff

The user subsequently authorized committing and publishing relevant BL-044 work as a PR to main. Branch `codex/bl044-shutdown-diagnostics` was created from freshly fetched `origin/main` at `61642ae`. The publication scope is the opt-in logger, reusable staged fixtures/runner, competing-dialog test repair, OpenSpec artifacts and sanitized written evidence/runbook. Raw captures/dumps, local profiles/device inventories, generated packages and machine-specific one-off scripts remain ignored and unpublished. No merge, spec archive or defect closure is implied.

Fresh local publication checks passed: repository lint, root typecheck, desktop-test typecheck, all 54 desktop unit tests, workspace build/desktop packaging, and the full packaged desktop suite (**19 passed / 1 explicitly gated audible test skipped**). All 33 OpenSpec changes/specs passed strict validation. The package build retained the existing large-web-chunk advisory. The packaged suite includes the new Cancel/Discard phase regression, repaired native-dialog selection, normal native X, restart/state preservation and silent production audio RPC. Post-suite checks found no Stream Jams process or surviving child of the interrupted unit runner.

The full local `pnpm test` command produced only its Vitest startup banner, with no test results, and was interrupted after several minutes. The inspected process was the repository's Vitest parent with a fork worker, not Electron. Its exact collection/runner cause is unresolved; this is an incomplete local gate, not a passing full suite or a demonstrated BL-044 regression. The independent focused desktop run passed. Repository-wide validation, Storybook, browser E2E and security checks must be taken from the PR's CI result; this record does not predeclare their outcome.

Independent review identified two diagnostic correctness/coverage gaps, both repaired before publication. The pure Node silence/output-selection tests are now included in the standard `test:unit` command, alongside two new native-exit observer tests. The staged runner previously sampled `child.exitCode` immediately after PID disappearance, which can precede Node's exit callback on Windows and falsely fail a clean sample. It now subscribes immediately after launch and awaits the delivered result within the same fifteen-second deadline, still requiring captured PIDs/listener to disappear. A real short-lived Node child regression failed against the snapshot implementation (`null` instead of exit code 7), then both exit-observer tests passed; all four Node helper tests, focused lint and runner syntax checks passed. The six-stage experiment was not repeated for this observer-only repair, and its earlier outcomes are not relabeled. These are test/diagnostic repairs, not a native-shutdown mitigation.

The [first PR CI run](https://github.com/jamsethoth/stream-jams/actions/runs/34248659177) independently passed full validation (182 Vitest files plus all four Node helper tests), build, Storybook, browser E2E, CodeQL and dependency review. Windows desktop reported 18 passes, one audible-gated skip and one failure: the existing duplicate-launch test hid management before its initial startup `show()` completed, then timed out expecting it to remain hidden. This occurred before the duplicate launch or shutdown, not in BL-044's native-exit observation. Source confirms `ManagementWindow.load()` calls `show()` after `loadURL` resolves, whereas the test had waited only for URL/health. The test now first observes the initial visible window before hiding it. All original assertions and deadlines remain; no production code changed. Focused lint/typecheck and five corrected duplicate-launch repetitions passed (36.6 seconds). The initial CI failure is retained rather than labeled a passing run; final-head CI remains the publication-readiness authority.
