## MODIFIED Requirements

### Requirement: Runtime Wiring Regressions Are Detected

The system SHALL include Fastify-inject smoke checks that fail when the medium critical runtime adapter set is not wired into the runtime composition.

#### Scenario: Medium adapter set is checked

- **WHEN** the production-entrypoint smoke suite runs
- **THEN** it verifies health, `/manage`, ordinary module overlay shells, rejection of retired test/unified routes, private desktop compositions, built static assets, overlay WebSocket registration, diagnostics, playback, overlay modules, and Twitch runtime status using deterministic local doubles

#### Scenario: Durable module config wiring is checked

- **WHEN** `persist-overlay-module-config` has landed and runtime wiring uses the SQLite-backed module config repository
- **THEN** the smoke suite saves overlay module config, recreates the runtime app over the same temp database, and verifies the saved config remains available through the management API

#### Scenario: Durable module config dependency is not landed

- **WHEN** `persist-overlay-module-config` has not landed
- **THEN** the change documents a blocked follow-up task for the restart-style durable overlay module config smoke assertion rather than implementing durable module config in this slice

#### Scenario: External services are not contacted

- **WHEN** the smoke suite runs in CI
- **THEN** Twitch and other external provider calls are replaced with deterministic local test doubles
