# Proposal: Replace Dev Secret Store

## Why

Runtime startup currently wires `DevSecretStore({ mode: "development" })` for Twitch OAuth and EventSub token access. The product plan requires local secrets to be stored in the OS credential store where possible, and real Twitch tokens must survive restart without being written to SQLite, logs, Vite client state, or exported config.

## What Changes

- Add runtime secret-store selection for normal development and production/local-app usage that uses an OS credential adapter where available.
- Keep in-memory/fake secret stores only for explicit test injection and non-runtime test seams.
- Preserve dev/prod parity for secret storage: normal `pnpm dev` and production/local-app startup use the same durable secret-store path.
- Keep the app available when credential storage is unavailable, but fail closed for Twitch OAuth/token operations that would require durable secret storage.
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
- New dependency: `@napi-rs/keyring@1.3.0` in `@stream-jams/server`, pinned exactly with pnpm lockfile updates for native platform packages. This dependency is a Node adapter to industry-standard OS credential stores, not the secret store itself.
