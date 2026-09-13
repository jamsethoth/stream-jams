## Context and approved scope

The user approved lightweight phase logging and a minimal staged reproduction on September 8. This replaces the unimplemented recovery helper. Implementation began from refreshed origin/main in the existing isolated worktree, preserving the dirty dialog-test repair/evidence. That execution excluded publication; the user subsequently authorized a dedicated diagnostics branch and PR to main. Publishing this diagnostic capability does not close BL-044 or authorize merging, raw-evidence uploads or recovery behavior.

## Decisions

### Opt-in phase log

`STREAM_JAMS_SHUTDOWN_LOG` names a new absolute JSONL file in an existing directory. Unset/relative paths disable logging. Open exclusively (`wx`) to avoid overwriting evidence. One asynchronous stream is owned by the main process; never await writes, fsync or closure on Quit. Disable on write errors. Bound accepted records to 256 and total encoded bytes, including queued data, to 64 KiB. Close after the final quit event or bound. No directory creation, scans, retention deletion or startup reconciliation.

Only version, random launch ID, numeric PID/attempt/sequence, UTC timestamp, monotonic elapsed milliseconds and a fixed phase enum are encoded. Invalid phases and extra payload fields are ignored. No URLs, device IDs, paths, exceptions, command lines or provider payloads. Missing/truncated records are unknown evidence. Developers choose separate output names and manage retention explicitly.

### Existing lifecycle boundaries

Instrument requestQuit: requested, decision accepted/cancelled, service stop requested/completed/failed, audio close requested/completed, windows destroy requested/completed and Electron quit requested. Record before-quit/will-quit/quit and Windows session-end signals. Attempt increments on quit-requested; monotonic time is launch-relative. Phase differences separate user-decision time from cleanup. No timeout infers consent. Service-stop completion describes the existing promise, which waits for worker exit, not a new correlated acknowledgement or universal durability guarantee.

Electron quit is not native-exit confirmation. The external runner observes all captured owned PIDs, launcher exit and any service listener. It never uses desktop.close, taskkill or forced cleanup. Timeout preserves profiles, logs and identities, stops the batch and leaves destructive cleanup for separate authorization.

### Staged reproduction

Use plain Electron at the manifest version, Chromium sandbox enabled and production's hardware-acceleration setting. Each stage uses fresh isolated data, default persistent management and persist:stream-jams-audio sessions, and small local HTML pages. The first two stages import no Stream Jams runtime. Stage one creates both windows; stage two adds zero-PCM WAV with volume zero through distinct explicit System/SFX endpoints; stage three retains that fixture and adds the real utility service with existing start/stop IPC. Empty data directories mean no real credentials or provider connections. A separate packaged test verifies actual product logs and Cancel followed by Quit.

Hide both windows and dwell seventy seconds before Quit to allow background timer work. Run two rounds in reversed order to reduce order confounding. Capture runtime version, sandbox/persistence settings, phases and process identities. Retain profiles for DIPS metadata inspection. Labels are allowed only in developer evidence, never product phase logs. Negative controls do not prove an intermittent defect absent.

## Risks and interpretation

Instrumentation may change timing. Logging is bounded, opt-in and not a production fix. The minimal fixture does not prove all application paths safe. Ready-but-unanswered renderer IPC remains a distinct robustness gap, now visible as decision-pending; no policy change is included. No native helper, forced exit, browser flush API or persistence change is introduced.
