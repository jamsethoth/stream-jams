## Why

The current alert routing implementation keeps video layers silent. Streamers need explicit control over each video's soundtrack, including choosing to play it alongside a separate sound, using the same Browser Source and named-device destinations already available for alerts.

## What Changes

- Add per-video-layer `Play embedded audio` and volume controls inside the owning editor. New video layers default on; existing saved layers migrate off to preserve audible behavior.
- Keep separately configured sound and embedded audio independent; adding sound never silently changes the video toggle.
- Extend shared normalized media-audio playback to allowlisted local video assets, retaining occurrence identity, synchronized media timing, duration bounds, global mute, and stop acknowledgement.
- Keep visual video elements internally muted and route each selected soundtrack once through the explicit media-audio path.
- Apply controls to Alerts first and expose reusable contracts/components for Screen Effects. This is not a new global mixer or top-level Shared audio page.

## Capabilities

### New Capabilities

- `routed-video-audio`: User-controlled soundtrack authoring, migration, local video playback through existing audio destinations, and synchronized bounded cleanup.

### Modified Capabilities

- `alert-audio-routing`: Extend the existing alert-wide outputs to enabled video soundtracks while retaining route, TTS, and security boundaries.
- `alert-playback-operator-controls`: Update mute/unmute requirements to cover deliberately enabled soundtracks while visual video elements remain silent.

## Impact

Touches core alert document/schema migration, media-audio resolution and transport, `AudioOutputService`, `DesktopAudioSink`, the desktop player, browser renderer, alert editor, and compatibility tests. Depends on the merged audio-routing foundation; independently implementable of the desktop visual surface, but delivered second in the agreed sequence. Does not change the separate video-shoutout proposal or TTS provider routing.


## Non-goals

Per-layer destinations, a global mixer, implicit muting when separate sound is added, automatic extraction/transcoding, FFmpeg, new native audio drivers, arbitrary URLs, TTS routing changes, sample-perfect synchronization across independent OBS/browser/device clocks, and changing existing alerts to become audible without user action.
