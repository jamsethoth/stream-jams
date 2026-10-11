## MODIFIED Requirements

### Requirement: Authentication Failures Never Downgrade Transport Security
Pear SHALL support `auto`, `ws` and `poll` modes. Auto fallback SHALL preserve authentication. WS close 1008 and HTTP 401/403 SHALL clear live music, stop automatic reconnect/pairing loops and request explicit credential recovery. A TLS certificate the saved source does not trust, or Pear serving HTTPS where the source saved an HTTP address, SHALL likewise clear live music, stop reconnecting and request re-pairing. Pear endpoints SHALL be loopback-only with validated ports and matched HTTP/WS or HTTPS/WSS schemes; TLS certificate validation SHALL remain enabled. Credential-bearing redirects SHALL be rejected.

#### Scenario: Auto falls back on transport unavailability
- **WHEN** the WS endpoint is unavailable but authenticated REST is usable
- **THEN** auto mode continues with authenticated polling and reports the transport accurately
- **AND** WS-only mode reports failure instead of treating an HTTP-only test as success

#### Scenario: Token is revoked during operation
- **WHEN** a request returns 401/403 or a socket closes with 1008
- **THEN** live output becomes transparent and management offers explicit reconnect/pairing
- **AND** no unauthenticated retry or automatic repeated pairing prompt occurs

#### Scenario: Unsafe endpoint is supplied
- **WHEN** setup receives a non-loopback host, embedded userinfo, invalid port or a TLS certificate validation failure
- **THEN** it rejects the connection with a non-secret correction message
- **AND** it does not disable TLS verification or change the Stream Jams listen address

#### Scenario: Pear's secure connection changes after setup
- **WHEN** a saved source's HTTP address now reaches Pear serving HTTPS, or Pear presents a certificate other than the one accepted while pairing
- **THEN** live output becomes transparent, the status is auth-required and management asks the user to re-pair
- **AND** no credential is sent to the changed endpoint and reconnecting stops until the user re-pairs
- **AND** detecting HTTPS uses only a certificate-reading TLS handshake and does not disable verification for any data-bearing connection

#### Scenario: Re-pairing an existing source
- **WHEN** the user re-pairs a registered source and its connection test passes
- **THEN** the save action is labelled "Save new authorization" and the passing-test message names it
