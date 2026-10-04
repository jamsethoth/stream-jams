## Why

The October 3 security audit reproduced credential-bearing connection fields escaping into persistence/backups, non-local plaintext connections, pre-authentication event intake, and incomplete emergency redaction. Management HTML also lacks framing protection and a content security policy.

## What Changes

- **BREAKING**: Restrict Streamer.bot and Speaker.bot connections to canonical loopback addresses and path-only endpoints; reject embedded credentials, query strings, fragments, and remote hosts before connecting or exporting.
- **BREAKING**: Require Streamer.bot authentication unless the operator explicitly allows unauthenticated local operation. A configured password always requires authentication; events are ignored until the handshake succeeds.
- Explain supported authentication and local transport in provider setup without inventing unsupported Speaker.bot authentication.
- Redact URL credentials and capability tokens consistently across normal and emergency logging.
- Add restrictive CSP and anti-framing headers to management HTML while preserving browser-source and private-renderer behavior.
- Restore the pinned development environment and verify all five fixes with regression tests, repository gates, and a disposable live instance.

## Capabilities

### New Capabilities

- `provider-connection-security`: Local connection policy, credential-free configuration, authenticated event intake, and explicit local exceptions.

### Modified Capabilities

- `local-management-security`: Browser framing and content policy requirements.

## Impact

Core provider contracts; server provider clients, persistence views, backups, diagnostics, and HTML responses; provider setup UI and tests. No remote-provider support or production data edits. Dependency remediation and pull-request publication with hosted verification are authorized; merging and branch-protection changes are excluded. Existing non-local or credential-bearing configurations fail closed and require replacement through provider setup.

## Authorized automation follow-up

- Patch audited transitive dependencies and make moderate-or-higher dependency audit failures blocking without advisory exceptions on manifest/lockfile changes.
- Provision pinned vendor binaries in disposable Windows CI and run installed security acceptance; missing capabilities fail explicitly.
- Add a read-only Windows listener/firewall exposure report with explicit Node PID selection and unknown remote reachability. No live configuration changes.
