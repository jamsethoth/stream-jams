## ADDED Requirements

### Requirement: Management Mutations Require CSRF Protection
The system SHALL require CSRF protection for every management-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` request unless a route has an explicit, documented, test-covered exemption.

#### Scenario: Missing CSRF token is rejected
- **WHEN** a state-changing management request includes valid management authorization but no valid CSRF proof
- **THEN** the request is rejected without changing state

#### Scenario: Session-bound CSRF token is issued
- **WHEN** the management UI creates or bootstraps a management session
- **THEN** the response provides a CSRF token bound to that management session for use in the `X-Stream-Jams-CSRF` request header

#### Scenario: Valid management mutation succeeds
- **WHEN** the management UI sends a state-changing request with valid management authorization and a valid session-bound `X-Stream-Jams-CSRF` header
- **THEN** the request is accepted according to the existing route authorization rules

### Requirement: Management Origins Are Restricted
The system SHALL restrict management API browser access to the configured local app origin in production and explicit config/env development or test origins outside production.

#### Scenario: Unknown origin is rejected
- **WHEN** a browser request to a management endpoint presents an unapproved Origin header
- **THEN** the request is rejected or receives no permissive CORS headers

#### Scenario: Missing or null origin relies on management proof
- **WHEN** a management request presents no Origin header or presents a null Origin header
- **THEN** the request proceeds only if management authorization and required CSRF proof are valid, and the response does not emit permissive CORS headers

### Requirement: Overlay Routes Preserve Browser-Source Compatibility
The system SHALL apply management security controls without requiring management CSRF credentials on authorized OBS/browser-source overlay HTTP or WebSocket routes.

#### Scenario: Authorized overlay route still works
- **WHEN** an OBS browser source requests an overlay URL with a valid overlay key
- **THEN** the overlay shell and WebSocket connection work without management CSRF credentials
