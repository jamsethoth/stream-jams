## Why

The September 29 live session exposed unseekable HTTP media, lost desktop renderer causes, and silent selected-device audio failures. Controlled replay reproduced the browser seek failure on 26 real assets and additional bounded media-preparation failures.

## What Changes

- Serve authorized asset byte ranges so late browser recipients can seek to the shared timeline.
- Preserve desktop renderer and selected-device audio failure causes, including fulfilled failed-route results.
- Classify expired media and capture bounded timing evidence without changing synchronization tolerance or configured destinations.
- Add regression tests for transport, timing, renderer, device, provider recovery, and session renewal failure scenarios.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `overlay-safe-assets`: authorized media range responses.
- `routed-video-audio`: bounded preparation and actionable selected-output failures.

## Impact

Core media/audio contracts, Fastify asset endpoints, the private desktop overlay and audio renderer, playback coordinators, and their tests. No new dependencies, output destinations, default-device fallback, or production configuration changes.
