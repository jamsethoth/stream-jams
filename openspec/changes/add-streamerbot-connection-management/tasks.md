## 1. Persistence Model And Repository

- [ ] 1.1 Add `004-streamerbot-connections` migration using the existing `node:sqlite` migration style, with a one-row connection configuration table and no plaintext password columns.
- [ ] 1.2 Register the migration in the existing migration list in `apps/server/src/modules/db/database.ts`.
- [ ] 1.3 Add Streamer.bot connection repository types for stored config, redacted config, status metadata, warning opt-ins, and subscription selections.
- [ ] 1.4 Add repository tests using `createInMemoryStreamJamsDatabase()` for default local config, save/read, selected subscription round-trip, status metadata round-trip, and no secret-value columns.
- [ ] 1.5 Implement the SQLite Streamer.bot connection repository with the existing `DatabaseSync` repository pattern and JSON validation for subscriptions and password secret refs.

## 2. Security Policy And Secret Handling

- [ ] 2.1 Add tests for loopback host validation covering `localhost`, IPv4 `127.0.0.0/8`, `127.0.0.1`, `::1`, bracketed IPv6 loopback, LAN IPs, public IPs, and non-local hostnames.
- [ ] 2.2 Add tests for security policy combinations: authenticated `ws`, authenticated `wss`, unauthenticated `ws`, unauthenticated `wss`, missing opt-ins, and rejected non-local settings.
- [ ] 2.3 Implement Streamer.bot connection normalization, local-only host validation, warning/error code generation, and endpoint URL validation helpers.
- [ ] 2.4 Add tests for password update semantics: omitted keeps existing secret, non-empty string writes through `SecretStore`, `null` deletes the secret, and empty strings are rejected.
- [ ] 2.5 Implement `createStreamerBotPasswordSecretRef()` and secret-store orchestration without returning secret refs from public responses.

## 3. Management Service And One-Shot Probe

- [ ] 3.1 Define a `StreamerBotConnectionProbe` interface for one-shot test and event discovery operations.
- [ ] 3.2 Add management-service tests for reading default redacted config and updating valid persisted config.
- [ ] 3.3 Add management-service tests proving invalid policy requests do not call repository writes, secret writes, or probe calls.
- [ ] 3.4 Add management-service tests for successful and failed test-connection outcomes, safe persisted status metadata, and secret redaction.
- [ ] 3.5 Add management-service tests for event discovery preserving category key casing and not persisting discovered events as subscriptions.
- [ ] 3.6 Add management-service tests for enable and disable persisting desired state without starting or stopping a long-lived runtime socket.
- [ ] 3.7 Add management-service tests for subscription save validation, exact casing preservation, and rejected invalid selections leaving previous selections unchanged.
- [ ] 3.8 Implement the Streamer.bot connection management service against the repository, `SecretStore`, validator, and one-shot probe.

## 4. Management Routes And App Wiring

- [ ] 4.1 Add route tests for `GET /streamerbot/connection`, `PUT /streamerbot/connection`, `POST /streamerbot/connection/test`, `POST /streamerbot/connection/enable`, `POST /streamerbot/connection/disable`, `POST /streamerbot/connection/discover-events`, and `PUT /streamerbot/connection/subscriptions`.
- [ ] 4.2 Add route tests proving management auth and local rate limit hooks run before repository, secret-store, service, or probe work.
- [ ] 4.3 Add route tests proving validation/probe failures map to stable safe HTTP errors without password values, authentication hashes, raw protocol payloads, or secret refs.
- [ ] 4.4 Implement Streamer.bot connection Fastify routes with existing management auth/rate-limit pre-handlers.
- [ ] 4.5 Wire optional Streamer.bot route dependencies through `createServerApp()` without requiring them for unrelated server tests.

## 5. Scope Guardrails

- [ ] 5.1 Confirm no browser management UI, web API client methods, or Playwright UI flows were added in this slice.
- [ ] 5.2 Confirm no long-lived Streamer.bot runtime startup, app-start connect behavior, external-event diagnostics table, or alert pipeline integration was added.
- [ ] 5.3 Confirm no Streamer.bot action-execution APIs, chat send APIs, code trigger APIs, command/trigger/global mutation APIs, LAN/remote support, new persistence technology, or new package dependencies were added.

## 6. Verification

- [ ] 6.1 Run focused Streamer.bot connection repository, validator, service, and route tests.
- [ ] 6.2 Run `pnpm typecheck`.
- [ ] 6.3 Run `pnpm test`.
- [ ] 6.4 Run `pnpm lint`.
- [ ] 6.5 Run `env OPENSPEC_TELEMETRY=0 openspec validate add-streamerbot-connection-management --strict`.
