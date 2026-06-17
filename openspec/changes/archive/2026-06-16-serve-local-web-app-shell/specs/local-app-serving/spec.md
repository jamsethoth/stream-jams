## ADDED Requirements

### Requirement: Management UI Served From Local Service
The system SHALL serve the management UI from the configured Fastify origin at `/manage` without requiring a separate Vite development server.

#### Scenario: Management shell loads from Fastify
- **WHEN** the local service is running on `127.0.0.1:39187` and a browser requests `/manage`
- **THEN** the response is an HTML management shell that references server-served built assets and does not reference `/src/main.tsx`

#### Scenario: Management API calls use same origin
- **WHEN** the management shell is loaded from `/manage`
- **THEN** client API calls resolve against the same local origin as the page unless explicitly configured otherwise

#### Scenario: Root redirects to management shell
- **WHEN** a browser requests `/` from the local service
- **THEN** the service redirects the browser to `/manage`

### Requirement: Overlay Shell Served From Overlay Routes
The system SHALL serve browser-source overlay shells from the configured Fastify overlay routes using built client assets.

#### Scenario: Module overlay shell loads built assets
- **WHEN** a valid module overlay route is requested with a live or test overlay key
- **THEN** the response is HTML that loads the overlay-capable built client bundle from the local service

#### Scenario: Unified overlay shell loads built assets
- **WHEN** a valid unified overlay route is requested with a live or test overlay key
- **THEN** the response is HTML that loads the overlay-capable built client bundle from the local service

### Requirement: Static Asset Serving Is Scoped
The system SHALL serve only the intended built web assets and SHALL NOT expose source files or unrelated repository files through the static web route.

#### Scenario: Source file is not served as a web asset
- **WHEN** a browser requests a Vite source path such as `/src/main.tsx` from the Fastify service
- **THEN** the service does not serve the source file as part of the production web surface

### Requirement: Backend Error Responses Are Correlatable And Safe
The system SHALL log server-side failures with backend detail and a unique error ID, and SHALL expose only safe, correlatable error data to frontend callers.

#### Scenario: API server error includes safe correlation data
- **WHEN** a management API request fails because of a server-side error
- **THEN** the backend logs the detailed failure with an error ID and request ID
- **AND** the HTTP response includes a safe error type, user-safe message, and the same error ID
- **AND** the response does not include stack traces, filesystem paths, secrets, or raw internal exception detail

#### Scenario: Frontend surfaces backend error envelope
- **WHEN** the management UI receives a backend error envelope from an API request
- **THEN** the UI displays a visible error notification or diagnostic that includes the safe error type and error ID

### Requirement: Documented Local Startup Is Usable
The system SHALL provide a documented local startup command that launches a usable management UI and overlay shell on the configured local host and port.

#### Scenario: Documented startup command works
- **WHEN** a developer follows the runbook startup command on a supported local environment
- **THEN** `/manage`, overlay shell routes, HTTP APIs, and overlay WebSocket endpoints are reachable from the same local service origin
