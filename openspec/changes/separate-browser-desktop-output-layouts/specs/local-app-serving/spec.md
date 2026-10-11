## MODIFIED Requirements

### Requirement: Overlay Shell Served From Overlay Routes

The system SHALL serve ordinary module browser-source overlay shells from configured Fastify routes using built client assets. Existing ordinary live module paths and exact profile-scoped authorization SHALL remain supported. Public test and unified shell routes SHALL be retired without exposing management or private desktop transports.

#### Scenario: Module overlay shell loads built assets
- **WHEN** a valid ordinary module overlay route is requested with its matching module/profile key
- **THEN** the response is HTML that loads the overlay-capable built client bundle from the local service

#### Scenario: Removed source requests a shell
- **WHEN** a former test or unified browser route is requested
- **THEN** the request does not receive an authorized overlay shell, management fallback page or redirect to ordinary output

#### Scenario: Private desktop still receives compositions
- **WHEN** the desktop host requests a private multi-module snapshot
- **THEN** public unified route removal does not remove its trusted transport or registered module eligibility
