## Context

The existing Electron window is transparent, non-focusable and click-through. Control DX12 becomes topmost when focused; native sampling showed its order change from below to above the overlay. Playback still produced audio. Restoring order must not activate a window, restart media or modify the game. The user authorized unattended design, tests, implementation via GPT-6.1-sol low-effort agents, and preparation for their return on October 2, 2026.

## Goals / Non-Goals

**Goals:** Recover supported desktop/borderless ordering automatically, preserve game input, automate repeatable native tests and real-game triggering, retain transparent failure and exact display binding.

**Non-Goals:** Absolute precedence over protected/system desktops, exclusive-fullscreen guarantees, graphics injection, new game-specific profiles, production installation replacement, or user configuration changes. BL-049 remains the stretch investigation.

## Decisions

1. Use Electron's existing `moveTop()` operation, which uses `SetWindowPos` with `SWP_NOACTIVATE` on Windows. Add `OverlayWindow.ensureTopmost(): void`; it operates only when ready, uninterrupted, visible and not destroyed. Call it after showing and immediately before a valid private `start` command is dispatched. Keep focusable=false and ignoreMouseEvents=true. No focus()/show() call or false/true topmost toggle is needed.
2. Use one 100 ms interval for each loaded ready window as the initial recovery candidate. It calls the guarded operation independently of the overlay's own focus events and content lifetime; static module content needs ordering too. Pause on hide, load/reset and display loss; dispose on close, destroy and load/render failure. Resume only on valid ready show. Do not expose interval settings or a production test toggle. Exceptions in background recovery must produce a bounded diagnostic and teardown, never an uncaught timer exception. A diagnostic using existing renderer-load-failed with reason topmost-restoration-failed is acceptable at this native-window boundary.
3. Vet the candidate using native competition before treating it as a solution. A 100 ms interval is a scheduling choice, not a claimed recovery SLA. The native regression records observed elapsed time with a generous 1 s failure deadline, checks order independently through User32, and verifies stable foreground identity. Actual Control latency and physical visibility remain separately reported.
4. Research alternatives: `electron-overlay-window` combines WinEvent callbacks with an 83 ms foreground fallback, but binds one permanent window to one title and hides on target blur. That is not our persistent display-bound, recreatable surface. A new FFI/native add-on or helper process solely for global foreground hooks increases packaging and shutdown obligations. Start with the existing non-activating API; adopt native event tracking only if observed recovery or overhead requires it. A periodic order correction handles reorder events without foreground changes as well. Baffler's overlay uses short recovery bursts/manual hotkeys, which cannot meet continuous automatic recovery alone.
5. Tests use isolated profiles and owned fixture windows. A test-only baseline fixture can omit recovery to prove the native failure detector catches the original bug. Never add a baseline switch to production. Native observations, captured composition, and human monitor observations are different evidence. Do not silently pass unavailable desktop capture or unavailable foreground access.
6. Prepare a bounded local Control runner that discovers game/overlay handles, waits for game focus, optionally triggers one explicitly selected saved effect via the ordinary authenticated management API, records only relevant window/playback metadata, and exits with structured evidence. It must not close, focus, inject into or reconfigure the game or replace the installed app. Test credentials remain in memory. All waits and child processes are bounded; cleanup only owns its own observer and triggered occurrence if still active.

### Research sources

- https://github.com/electron/electron/blob/main/shell/browser/native_window_views.cc (`MoveTop`, non-activating native flags)
- https://github.com/SnosMe/electron-overlay-window/blob/master/src/lib/windows.c (foreground events and fallback)
- https://github.com/SnosMe/electron-overlay-window/blob/master/src/index.ts (target lifecycle)
- https://github.com/baffler/Transparent-Twitch-Chat-Overlay/blob/master/TransparentTwitchChatWPF/MainWindow.xaml.cs (short recovery timer)
- https://centerpointgaming.com/faq.html (Game Bar exclusive-fullscreen route)

## Risks / Trade-offs

- Timer scheduling/another topmost app can cause transient occlusion -> measure and report latency; do not promise zero-frame occlusion or exclusive-fullscreen visibility.
- `moveTop()` includes a native show flag -> guard readiness, visibility and interruption, with hidden/removed-display regressions.
- Background callback after teardown -> one owner, explicit cancellation, destroyed guard and queued-callback tests.
- Native evidence depends on an interactive Windows session -> classify missing session as environment blockage, never a passing visibility test.
- Screen capture can differ from physical scanout -> preserve automated composition evidence and reserve one physical confirmation for the user.

## Migration Plan

No data migration. Build the candidate in this worktree and stage an isolated runnable artifact/test command. Do not replace C:\StreamingTools\stream-jams while unattended. Rollback is the previous application build; settings are unchanged.

## Open Questions

Physical Control visibility, real gameplay input and latency under game load are pending the user's return. Exclusive fullscreen needs a separate backend feasibility assessment.
