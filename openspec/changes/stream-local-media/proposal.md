## Why

Accepted local videos can render successfully while their selected-device soundtracks fail because the audio transport rejects whole files above 25 MiB. HTTP delivery, management previews, and desktop visuals also allocate complete media bodies. A common streaming delivery path should let every accepted asset reach its configured recipients without whole-file playback transfers.

## What Changes

- Serve registered, version-pinned local assets using bounded file streams and HTTP byte ranges, preserving original bytes and existing import limits.
- Reuse the existing @fastify/static/@fastify/send file-delivery implementation and platform streaming APIs; reserve custom code for application authorization, version lifetime, integrity policy, and thin integration adapters.
- Replace desktop media byte payloads with scoped references, delivered through the existing private Electron protocols and owned loopback service.
- Replace registered-asset preview Blobs with revocable, session-owned media URLs.
- Retain old asset versions while queued/active occurrences, previews, or persistent module presentations own them; retire old storage safely after release.
- Preserve selected-device routing, muted visual videos, gain/fades, prepare-before-start timing, stop guarantees, failure isolation, and diagnostic provenance.
- **BREAKING (private runtime contract):** desktop audio and visual IPC media payloads become versioned references instead of bulk bytes. The packaged host/server/renderers must upgrade together; saved authoring documents and existing browser-source URLs remain compatible.

## Capabilities

### New Capabilities

- `local-media-streaming`: Shared bounded local-media delivery, scoped leases, immutable versions, integrity checks, cancellation, and acceptance requirements for all currently supported formats and playback surfaces.

### Modified Capabilities

- `overlay-safe-assets`: Stream authorized HTTP reads with version identity, correct validators, ranges, and resource cleanup.
- `routed-video-audio`: Replace the 25 MiB asset/100 MiB batch transport restrictions with bounded streaming, retaining import eligibility and playback safety.
- `shared-overlay-surfaces`: Deliver desktop visual and persistent module assets through scoped private streaming references.
- `asset-library-management`: Stream authenticated previews and preserve the file version used by existing playback during replacement.

## Impact

- Core asset, overlay, and audio contracts; server asset store, HTTP response helper, media authorization/lifetimes, and playback composition; desktop private protocols and IPC; management previews and desktop renderer asset resolution.
- Update the canonical specifications only after implementation and spec sync. This proposal does not change production behavior or user assets.
- Use Node, Fastify, Electron, and native media elements already in the product. No streaming server, transcoder, HLS/DASH, or additional dependency is proposed.
- Three sequential slices: shared delivery/version lifetimes; desktop references/protocol adapters; management previews and complete runtime acceptance.

## Non-goals

New formats/codecs, larger import limits, remote-media proxying, LAN exposure, automatic transcoding/extraction, changing upload/backup buffering, a global playback scheduler, frame-perfect synchronization, or installing a new executable into the user's live runtime.
