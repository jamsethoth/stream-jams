## Context

The user approved implementation of audit findings 1-5. This change hardens existing boundaries without adding a new integration architecture. UX routing: Integrations/Provider Setup/TTS Providers, Error Handling, Diagnostics, and Settings And Backup in `docs/design/ui-refactor-mvp-ux-spec.md`. Non-local Streamer.bot remains deferred in BL-023.

## Goals / Non-Goals

Goals: prevent credentials entering public connection configuration, enforce local connections, complete authentication before event intake, preserve secret redaction when logging fails, and protect the management browser surface.

Non-goals: TLS termination/proxies, remote connections, third-party server configuration changes, inventing authentication not supported by Speaker.bot, unrelated audit hardening, or publishing.

## Decisions

1. Share browser-compatible connection validation in core. Accept only canonical loopback hosts (`127.0.0.1`, `localhost`, `::1`/`[::1]`), mapping localhost to a literal address when connecting. Require path-only endpoints. Reject URL user information, query strings, fragments, ambiguous numeric hosts, and remote addresses. Enforce again at socket construction; validate legacy configurations before backup export and mask unsafe connection fields in management projections.
2. Streamer.bot requires a successful challenge-response when it advertises authentication. If a password is configured, omission of the challenge fails closed even when a local exception is set. Without a password, unauthenticated local operation requires a persisted `allowUnauthenticatedLocalConnection: true` flag, absent/false by default. Track handshake readiness separately from diagnostic status; reject duplicate handshakes and suppress events before authentication, after failure, and on stale sockets.
3. Speaker.bot retains its documented local unauthenticated protocol with explicit setup guidance. Authentication and encryption are separate: local ws remains supported because native integration uses it; neither ws nor wss enables a non-local host.
4. Keep normal and emergency redaction equivalent for URL user information and generated capabilities. Test filesystem failure with injected in-memory sinks; no real credentials are used.
5. Apply restrictive response CSP and anti-framing to management HTML. Permit required local assets, styles, fonts, media/blobs, and workers only as demonstrated by browser tests. Preserve OBS/browser-source rendering and scoped authentication.
6. Use existing dependencies. Install from the frozen lockfile, test negative cases first, then focused checks, full unit/script tests, typecheck, lint, builds, Storybook, browser acceptance, and a disposable live instance. Independent redaction and HTML-policy edits can be delegated to separate agents; provider contracts/runtime/UI stay together.

## Research

Verified 2026-10-03 using official docs:

- https://docs.streamer.bot/api/websocket/guide/configuration documents optional Authentication and Enforce (authentication for all requests).
- https://docs.streamer.bot/api/websocket/guide/authentication documents Hello salt/challenge and Authenticate using the mandated two SHA-256/base64 steps. This authenticates the client to the server and does not encrypt transport or independently prove server identity.
- https://docs.streamer.bot/api/websocket/recipes/remote-access documents WSS through secure proxies/tunnels such as Tailscale Serve. Remote support remains deferred here.
- https://speaker.bot/api/websocket and https://speaker.bot/api/websocket/requests document address/port/endpoint and command requests, with no native authentication setting or Authenticate request. No unsupported authentication is claimed or implemented.

## Risks / Trade-offs

- Previously accepted remote/credential-bearing configurations stop working -> fail closed with safe setup guidance; do not mutate live user data during development.
- Existing unauthenticated Streamer.bot configurations require replacement/review with explicit consent -> explain in setup and release notes.
- CSP can block necessary rendering resources -> regression test management and overlays against the actual production build and make only specific allowances.
- Authenticated local ws still trusts the local machine -> document this boundary; no claim of protection from a compromised OS/local administrator.

## Migration Plan

No schema migration is required for optional configuration fields. Existing unsafe settings remain blocked from connecting/exporting. Existing provider credentials remain in the OS store. Rollback is code-only; no automatic secret migration or data deletion.
