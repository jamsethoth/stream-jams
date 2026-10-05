# Opt-in packaged native cold/warm timing runner

## Current schema 3: ETW storage-read evidence

The runner now implements the approved [ETW plan](cold-timing-etw-plan.md). It uses the built local TraceEvent helper to qualify exact-file read mapping without purging, capture owned bounded sessions, compare packaged playback after reviewed cache-purge requests with warm repeats, and assess exact-fixture storage-read completions. Its claim is startup with verified storage reads after OS-cache purge; complete eviction and hardware-cold storage remain excluded. The default remains nonmutating, and `--measure-warm` remains available without ETW or elevation.

The helper has been built in this checkout. From a fresh existing Administrator PowerShell, first run the nonpurging live qualification:

```powershell
Set-Location 'C:\Users\James\.codex\worktrees\64e0\stream-jams'
& '.\node_modules\.bin\node.EXE' '.\scripts\local-media-cold-timing.mjs' --verify-tracing
```

Only after that returns `outcome: completed`, run the integrated comparison when cache mutation is intended:

```powershell
& '.\node_modules\.bin\node.EXE' '.\scripts\local-media-cold-timing.mjs' --execute-cache-purge --acknowledge-system-wide-cache-purge --rammap '.\apps\desktop\out\cold-timing-tools\RAMMap\RAMMap64.exe' --pairs 1
```

The comparison independently repeats qualification before requesting any purge. `completed` requires exact-file disk-read evidence for every first-pass fixture and zero known event/buffer loss; absent evidence is inconclusive. Neither a warm repeat nor a later pair can conceal an earlier gap. Qualification itself is labelled verified file-read mapping, not verified storage reads.

ETL/ETLX and JSON evidence remain under ignored `apps/desktop/out/local-media-cold-timing`. Raw traces can contain unrelated machine paths and are kept local. Capture uses a unique owned system-logger handle, a 120-second watchdog, bounded buffers and a 128 MiB sequential ETL cap. Analysis uses TraceEvent's supported TraceLog rundown handling, a bounded event count, and disabled symbol downloads. See [helper dependency/lifecycle review](../../../../scripts/local-media-etw/README.md).

Cleanup attempts trace and native shutdown independently. Failed cleanup saves failure evidence, closes and retains the owned account-specific machine-local file lock with recovery metadata, and blocks another run in that account. The helper also holds a machine-wide mutex for capture and blocks if another Stream Jams test session exists, protecting the purge interval across elevated accounts. Investigate the recorded session/helper/app PIDs before removing that specific lock; never globally cancel WPR, delete a replacement lock, or stop unrelated sessions. Normal cancellation sends a stop request to the owned helper and independently closes the disposable package. External force termination can defeat in-process cleanup.

To rebuild explicitly after source changes, use `dotnet build scripts/local-media-etw/LocalMediaEtw.csproj -c Release --locked-mode` with the installed .NET 10 SDK. The timing runner never restores packages, builds a helper, installs a runtime or elevates itself.

## Historical schema 2 investigation

The following describes the superseded RAMMap residency approach, not current schema 3 execution. Exact-file eviction remains unproven; ETW was approved as the supported alternative with a narrower claim.

Schema 2 measures packaged integrity preparation followed by actual muted native audio clock advancement through the existing private selected-device playback route. Valid repository MP4 media is padded with a fully written free box to exactly 1/25/100 MiB, imported and natively probed before any proposed purge. This replaces schema 1's non-playable synthetic bytes and interval transport timing. Physical sound, OBS, isolated integrity duration and production IPC-internal owner/grant/reader counts remain unverified.

Default `node scripts/local-media-cold-timing.mjs` prints a plan without adapter calls, writes, package launch or cache changes. `--measure-warm` uses the existing packaged executable in its own temporary profile, creates its own alert set/rule and selected-device route, and runs with authoritative mute and zero gain. It does not launch RAMMap. `--pairs` is bounded to 1-3. Native pre-probe warms every imported fixture; the first recorded warm-only pass is consequently `uncontrolled-after-preprobe`, followed by `warm-repeat`.

**Exact-file eviction verification is [blocked].** The missing dependency is a reviewed RAMMap 1.63 snapshot FileList/PFN representation, validated against the exact imported paths/file identities with a warmed-file positive control. The current CLI blocks acknowledged real-purge mode during preflight before acquiring a lock, creating fixtures, launching the package or requesting a cache purge. No CLI proof/JSON is accepted. A test dependency seam verifies outcome/order rules; it does not establish Windows residency support.

An untouched mapping's QueryWorkingSetEx Valid=0 is insufficient: the documented API describes process virtual addresses, and its invalid block does not document global cache-page physical location. Standby pages can satisfy soft faults without backing-store reads. RAMMap supports File Summary, File Details and snapshots. Its inspected signed binary identifies positional snapshot output. The supplied snapshot has now been inspected; the remaining dependency is a trustworthy FileList/PFN join and completeness contract, followed by a warmed-file positive control. The MIT etwview parser was considered; its process/system parser provides no validated exact-file observer and lacks established adoption/history. No invented PFN schema, undocumented Nt calls or new dependency was added. Sources: [QueryWorkingSetEx](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-queryworkingsetex), [working-set block](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-psapi_working_set_ex_block), [working set](https://learn.microsoft.com/en-us/windows/win32/memory/working-set), [RAMMap](https://learn.microsoft.com/en-us/sysinternals/downloads/rammap), [snapshot format request](https://github.com/MicrosoftDocs/sysinternals/issues/235), [etwview](https://github.com/proxylat/etwview).

## Supplied snapshot inspection

`pwsh -NoLogo -NoProfile -NonInteractive -File scripts/local-media-residency-inspect.ps1 -Snapshot apps/desktop/out/cold-timing-tools/residency-format-probe.rmp` reads the existing snapshot without running RAMMap, reading fixture content, or changing caches. It streams XML and large text nodes through a 65,536-character buffer; it emits structural counts and attribute names, never file paths, keys or process names. It always returns `status: inconclusive` and exposes no residency count. Malformed/prohibited XML exits nonzero; an unknown root cannot become eviction proof.

The supplied 842,258,607-byte snapshot has `root` attributes `Application=RamMap`, `Version=1.0`, `Architecture=amd64`, 581 process entries and 62,184 self-closing `File` entries. Each file has only `Key` and `Path`; there are no child elements containing per-file page counts or PFNs. `PfnDatabase` contains 802,125,024 text characters, observed to begin with hexadecimal data. This establishes XML structure, not how a binary record refers to a file key or which states count as resident. An absent FileList entry cannot mean zero resident pages without a completeness guarantee.

The official RAMMap page documents its UI views and snapshots but provides no file-key/PFN record layout. The MicrosoftDocs export request describes the embedded PFN parsing gap. A newly found [rmp2csv package](https://pypi.org/project/rmp2csv/) explicitly warns that its entire implementation and reverse-engineering notes were AI-generated and may contain incorrect assumptions; its linked format notes returned 404 during this review. It is not accepted as a trusted eviction decoder. A positive control alone would not establish the correctness of an undocumented zero-page/completeness inference, so no additional user snapshot capture is requested merely to repeat this unresolved prerequisite.

The smallest supported alternative is trace evidence of reads reaching the Windows storage stack during the exact imported-file verification/playback window. Microsoft's [PerfView user guide](https://github.com/microsoft/perfview/blob/main/src/PerfView/SupportFiles/UsersGuide.htm) distinguishes completed physical disk reads (`DiskIO`), file-object/name mapping (`DiskFileIO`), and file operations that can be satisfied from cache. Microsoft's maintained [TraceEvent library](https://github.com/microsoft/perfview/blob/main/documentation/TraceEvent/TraceEventLibrary.md) or [.NET TraceProcessing disk/file I/O consumers](https://learn.microsoft.com/en-us/windows/apps/trace-processing/tutorial) can interpret those traces. This route needs a reviewed collection profile, existing elevated capture session, installed/restored parser, complete file-name mapping, markers identifying the measurement window, lost-event checks and a nonpurging positive control before integration. It could prove observed disk-backed reads and compare warm repeats; it would not prove whole-file eviction, distinguish SSD/controller cache, or establish hardware-cold timing. Disk offsets are not file offsets, so full-file range coverage requires a separate documented mapping. No ETW session, parser installation or purge was performed for this investigation.

The retained future command is only for an existing elevated Windows terminal after the observer dependency is resolved:

```powershell
node scripts/local-media-cold-timing.mjs --execute-cache-purge --acknowledge-system-wide-cache-purge --rammap C:\path\RAMMap64.exe --pairs 1
```

Previous safety gates remain: CI blocked; exact reviewed RAMMap64 SHA256 `e970913798481432cd590991577089e68510b861dc669dcab24feb06aae0df52`, version 1.63, valid Microsoft signature, existing elevated terminal and previously accepted EULA. No auto-elevation, installation/download, EULA acceptance, registry write, reboot, modified-page-list flush, all-process working-set purge or retries. Only reviewed shell-free hidden `-Es` then `-Et` children are retained, with timeout/cancellation. [Official ZIP](https://download.sysinternals.com/files/RAMMap.zip). Successful exit is request completion, never cold proof.

After an observer is validated, sequencing is prepare/import/probe, purge, independently observe exact-file residency without content reads, immediately trigger packaged verification/native playback, then repeat warm. Unknown evidence or remaining resident pages produces `inconclusive`. Every pair's proof is retained so later success cannot hide an earlier inconclusive pair. No fixture hash, preview or probe read occurs between observation and playback.

An exclusive machine-local temporary lock prevents overlap across worktrees and is never stolen. Package executable/ASAR hashes and output writability are checked before purge. Each playback arms native observation before its request, requires at least 50 ms of currentTime advancement while playing, verifies private transport, explicit sink, mute and zero gain, then skips and waits for native detachment. Timing is a wall-clock upper bound including preparation, transport, decoder startup and the 50 ms advancement requirement, sampled every 5 ms. It is not sample-accurate audible onset. Packaged internal counters and individual integrity duration are explicitly unavailable.

Only this runner's sandbox-enabled package launch is closed. Normal quit is bounded, captured PIDs must exit, and deletion is confined to its own resolved temporary prefix. Shutdown failure attempts bounded termination of only its still-running launch child tree, records attempt/completion/PIDs, retains the profile and never reports normal shutdown success. Existing runtime, installed executable and production user data stay untouched. Unique exclusive-write evidence files live under ignored `apps/desktop/out/local-media-cold-timing`; `--output` changes the evidence directory. Grant handles, device identifiers and credentials are excluded.
