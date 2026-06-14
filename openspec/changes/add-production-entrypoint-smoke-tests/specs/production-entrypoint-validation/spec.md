## ADDED Requirements

### Requirement: Production App Composition Is Testable
The system SHALL expose a testable production app composition path that is equivalent to the runtime startup graph while allowing temp local resources and mocked external network clients.

#### Scenario: Test creates production-equivalent app
- **WHEN** the smoke test builds the app with temporary config and database locations
- **THEN** the resulting Fastify instance registers the same local HTTP surfaces as runtime startup

### Requirement: Local Shell Routes Are Smoke Tested
The system SHALL verify that server-served management and overlay shell routes are reachable from the production app composition.

#### Scenario: Management route smoke succeeds
- **WHEN** the production app smoke test requests `/manage`
- **THEN** the response is successful HTML for the management app shell

#### Scenario: Overlay route smoke succeeds
- **WHEN** the production app smoke test requests a valid overlay route with a test key
- **THEN** the response is successful HTML for the overlay app shell

### Requirement: Runtime Wiring Regressions Are Detected
The system SHALL include smoke checks that fail when critical runtime adapters are not wired into the production composition.

#### Scenario: Durable module config wiring is checked
- **WHEN** the smoke test saves overlay module config and recreates the production app over the same temp database
- **THEN** the saved config remains available through the management API

#### Scenario: External services are not contacted
- **WHEN** the smoke suite runs in CI
- **THEN** Twitch and other external provider calls are replaced with deterministic local test doubles

### Requirement: Smoke Tests Run In Validation Gates
The system SHALL run production-entrypoint smoke validation as part of documented pre-PR validation and CI.

#### Scenario: CI executes smoke validation
- **WHEN** CI validates a pull request
- **THEN** the production-entrypoint smoke tests run and fail the job on regression
