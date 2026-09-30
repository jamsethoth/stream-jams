# production-entrypoint-validation

## Purpose

Define production-entrypoint smoke validation for the local Stream Jams runtime so the CLI startup graph, Fastify-served shells, runtime adapters, and validation gates stay aligned.

## Requirements

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

### Requirement: Packaged Windows Entry Point Is Validated
The validation workflow SHALL exercise the actual packaged Windows application in addition to existing CLI/runtime tests and SHALL detect dependencies or paths that accidentally rely on the source checkout.

#### Scenario: Packaged smoke runs with an isolated profile
- **WHEN** Windows desktop validation launches the packaged executable with an isolated temporary profile outside the checkout
- **THEN** it verifies health, built management assets, SQLite persistence, packaged native keyring availability, and ordinary owned-process shutdown
- **AND** it does not access or replace the operator's live profile

#### Scenario: Package is incomplete
- **WHEN** a production workspace dependency, web asset, or required native binary is missing from the packaged layout
- **THEN** desktop validation fails rather than passing based only on development startup

#### Scenario: Interactive lifecycle is accepted
- **WHEN** the desktop change is accepted for delivery
- **THEN** Windows evidence covers tray hide/reopen, default and disabled close behavior, duplicate launch, port conflict, and no owned listener after Quit

### Requirement: Desktop Lifecycle Validation Is Isolated And Observable

Desktop lifecycle validation SHALL isolate healthy-renderer quit decisions from renderer-loss fault injection, synchronize requests with actual quit-guard readiness, and preserve primary and cleanup failures with bounded shutdown evidence.

#### Scenario: Healthy renderer cancels then discards
- **WHEN** an isolated packaged application has unsaved settings and its real quit guard is registered
- **THEN** Cancel keeps the service alive without beginning cleanup
- **AND** a subsequent Discard produces the expected shutdown phases, exit code zero, no captured live processes, and no owned listener within the existing deadline
- **AND** no renderer-loss event is injected into this healthy scenario

#### Scenario: Guard registration is delayed
- **WHEN** the settings edit has occurred but its quit-guard registration has not reached the main process
- **THEN** validation waits for the actual registration before requesting Quit
- **AND** it neither manufactures ready IPC nor relies on a fixed delay

#### Scenario: Renderer crashes
- **WHEN** the dedicated packaged renderer-loss scenario crashes management
- **THEN** native confirmation is required before shutdown
- **AND** the runtime diagnostic includes an error reference, crash reason, and numeric exit code

#### Scenario: Test and cleanup both fail
- **WHEN** desktop validation fails and its ordinary cleanup also fails
- **THEN** the primary error remains visible alongside the cleanup error
- **AND** available bounded shutdown phase evidence is retained under the uploaded test-results directory even when cleanup throws
- **AND** an unexpected native confirmation cannot count as a successful healthy-renderer quit test

#### Scenario: Neutral MP4 fixture metadata matches decoded duration
- **WHEN** desktop validation imports the neutral MP4 soundtrack fixture
- **THEN** its media-header durations use track timescale units and metadata reports the full 9941 ms duration
- **AND** fixture repair preserves encoded media samples and existing silent decoder assertions
