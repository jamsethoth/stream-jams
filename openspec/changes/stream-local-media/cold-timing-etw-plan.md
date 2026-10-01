# Automated storage-read startup timing

The approved extension replaces RAMMap snapshot decoding with observed storage reads. Its acceptance claim is **startup with verified storage reads after OS-cache purge**, not complete file eviction or cold SSD/controller caches. Existing packaged playback measurements and physical-output acceptance retain their documented scope.

## Integration

- Keep the existing default nonmutating dry-run and explicit warm-only mode.
- Add an explicit, nonpurging trace-validation mode. Build/restore the local analysis helper separately before execution; the timing runner never installs dependencies or elevates itself.
- Use Microsoft's maintained TraceEvent library to decode ETL events and correlate file names. Keep any native lifecycle code limited to documented control of the helper's owned session; document a concrete library gap before adding it.
- Prepare, import, hash and probe disposable 1/25/100 MiB valid MP4s before a purge. Use the existing packaged private audio route, authoritative mute, zero gain and an explicitly selected sink.
- Validate tracing and exact-file read attribution using a nonpurging positive control before permitting cache mutation. A started trace alone is insufficient.
- Start a unique, owned and bounded capture; request only the reviewed signed RAMMap `-Es` then `-Et`; record each native request-to-clock-advancement window and repeat warm. Record clock advancement as an upper bound including the required 50 ms progression and observation delay.
- Stop only the owned session and analyse the trace locally. Require known zero lost events, exact fixture attribution and observed disk-read completion during every tested first-pass window. Compare warm reads without requiring them to be zero.
- Aggregate every fixture and pair: a later pass cannot conceal missing evidence or an earlier failure. Missing or ambiguous evidence produces an inconclusive result.

## Safety and evidence

Retain Windows/admin/EULA/signed-tool prerequisites, CI exclusion, explicit system-wide purge acknowledgement, the account-specific machine-local exclusive file lock and bounded pairs. The helper additionally holds a machine-wide named mutex during capture and blocks on any existing Stream Jams test session, protecting the purge interval across accounts without changing access permissions. Never attach to or restart an existing trace, globally stop WPR, adjust profiling settings, write registry settings, auto-elevate, reboot or retry a purge. Cancellation must independently stop the owned trace and disposable package; failed cleanup retains a failing outcome and owned session/process identifiers. Abrupt process termination can leave an ETW session, so document recovery scoped to the recorded owned identity.

Raw ETL files may contain unrelated system file names. Keep them in ignored local evidence storage; summaries expose fixture identifiers and counts, not unrelated paths or credentials. Bound capture duration, buffers and evidence size. Preserve failed evidence rather than silently deleting it. Delete only verified disposable profile paths after their owned processes exit.

Disk offsets are not file offsets. Observed read bytes are not proof of whole-file uncached coverage. Disk completions show reads reaching the Windows storage stack, not that an SSD accessed flash rather than its controller cache. Native audio clock advancement is not a measurement of physical sound onset.

## Verification

Run focused helper and orchestration tests covering attribution, windows, event loss, missing data, collisions, timeout/cancellation and cleanup. Compile against the pinned maintained library; verify dry-run and warm packaged playback with the pinned Node runtime. Live trace validation requires the user's existing Administrator PowerShell. A passing nonpurging trace control precedes the explicitly acknowledged purge command. Keep actual storage-read acceptance open until a real local run supplies evidence.

Sources: [Microsoft TraceEvent](https://github.com/microsoft/perfview/blob/main/documentation/TraceEvent/TraceEventLibrary.md), [TraceProcessing disk/file consumers](https://learn.microsoft.com/en-us/windows/apps/trace-processing/tutorial), [ControlTraceW](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-controltracew).
