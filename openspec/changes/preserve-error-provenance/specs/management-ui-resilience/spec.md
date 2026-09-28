## ADDED Requirements

### Requirement: Unexpected Management Client Failures Produce Safe References
The management application SHALL record unexpected bootstrap, React render, window error and unhandled rejection failures through an authenticated bounded diagnostic route. The visible recovery surface SHALL provide safe copy and a stable reference without exposing a stack or serialized exception.

#### Scenario: React rendering fails
- **WHEN** a management component throws during rendering or a supported lifecycle
- **THEN** the root error boundary shows an actionable recovery surface with a Diagnostics reference
- **AND** Raw logs retain the redacted structured exception

#### Scenario: Failure occurs outside React
- **WHEN** management receives a window error or unhandled promise rejection
- **THEN** the global boundary submits one authenticated diagnostic report with the same locally assigned reference

#### Scenario: Diagnostic reporting also fails
- **WHEN** the management diagnostic request cannot be delivered
- **THEN** the client writes one console fallback and does not recursively retry or replace the original failure
- **AND** the recovery surface retains the original reference

#### Scenario: Client report lacks management authorization
- **WHEN** an unauthenticated or CSRF-invalid request submits a client exception
- **THEN** the server rejects it without creating a runtime diagnostic record
