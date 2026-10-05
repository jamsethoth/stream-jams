## ADDED Requirements

### Requirement: Private Desktop Media Uses Scoped Streaming References
Desktop transient visuals and persistent module media SHALL use validated versioned references instead of whole-file IPC bytes. The owned host SHALL resolve those references through session-local private protocol handlers and the trusted loopback media service. Renderers SHALL receive no filesystem paths or management credentials. Handlers SHALL accept only GET/HEAD for issued recipient/generation handles, reject redirects and arbitrary destinations, preserve range response semantics, and stream response bodies without accumulating them.

#### Scenario: Large transparent desktop video prepares
- **WHEN** an eligible transparent video within import limits is sent to the desktop surface
- **THEN** validated IPC SHALL carry its reference rather than media bytes
- **AND** the private renderer SHALL prepare and display its original transparent media using the existing timing contract

#### Scenario: Timer icon is updated
- **WHEN** a persistent timer presentation moves to a new media revision
- **THEN** the new revision SHALL acquire ownership before old ownership is released
- **AND** an unavailable icon SHALL retain the existing safe missing-icon behavior

#### Scenario: Renderer invents a media URL
- **WHEN** a renderer requests an unknown handle, another recipient's handle, or a stale generation
- **THEN** its protocol handler SHALL reject the request without accessing arbitrary media or management state

#### Scenario: Renderer or service is lost
- **WHEN** renderer destruction, service loss, or ownership lease expiry occurs
- **THEN** the host SHALL cancel active media responses and revoke affected handles
- **AND** its existing transparent-failure, stop, and future-only recovery behavior SHALL remain authoritative

#### Scenario: Packaged contracts do not match
- **WHEN** host, server, or renderer uses an incompatible private media protocol version
- **THEN** desktop playback SHALL fail with an explicit capability diagnostic instead of accepting bulk legacy payloads or opening a broader access path
