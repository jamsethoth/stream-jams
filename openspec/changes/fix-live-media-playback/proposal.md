## Why

The September 29 live session exposed unseekable HTTP media, lost desktop renderer causes, and silent selected-device audio failures. Controlled replay reproduced the browser seek failure on 26 real assets and additional bounded media-preparation failures.

## What Changes

- Serve authorized asset byte ranges for reliable browser media loading and explicit seeking.
- Preserve desktop renderer and selected-device audio failure causes, including fulfilled failed-route results.
- Prepare actual media on participating outputs before scheduling a shared start from zero at normal speed, without changing configured destinations.
- Automatically recover failed output targets for subsequent clips; interrupted clips do not require replay.
- Add regression tests for transport, timing, renderer, device, provider recovery, and session renewal failure scenarios.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `overlay-safe-assets`: authorized media range responses.
- `routed-video-audio`: bounded preparation and actionable selected-output failures.

## Impact

Core media/audio contracts, Fastify asset endpoints, the private desktop overlay and audio renderer, playback coordinators, and their tests. No new dependencies, output destinations, default-device fallback, or production configuration changes.
