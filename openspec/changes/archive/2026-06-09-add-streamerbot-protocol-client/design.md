## Context

Streamer.bot integration is planned as passive local event intake before any management UI or action-execution surface. Slice 1 adds the shared source/ingest event model and Streamer.bot secret namespace. Slice 2 introduces only the WebSocket protocol client needed by later persistence, management API, runtime, diagnostics, and normalization slices.

The Streamer.bot WebSocket server defaults to a local server at `127.0.0.1`, port `8080`, endpoint `/`, and emits events only after subscription. The protocol sends an initial `Hello` message, optionally with authentication `salt` and `challenge`. Requests and responses use caller-provided string IDs for correlation. Event envelopes carry `timeStamp`, `event.source`, `event.type`, and object `data`.

Current server code already uses an injected outbound WebSocket factory for Twitch EventSub. The Streamer.bot client should follow that pattern so tests do not require a real socket server and production startup can continue using Node's global WebSocket runtime.

## Goals / Non-Goals

**Goals:**

- Add `apps/server/src/modules/streamerbot/streamerbot-client.ts`.
- Build a local Streamer.bot WebSocket URL from protocol, host, port, and endpoint, defaulting to `ws://127.0.0.1:8080/`.
- Parse `Hello` messages and optional authentication challenge data.
- Implement the passive request set: `Authenticate`, `GetInfo`, `GetEvents`, `Subscribe`, and `UnSubscribe`.
- Compute Streamer.bot direct-client authentication with SHA-256/base64 using password, salt, and challenge.
- Correlate responses by request ID and reject pending requests on response errors, malformed responses, request timeout, socket close, or socket error.
- Validate incoming event envelopes and deliver valid envelopes through a callback without normalizing or persisting them.
- Track `idle`, `connecting`, `connected`, `reconnecting`, `degraded`, and `error` status.
- Reconnect with bounded backoff and resubscribe using stored subscription category keys.
- Preserve subscription category keys separately from received `event.source` values.

**Non-Goals:**

- No Streamer.bot connection persistence or secret lookup.
- No Fastify management routes.
- No runtime service wired into app startup.
- No external-event diagnostic table or raw payload storage.
- No Streamer.bot Twitch normalizers or alert playback.
- No browser management UI.
- No `DoAction`, `SendMessage`, `ExecuteCodeTrigger`, command mutation, trigger mutation, global variable APIs, or other active automation controls.
- No LAN/remote security policy enforcement beyond URL construction inputs; Slice 3 owns persisted config and local-only validation.

## Decisions

### Decision: Use a direct protocol client with injected socket factory

Use a small direct client instead of adding `@streamerbot/client`. The required Slice 2 protocol surface is narrow, and the repo already has a testable pattern for outbound WebSocket clients. The client constructor should accept a socket factory, clock, scheduler, request ID generator, request timeout, reconnect backoff list, and callbacks.

Alternative considered: add the official client package. That could reduce protocol code, but it adds dependency surface and may hide request/response, reconnect, redaction, and test hooks that this app needs to own. Do not add the dependency in this slice unless implementation discovers a concrete blocker and updates this design/spec first.

### Decision: Keep the client runtime-only

The client should accept connection options and selected subscriptions in memory. It must not read or write SQLite, config files, or `SecretStore`. Later slices will fetch persisted settings and secrets, then pass values into the client.

This keeps Slice 2 reviewable and avoids mixing protocol behavior with local security-policy validation, management API shape, and persistence migrations.

### Decision: Model request correlation explicitly

Every request should use a generated string ID and be tracked in a pending-request map. Responses must match an existing ID and have `status: "ok"` or `status: "error"`. Unknown response IDs should mark status degraded or error, but must not resolve another request. Closing or erroring the socket rejects all pending requests.

Request timeout defaults to 5 seconds. Tests should inject scheduling so timeout behavior is deterministic.

### Decision: Authenticate only when the server asks for it

If `Hello.authentication` is present, the client must require a non-empty password input and send an `Authenticate` request before considering the connection connected or sending subscription requests. The authentication value is computed with the documented two-step SHA-256/base64 flow:

1. `base64(sha256(password + salt))`
2. `base64(sha256(secret + challenge))`

If authentication fails or the response is malformed, status becomes `error`, the socket is closed, and no subscriptions are sent.

If `Hello.authentication` is absent, no `Authenticate` request should be sent even if a password was supplied.

### Decision: Preserve subscription keys and envelope source separately

`GetEvents`, `Subscribe`, and `UnSubscribe` use event category keys such as `twitch` or `Twitch`, while emitted envelopes use `event.source` values such as `Twitch`. These values are not guaranteed to share casing or display form. The client must preserve configured subscription category keys for resubscribe requests and pass received envelope source/type through unchanged.

### Decision: Validate only the envelope in this slice

The protocol client validates that incoming events have:

- `timeStamp` as a non-empty string parsable as a date;
- `event.source` as a non-empty string;
- `event.type` as a non-empty string;
- `data` as an object.

The client does not validate source/type-specific payload fields, does not normalize events, and does not reject unknown source/type pairs when the base envelope is valid.

### Decision: Status messages must be safe

Status and errors may include high-level failure reasons such as timeout, socket close, malformed response, malformed event envelope, or authentication failed. They must not include passwords, authentication hashes, full raw payloads, or secret refs.

## Risks / Trade-offs

- Protocol details may differ across Streamer.bot versions. -> Keep parsing strict at boundaries, fixture tests focused on documented shapes, and error messages safe.
- Reconnect/resubscribe can duplicate subscriptions if an old socket is still alive. -> Close the previous socket before reconnecting and ignore events from stale socket instances.
- Request correlation bugs can hang later management actions. -> Test success, error, malformed, timeout, close, and socket error paths with deterministic fake sockets.
- Automatically resubscribing after reconnect can surprise users if subscriptions were mutated concurrently in a later slice. -> In Slice 2, subscriptions are in-memory; later persistence/runtime slices must own update serialization.
- A direct client duplicates some behavior from the official library. -> Keep scope limited to passive requests and avoid broad protocol coverage.
- Authentication over local `ws://` is insecure in transit. -> Slice 2 accepts password input only as runtime data; Slice 3 owns local-only and insecure-transport policy checks before secrets reach the client.

## Migration Plan

No data migration is required. The slice adds an unused server module plus tests. Existing Twitch EventSub, alerting, diagnostics, persistence, HTTP routes, and UI behavior remain unchanged.

Rollback is removing the new Streamer.bot module, tests, and exports if any are added. No persisted state or API clients depend on it until later slices.

## Open Questions

None for this slice. Later slices still need exact management route names, persisted connection schema, UI copy, and external-event diagnostic table shape.
