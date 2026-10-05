## Why

Streamers currently run Stream Jams Music Widget separately, with browser-owned unauthenticated Pear connections and a different implementation stack. A native Music module should preserve its now-playing experience while using Stream Jams' typed contracts, durable configuration, secret storage, authenticated outputs, and shared rendering, with a provider boundary that accommodates later Plex and Spotify adapters.

## What Changes

- Add a disabled-by-default `music` module with module-specific and unified browser-source outputs and opt-in desktop surface participation.
- Port the widget's metadata, artwork, interpolated progress, full/compact views, dark/light themes, opacity, eight alignment choices, scrolling text, idle hide/collapse, custom appearance, and mock preview into shared TypeScript/React components.
- Add a transport-independent music-source contract and one active music provider, independent of event-source and TTS selection. Extend existing provider registration and OS-backed secret storage.
- Implement Pear Desktop first: explicit pairing, authenticated REST and WebSocket communication, secure credential recovery, bounded reconnect/fallback, and validated normalized snapshots.
- Correct empty-state, stale-state, polling-idle, and shutdown races identified in the standalone widget. Keep live failures transparent and show actionable diagnostics in management.
- Combine saved appearance controls with an optional Advanced CSS editor for custom layouts, component visibility, responsive styling and animations. Validate and isolate CSS, document stable widget selectors, and retain the editor content across restarts/backups.
- Add an uploaded branding image behind the widget components, using existing image assets, transparency, fit/position/opacity controls and separate full/compact presentation. Preview the complete branded widget with the production renderer.
- Add reusable adapter contract tests and Pear protocol fixtures; use Plex session selection and Spotify OAuth/polling as design checks without shipping those providers in this slice.

- Extend Music and Alerts editing with independent grid/alignment snapping controls and transient peer/canvas guides, using shared bounded pointer geometry. This user-approved refinement promotes those snapping controls from BL-016 while leaving responsive units and custom profiles deferred.

## Capabilities

### New Capabilities

- `music-source-providers`: Provider lifecycle, durable registration, authenticated Pear communication, normalized music state, safe artwork access, and extensibility contracts.
- `music-widget-overlay`: Saved presentation, preview, live/test rendering, output composition, and provider-independent widget behavior.

- `editor-snapping`: User-approved refinement sharing optional grid and visible-component alignment snapping between Music and Alerts.

### Modified Capabilities

None. Existing module configuration, output authorization, durable secret storage, shared surfaces, and backup requirements remain applicable. The new capability specifications define their Music-specific extensions without changing other modules' requirements.

## Impact

- `packages/core`: Music schemas/types, provider configuration and capability extensions, projection/lifecycle rules, registry entry, and extension of the module presentation union currently housed in timer types.
- `apps/server`: Provider registration migration/repository, credential and pairing services, Pear transport adapter, authoritative Music runtime, artwork delivery, management routes, overlay/desktop delivery, diagnostics, and backup integration.
- `apps/web`: Music management/setup and appearance UI, typed clients, reusable renderer, management preview, Storybook, and browser/desktop presentation handling.
- `apps/desktop`: Existing private renderer/IPC contracts and lifecycle integration where the new presentation variant requires them; no extra player or local service.
- Verification: Unit, protocol/contract, migration/restore, HTTP authorization, Storybook, Playwright, and real Pear plus OBS/desktop acceptance.
- Dependencies: Reuse Zod, `ws`, Fastify, React, existing image/font assets, and the keyring adapter. Use an established CSS parser for the explicit validation policy; evaluate maintenance, license and stack compatibility before selecting an exact dependency. Evaluate additional image/safe-fetch libraries only for concrete gaps.
- Scope: No playback controls, audio capture/playback, song requests, queue/history, simultaneous music-provider mixing, Plex/Spotify implementation, or modification of the standalone widget repository. BL-028 becomes the index for this proposal.
