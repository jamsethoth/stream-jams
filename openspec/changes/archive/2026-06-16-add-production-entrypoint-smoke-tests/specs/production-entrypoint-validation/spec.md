## ADDED Requirements

### Requirement: Production App Composition Is Testable
The system SHALL expose a single testable runtime app composition path used by the CLI entrypoint and by smoke tests while allowing temp local resources and mocked external network clients through explicit configuration and boundary adapters.

#### Scenario: Test creates runtime-equivalent app
- **WHEN** the smoke test builds the app with temporary config and database locations
- **THEN** the resulting Fastify instance registers the same local HTTP surfaces as runtime startup

#### Scenario: Environment differences are configuration only
- **WHEN** local, CI, production, or future non-production modes need different paths, secrets, loggers, clocks, IDs, or external provider clients
- **THEN** those differences are supplied as configuration or boundary adapters without creating separate application composition branches

### Requirement: Local Shell Routes Are Smoke Tested
The system SHALL verify that server-served management and overlay shell routes are reachable from the production app composition.

#### Scenario: Management route smoke succeeds
- **WHEN** the production app smoke test requests `/manage`
- **THEN** the response is successful HTML for the management app shell

#### Scenario: Overlay route smoke succeeds
- **WHEN** the production app smoke test requests a valid overlay route with a test key
- **THEN** the response is successful HTML for the overlay app shell

### Requirement: Runtime Wiring Regressions Are Detected
The system SHALL include Fastify-inject smoke checks that fail when the medium critical runtime adapter set is not wired into the runtime composition.

#### Scenario: Medium adapter set is checked
- **WHEN** the production-entrypoint smoke suite runs
- **THEN** it verifies health, `/manage`, module and unified overlay shells, built static assets, overlay WebSocket registration, diagnostics, playback, overlay modules, and Twitch runtime status using deterministic local doubles

#### Scenario: Durable module config wiring is checked
- **WHEN** `persist-overlay-module-config` has landed and runtime wiring uses the SQLite-backed module config repository
- **THEN** the smoke suite saves overlay module config, recreates the runtime app over the same temp database, and verifies the saved config remains available through the management API

#### Scenario: Durable module config dependency is not landed
- **WHEN** `persist-overlay-module-config` has not landed
- **THEN** the change documents a blocked follow-up task for the restart-style durable overlay module config smoke assertion rather than implementing durable module config in this slice

#### Scenario: External services are not contacted
- **WHEN** the smoke suite runs in CI
- **THEN** Twitch and other external provider calls are replaced with deterministic local test doubles

### Requirement: Smoke Tests Run In Validation Gates
The system SHALL run production-entrypoint smoke validation through `pnpm test` as part of documented pre-PR validation and CI.

#### Scenario: CI executes smoke validation
- **WHEN** CI validates a pull request
- **THEN** `pnpm test` runs the production-entrypoint smoke tests and fails the job on regression
