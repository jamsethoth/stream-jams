## Why

Streamer.bot now has the core event-source model and a tested passive protocol client, but Stream Jams still has no durable way to configure a local Streamer.bot connection or safely manage its password. Persistence and management APIs are the next required boundary before runtime startup, diagnostics intake, or UI can depend on Streamer.bot.

## What Changes

- Add a persisted Streamer.bot connection configuration for one local connection profile.
- Store non-secret connection settings through the existing Stream Jams `node:sqlite` database, migration, and repository pattern, including enabled state, protocol, host, port, endpoint, selected subscriptions, warning opt-ins, and coarse connection metadata.
- Store Streamer.bot passwords only through `SecretStore` using the existing `streamerbot` secret namespace, and persist only secret refs.
- Enforce first-wave local-only connection policy:
  - allow loopback hosts only;
  - reject non-local hosts;
  - reject credential-bearing `ws://` unless `allowInsecureLocalConnection` is true;
  - reject unauthenticated mode unless `allowUnauthenticatedLocalConnection` is true;
  - reject unauthenticated `ws://` unless both unauthenticated and insecure-local opt-ins are true.
- Add management-protected routes to read/update config, test connection, enable, disable, discover events, and update subscriptions.
- Use an injected one-shot Streamer.bot connection probe for test connection and discovery calls; the production probe can adapt the Slice 2 protocol client without making route tests depend on socket timing internals.
- Return warning codes and safe status metadata from APIs without returning password values or authentication hashes.
- Keep long-lived runtime startup, external-event diagnostics, browser UI, and alert normalization out of this slice.

## Capabilities

### New Capabilities

- `streamerbot-connection-management`: Persisted local Streamer.bot connection settings, secret handling, local-only security policy, and management API behavior.

### Modified Capabilities

None.

## Impact

- Adds a `node:sqlite` migration registered in the existing migration list and a repository under `apps/server/src/modules/streamerbot/`, following the Twitch account repository pattern.
- Adds Streamer.bot connection management services and validation helpers in the server.
- Adds Fastify management routes under a Streamer.bot namespace and wires them through `createServerApp`.
- Reuses existing `SecretStore`, management auth, management rate limiting, in-memory database test harness, and the Streamer.bot protocol client.
- Does not add browser UI, runtime startup wiring, external-event diagnostics tables, alert normalizers, action-execution APIs, a new persistence technology, or new package dependencies.
