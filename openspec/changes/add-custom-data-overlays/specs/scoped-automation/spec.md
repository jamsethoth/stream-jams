## ADDED Requirements

### Requirement: Explicit data automation consent
Proof-bound pairing SHALL support data:read, data:write and data:events scopes, requiring data:read with writes/events. Write scope SHALL cover custom values with that breadth stated during approval. Event scope SHALL additionally bind explicitly approved custom source IDs; new sources SHALL require new approval. Existing grants, legacy timer credentials and overlay keys SHALL NOT acquire data privileges. Capability/state discovery SHALL expose only authorized data domains and documented limits.

#### Scenario: Existing integration requests data access
- **WHEN** an existing timer grant submits a data update or new source without explicit consent
- **THEN** the request is denied without mutation and renewed approval is required

### Requirement: Data receipts preserve existing automation guarantees
The data input extension SHALL document caller-owned durable receipts, revisions, source restrictions and retention separately from existing non-receipted timer/playback commands. Maintenance SHALL block data mutation, ticket issuance and receipt-changing operations. Revocation SHALL immediately deny HTTP writes and close bound ingress sockets. No client SHALL automatically retry uncertain existing automation commands because data receipts exist.

#### Scenario: Revoke active producer
- **WHEN** management revokes a data grant with an active WebSocket
- **THEN** the socket closes and further HTTP/ticket requests fail without changing values
