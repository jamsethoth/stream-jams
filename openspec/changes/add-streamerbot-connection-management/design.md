## Context

Slice 1 added Streamer.bot event-source identity, external event contracts, and the `streamerbot` secret namespace. Slice 2 added a runtime-only passive Streamer.bot protocol client. Stream Jams still needs a durable, management-protected configuration boundary before runtime wiring, diagnostics intake, browser UI, or normalizers can depend on Streamer.bot.

Current server patterns already provide the pieces this slice should reuse:

- SQLite is already part of the project through Node `node:sqlite`; migrations are registered in `apps/server/src/modules/db/database.ts`.
- Repository tests use the existing in-memory SQLite harness through `createInMemoryStreamJamsDatabase()`.
- Secret values flow through `SecretStore`; routes and persistence never return secret values.
- Management routes are guarded by the existing management rate-limit and auth pre-handlers.
- Twitch EventSub runtime wiring remains the pattern for long-lived startup behavior, but long-lived Streamer.bot runtime is deferred to Slice 4.

## Goals / Non-Goals

**Goals:**

- Persist one local Streamer.bot connection profile using the existing SQLite integration.
- Store only non-secret settings in the existing SQLite database.
- Store password values only through `SecretStore`, using the `streamerbot` namespace.
- Enforce the first-wave local-only security policy before any protocol call can use persisted settings.
- Expose management-protected routes to read/update configuration, test connection, enable, disable, discover events, and save selected subscriptions.
- Return warning codes and safe status metadata without returning passwords, authentication hashes, raw protocol payloads, or secret refs.
- Use an injected one-shot connection probe for test and discovery behavior so route and service tests stay deterministic.

**Non-Goals:**

- No browser management UI.
- No long-lived Streamer.bot runtime startup or app-start wiring.
- No external-event diagnostics table or raw payload persistence.
- No Streamer.bot Twitch normalizers or alert playback.
- No LAN/remote support.
- No action-execution APIs such as `DoAction`, `SendMessage`, code triggers, command mutation, trigger mutation, or global mutation.
- No production secret-store backend change beyond using the existing `SecretStore` interface.
- No new persistence technology, ORM, database library, config-store replacement, or package dependency.

## Decisions

### Decision: Reuse the existing SQLite integration pattern

Slice 3 should add a normal Stream Jams SQLite migration and repository, not a new persistence integration. The migration should follow the existing numbered migration files, be registered in the existing migration array, and be exercised through `createInMemoryStreamJamsDatabase()` in tests. The repository should accept the existing `DatabaseSync` connection, matching the `SqliteTwitchAccountRepository` style.

Alternative considered: introduce a separate config file, ORM, or database adapter for Streamer.bot. That would split persistence rules and testing patterns for no benefit; the app already has a working SQLite boundary.

### Decision: Store one local connection profile

Add a `streamerbot_connections` table with a single profile row. The row should use a stable ID such as `default` and contain:

- `enabled` boolean;
- `protocol` as `ws` or `wss`;
- `host`;
- `port`;
- `endpoint`;
- `password_secret_ref_json` nullable text;
- `allow_insecure_local_connection` boolean;
- `allow_unauthenticated_local_connection` boolean;
- `subscriptions_json`;
- test/discovery status metadata such as `last_tested_at`, `last_successful_test_at`, `last_error_at`, and `last_error_message`;
- `created_at` and `updated_at`.

Alternative considered: store multiple profiles now. The umbrella only needs one active local connection, and multi-profile support would add UI/API complexity without unlocking the first-wave runtime path.

### Decision: Keep runtime status out of durable config

Persist coarse metadata from management actions, but do not persist high-churn socket state such as `connecting`, `connected`, reconnect attempts, or last socket message timestamps. Slice 4 runtime and diagnostics snapshots own long-lived status.

Alternative considered: store all status in the connection row. That would blur configuration with runtime telemetry and create stale status after server restarts.

### Decision: Use explicit password update semantics

The update API should treat password input as follows:

- password omitted: keep the existing secret ref unchanged;
- password non-empty string: write the value through `SecretStore` and persist the stable secret ref;
- password `null`: delete the stored secret and clear the persisted secret ref;
- empty or whitespace password string: reject.

Responses return `hasPassword` but never the password or secret ref. Use a helper such as `createStreamerBotPasswordSecretRef()` with `namespace: "streamerbot"`, `accountId: "local"`, and `name: "websocket-password"`.

Alternative considered: require password updates through a separate endpoint. A single update route is simpler for the later UI, provided the omitted/null/string semantics are explicit and tested.

### Decision: Enforce local-only policy in a service validator

Centralize policy validation in a server module, not route handlers. The validator should normalize connection input, build the protocol URL using the Slice 2 URL rules, and return warning codes plus validation errors.

First-wave policy:

- Accept loopback hosts that can be proven locally without DNS lookup: `localhost`, `127.0.0.1`, IPv4 `127.0.0.0/8`, `::1`, and bracketed loopback forms accepted by URL parsing.
- Reject non-local hosts such as LAN IPs, public IPs, and hostnames that are not exactly `localhost`.
- Reject credential-bearing `ws://` unless `allowInsecureLocalConnection` is true.
- Reject unauthenticated mode unless `allowUnauthenticatedLocalConnection` is true.
- Reject unauthenticated `ws://` unless both unauthenticated and insecure-local opt-ins are true.
- Allow `wss://` for loopback hosts without the insecure-local opt-in.

Alternative considered: resolve hostnames to determine loopback. That can block, depend on network state, or turn validation into an SSRF-sensitive resolver. First-wave validation should only accept syntactically local values.

### Decision: Make enable/disable persisted-state actions

Slice 3 should provide enable and disable routes, but these actions only update persisted `enabled` state. They must not start or stop a long-lived socket. Enabling validates the stored configuration and secret policy. Slice 4 will interpret the persisted enabled flag when wiring runtime startup and config changes.

Alternative considered: implement connect/disconnect runtime behavior now. That would pull runtime lifecycle, diagnostics status, and event intake into Slice 3 and make the slice too wide.

### Decision: Use a one-shot connection probe abstraction

Management test and discovery routes should depend on an interface shaped around outcomes:

- `testConnection(input)` returns safe instance info/status from a one-shot connection;
- `discoverEvents(input)` returns the Streamer.bot event map.

The production probe can adapt `StreamerBotClient` and disconnect after the operation. Tests can inject a fake probe without depending on WebSocket timing or real Streamer.bot.

Alternative considered: route directly against `StreamerBotClient`. The current client intentionally exposes runtime methods, not a connect-and-await helper. A probe abstraction keeps route/service behavior deterministic and leaves protocol timing details behind one boundary.

### Decision: Keep selected subscriptions separate from discovery

The update-subscriptions route persists `StreamerBotSubscriptionSelection[]` using the category keys supplied by the caller. It validates shape and non-empty values, but it does not require the selected category keys to be present in the most recent `GetEvents` result. Streamer.bot category casing and plugin availability can change between discovery and save.

Alternative considered: require discovered-event membership for every subscription. That would add stale-cache semantics before the UI and diagnostics slices exist.

## Risks / Trade-offs

- Misclassifying hosts could allow non-local access -> use an allowlist of syntactically local hosts and tests for IPv4, IPv6, bracketed IPv6, LAN, public, and arbitrary hostnames.
- Later UI may want to test unsaved settings -> this slice can start with persisted-config test/discovery; a later UI slice can add preview/test-with-overrides if needed.
- Secret deletion can leave stale refs if store deletion fails -> perform secret-store operations before updating SQLite and surface safe errors.
- One-shot probe failures could leak low-level protocol messages -> map probe errors to safe management error codes and store only safe status messages.
- Persisting enabled without runtime can confuse callers -> route responses must make clear that Slice 3 stores desired state; runtime connection state remains unavailable until Slice 4.

## Migration Plan

Add a new migration after `003-twitch-accounts`, likely `004-streamerbot-connections`, and register it in the existing migration list in `database.ts`. The migration creates the single-row connection table in the existing Stream Jams SQLite database without changing existing data or adding another persistence mechanism.

Rollback is dropping the new table, removing the Streamer.bot connection repository/service/routes, and deleting any `streamerbot:local:websocket-password` secret if one was created during local testing. Since no runtime depends on the table until Slice 4, rollback has no event-processing side effects.

## Open Questions

None. Route names, migration ID, profile ID, warning codes, and password update semantics are intentionally fixed in this design for implementation.
