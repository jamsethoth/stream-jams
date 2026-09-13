## Why

Stream Jams needs to show effects on the streamer's own Windows display as well as in OBS. Making that output a shared module surface now avoids a separate desktop window, device player, and stacking policy for every future module.

## What Changes

- Add one opt-in, transparent, click-through, non-focusable desktop overlay window owned by the existing Windows desktop runtime.
- Persist explicit monitor selection, enablement, opacity, and ordered module visibility. Missing monitors fail closed without fallback.
- Make the desktop a first-class visual recipient using normalized module compositions and bounded occurrence acknowledgements, not a management browser tab or a copyable secret URL.
- Add independent ordered module layers to desktop and unified OBS compositions, with isolated stacking contexts. Preserve module-specific OBS outputs.
- Prove the shared surface with Alerts; Screen Effects consumes it in a later slice. Newly registered modules are hidden at the bottom of each surface.
- Add shared-surface configuration to management Settings. Keep module browser-source setup in its owning module.

## Capabilities

### New Capabilities

- `shared-overlay-surfaces`: Windows desktop lifecycle, reusable visual-recipient contract, persisted surface layers, stacking, display selection, and failure behavior.

### Modified Capabilities

None. Existing module browser-source URLs and desktop service ownership remain intact; the new specification adds a distinct surface capability.

## Impact

Extends `apps/desktop`, `packages/core/src/overlay-modules`, `packages/core/src/overlays`, server composition/recipient tracking, typed persistence, Settings, and `OverlaySurface`. Depends on merged Windows desktop runtime and alert audio routing at `61642ae`; does not depend on Screen Effects or the unimplemented video-shoutout proposal.

Implementation must pass an early packaged-Windows transparent-video feasibility gate while preserving the existing hardware-acceleration shutdown workaround.

## Non-goals

Multiple desktop windows, cross-platform delivery, exclusive-full-screen guarantees, graphics injection, automatic game-setting changes, native OBS plugins, OBS WebSocket control, new audio devices/routing, cloud/LAN deployment, installers, and third-party plugin loading.
