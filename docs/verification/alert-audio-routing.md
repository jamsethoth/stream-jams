# Alert audio routing capability evidence

Current implementation checkpoint (September 7): production routing, queue/player safety, authoring, backup/activity protection and diagnostics have been integrated. See the [authoring and acceptance record](alert-audio-routing-authoring-acceptance.md) for automated verification and the remaining final physical-device/OBS matrix. The evidence below remains historical capability evidence, not acceptance of the final integrated build. BL-044 remains separately owned and deferred; native shutdown deadlines are unchanged.

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

Local ignored evidence is under `dist/diagnostics/shutdown-20260905/`: `audio-devices-baseline-20260906.json`, `audio-devices-after-unplug-20260906-0206.json`, `audio-devices-after-reconnect-20260906.json`, `active-device-loss-1788661422395.jsonl`, and `active-device-loss-1788661617311.jsonl`. The diagnostic-only `test-active-device-loss.mjs` and `read-device-loss-state.ps1` reuse the existing read-only inventory/session helpers; JavaScript syntax and PowerShell parsing passed before execution. Use a case-sensitive JSON parser (or PowerShell `ConvertFrom-Json -AsHashtable`) for the raw session rows: they retain both the outer `at` and native `At` timestamp keys.
