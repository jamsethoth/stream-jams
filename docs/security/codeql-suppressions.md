# CodeQL Suppressions

This file records intentional in-source CodeQL suppressions that rely on repository-specific controls.

## `js/missing-rate-limiting` on `GET /config/server`

- Location: `apps/server/src/http/routes/config.ts`
- Reason: GitHub CodeQL models common rate-limiting packages, but does not recognize the Stream Jams custom Fastify `preHandler` limiter.
- Control: `ServerConfigRouteDependencies` requires `managementRateLimitPreHandler`, and `registerConfigRoutes` installs it as the first pre-handler before management auth and before the filesystem-backed config handler runs.
- Validation: `apps/server/src/http/routes/config.test.ts` asserts repeated authenticated and unauthenticated config requests return HTTP 429 before additional config-store reads or writes.

## `js/insufficient-password-hash` on Streamer.bot WebSocket authentication

- Locations:
  - `apps/server/src/modules/streamerbot/streamerbot-client.ts`
  - `apps/server/src/modules/streamerbot/streamerbot-client.test.ts`
- Reason: GitHub CodeQL treats the Streamer.bot WebSocket authentication value as a password hash with insufficient computational effort. In this code path, the SHA-256 value is not used for password storage, password verification at rest, account lookup, or reusable credential persistence. It is the challenge-response value required by Streamer.bot's WebSocket protocol.
- Protocol reference: Streamer.bot's official WebSocket authentication guide documents that the server sends `authentication.salt` and `authentication.challenge` in the `Hello` message, and that direct clients must send an `Authenticate` request whose authentication value is `base64(sha256(password + salt))` followed by `base64(sha256(base64_secret + challenge))`: https://github.com/Streamerbot/docs/blob/main/streamerbot/3.api/4.websocket/0.guide/4.authentication.md
- Client reference: Streamer.bot's official JavaScript client computes the same two-step SHA-256/base64 value before sending `request: "Authenticate"`: https://github.com/Streamerbot/client/blob/main/packages/client/src/ws/StreamerbotClient.ts
- Scope: The suppressed helper is used only to produce or test Streamer.bot's mandated WebSocket challenge response. Stream Jams does not persist this hash, log it, expose it in status output, or use it as an application password hash. Later connection-management slices store Streamer.bot passwords only through `SecretStore` and persist only secret references.
- Control: Keep the suppression immediately adjacent to the SHA-256 helper and do not reuse that helper for application password storage or user credential verification.
- Validation: `apps/server/src/modules/streamerbot/streamerbot-client.test.ts` asserts the `Authenticate` request value for known password/salt/challenge inputs and asserts connection status does not include password, salt, challenge, or generated authentication values.
