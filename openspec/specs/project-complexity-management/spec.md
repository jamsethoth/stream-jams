# project-complexity-management

## Purpose

Keep project-level implementation and test structure simple without changing runtime behavior.

## Requirements

### Requirement: Unsupported Wrappers Are Removed

The system SHALL NOT keep production wrapper modules that only delegate to one existing function and have no independent behavior, configuration, or boundary value.

#### Scenario: One-call registry wrapper is removed

- **WHEN** runtime composition needs the default overlay module registry
- **THEN** it imports the existing core registry factory directly instead of calling a server-side wrapper with one caller

### Requirement: Management HTTP Mechanics Are Shared

The system SHALL use one small web management HTTP helper for repeated management-session creation, CSRF headers, JSON request bodies, response parsing, and HTTP error handling across web API clients.

#### Scenario: Web clients share session and JSON request code

- **WHEN** management and alert configuration API clients make authenticated JSON requests
- **THEN** both clients use the shared helper for session, CSRF, fetch, JSON parsing, and error handling

### Requirement: Web DTO Types Reuse Core Contracts

The system SHALL reuse exported core alert and normalized event types in web alert API code wherever the web contract matches the core contract.

#### Scenario: Core alert shape drift is caught by typecheck

- **WHEN** a shared alert, variant, collection, condition, or normalized event type changes in `@stream-jams/core`
- **THEN** the web alert configuration API typecheck fails unless the web client remains compatible or documents an intentional UI-specific narrowing

### Requirement: Wizard Field Types Match Rendered Controls

Overlay module wizard field type definitions SHALL include only field kinds that are rendered correctly by the management UI or are used by a current module definition.

#### Scenario: Unsupported future field kinds are absent

- **WHEN** no current module uses `select`, `asset`, or `color` wizard fields and the management UI has no dedicated controls for them
- **THEN** those field kinds are not part of the wizard field type union or validation schema

### Requirement: Generic Test Doubles Are Shared When Repeated

The test suite SHALL place generic reusable test doubles in the existing test-support package when the same fake is duplicated across multiple test files.

#### Scenario: Secret-store fake is reused

- **WHEN** multiple server tests need an in-memory `SecretStore`
- **THEN** they import the shared test-support fake instead of carrying separate local `Map`-backed implementations

### Requirement: Simplification Preserves Runtime Behavior

The simplification SHALL NOT change public HTTP routes, WebSocket paths, overlay URLs, persisted database schema, config file shape, or visible management and overlay workflows.

#### Scenario: Existing validation remains green

- **WHEN** the simplification is implemented
- **THEN** typecheck, lint, unit tests, build, and any relevant Playwright tests pass without weakening or deleting behavior coverage
