## Context

The merged Windows runtime owns a local service, management window, tray and sandboxed audio player. `OverlayComposition` contains module snapshots, but visual delivery still centers on browser clients. This change defines a reusable desktop recipient and independent per-surface stacking.

## Goals / Non-Goals

Execution details: [shared desktop overlay implementation plan](../../../docs/superpowers/plans/2026-09-08-shared-desktop-overlay-surface.md).

**Goals:** One opt-in Windows overlay reusable by registered modules; persisted display/opacity/layers; independent bounded desktop completion; unchanged module-specific browser outputs and audio routing.

**Non-goals:** New audio paths, multiple desktop windows, arbitrary plugin code, custom desktop profile editors, injection/full-screen guarantees, installers or cloud deployment.

## Decisions

### Extend the owned desktop runtime

Create `apps/desktop/src/overlay/` with separate window, preload, renderer and host responsibilities. Reuse lifecycle/supervisor ownership patterns, but do not embed overlay logic into the audio player or management window. The window is frameless, transparent, topmost, skipped from taskbar, non-focusable and always mouse-pass-through. There is no interaction mode that accidentally intercepts game input. Bind monitor IDs returned by Electron's display enumeration; on missing selection hide the window and require a valid explicit binding.

The alternative of one window per module multiplies focus, lifetime and ordering problems. Reusing management loses transparency and background guarantees. A native injected renderer would materially expand scope and compatibility risk.

### Shared composition and narrow recipient transport

Add core surface configuration/recipient schemas alongside `overlay-modules` and `overlays`. A surface record has a stable ID, kind (`desktop` or `unified-browser`), ordered `{moduleId, visible}` rows, and desktop-only enabled/display/opacity fields. Separate this from global `OverlayModuleConfig.enabled` and from copyable `OverlayOutputView` URLs.

The service sends normalized visual compositions through validated private IPC. The host accepts only its owned top-frame renderer, and uses a separate session without management cookies. All assets are resolved from authorized local asset IDs with bounded reads; reject filesystem paths, remote URLs and unknown media kinds. Any asset-delivery credential/handle is purpose-scoped and never grants management authority or appears in UI, logs or exports. Do not expose a new copyable desktop URL. Strip audio/TTS work from this visual transport; device playback already has an owner.

Track desktop recipients using `(surfaceId, moduleId, occurrenceId, generation)`. Prepare/start/stop/complete/error messages and reconnection snapshots are schema-validated. A renderer generation has only bounded in-flight work; stale acks are ignored. A desktop failure settles only its obligations. Keep the existing maximum occurrence duration plus 5-second transport grace; stop/hide the visual surface on lost ownership within the existing 10-second lease. Allow one automatic renderer recreation and then explicit Retry, without replaying interrupted content.

### One logical canvas and isolated module layers

Use Landscape `1920 x 1080` instructions, uniformly fitted to the actual monitor bounds. Retain Alerts' active-set and reviewed-profile requirements. Desktop readiness does not invent a connected OBS profile. Reuse rendering in `OverlaySurface.tsx`; put each module in a positioned `isolation:isolate` stacking context. Surface z-order is assigned outside module content. Playback IDs and React keys remain stable when reordered. Re-show an active layer only at its current offset.

Unified-browser surface records retain their own order/visibility; changing desktop has no side effects on them. Module-specific outputs bypass these composition preferences. An existing global module disable continues to suppress all of its visual surfaces.

### Settings owns shared surfaces

Put display/opacity/enable and shared composition controls in Settings, alongside the existing desktop/audio preferences. Keep module browser-source sections where they are. Use explicit save, draft state, accessible up/down controls, and management-only capability/error reporting. Never automatically open a real HUD or play media upon selection. A separately labeled test states its destinations.

### Feasibility before full implementation

The current `apps/desktop/src/main.ts` disables hardware acceleration to avoid a Windows shutdown issue. First test transparent 1080p and 1440p neutral video, input/focus behavior, two displays/mixed DPI, management hidden, service loss and Quit in the packaged runtime. Record observed playback and shutdown timings. If acceptable video cannot be delivered with this configuration, stop for a scoped backend decision; do not remove the workaround or add injection/native dependencies implicitly.

## Risks / Trade-offs

- Exclusive full-screen or protected desktops can cover a topmost window → disclose windowed/borderless support; never alter game settings.
- A failed shared renderer removes every desktop module → settle every affected desktop obligation, preserve healthy OBS/audio and report the host failure.
- Device identity/DPI changes → enumerate again, recompute bounds for the selected ID, never identify by label alone.
- Hiding a visual could accidentally mute browser audio → filter visual membership separately from audio instructions and test both directions.

## Migration Plan

Add typed SQLite persistence with transactional complete-order validation. Existing unified outputs keep their prior enabled module membership and paint order. New desktop settings start disabled with no monitor selected. Newly discovered modules append hidden at the bottom of every surface. Include configuration in backup/restore but treat imported monitor IDs as unbound until explicitly selected on that machine. Do not persist runtime clients or credentials. Restore a pre-upgrade backup for binary rollback; do not downgrade a live database.

## Open Questions

No product-choice blocker remains. The packaged-Windows feasibility gate is an implementation acceptance requirement, not a promise that tests or hardware checks have already passed.
