# Task 8 report — bounded, authorized Music artwork

Status: implemented. Provider artwork remains ephemeral and server-only. The asset repository and upload tables are unchanged. No user Pear account or remote artwork host was contacted.

## Behavior and handoff interfaces

- `MusicArtworkService.resolve(descriptor, { providerId, generation }, signal)` accepts only HTTPS URLs on `i.ytimg.com` or `lh3.googleusercontent.com`. It checks all DNS answers, pins the actual HTTPS socket lookup to a validated address, preserves the original hostname/SNI and ordinary TLS verification, rejects redirects, and bounds the whole operation to five seconds. A streamed response is capped at 2 MiB. PNG/JPEG/WebP magic, matching Sharp format, dimensions at most 4096 per side, and full decoding are required. Any failure returns `null` without changing playback text.
- `read(ref, owner)` returns `{ bytes, mimeType }` only while the same owner and descriptor remain current. `clearGeneration(owner)` aborts its pending work, evicts its cached bytes and revokes its private grants. The cache is bounded to 32 entries and 16 MiB; pending fetches to eight; private grants to 64. No raw URL appears in a public reference or response.
- `issueGrant(ref, owner, "desktop-music", expiresAt)` and `readGrant(handle, "desktop-music")` are the private desktop interface. Expiry is at most one hour, and the handle is valid only for current artwork. Task 10 should issue it only from a validated private desktop output context and use `/media/music-artwork/:handle` for delivery.
- `MusicRuntimeCoordinator.getCurrentArtwork()` returns the current `{ ref, owner, descriptor }` inside the server. Runtime composition constructs the service with live generation/descriptor callbacks, clears artwork when playback disappears or generation changes, and exposes `musicArtworkService` for Tasks 10–12.
- HTTP reads: `/management/music/artwork/:ref` uses the existing management session/rate handlers; `/overlay/modules/music/live/:overlayKey/artwork/:ref` and `/overlay/unified/live/:overlayKey/music/artwork/:ref` use existing output-key verification. Test-purpose/wrong-scope/revoked keys cannot fetch the live image. Routes accept opaque references only and send verified raster content type, `nosniff`, `no-store` and `no-referrer` headers. Private handle delivery has no management authority.

## Verification

- Focused artwork service/route tests: 13/13 passed. Cases include allowlist and credentials, unsafe DNS and IPv4/IPv6 transition ranges, actual pinned local socket with normal TLS rejection, streamed overflow, malformed/truncated/oversized images, cancellation, old generation and same-generation track changes, in-flight and cache bounds, empty-state clearing, output-key denial, and grant expiry.
- Coordinator and affected runtime tests: 38/38 passed across four files before the final narrow test addition; that addition only covers failure text preservation. Final artwork-only run: 13/13 passed.
- `tsc -b apps/server/tsconfig.json --pretty false`: passed. Targeted ESLint on all changed TypeScript: passed. `git diff --check`: passed.
- The pinned-socket fixture deliberately uses a local TCP peer to prove the lookup reaches that exact address for a nonlocal hostname; the handshake fails because the peer has no valid TLS certificate. It is transport evidence, not a successful remote artwork request.

## File changes and reasons

- `apps/server/src/modules/music/music-artwork-service.ts`: bounded remote fetch, raster verification, ephemeral cache and private grant ownership.
- `apps/server/src/modules/music/music-artwork-service.test.ts`: failure, resource-cap, image, DNS and actual socket regressions.
- `apps/server/src/http/routes/music-artwork.ts`: thin authorized reference and private-grant delivery.
- `apps/server/src/http/routes/music-artwork.test.ts`: management/overlay/private authorization and response checks.
- `apps/server/src/modules/music/music-runtime-coordinator.ts`: private current-artwork descriptor handoff.
- `apps/server/src/runtime/runtime-composition.ts`: service lifecycle and current-source validation.
- `apps/server/src/app.ts`: registers artwork routes when the runtime supplies the service.

Remaining integration: Task 10 must transform/use opaque artwork refs in its output-specific publication and issue private desktop grants only after validating that output. Task 11's renderer can use the verified raster endpoints; Task 12 can use the management endpoint. The local TCP fixture does not claim successful production TLS to upstream hosts; a physical Pear/OBS run remains a later acceptance gate.
