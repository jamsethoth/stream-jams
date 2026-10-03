## Context

Design direction approved on October 3, 2026. This document is the written specification for review, not evidence of implementation. Proposal base: `origin/main` at `1d9dfe7`; standalone reference: `C:/dev/projects/stream-jams-music-widget` at `91dcee0327eb97a75860a892a92630c32e0f9e3e`. Source and tests, rather than dated plans, determine existing behavior.

The standalone widget uses JavaScript ES modules, direct DOM rendering, browser-owned Pear requests, URL-based configuration, and generated classic-script bundles. Its source/state separation and presentation are useful porting references. Stream Jams uses strict TypeScript, Zod boundaries, React/Vite, Fastify, SQLite repositories, and an OS-backed secret store. Alerts, Screen Effects, and Timers are already modules; the Music integration must use those extension points.

The source audit ran 21 focused tests successfully. Additional disposable probes reproduced three uncovered defects: HTTP 204 leaves the previous playing track in state; an outstanding poll publishes after disconnect; and repeated successful polling emits `connected`, resetting the overlay's idle timer. Authentication is absent from the standalone adapter. Its visible configuration-error page conflicts with live overlay transparency requirements.

## Goals / Non-Goals

**Goals:** Preserve the widget's display functionality; implement authenticated Pear first; share provider-independent presentation and normalized state; persist configuration and credentials appropriately; support module/unified browser and desktop surfaces; make the next provider an adapter and setup integration rather than a renderer rewrite.

**Non-goals:** Actual Spotify/Plex adapters, audio playback/capture, music playback controls, song requests, queues/history, simultaneous source mixing, arbitrary third-party plugin loading, automatic standalone URL/file import, standalone repository changes, and LAN exposure of Stream Jams. Future outbound Plex/cloud connectivity does not imply changing Stream Jams' loopback listener.

## Decisions

### 1. Port behavior into the existing monorepo

Use `packages/core/src/music` for browser-compatible schemas, snapshot/projection rules, presentation configuration, and adapter contracts; `apps/server/src/modules/music` for transport/authentication/runtime/artwork; and existing web management/overlay locations for React orchestration and rendering. Reuse Node `fetch`, `ws`, Zod, Fastify and the keyring service. Do not add a second server or ship the standalone bundles inside an iframe.

An iframe wrapper would preserve the old browser credential boundary and duplicate setup. A separately managed local service would add startup, packaging and synchronization failure modes. A native port preserves useful pure logic and tests while adopting the application's existing lifecycle and authorization.

Move the shared presentation union out of timer-specific types into an overlay-module-owned contract, preserve the `timer-stack` variant, and add a `music-widget` variant. Extend browser and private desktop validators together. Music is a continuously projected state, not an alert occurrence or a queue item.

### 2. Reuse provider registrations with a music capability

Add `music-source` and the `pear-desktop` provider kind to typed management schemas, capability mapping, and SQLite constraints through the next migration. Retain one active registration per capability. Music selection cannot activate, replace, or deactivate an event/TTS provider.

Follow existing setup semantics: validate before registration; the first successfully registered music provider becomes selected, later registrations remain inactive; `Test connection` does not activate. The module defaults disabled, so selection alone does not expose a live widget. Switching an enabled module's source clears its old projection immediately, disconnects it, and starts the new source with a fresh generation. Failure leaves the selected source in an actionable error state and output transparent rather than automatically switching accounts.

Persist non-secret endpoint/settings, registration identity, stable pairing client ID, selection, module enablement, and presentation. Store token material only behind `SecretStore`. Starting over the same profile retrieves credentials and obtains fresh current state; it never restores a previous track as live truth. Stopping the module disconnects its live adapter; an explicit connection test uses a bounded isolated session.

### 3. Define one small transport-independent source contract

The adapter contract exposes `testConnection(signal)`, `start(onSnapshot, onStatus, signal)`, `getSnapshot()`, and idempotent asynchronous `stop()`. Starting resolves only after authenticated initialization; empty playback is a successful initialized state. Callbacks deliver complete validated snapshots/status, never transport frames. Each start owns a generation and cancellation signal. Provider-specific setup controllers handle pairing or future OAuth; the common runtime does not prescribe a password, token query parameter, or universal refresh operation.

Descriptors identify provider kind, display label, and supported observations (artwork, position, duration, session selection). Capabilities describe what can be reported, while nullable fields describe what is available for the current item. A later provider must add typed setup/schema/registration mapping, its adapter, and contract tests; no dynamic plugin loader or generic form framework is introduced.

Future fit checks: Spotify can keep OAuth PKCE, refresh serialization and authenticated HTTP polling inside its setup/adapter and secret-store boundary. Plex can discover/select a server and player session, combine notifications with authoritative session reads, and resolve protected artwork through its own validated server policy. Neither requires the renderer to know OAuth, WebSocket framing, Plex tokens or account-wide session lists. Preserve optional safe attribution metadata for provider-specific display requirements. Their actual onboarding, account permissions, remote-host policy and rate limits belong to separate proposals tracked in BL-054.

Normalized state contains:

| Field | Meaning |
| --- | --- |
| `providerId`, `generation`, `revision` | Registration ownership and monotonic publication identity; obsolete generations cannot win |
| `track` | Null for no item; otherwise provider-scoped ID, title, ordered artists, nullable album and artwork reference, and optional safe attribution link |
| `playbackState` | `playing`, `paused`, `stopped`, or `unknown`; connectivity is separate |
| `positionMs`, `durationMs` | Finite nonnegative values or null for unknown, normalized once at ingress |
| `observedAtEpochMs` | Server observation time, used with existing clock synchronization for interpolation |
| `session` | Nullable opaque ID/display label for the selected session, not a list of account activity |

Provider transport payload schemas permit harmless upstream extra fields, then construct a strict bounded normalized projection. Bound strings and collections; reject invalid numbers, malformed frames and excessive payloads. Limit frames to 256 KiB, titles/artist/album strings to 1,024 characters, artist arrays to 32, and provider IDs/track IDs to 512 characters. Missing fields use shared display fallbacks without fabricating a duration or a playing state. Keep optional metadata omissions distinct from an explicit empty snapshot.

Connection status includes connecting, connected, reconnecting, auth-required, and error with redacted diagnostic reference. Existing registration validation remains distinct from live Music status. Management can display last known data marked stale; live recipients receive only a current renderable projection or transparent state.

### 4. Authenticate Pear on both transports

Use Pear Desktop 3.12.0 as the initial supported protocol baseline, whose versioned source includes WebSocket authentication. Setup asks for a loopback endpoint, defaults to `http://127.0.0.1:26538`, and generates a stable client identifier. An explicit Pair action sends `POST /auth/{id}`; the user approves in Pear. Bound pairing to 60 seconds, support cancellation, and reject late success from abandoned setup. Hold provisional credentials only on the server; commit them to the secret store with successful registration, and compensate failed saves without leaving usable orphan registrations.

Send REST credentials in `Authorization: Bearer ...`. Pear's WebSocket protocol requires `/api/v1/ws?token=...`; this URL exists only inside the server transport. It is never a browser source URL or management response. Redact query tokens, authorization values and serialized causes for HTTP, WS and WSS failures. No unauthenticated configuration is offered in this slice and no code changes Pear's settings. Pairing is exercised against `AUTH_AT_FIRST`; the application does not claim it can prove server-side enforcement merely from a successful connection to a server configured as `NONE`.

WebSocket `open` does not establish authentication: require the first validated `PLAYER_INFO` within five seconds. A valid empty `PLAYER_INFO` is healthy and clears the track. Treat close 1008 and REST 401/403 as auth-required; stop automatic retries and offer explicit Reconnect/Pair. Do not trigger repeated approval dialogs from a reconnect loop. Connection testing must exercise the selected transport, not merely accept a successful `/song` request for a WS-only configuration.

Support `auto`, `ws`, and `poll` transport modes. Auto prefers WS and falls back to authenticated HTTP on transport unavailability, never on an auth failure. WS-only reports incompatible/unavailable endpoints; polling-only does not open a socket. Old releases cannot silently qualify as authenticated WebSocket support.

Accept loopback IPv4/IPv6 literals and `localhost` only for Pear; do not accept paths/userinfo in host fields or follow credential-bearing redirects. Allow HTTPS/WSS with normal certificate validation; never disable verification. The loopback HTTP/WS default is explicit in setup and documented as unencrypted local transport. Non-loopback Pear endpoints require a separate security scope.

### 5. Make lifecycle, freshness, and progress deterministic

Use cancellable five-second ordinary requests and initialization, a three-second nonoverlapping poll cadence, and reconnect delays of 1, 2, 5, 10, then 30 seconds with bounded jitter. Keep at most one live transport generation, request, retry timer, and pending latest snapshot per registration; discard intermediate snapshots if delivery is slow. Stop removes listeners/timers, aborts requests, closes sockets, and prevents all later callbacks from publishing.

For healthy WS sessions, reconcile with authenticated `/song` every 15 seconds to detect missed metadata, silent transport failure and revocation. HTTP 204 or an explicit empty snapshot clears track and progress. Ordinary position-only/play-state events merge only into the known current track; a new track cannot inherit previous artwork or album. Ignore unsupported event types; bounded malformed payload failures yield diagnostics and trigger resynchronization rather than rendering raw content.

Clear live projection immediately on disconnect, auth failure, disable or source change. While a connection still appears healthy, a snapshot older than 45 seconds without a successful observation/reconciliation is stale and hidden. Management retains redacted stale evidence for diagnosis. Recovery publishes a new full snapshot. Respect provider rate limiting without retrying before `Retry-After`; a delayed source can be stale rather than pretending to remain current.

Interpolate only a fresh playing snapshot with known position, freeze paused state, clamp to known duration, and accept authoritative seeks backward or forward. Unknown duration has no percentage or fabricated `0:00` total. A newly connected overlay receives the current full snapshot and clock reference. Track changes reset the appearance timer; routine polling and position updates do not. Genuine recovery from disconnected to healthy restarts display. Closing/reopening an overlay uses the shared server appearance epoch rather than independently restarting its visibility window.

### 6. Keep artwork credentials behind the server

Adapters retain private upstream artwork descriptors; normalized client snapshots carry an opaque artwork ID. Resolve images through bounded server fetching and existing management/overlay/private-desktop authorization boundaries. Overlay access must match output, purpose, selected source generation and permitted media reference; an artwork URL cannot authorize management or fetch arbitrary URLs.

Pear starts with HTTPS origins `i.ytimg.com` and `lh3.googleusercontent.com`; unknown origins produce a placeholder and a management diagnostic until explicitly supported. Reject userinfo, redirects to unapproved hosts, private/link-local/loopback destinations for these remote image origins, non-image responses and oversized bodies. Bind connections to validated DNS results or an equivalent safe-fetch boundary to avoid rebinding. Limit each raster image to 2 MiB and 4096 pixels per side, fetch time to five seconds, and cache to 16 MiB/32 items with eviction. Reject SVG/HTML and credentials embedded in public references. Source changes stop pending fetches; recipients discard obsolete completions and clear artwork on an empty track. Artwork failure alone keeps safe text and a placeholder.

Future authenticated Plex images use a separately validated configured-server policy; they must not weaken Pear's remote image allowlist. Reuse existing asset parsing/validation primitives where applicable, with a concrete maintained-library evaluation for any missing decoding or safe-fetch boundary.

### 7. Preserve appearance through saved controls

Proposed default for written-spec review: replace the standalone optional `styles/custom-theme.css` file with bounded saved appearance controls. The user approved custom appearance parity; the follow-up choice between native controls and a custom CSS editor had not received an answer when this draft was written. This is an explicit compatibility decision for review, not a claim that arbitrary existing CSS files are portable. If the user selects a CSS editor, revise this section and its security/verification requirements before implementation.

Provide colors for the two background gradient stops, title, details, artwork placeholder, border, progress fill and progress track; opacity, widget width, artwork size, padding/gap, corner radius, border width and shadow; separate title/detail font settings. Reuse existing uploaded font assets and typed text appearance primitives where they fit, including size, weight, italic, underline and letter spacing. This avoids creating a new font upload/store. Keep theme presets as starting values with an explicit reset-to-theme action; saving overrides never changes the global management theme.

Use RGBA colors with alpha 0..1; integer sizes in CSS pixels: widget width 160..1920, artwork size 0..512 (zero hides artwork), padding/gap 0..128, radius 0..128, border width 0..32, title/detail font size 8..144; font weight 100..900 in steps of 100, letter spacing -20..100; shadow offset -128..128, blur 0..128, spread -64..64. Width is also capped to its target-profile region at projection. Font assets use existing availability/usage checks and authorized delivery; load failure follows existing font readiness/error handling. Full/compact mode and eight alignments remain shared behavior. Reduced motion disables scrolling animation and uses stable wrapping/clipping with full text available in management preview.

These controls cover the reference stylesheet's exposed theme variables and basic box/text styling. Arbitrary selector overrides, extra HTML, custom animations and external CSS/font/image URLs are not imported. The Music module stays within Stream Jams' schema-backed presentation model. The initial widget palette/layout remains recognizable; broader visual redesign is not part of the port. Defaults for full view follow the reference (640 px widget, 144 px artwork, 16 px padding, 22 px gap and 8 px corner radius). Compact defaults retain a 480 px-wide, 118 px-high widget, hidden artwork, 14 px vertical/18 px horizontal padding, and 22 px title/14 px details; profile width still caps the projected box. Store padding per axis so compact defaults round-trip without distortion.

### 8. Integrate shared outputs and operation

Register `music` with live/test module outputs, unified composition, and opt-in desktop surface membership. Preserve purpose-scoped keys, revocation, private desktop grants, profile sizing and surface layering. Add no management credentials or raw provider URLs to renderers. The Music runtime publishes independently of Alert/Effect queues. Existing transient alert pause, mute, skip, replay and DND operations neither control the external music player nor enqueue/skip Music; module disable and surface layer visibility control this visual module.

Keep desktop click-through, focus preservation and shared z-order behavior. A fresh desktop surface does not opt Music in automatically. No audio is emitted by the widget, including tests. Mock fixtures appear only in management preview or explicit test output and cannot become a live registered provider.

Management follows the existing shell, integration setup/validation pattern, compact controls, dirty-state handling, accessible forms, actionable inline failures and toasts. Add a Music sources integration entry and a Music module page for configuration/output links. Refresh live status at least every five seconds while visible. Preview uses the production renderer with typed fixture state and never changes the live provider. New UI covers loading, empty, saved, dirty, pairing, auth failure, reconnecting and stale states.

## Risks / Trade-offs

- Pear uses a token query parameter for WS: isolate the transport and test redaction at every exception/diagnostic boundary; never expose a direct Pear connection to a renderer.
- Provider features differ: support nullable observations and adapter-specific authentication/session setup; do not infer universal WebSocket availability or implement speculative playback-control APIs.
- Remote artwork introduces network/resource exposure: use the constrained fetch boundary and explicit placeholder behavior above, not a general URL proxy.
- A passing protocol fixture does not verify installed Pear: keep real pairing, revocation, restart, OBS and desktop acceptance separate from automated claims.
- Future Spotify/Plex provider access and branding rules can change: validate official APIs and usage requirements when implementing those adapters. This contract is a design fit, not a guarantee of account/API eligibility.
- Native appearance controls cannot reproduce arbitrary custom-theme.css overrides: this proposed compatibility choice is called out for written-spec review; do not silently claim complete CSS-file compatibility.

## Migration Plan

Add a new migration that rebuilds provider constraints/indexes as needed while preserving every existing registration, config and secret reference inside a narrow transaction. Do not edit migration 005. Add music config defaults lazily through the existing module config service. Save non-secret setup and display values in existing configuration storage; persist no playing-track history.

Backups include Music display config, non-secret provider metadata and custom appearance resources. Exclude pairing client identities, credential references/material, remote artwork cache and playback state. Restore creates fresh local pairing identity, requires pairing and shows transparent live Music until validation succeeds. Stop Music before replacement, preserve the prior runtime/configuration for failed-restore rollback, and clean superseded secrets only after successful database replacement. Treat missing Music sections in supported older archives as disabled defaults; follow existing schema compatibility rejection otherwise.

Deployment requires a verified database backup including WAL companions when applicable. Older binaries may reject the widened provider constraints/presentation variant; rollback restores the compatible backup with the prior binary rather than attempting an unverified down migration. Keep the standalone repository and its runtime packages available for the user during acceptance.

## Verification Strategy

Share adapter contract tests for a push fixture, a polling-only fixture and a session-selecting fixture; these are test doubles, not promised Spotify/Plex implementations. Verify empty/missing metadata, unknown duration, seeks, pause/resume, rapid source change, slow consumers, cancellation and no late publish. Add Pear protocol tests for pairing allow/deny/timeout, first-frame auth readiness, 1008/401/403, expired/revoked credentials, auto fallback, WS-only failures, reconnection, malformed/oversized frames and secret-store failures.

Use Fastify injection for management/overlay authorization, artwork, config and migration/restore tests; a disposable local Pear protocol server for real HTTP/WS handshakes; production React components for unit/Storybook interaction and accessibility coverage; Playwright for pairing/setup, preview, saved display, keys, unified/browser outputs and runtime recovery. Add focused private-desktop coverage. Test the three reproduced standalone regressions explicitly.

Before publishing run lint, typecheck, tests, build, Storybook build/test, applicable Playwright/desktop checks, strict OpenSpec validation, and rebuild/restart/health/reload verification. Record real Pear 3.12.0-or-later version, authenticated pairing, restart, disconnect/reconnect, revocation, track/seek/pause behavior and OBS/desktop acceptance separately; missing physical acceptance cannot be reported as passing.

## Sources

- Standalone sources: `src/sources/pearYoutubeMusicSource.js`, `src/state/playerState.js`, `src/state/progressClock.js`, `src/app/overlayApp.js`, `src/ui/overlayView.js`, `src/config/overlayConfig.js`, and `styles/overlay.css` in the reference repository.
- Stream Jams sources: `packages/core/src/management/contracts.ts`, `packages/core/src/overlay-modules/`, `packages/core/src/timers/types.ts`, `apps/server/src/modules/providers/`, `apps/server/src/modules/security/`, and canonical specs for outputs, surfaces, module config, secret storage and backups.
- [Pear 3.12.0 WS protocol](https://github.com/pear-devs/pear-desktop/blob/v3.12.0/src/plugins/api-server/backend/routes/websocket.ts), [Pear pairing](https://github.com/pear-devs/pear-desktop/blob/master/src/plugins/api-server/backend/routes/auth.ts), [Pear REST/TLS](https://github.com/pear-devs/pear-desktop/blob/master/src/plugins/api-server/backend/main.ts).
- [Spotify PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [currently-playing API](https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track), [Plex API](https://developer.plex.tv/pms/). Reviewed October 3, 2026; future adapters require fresh verification.
