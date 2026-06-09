## Why

Streamer.bot event intake needs a tested local WebSocket protocol boundary before persistence, management APIs, runtime wiring, diagnostics storage, or UI can depend on it. This slice adds the passive Streamer.bot client foundation while keeping the app's current live Twitch behavior unchanged.

## What Changes

- Add a small direct Streamer.bot WebSocket protocol client in the server.
- Support local URL construction from protocol, host, port, and endpoint, defaulting to `ws://127.0.0.1:8080/`.
- Parse the initial `Hello` message, including optional authentication salt/challenge data.
- Implement the passive request set needed by later slices: `Authenticate`, `GetInfo`, `GetEvents`, `Subscribe`, and `UnSubscribe`.
- Correlate request responses by request ID and fail pending requests on timeout, socket close, socket error, or malformed responses.
- Validate incoming Streamer.bot event envelopes with `timeStamp`, `event.source`, `event.type`, and object `data`.
- Track connection status, reconnect with bounded backoff, and resubscribe after reconnect.
- Preserve subscription category keys separately from received envelope `event.source` values.
- Keep Streamer.bot action execution APIs out of scope.

## Capabilities

### New Capabilities

- `streamerbot-protocol-client`: Passive Streamer.bot WebSocket protocol client behavior, including connection lifecycle, optional authentication, passive discovery/subscription requests, event envelope validation, reconnect/resubscribe, and status reporting.

### Modified Capabilities

- None.

## Impact

- Affected server code: new `apps/server/src/modules/streamerbot/` module and tests.
- Affected contracts: internal server-side protocol client interfaces only; no management API, runtime service, persistence schema, UI, or alert pipeline behavior changes in this slice.
- Dependencies: no new dependency unless implementation proves a direct protocol client is not viable and the dependency is explicitly justified before adding it.
- Security: supports only passive event intake commands; does not expose `DoAction`, chat sending, code trigger execution, command mutation, or global variable mutation.
