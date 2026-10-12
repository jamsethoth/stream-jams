## Why

OBS should position ordinary module content independently of the Windows desktop overlay. Full-scene browser canvases make this difficult, while test and unified browser sources add output choices the operator does not want.

## What Changes

- **BREAKING** Remove public test and unified browser sources, their management source controls and their HTTP/WebSocket/media authorization paths. Remove the separate Videos test queue/player and purpose selection. Test sends become manual events on the shared bus using ordinary queues and outputs.
- Keep landscape (horizontal) and vertical browser layouts for Alerts, Music and Timers. Retain one browser source for Videos and Screen Effects; do not invent orientation profiles for those modules.
- Render Music, Timers and Videos on stable transparent canvases sized to their configured content envelope, independent of desktop position and scale.
- Keep Alerts and Screen Effects on full-scene canvases for dynamic positioning.
- Preserve desktop placement and introduce separate per-profile Timer visual configuration, following Music's appearance-versus-placement separation.
- Show exact OBS width/height beside each browser source. Preserve existing live module URLs and credentials where possible; removed test/unified URLs fail closed.

## Capabilities

### New Capabilities

- `output-specific-module-rendering`: Stable content canvases, independent desktop placement, Timer visual configuration and migration/acceptance rules.

### Modified Capabilities

- `central-event-bus`: Authenticated manual events with truthful provenance, normal fan-out and bounded admission/idempotency.
- `alert-configuration-management`: Dispatch selected draft/saved tests through the shared bus while preserving local editor previews and destination checks.
- `runtime-log-operations`: Show manual/subscribed provenance instead of implying separate live/test playback destinations.
- `overlay-browser-resilience`: Apply the same transparent audio-failure policy to manually submitted and subscribed events on ordinary output.

- `overlay-output-management`: Only ordinary module sources remain; orientation variants and canvas dimensions are explicit, and test/unified outputs disappear.
- `local-app-serving`: Retire public test/unified shells without altering management or private desktop transport.
- `overlay-safe-assets`: Reject retired-output media/artwork routes and preserve ordinary profile-scoped delivery.
- `shared-overlay-surfaces`: Retain desktop composition/layer capabilities independently of removed public unified surfaces.
- `timer-overlay-module`: Independent appearance and placement with deterministic content geometry and exact legacy migration.
- `music-widget-overlay`: Content-sized browser bounds, desktop-only scene alignment and preserved preview/provider isolation.
- `video-request-queue`: Separate geometry from desktop placement and consolidate video requests into one queue/primary mirror session.
- `configuration-backup-restore`: Normalize supported legacy layouts and retired output metadata before validation and fresh-key regeneration.
- `production-entrypoint-validation`: Replace unified-browser smoke success with ordinary-output success, retired-route rejection and private-desktop coverage.
- `scoped-automation`: Preserve concurrent playback during Timer updates on private desktop composition after public unified retirement.
- `multi-module-playback-operations`: Preserve independent ordinary browser/device audio when desktop layers are hidden.

## Impact

Core projection/configuration contracts, server recipient routing and key authorization, SQLite migration and backup/restore, web browser/private renderers, module editors, Settings surface management, Storybook and disposable browser acceptance. Actual delta requirements accompany every affected capability; current canonical specs remain unchanged until implementation and spec sync. No new dependency is proposed.

## Non-goals

Do not apply the historical restore snapshot. Do not change timer command semantics, event replay, music provider authentication, single-primary video ownership, desktop monitor selection or audio destination policy. Do not publish or merge this proposal as part of design review.
