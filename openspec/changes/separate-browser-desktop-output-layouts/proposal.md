## Why

OBS should position ordinary module content independently of the Windows desktop overlay. Full-scene browser canvases make this difficult, while test and unified browser sources add output choices the operator does not want.

## What Changes

- **BREAKING** Remove public test and unified browser sources, their management controls and their HTTP/WebSocket/media authorization paths. Keep management preview/test actions and internal live/test runtime identities where required for existing queue and event behavior.
- Keep landscape (horizontal) and vertical browser layouts for Alerts, Music and Timers. Retain one browser source for Videos and Screen Effects; do not invent orientation profiles for those modules.
- Render Music, Timers and Videos on stable transparent canvases sized to their configured content envelope, independent of desktop position and scale.
- Keep Alerts and Screen Effects on full-scene canvases for dynamic positioning.
- Preserve desktop placement and introduce separate per-profile Timer visual configuration, following Music's appearance-versus-placement separation.
- Show exact OBS width/height beside each browser source. Preserve existing live module URLs and credentials where possible; removed test/unified URLs fail closed.

## Capabilities

### New Capabilities

- `output-specific-module-rendering`: Stable content canvases, independent desktop placement, Timer visual configuration and migration/acceptance rules.

### Modified Capabilities

- `overlay-output-management`: Only ordinary module sources remain; orientation variants and canvas dimensions are explicit, and test/unified outputs disappear.

## Impact

Core projection/configuration contracts, server recipient routing and key authorization, SQLite migration and backup/restore, web browser/private renderers, module editors, Settings surface management, Storybook and disposable browser acceptance. Canonical local-app-serving, overlay-safe-assets, shared-overlay-surfaces, timer-overlay-module, music-widget-overlay and video-request-queue requirements must be reconciled with the new contract during implementation/spec sync. No new dependency is proposed.

## Non-goals

Do not apply the historical restore snapshot. Do not change timer command semantics, event replay, music provider authentication, video playback ownership, desktop monitor selection or audio routing. Do not publish or merge this proposal as part of design review.
