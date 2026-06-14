## ADDED Requirements

### Requirement: Management Mutations Require CSRF Protection
The system SHALL require CSRF protection for state-changing management API requests.

#### Scenario: Missing CSRF token is rejected
- **WHEN** a state-changing management request includes valid management authorization but no valid CSRF proof
- **THEN** the request is rejected without changing state

#### Scenario: Valid management mutation succeeds
- **WHEN** the management UI sends a state-changing request with valid management authorization and CSRF proof
- **THEN** the request is accepted according to the existing route authorization rules

### Requirement: Management Origins Are Restricted
The system SHALL restrict management API browser access to known local origins derived from the configured local service and documented development origins.

#### Scenario: Unknown origin is rejected
- **WHEN** a browser request to a management endpoint presents an unapproved Origin header
- **THEN** the request is rejected or receives no permissive CORS headers

### Requirement: Overlay Routes Preserve Browser-Source Compatibility
The system SHALL apply management security controls without breaking authorized OBS/browser-source overlay routes.

#### Scenario: Authorized overlay route still works
- **WHEN** an OBS browser source requests an overlay URL with a valid overlay key
- **THEN** the overlay shell and WebSocket connection work without management CSRF credentials
