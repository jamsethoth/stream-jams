## Context

The repository has a Fastify server, React management/overlay bundles, framework-independent core contracts, and no desktop workspace. `apps/server/src/index.ts` currently performs startup as an import side effect. `createRuntimeAppComposition()` already owns provider connections, Fastify and SQLite and exposes `close()`. `FileConfigStore` owns validated, atomically replaced configuration under the existing local profile.

The user approved a two-change program and selected a runnable Windows application folder, not the full BL-030 distribution program. This change supplies the prerequisite shell; [audio routing](../2026-09-07-add-alert-audio-routing/design.md) supplies actual device playback.

## Goals / Non-Goals

**Goals:** Windows x64 packaged startup; unchanged local-server/OBS behavior; desktop-owned service lifetime; default close-to-tray with an opt-out; single-instance behavior; predictable failure and shutdown; secure narrow IPC; continued OS-keyring use.

**Non-Goals:** Installer, signing, updater, publishing, launch at login, service installation, other packaged operating systems, `safeStorage` migration, OBS automation, LAN serving, production audio routing, or a replacement management interface.

## Decisions

### 1. Electron main owns a utility-process server

Add `apps/desktop` with separate main, supervisor, tray, management-window and preload modules. Export server startup from a new `@stream-jams/server/runtime` subpath; leave the root CLI entry as a caller, not an importable runtime. The worker imports the runtime subpath and runs the same composition as the CLI.

The alternative of running Fastify/SQLite in Electron main couples synchronous database work to tray responsiveness. A separate external Node installation would defeat self-contained packaging. Electron's [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) supplies the owned Node-enabled process and private messaging boundary.

Startup is single-instance lock -> app ready -> owned worker -> validated ready message -> load the actual local `/manage` origin. Retain `127.0.0.1`, the configured port, `STREAM_JAMS_CONFIG_PATH`, current storage locations and keyring identity. A port conflict is an error with manual recovery; never attach to or terminate the occupying process or automatically change the port.

### 2. Model lifecycle explicitly

The main lifecycle is `starting`, `running`, `stopping`, `stopped`, or `failed`. Use a 20-second startup timeout and a 10-second graceful-stop timeout; timeout errors are visible and refer only to the owned process. Unexpected worker exit moves to `failed`, stops desktop-owned consumers, and offers explicit Retry or Quit. Do not silently reconnect event intake through an automatic restart loop.

One shared, idempotent shutdown promise prevents close/tray/OS events from performing teardown twice. After any dirty-state decision, stop intake and pending timers, close provider runtimes, Fastify and SQLite, acknowledge stop, destroy owned windows/tray, and exit. On timeout, terminate only the worker object created by this desktop instance. Windows session-end handling must initiate best-effort cleanup rather than hide the window; OS termination cannot guarantee an unlimited async grace period.

### 3. Persist close policy through the existing server-owned store

Add `desktop.closeToTray: boolean`, default true, to `AppConfig` and a partial desktop patch to `AppConfigUpdate`. Update every explicit config merge, default, restore and rollback path. Serialize store read-modify-write operations so a desktop preference update cannot overwrite a concurrent playback-safety update. Do not introduce a second Electron-side config writer.

Expose `GET /config/desktop` returning `{ available, closeToTray }` and protected `PATCH /config/desktop` accepting `{ closeToTray }`. `available` describes the runtime host, not a persisted preference. CLI mode keeps the preference but reports desktop unavailable and rejects desktop-only changes. Mutations require the existing management session, CSRF proof, origin policy and rate limit. Persist successfully before applying/broadcasting a preference change.

X with close-to-tray enabled calls `hide()` without destroying the renderer, so drafts survive. With it disabled, X enters the same quit path as tray Quit. Tray Open restores/focuses the existing window. Tray Mute/Unmute invokes the existing authoritative playback command through the owned worker and reflects returned state; it has no separate mute flag. A save failure leaves the previous safety state and produces a visible failure.

### 4. Keep privileged surfaces narrow

Load management only from the ready worker's exact loopback origin. Use sandboxing, context isolation, no Node integration, a restrictive navigation/window-open policy, and allowlisted external HTTP(S) navigation through the system browser. Preserve local `/operator` navigation and browser-session bootstrap. Never pass management or overlay secrets as URLs or preload globals.

Preload exposes only desktop capability and quit-guard interactions needed by management. Validate the exact webContents, main frame and origin for every IPC request; validate worker messages as discriminated unions with request IDs. Do not expose raw `ipcRenderer`, generic method invocation, filesystem access or a public HTTP quit endpoint. User content and OBS overlays never receive the preload.

Before explicit quit, the management window uses its existing Save and leave / Discard / Cancel guard. Cancellation keeps the service running. A renderer crash must not prevent an explicit Quit; report that unsaved renderer-only edits cannot be recovered. Merely hiding never invokes a discard decision.

### 5. Package only the approved deliverable

Use [Electron Forge packaging](https://www.electronjs.org/docs/latest/tutorial/forge-overview) to produce an unsigned `win32-x64` application folder. Resolve supported Electron/Forge versions during the implementation dependency gate, pin them exactly, and verify the embedded Node runtime supports `node:sqlite` and the existing keyring dependency. Do not bump root Node/pnpm/TypeScript merely to scaffold Electron.

Stage built desktop/server/core/web outputs and their production dependency closure inside the package, including native optional keyring binaries. No link may resolve back into the checkout. Keep ASAR/native unpacking explicit and test the installed-layout paths. No maker/publisher/update feed is configured. Use a small checked-in application/tray icon; this is not a branding redesign.

### 6. Preserve the documented workflow and extend proof

Existing browser-based management, CLI startup, protected overlay asset URLs and keyring failure behavior remain supported. Add packaged desktop smoke tests plus focused main-process lifecycle tests; browser UI gates still apply to the Settings/quit-guard changes. The independent device capability experiment belongs at the start of the second change, not as a claim that this shell already routes sound.

## Risks / Trade-offs

- Native keyring or SQLite packaging mismatch -> fail the packaged-runtime gate before accepting the foundation; do not fall back to plaintext credentials.
- Closing a familiar X no longer exits -> label the default clearly in Settings and explain tray Quit on first hide without repeated notifications.
- Async quit and unsaved edits -> obtain the decision before stopping the service; share one shutdown promise and test cancellation/re-entry.
- Unsigned folder distribution -> document possible Windows warnings; do not imply signing or installer support.
- IPC/config changes cross package boundaries -> validate inputs at each boundary and preserve the existing HTTP security tests.

## Migration Plan

Old config parses with `desktop.closeToTray: true`; no database migration or secret migration is needed. The desktop app reuses existing configuration/assets/keyring data rather than copying them into Electron userData. Electron session/cache files are separate from domain storage. For isolated packaged tests, accept a validated absolute `STREAM_JAMS_DESKTOP_USER_DATA_PATH` override before acquiring the single-instance lock; use a temporary value alongside a temporary `STREAM_JAMS_CONFIG_PATH` so tests cannot focus or reuse a real user instance. Backups gain the non-secret close preference; rollback restores its exact prior value. The CLI remains an alternative entry point but must not run concurrently on the same configured port/profile. Keep distribution residuals in BL-030 and record this narrower deliverable separately.

## Open Questions

No product decisions remain open. Native packaging compatibility is an implementation acceptance gate, not a reason to change the credential or distribution scope silently.

## Implementation

Follow the [implementation plan](../../../../docs/superpowers/plans/2026-09-03-windows-desktop-tray-runtime.md) and [unchecked task list](tasks.md). Do not mark this dependency complete from artifact readiness alone.
