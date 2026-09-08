## Context

The current `alert-audio-routing` specification deliberately keeps all alert video silent. Audio resolution, route binding snapshots, bounded asset transport and a dedicated player already exist. The [approved design](../../../docs/superpowers/specs/2026-09-07-screen-effects-design.md) expands media-audio support without changing output selections or TTS.

## Goals / Non-Goals

Execution details: [routed video audio implementation plan](../../../docs/superpowers/plans/2026-09-08-routed-video-audio-controls.md).

**Goals:** Explicit per-video soundtrack toggle and volume, silent migration of existing alerts, common item-wide destinations, coordinated media timing, reused components in each owning editor.

**Non-goals:** A separate Shared audio page, global mixer, per-layer destinations, implicit muting due to another sound, media extraction/transcoding, new audio drivers, perfect OBS/device clock synchronization, or changes to video-shoutout/TTS.

## Decisions

### Author controls each source

Add validated `playEmbeddedAudio` and `audioVolume` fields to the shared video-layer representation. Newly constructed video layers set true and volume 1. Compatibility parsing of persisted legacy layers without fields sets false and preserves the asset/layout. Bump the document schema version and cover DB/backup/import paths; do not use one unconditional true-default schema for both constructors and legacy deserialization.

Use `Play embedded audio`, a disabled-when-off volume control, and a nonblocking multiple-source notice inside the existing editor inspector. Separate sound remains its own layer/source with volume. Reuse item-wide `browserSource` / `deviceRouteIds`; do not move existing authoring to a global audio panel. Duplicate/variation copying retains values; theme application preserves sound settings for retained media and intentionally replaced layers follow the new-layer default without bypassing review/save safeguards.

### Normalize soundtrack audio once

Extend the core media-audio layer with an allowlisted source kind (`audio` or `video-soundtrack`), logical layer ID, asset ID and volume. The selected document is normalized before profile/surface expansion. Visual `<video>` elements always have `muted` set, including preview and test. Audio recipients play the soundtrack from the same approved local asset independently of visual membership. Distinct layers using the same file remain distinct; duplicate routes to the same device do not duplicate a layer.

Retain an alert-compatible wrapper around reusable media-audio resolution to avoid a broad naming refactor. `AudioOutputService.preparePlayback` still snapshots route bindings synchronously before async enumeration. Generalize route ownership in slice 3 when effects become real consumers, not speculatively here.

### Reuse bounded playback with a common timing envelope

Extend `packages/core/src/audio/transport.ts` and `DesktopAudioSink` to accept the intersection of locally supported video MIME types and actual packaged/OBS decoder support. Retain 25 MiB per transport asset, 100 MiB per batch and the 5-second preparation/start ceiling; unsupported/oversized soundtracks fail at their destination with actionable management feedback. Do not silently lift limits or fall back to the system default device.

Use an occurrence timing envelope with a start epoch, end deadline and layer media offset. Prepare before commit where possible; dispatch all healthy recipients against the same scheduled epoch. A late recipient seeks to elapsed media time after metadata loads, or fails if it cannot seek/start within the bounded window. Seeking/replaying uses a new occurrence and never resuscitates an expired one. Soundtrack end or failure settles its own obligation; visual and explicit sound can continue to their own bounded ends. Stop all remaining media by the declared duration, with the existing 5-second outer transport watchdog.

An `<audio>`/hidden-media element backed by a local video asset is preferred over extraction. Verify container/codec support with a known marker fixture first. Record browser/device onset skew and drift; use 150 ms onset/skew as the local test target, explicitly record endpoints exceeding it, and require a product/backend decision before claiming synchronized support there. This is a release gate, not a guarantee for arbitrary hardware or OBS capture/monitoring pipelines.

### Preserve safety ownership

Route global mute to all explicit sounds and enabled soundtracks before playback or recreation. Skip cancels preparation, stops the occurrence and awaits acknowledgement; retain renderer destruction after 2 seconds without stop acknowledgement. Renderer crash/service loss never retries interrupted sound. No browser or desktop visual recipient is required for selected available device audio. Asset-only video with its visual destination disabled can still deliver the explicitly enabled soundtrack.

## Risks / Trade-offs

- A playable video may have no supported audio track → settle silently for a verified trackless file or fail with an actionable codec diagnosis; never stall the queue.
- Decoding the same video for visuals and soundtrack consumes resources → tiny fixtures, byte caps, measured packaged performance; no automatic extraction dependency.
- Old alerts could become newly audible → version-aware false migration; require explicit user edit before old video sound is enabled.
- OBS Desktop Audio may capture private device routes → retain existing setup warning; device selection alone cannot guarantee privacy on stream.

## Migration Plan

Read legacy document variants from database, duplicate/import, backup and preview paths and assign false only to missing legacy soundtrack fields. Preserve existing explicit audio output defaults and all saved volume/routing values. Add schema round-trip and restore validation. Keep old schema backups for rollback; never rewrite a profile to an older schema in place. Update the alert-routing and Operator mute delta specs together so no normative "all video remains silent" claim survives.

## Open Questions

No authoring choice is outstanding. Supported video codecs and the timing target must be demonstrated in packaged Windows and OBS before completion; failed capability tests require a bounded backend decision, not silent extraction or automatic rerouting.
