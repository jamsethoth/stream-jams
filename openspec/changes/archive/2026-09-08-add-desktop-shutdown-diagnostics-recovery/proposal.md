## Why

BL-044's native shutdown delays remain unexplained. The user approved lightweight logging and staged reproduction after reviewing source-backed research and questioning the recovery subsystem. This revision supersedes that unimplemented subsystem; the change ID remains for existing links.

## What Changes

- Add opt-in bounded shutdown-phase logs with no sensitive payloads.
- Separate pending decisions, service cleanup, audio/window teardown and Electron quit events.
- Compare plain persistent windows, silent explicit-output playback, then the owned service using the same Electron runtime.
- Observe captured native PIDs independently; retain evidence and stop the batch on failure without forced cleanup.
- Preserve persistent sessions, tray/edit decisions, ten-second worker timeout and fifteen-second native observation deadline.

## Capabilities

### New Capabilities

- `desktop-shutdown-diagnostics`: opt-in phase evidence and controlled reproduction.

### Modified Capabilities

- `windows-desktop-runtime`: diagnostic instrumentation without shutdown policy changes.

## Impact

Desktop main-process logger, focused tests, developer reproduction fixtures and documentation. No dependencies, migrations, frontend changes or native packaging helpers.

## Non-goals

Automatic termination/restart, native watchdog, restart notices, session migration, quit-decision policy changes, vendor intervention, security changes, audible testing or dumps/uploads. BL-044 remains unresolved unless matching evidence identifies its trigger. Recovery is deferred.
