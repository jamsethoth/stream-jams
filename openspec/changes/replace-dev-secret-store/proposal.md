# Proposal: Replace Dev Secret Store

## Why

Runtime startup currently wires `DevSecretStore({ mode: "development" })` for Twitch OAuth and EventSub token access. The product plan requires local secrets to be stored in the OS credential store where possible, and real Twitch tokens must survive restart without being written to SQLite, logs, Vite client state, or exported config.

## What Changes

- Add production runtime secret-store selection that uses an OS credential adapter where available.
- Keep `DevSecretStore` only for explicit development/test modes.
- Fail closed when real Twitch OAuth is enabled without a durable secret store.
- Add restart-style tests proving OAuth token references persist while secret material remains outside SQLite.
- Redact secret references and route-sensitive values from diagnostics/logs.
- Document platform behavior for Windows, macOS, and Linux local execution.

## Capabilities

### New Capabilities

- `runtime-secret-storage`: Runtime secrets are stored durably and securely through platform credential storage or explicit safe failure modes.

### Modified Capabilities

None. No repo-local base specs exist yet for this behavior.

## Impact

- Affected code: server runtime composition, secret-store adapters, Twitch OAuth/EventSub services, diagnostics redaction, config/runbook docs, and integration tests.
- Dependencies: implementation MUST wait until `serve-local-web-app-shell` is merged and present in remote `main` because both changes touch runtime composition and startup behavior.
