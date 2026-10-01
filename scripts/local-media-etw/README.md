# Local media ETW helper

Opt-in developer tool; it is not shipped in Stream Jams and is never invoked by
the default timing plan. Build with the installed .NET 10 SDK:

```powershell
dotnet restore scripts/local-media-etw/LocalMediaEtw.csproj --configfile scripts/local-media-etw/NuGet.Config --locked-mode
dotnet build scripts/local-media-etw/LocalMediaEtw.csproj -c Release --no-restore
dotnet scripts/local-media-etw/bin/Release/net10.0-windows/LocalMediaEtw.dll self-test
dotnet scripts/local-media-etw/bin/Release/net10.0-windows/LocalMediaEtw.dll preflight
```

Restore uses a project-local ignored `.packages` directory and checked-in lock.
No global tool installation. `preflight` is read-only; it reports existing-token
elevation and Windows x64 capability. Capture does not elevate or change caches.
Raw ETL records can contain unrelated machine file/process paths: keep the ETL
local in the runner's ignored evidence directory. Summary JSON emits only supplied
fixture/window IDs, counts and aggregate loss; never unrelated paths.

Capture requires `--session StreamJamsMedia-<UUID> --output NEW.etl
--timeout-seconds N` with N from 1 through 180. Stdout is one JSON object per line:
`ready` after start, `stop-started` before the blocking native stop, then `stopped`
after stopping. The latter two include UTC boundaries and `stopped` includes
monotonic `stopElapsedMs`. Send stdin line `stop` for
success. EOF, invalid input, cancellation and watchdog stop the owned session but
exit nonzero. Existing session names and existing output files are rejected.
Capture first acquires the machine-wide named [Mutex](https://learn.microsoft.com/en-us/dotnet/api/system.threading.mutex)
`Global\StreamJamsMediaColdTiming` without waiting, then queries active ETW
sessions read-only. Any existing `StreamJamsMedia-` session blocks start, including
an orphan from another account. Busy, abandoned or inaccessible coordination,
and unknown session inventory, fail closed. No ACL repair, registry change or
orphan-session stop is attempted. The controller retains the mutex on the same
thread through capture/owned stop; stdin reading and the independent watchdog
use background tasks. This serializes helper-backed purge runs across accounts.
Abrupt forced process termination can defeat in-process cleanup; do not force-kill
the helper. It never stops WPR or any unrelated session.

The runner saves the exact-fixture manifest before requesting stop and sends one
stdin stop command. Its initial owned-stop wait is bounded to 45 seconds, including
helper exit. On the 2026-10-01 nonpurging verification, the previous 15-second wait
expired, but a second cleanup wait completed normally. The retained ETL header
covers 04:25:40.6454037Z through 04:26:10.6685601Z (30.023 seconds), with zero lost
events; the old runner did not record its stop-request timestamp, so that interval
does not measure native stop duration or establish why it took longer. The new
45-second budget accommodates the observed completed lifecycle with margin.
Node records stop-request, helper-close and total wait timing along with the
helper's native-stop timing, retaining the PID even after exit. Missing successful
`stopped` evidence, nonzero exit or an unresolved deadline still fails closed and
retains evidence and ownership for cleanup. The helper watchdog bounds waiting
for a stop request; it cannot cancel a synchronous `ControlTraceW` call. An
unresolved owned stop retains the runner's machine lock. This implementation has
fake-child coverage; elevated live verification remains required before any purge.

Analyze uses `--trace FILE.etl --manifest FILE.json --output NEW.json` and does
not alter tracing sessions. The library creates a uniquely named local ETLX next
to the trace so complete end-of-trace file/process rundown can resolve earlier
events. Conversion retains at most one million events; truncation or timestamp
inversion fails closed. Symbol resolution and remote symbol downloads are disabled.
The ETLX can also contain unrelated paths and must remain local and ignored.
Manifest schema 1 has `fixtures: [{id,path}]` with
unique exact canonical paths and `windows: [{id,fixtureId,kind,startUtc,endUtc,
processIds}]`. Kind is `positive-control` or `measurement`; UTC windows must be
bounded and nonoverlapping. Every measured fixture needs its own earlier control
in the same trace, and a FileIORead from a declared PID in both windows.

`observed` means mapping and loss checks passed, including with zero disk reads.
The caller must additionally require nonzero exact-file `diskReadBytes` before
labeling a pass `storage-reads-observed`. Other-process/unknown attribution,
unmapped disk reads in a window, unknown/nonzero loss, or missing trace coverage
returns `inconclusive`. System PID 4 reads are retained separately because cache
manager activity may use that PID. Temporal coincidence does not prove causal
ownership. Disk offsets are not file offsets. This proves neither whole-file
eviction, full-file range coverage, SSD/controller cache state nor hardware-cold
timing.

## Dependency review

Uses Microsoft's established MIT-licensed [TraceEvent](https://github.com/microsoft/perfview)
[3.2.8 NuGet package](https://www.nuget.org/packages/Microsoft.Diagnostics.Tracing.TraceEvent),
exactly resolved in `packages.lock.json`; its parser decodes ETW records and maps
file keys/file objects plus kernel volume paths to names. No PFN decoder, custom
ETW event decoder, new Node dependency or production dependency is added. It is
used by BenchmarkDotNet and Microsoft's diagnostics tools; net10 uses its netstandard2.0
asset with diagnostics-client, reflection and logging transitive dependencies.
On 2026-10-01 the NuGet audit of direct and transitive locked packages reported
no known vulnerable packages in the configured NuGet source. That audit is a
point-in-time result, not a guarantee of future advisory status.

[Kernel parser source](https://github.com/microsoft/perfview/blob/main/src/TraceEvent/Parsers/KernelTraceEventParser.cs)
documents `DiskIORead`, `TransferSize`, timestamp-aware `FileIDToName`, default
`VolumeMapping`, and `EventTraceHeader.BuffersLost`.
[ETW source](https://github.com/microsoft/perfview/blob/main/src/TraceEvent/ETWTraceEventSource.cs)
reads `EventsLost` from ETL logfile headers. Unknown buffer/header loss fails
closed. Fake decoded-event reducer tests exercise these decision rules; a live
elevated positive control is still required to establish machine capability.

The [session library source](https://github.com/microsoft/perfview/blob/main/src/TraceEvent/TraceEventSession.cs)
unconditionally resets global CPU sampling and heap flags in its `Stop()` path.
Its startup can also throw after creating a session before setting `IsActive`,
making successful ownership unavailable through its public lifecycle API. The helper
uses narrow documented [StartTraceW](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-starttracew)
and [ControlTraceW](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-controltracew)
lifetime calls to retain the returned owned handle and avoid those unrelated changes.
It uses one named system logger, QPC clock, sequential 128 MiB maximum file and
64 KiB buffers (64 minimum, 512 maximum). Reaching the file limit stops the trace
and invalidates normal stop evidence. The 1-180 second watchdog bounds waiting
for a stop request; the caller separately bounds its exit wait. It cannot cancel
a blocking native ControlTrace call. Process/thread events provide PID mapping.
Capture never enables profile,
stack, heap or registry keywords. All event interpretation remains in TraceEvent.
