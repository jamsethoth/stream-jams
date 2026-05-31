# Stream Jams Future Features

This document captures intentionally deferred product and architecture ideas that should not be lost while current work stays tightly scoped.

Each item should become its own design/spec before implementation.

## Streamer.bot Non-Local Connections

**Status:** Deferred.

**Captured:** 2026-05-31.

**Why deferred:** The first Streamer.bot event-source implementation is local-only. Non-local Streamer.bot connections change the security model because Stream Jams would connect to automation software across a LAN or remote network boundary.

**Future capability:** Allow users to connect Stream Jams to a Streamer.bot WebSocket server that is not bound to the same local machine.

**Design questions to answer before implementation:**

- Which host values are allowed: private LAN only, arbitrary hostnames, or user-confirmed advanced entries?
- Should non-local support require Streamer.bot authentication?
- Should Stream Jams require TLS or a trusted tunnel for remote connections?
- How should management UI warn users about connecting to automation software over a network?
- Should Stream Jams detect and block public or ambiguous network addresses by default?
- How should connection errors distinguish DNS, TCP, WebSocket, authentication, and subscription failures?
- What diagnostics are safe to expose when a remote endpoint may be shared or administered by someone else?

**Likely prerequisites:**

- Completed local Streamer.bot event-source integration.
- Explicit authentication and unauthenticated-mode configuration model.
- Redacted diagnostics for Streamer.bot connection and event payloads.
- Threat model update for non-local provider connections.

**Non-goals for the first local implementation:**

- LAN setup wizard.
- Remote tunnel guidance.
- TLS certificate management.
- Public endpoint support.
- Action execution over a non-local Streamer.bot connection.


## Twitch Secure Configuration And UI Parity

**Status:** Deferred.

**Captured:** 2026-05-31.

**Why deferred:** The MVP Twitch integration currently has a management UI for connection/status, but Twitch app credentials are configured through process environment variables. Streamer.bot planning introduces a stronger explicit configuration model for secure transport defaults, insecure-mode opt-ins, encrypted-at-rest credentials, warning states, and connection diagnostics.

**Future capability:** Bring Twitch integration up to the same configuration and security standard as the Streamer.bot integration where the concepts apply.

**Design questions to answer before implementation:**

- Should Twitch client ID and client secret move from environment variables into management configuration?
- Which Twitch credential values are secrets and which are non-secret configuration?
- Which secret-store backend is required before real Twitch credentials can be managed in-app?
- How should the UI distinguish app credentials, connected broadcaster account, OAuth token status, and EventSub runtime status?
- What warning or blocked state should appear when the runtime falls back to development-only secret storage?
- Should Twitch credential changes force token revocation, account disconnect, or EventSub reconnect?
- What diagnostics prove Twitch OAuth and EventSub communication are using expected secure upstream endpoints?

**Likely prerequisites:**

- Production-ready encrypted secret-store selection.
- Provider configuration model that separates non-secret settings from secret refs.
- Streamer.bot secure configuration implementation or equivalent shared provider-settings pattern.
- Server-composition smoke tests that prove runtime uses the selected secret store.

**Known UI gaps from the current Twitch panel:**

- No UI for Twitch app client ID or client secret configuration.
- No UI warning when Twitch runtime uses a development-only secret store.
- No UI for credential storage health.
- No explicit secure-communication status beyond relying on Twitch HTTPS endpoints.
- No EventSub subscription selection or scope explanation beyond listing granted scopes.
