# Desktop Overlay Ordering Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver an automatically recovering desktop overlay and automated evidence that it stays above borderless windows without taking input.

**Architecture:** Keep recovery inside the existing Electron window lifecycle. Use a guarded non-activating raise immediately before playback and a single 100 ms fallback while the ready surface is visible. Native test fixtures independently observe Windows order, focus, input and composition; an optional game runner prepares human acceptance.

**Tech Stack:** Existing Electron, TypeScript, Vitest, Playwright, and Windows User32 observation from bounded PowerShell/C# test helpers. No production dependencies.

**Spec:** `openspec/changes/restore-desktop-overlay-topmost/design.md` and `specs/shared-overlay-surfaces/spec.md`.

## Global Constraints

- Keep focusable=false and ignoreMouseEvents=true. No focus()/show() call or false/true topmost toggle is needed.
- Recovery operates only when ready, uninterrupted, visible and not destroyed.
- No production test toggles, game injection, new dependency, production installation replacement or user configuration mutation.
- Native measurement uses a 1 s failure deadline; the 100 ms interval is not a latency guarantee.
- Only fixture-owned processes, temporary profiles and observers may be cleaned up. Game and installed Stream Jams processes must survive.
- Record automated native evidence separately from composed pixels and physical observations.
- Use GPT-6.1-sol with low reasoning for implementation agents. User authorized unattended execution and routine choices; no intermediate design approval is pending.
- Run focused tests while iterating; controller runs affected desktop checks once after integration. One independent final review, per repository proportionality instructions.

## Review Focus

- Hidden windows: moveTop has a native show flag. Test that hide, display loss, pending load and callbacks after disposal cannot show it.
- Input: a topmost bit alone proves nothing. Independently verify order, foreground, native no-activate/pass-through styles and delivery to the owned competitor.
- Lifecycle: double load/show or renderer recreation must not accumulate guards. Assert no work on the replaced window.
- Late failures: a native raise exception must not escape a timer or leave the surface falsely ready.
- Evidence: injected renderer events alone do not prove click-through; unavailable interactive desktop or capture must be labeled explicitly.

## Task 1: Recovery behavior and unit regressions

**Owner/files:** `apps/desktop/src/overlay/overlay-window.ts`, `overlay-window.test.ts`, `private-overlay-window.ts`, `private-overlay-window.test.ts` only.

**Interfaces:** Add `OverlayWindow.ensureTopmost(): void`. Private dispatch calls it for validated `start` only, before sending IPC. Other public contracts remain unchanged.

- [x] Write meaningful failing unit regressions for ready visible recovery after a competing window overtakes, explicit start recovery before IPC, no recovery before ready/while hidden/after display loss, cleanup on failure/destroy, repeated load/show without duplicate timers, and raise failure teardown/diagnostic. Fake timers should advance beyond the interval and model ordering independently of the raised flag; assert observable native adapter effects and lifecycle, not a copied implementation algorithm.
- [x] Run the new tests against the old implementation and retain the failure evidence.
- [x] Add one 100 ms unref'ed interval for the ready visible native surface. Stop/reset on hide/load/interruption/failure/close. Guard queued callbacks. Use moveTop() for order restoration; keep topmost policy unchanged. Catch background native failure once, notify bounded failure reason and destroy in a finally-safe path.
- [x] Raise after ready show and immediately before valid private start dispatch. Do not restart media or send extra commands.
- [x] Run both affected Vitest files and scoped lint; report commands/results and self-review. Controller owns build and commits.

## Task 2: Native Windows competition regression

**Owner/files:** new `tests/desktop/overlay-topmost.spec.ts`, `tests/desktop/fixtures/overlay-topmost-*` and at most a narrowly scoped new `tests/desktop/overlay-topmost-harness.ts`.

**Interfaces:** Import the built `OverlayWindow` from `apps/desktop/dist/overlay/overlay-window.js` in an isolated Electron fixture. Use `load()`, `window`, `ensureTopmost()` only for the explicit-start scenario, and `destroy()`. Tests of automatic correction must not call ensureTopmost themselves. Use existing `withCleanup`, `finishDesktop`, and failed-launch cleanup where appropriate.

- [x] Create an owned baseline fixture which requests topmost once and is deliberately overtaken by a foreground competing window. Verify native observer detects the covered baseline before testing candidate recovery.
- [x] Exercise candidate overlay with competitor activated after overlay load, competitor reordered while already focused, repeated alternating owned foreground windows, and destruction. Independently sample User32 order and foreground (not Electron's isAlwaysOnTop alone); assert recovery in 1 s and competitor remains foreground. Record elapsed samples and styles in JSON attachments.
- [x] Add a deterministic transparent visual marker; capture the actual desktop compositor with Electron desktopCapturer or Windows screen capture and crop to fixture bounds. Verify marker on top if capture is available; do not present window-only screenshot as composition evidence. Mark capture limitations explicitly.
- [x] Verify click-through and keyboard delivery using native input only aimed at the owned competitor and an event log in its renderer. Never send test input to Control or other user apps. If native synthesis is unavailable, report the blocker instead of replacing it with renderer event injection.
- [x] Bound all native calls and fixture lifetime; use unique executable/profile paths, cleanup and failure timeout. Do not touch the live installation. Keep this Windows interactive test out of misleading headless claims, using @hardware if it genuinely needs physical input/session; provide exact command.
- [x] Run or at least compile/list the new test; controller will serialize visible runs and collect final evidence after Task 1 build.

## Task 3: Prepared Control acceptance runner

**Owner/files:** new `scripts/desktop-overlay-game-check.mjs`, `scripts/desktop-overlay-game-check.test.mjs`, `scripts/desktop-overlay-game-observer.ps1`, and `docs/verification/desktop-overlay-topmost.md`.

**Interfaces:** Ordinary local `/health`, `/auth/management/sessions`, `/screen-effects/:effectId/test`, `/playback/operations` endpoints. Bearer and CSRF credentials in memory only. User supplies an explicit base URL/effect ID/variant ID for triggering. Existing saved Mr Rogers effect may be offered as an example only in local handoff, not hardcoded product data.

- [x] Implement pure argument/evidence validation with node:test: invalid/non-loopback URL and unsafe observer arguments rejected; finite timeout limits; missing trigger identifiers rejected; no secret values in output; ordering pass requires visible live matching windows and focused game observations rather than topmost flags alone; no game observed means incomplete/blocked.
- [x] Build a Windows observer for matching Control process (DX11/DX12 executable discovery) and exact Stream Jams desktop-overlay title, with monotonic relative timestamps, relevant handles/PIDs/order/bounds/styles, and no unrelated titles or command lines. Validate handle/process identity each sample to avoid stale handles. Output structured samples and finite completion.
- [x] Wait for focused game then trigger one exact saved effect via authenticated API when explicit `--trigger` is set; never steal focus. Collect occurrence/playback observations separately from order. A timeout or abort must stop/reap the owned observer; stop only that triggered occurrence if still active, never clear queues. Observe-only mode must be usable without creating a management session or mutating runtime.
- [x] Document commands for isolated candidate/native test and real-game runner, what is automated, the one physical confirmation still needed, and exclusive fullscreen limitations. No live Control run while user is unavailable.
- [x] Run node:test and scoped lint. Do not update package.json; controller will decide whether a command alias is useful after inspection.

## Controller integration and acceptance

- [x] Validate OpenSpec; commit spec/plan before implementation.
- [x] Run affected desktop Vitest suite, desktop typecheck/build, test TypeScript check, lint on touched code, background native ordering fixture and helper unit tests. Interactive fixture acceptance is separately pending below.
- [x] Check candidate source/dist identity and preserve native negative-control versus candidate evidence.
- [x] Obtain one independent review of the complete diff and address actionable findings.
- [x] Commit tested implementation and update OpenSpec tasks/evidence. Keep physical acceptance unchecked; do not archive as fully accepted.
- [x] Stage an isolated runnable candidate if feasible. Leave ready-to-run commands and remaining human observations. No push or merge is requested.

## Attended acceptance — completed 2026-10-02

- [x] Run the full interactive native fixture after unlock: foreground switching, compositor capture and real click-through/key delivery. Passed with Control in the background and user input idle; the earlier locked-session limitation remains historical evidence.
- [x] Run the Control runner with DX11 and DX12 borderless; confirm monitor video, audio and uninterrupted gameplay. Both passed physical video/audio/input and Alt-Tab return. The user accepted the imperceptible DX12 ordering transient; the strict sample failures remain recorded.

Control DX11's Fullscreen setting failed physical video acceptance; audio worked and video appeared after Alt-Tab to the desktop. Actual exclusive presentation remains unverified. Fullscreen compatibility stays in BL-049. See [verification evidence](../../verification/desktop-overlay-topmost.md).

The original unattended constraints above describe that phase. The user subsequently authorized a backed-up installation and then PR publication. The installed tested archive passed the attended borderless checks without changing saved configuration. Canonical shared-surface requirements are synchronized; merge remains a separate action.
