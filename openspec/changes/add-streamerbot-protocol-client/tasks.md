## 1. Module And Test Harness

- [ ] 1.1 Create `apps/server/src/modules/streamerbot/streamerbot-client.ts` with exported protocol-client types, status types, connection input types, and error classes.
- [ ] 1.2 Create `apps/server/src/modules/streamerbot/streamerbot-client.test.ts` with a deterministic fake socket, scheduler, clock, request ID generator, and event callback harness.
- [ ] 1.3 Add initial tests for default URL construction, custom endpoint path normalization, idle status, and connecting status.
- [ ] 1.4 Implement URL construction and initial connect/disconnect/status behavior.

## 2. Hello And Authentication

- [ ] 2.1 Add tests for valid `Hello` without authentication and ensure no `Authenticate` request is sent.
- [ ] 2.2 Add tests for valid `Hello` with authentication challenge, expected SHA-256/base64 authentication value, and delayed connected state until auth succeeds.
- [ ] 2.3 Add tests for authentication challenge without password, authentication error response, malformed `Hello`, and secret-free status messages.
- [ ] 2.4 Implement `Hello` parsing, authentication challenge response generation, authentication request sending, and auth failure handling.

## 3. Passive Request API

- [ ] 3.1 Add tests for `getInfo()` request shape, response correlation, and invalid `info` response rejection.
- [ ] 3.2 Add tests for `getEvents()` request shape and preservation of response category key casing.
- [ ] 3.3 Add tests for `subscribe()` request payloads, stored subscription selections, and category key casing preservation.
- [ ] 3.4 Add tests for `unsubscribe()` request payloads and removal from stored reconnect selections.
- [ ] 3.5 Implement `GetInfo`, `GetEvents`, `Subscribe`, and `UnSubscribe` methods without adding action-execution methods.

## 4. Request Correlation And Failure Handling

- [ ] 4.1 Add tests proving matching response IDs resolve only the matching pending request.
- [ ] 4.2 Add tests for `status: "error"` responses, unknown response IDs, malformed responses, and safe error messages.
- [ ] 4.3 Add tests for request timeout rejection and pending-map cleanup.
- [ ] 4.4 Add tests for socket close and socket error rejecting all pending requests.
- [ ] 4.5 Implement pending-request tracking, response parsing, timeout handling, and pending rejection on close/error.

## 5. Event Envelope Handling

- [ ] 5.1 Add tests for valid event envelopes preserving `timeStamp`, `event.source`, `event.type`, and object `data`.
- [ ] 5.2 Add tests proving unknown source/type pairs are accepted when the envelope is valid.
- [ ] 5.3 Add tests for malformed event envelopes and safe degraded/error status.
- [ ] 5.4 Implement event envelope validation and callback dispatch without normalization or persistence.

## 6. Reconnect And Resubscribe

- [ ] 6.1 Add tests for unexpected socket close scheduling reconnect with the configured backoff sequence.
- [ ] 6.2 Add tests proving reconnect backoff is bounded at the maximum configured delay.
- [ ] 6.3 Add tests proving successful reconnect resubscribes stored category keys and event names.
- [ ] 6.4 Add tests proving stale socket messages are ignored after a newer socket is opened.
- [ ] 6.5 Implement reconnect scheduling, stale-socket guards, and resubscribe-after-reconnect behavior.

## 7. Integration Scope And Exports

- [ ] 7.1 Export any Streamer.bot client types only where needed by server code; avoid exposing a public management API contract in this slice.
- [ ] 7.2 Confirm no new dependency is added; if a dependency becomes necessary, update the design and proposal with justification before implementation.
- [ ] 7.3 Confirm no Streamer.bot persistence, management routes, runtime startup wiring, diagnostics tables, UI, Twitch normalizers, or action-execution APIs were added.

## 8. Verification

- [ ] 8.1 Run the focused Streamer.bot client test file.
- [ ] 8.2 Run `pnpm typecheck`.
- [ ] 8.3 Run `pnpm test`.
- [ ] 8.4 Run `pnpm lint`.
- [ ] 8.5 Run `env OPENSPEC_TELEMETRY=0 openspec validate add-streamerbot-protocol-client --strict`.
