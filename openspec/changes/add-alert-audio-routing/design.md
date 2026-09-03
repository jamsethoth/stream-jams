## Context

An alert document already has multiple audio layers, while each normalized overlay instruction carries at most one audio asset. `PlaybackCoordinator` selects variations once and then expands instructions across visual targets. Queue admission currently requires overlay alerts, completion is driven by browser recipients, and editor Send test requires a connected profile. Reusing that expansion for devices would duplicate sound and would not support device-only operation.

The implemented [desktop prerequisite](../add-windows-desktop-tray-runtime/design.md) must own service and playback lifetime. This proposal does not assume an ordinary browser or OBS CEF grants output-device access.

## Goals / Non-Goals

**Goals:** One routing decision per alert; optional existing Browser Source plus multiple named devices; independent background device playback; shared safety controls; explicit failures without unintended fallback; portable route definitions; compatible default behavior for explicit audio.

**Non-Goals:** Layer-level routing overrides, TTS routing, video audio extraction, video-shoutout changes, extra Browser Sources, native audio drivers, automatic OS-default routing, latency calibration, sample-accurate synchronization, per-route DSP/gain, OBS configuration, installer or updater work.

## Decisions

### 1. Route at alert-document scope

Use validated `AlertAudioOutputs { browserSource: boolean; deviceRouteIds: string[] }` on every default/variation editor document. Missing data defaults to `{ browserSource: true, deviceRouteIds: [] }`; an explicitly empty selection is valid silence for explicit audio, not for unrelated TTS. Hidden audio layers do not play. Layer volumes remain effective. Variations initially copy the default selection and can diverge; duplication and re-theming preserve outputs along with existing nonvisual behavior.

Per-layer routing was considered and excluded for v1. A single `both` enum would not describe multiple devices. Hardware IDs are never placed in overlay instructions. Existing visual profile enablement/review rules still control visuals. Local audio requires an enabled, eligible alert and valid audio layers, not a connected or visually ready profile; it does not enable or render unreviewed visuals. Existing save/set-activation safeguards remain unless explicitly changed by this proposal.

### 2. Persist named routes, not operating-system topology

Use a typed SQLite `AudioOutputRouteRepository` and new `audio_output_routes` table containing `id`, `name`, `device_id`, and `device_label`. Null binding fields mean needs setup. Enforce trimmed names unique under SQLite NOCASE comparison and nonempty stable route IDs. Bind explicit enumerated `audiooutput` IDs, excluding Chromium's default/communications aliases. Labels are display hints only; never auto-match by label. Multiple routes bound to the same device ID are permitted but deduplicated per audio layer at delivery.

Add protected `/audio/routes` CRUD, `/audio/devices`, `/audio/status`, and `POST /audio/routes/:routeId/test`; test uses a tiny bundled one-second sound, current global mute, and explicit user activation of the management action. Desktop-unavailable reads return truthful capability status; device enumeration/binding/test failures use safe error envelopes. Existing route selections remain visible and preserved in CLI mode, but device playback is unavailable there. All HTTP mutations use existing authentication, CSRF, origin and rate-limit hooks.

Reject deleting a referenced route with 409 and an impact list. Validate route IDs during editor save and backup preflight. Perform reference checks and mutations under a narrow synchronous transaction so deletion cannot race a document save. Device rebinding is an explicit live-impact save affecting future starts, never an active stream. An unavailable bound device is an operational warning, not permission to rewrite assignments or silently disable an alert's healthy destinations.

### 3. Normalize audio once before visual expansion

Introduce framework-independent canonical audio records on queue items, separate from `ResolvedAlert[]`. Each selected default/variation contributes visible explicit audio layers once, using stable document/layer IDs and the same selected variation as visuals. Handle editor-backed and legacy paths; the legacy Browser Source path must not bypass the selected document's browser-audio flag. Keep existing Browser Source multiplicity per connected output; only device dispatch is deduplicated across visual profiles.

Queue items are admissible when they contain visual/overlay instructions or device audio. Snapshot alert content and route IDs at enqueue. Resolve current route-to-device bindings once when a playback occurrence starts, and keep that binding snapshot until it ends. Thus document edits affect newly enqueued content, route rebinding affects new starts, and neither redirects in-flight sound. Replay reuses the resolved content/route IDs with a new queue occurrence ID and current bindings; missing routes fail closed instead of rerunning matching or choosing another output.

Key device work by occurrence ID, alert-document ID, layer ID and device ID. Do not deduplicate by asset ID: two layers can intentionally share one sound. Device audio must not depend on which landscape/vertical clients are connected.

### 4. Use an isolated hidden Electron renderer

The main process owns a hidden audio BrowserWindow, separate from management, with context isolation, sandboxing, no Node integration and `backgroundThrottling: false`. Serve only allowlisted bundled player resources at a stable app-owned secure origin with a dedicated persistent session. Restrict both permission-check and permission-request handlers to this webContents/main frame/origin and `speaker-selection`; deny microphone/camera and unrelated permissions. This uses documented [session permission APIs](https://www.electronjs.org/docs/latest/api/session) and [background throttling controls](https://www.electronjs.org/docs/latest/api/browser-window).

The server resolves trusted asset IDs and sends bounded asset bytes through worker -> main -> validated preload messages. Reuse current asset-size limits, transfer each unique asset once per batch, and release Blob URLs on finish/stop. No persistent decoded-media cache is needed. Preload exposes only validated player commands/events; neither raw IPC nor arbitrary URLs/filesystem reads are available. Before `play()`, create the media element, set mute and volume, await successful `setSinkId`, and confirm the occurrence has not been cancelled. Use one element per layer/device pair.

First run a packaged capability experiment with two real endpoints: enumeration, independent and simultaneous output, no microphone permission, autoplay, hide-to-tray, restart, and disconnect. If this cannot be demonstrated, stop the routing implementation and report the specific API/device failure. Do not substitute an unapproved native backend or fallback destination.

### 5. Complete and stop all recipients safely

Register pending local work before invoking the sink. A sink promise settles when its batch finishes, is stopped, or has failed; per-route results feed Diagnostics. Healthy browser/device recipients continue when another recipient fails. Start waits are capped at 5 seconds. Playback ends at the configured alert duration after dispatch; a server watchdog at duration plus 5 seconds releases missing completion reports. Slow loading does not extend the event indefinitely or start after its deadline.

Every callback includes the occurrence ID and renderer generation; late completion is ignored. Global mute applies to current/future device elements and authoritative persisted safety state is applied before any new element can play. Pause and do-not-disturb continue to gate queue advancement, not pause a currently playing clip. Skip stops all device and browser work before next delivery; if the audio host cannot acknowledge stop within 2 seconds, destroy that owned renderer before allowing the next item. Shutdown uses the same cancellation path without advancing the queue.

On renderer crash, fail its pending work; permit one automatic recreation for future items, then require explicit retry if it crashes again. Never replay the interrupted occurrence. A missing/disconnected device stops or skips only that destination, with no default-device/browser fallback. Device availability recovery permits future playback and never drains a stale backlog. Server failure/worker IPC loss immediately stops the audio host; a main-owned lease refreshed by the worker every 2 seconds expires after 10 seconds as a backstop, preventing an isolated renderer from playing on without its coordinator.

### 6. Keep Preview, Send test and route test distinct

Preview renders the selected saved/draft document locally and starts audio/TTS only after explicit preview opt-in; it never uses configured live device routes. Send test bypasses sibling matching but uses the same canonical audio and delivery path as live playback, keeping existing session audio/TTS toggles and test history markers.

The selected visual profile is delivered only when enabled/reviewed/valid and connected. Independently, included audio goes to selected available device routes. Allow partial delivery with named unavailable outputs in the result. Reject with an actionable error when there is no deliverable included content. A browser-only test still requires a connected profile. Device-only tests can proceed without a connected browser or a visually ready profile and must not render the invalid visual profile. Inventory Test retains existing profile choice when browsers are available and offers device-only delivery when only devices are usable. Browser audio opt-out removes only explicit audio instructions, not visual layers or browser speech.

### 7. Make alert videos intentionally silent

Always mute embedded audio for alert video layers in preview, Send test and live playback, including a video asset represented by a legacy visual instruction. Do not globally mute unrelated module players. On upgrade, show an actionable management warning on video-containing alerts that sound now requires a separate explicit audio layer; retain video assets/layouts and do not attempt automatic extraction. No change to browser-speech or Speaker.bot routing or their existing mute limitations.

### 8. Integrate persistence and UX without duplicate state

Settings gains named audio outputs with loaded/empty/loading/error/unavailable/rebind states and explicit test feedback. The focused editor gains a single alert-wide checkbox group; selections participate in undo/redo, dirty-state and live-impact confirmation. Missing devices remain listed so opening/saving an alert never silently drops routes. Show safe route-specific Diagnostics and operator links, not live overlay messages. Document that OBS Desktop Audio/monitoring may independently capture a supposedly private endpoint and that different paths can have latency differences.

Add route table mapping/reference checks to existing backup code. Portable exports include IDs/names and assignments with device binding fields null; classify bindings explicitly as local-only. Internal rollback snapshots retain all binding values. Restore clears bindings, lists routes needing setup, and is blocked by active device playback as well as existing intake/overlay playback. Keep the current explicit unsupported-schema rejection policy; do not introduce general old-archive migration. A schema-version bump may require exporting a fresh backup from the upgraded app.

## Risks / Trade-offs

- Electron output permissions/autoplay differ from normal browsers -> packaged two-device gate before UI integration; never grant microphone permission as a workaround.
- Separate browser and device playback clocks -> best-effort simultaneous dispatch, no sample-accurate sync promise; warn about capturing both paths in OBS.
- Device IDs change after reinstall/device reconfiguration -> explicit rebind by ID, no guessed fallback.
- Queue refactor can drop audio-only items or duplicate by profile -> canonical pre-expansion audio, independent recipient tracking, replay/race tests.
- Silent alert videos change prior behavior -> breaking-change notes and management warnings, with separate audio layers as the migration path.
- Route deletion and archive mappings can orphan references -> transaction-scoped reference checks, schema-drift tests and restore rollback proof.

## Migration Plan

1. Verify the desktop prerequisite is implemented on the execution branch and passes packaged tests.
2. Pass the real-device capability gate with isolated test data and explicit audio-test permission.
3. Add the next sequential SQLite migration for routes; parse old alert documents with Browser Source-only defaults; preserve legacy matching and TTS.
4. Ship route management, canonical dispatch and device-aware safety/tests together; do not expose partially wired controls.
5. Explain video muting and device rebinding in upgrade/restore guidance. Keep pre-upgrade data backups and use the existing safety/restore workflow for rollback; do not open a newer schema with an older executable or perform destructive down-migrations.

## Open Questions

No further product choices are required. Hardware/API feasibility remains an explicit early acceptance gate. Failure there requires revisiting this design with the user, not expanding scope automatically.

## Implementation

Follow the [implementation plan](../../../docs/superpowers/plans/2026-09-03-alert-audio-routing.md) and [unchecked tasks](tasks.md). All actual device checks remain unperformed at proposal time.
