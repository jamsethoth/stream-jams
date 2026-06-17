# Design: Add Overlay Output Management

## Context

The server already has overlay route-key verification and hashed key persistence, and the UI already has an overlay outputs panel. The missing layer is the management contract that turns those pieces into a user-facing browser-source URL workflow. This change should preserve the strict separation between management authorization and overlay route authorization.

## Goals / Non-Goals

**Goals:**

- Provide management APIs for output URL listing, route-key lifecycle, and connected overlay client status.
- Generate module-specific and unified live/test URLs from the configured local origin.
- Store route-key authorization verifiers as hashes and store recoverable route keys only encrypted at rest through the runtime secret-store path.
- Return full copyable URLs to authorized management users after restart when the encrypted route secret can be recovered.
- Redact raw route keys, encrypted route-key payloads, and secret references in logs and diagnostics.
- Keep UI state honest: if no output exists, show a real empty state and available creation actions.
- Add route, service, UI, and browser-visible tests for the full lifecycle.

**Non-Goals:**

- Do not implement overlay media asset serving; that is handled by `serve-overlay-safe-assets`.
- Do not redesign module configuration.
- Do not add LAN, cloud, or public overlay URL support.
- Do not grant overlay keys access to management APIs.

## Dependency Gate

Implementation MUST NOT begin until both `serve-local-web-app-shell` and `replace-dev-secret-store` have landed in remote `main`. The first task must fetch `origin/main`, confirm the final `/manage`, module overlay, and unified overlay URL format, and confirm the finalized runtime secret-store path is available for encrypting recoverable overlay route keys.

## Assumptions

- Overlay outputs can be modeled from existing overlay access keys plus module definitions and output purpose (`live` or `test`).
- One output may have separate live and test keys, and key regeneration should invalidate only the selected purpose/output.
- Connected-client state is runtime-only and does not need SQLite persistence.
- The runtime secret-store work provides a durable local secret path that can protect recoverable overlay route keys without storing plaintext route keys in SQLite.

## Decisions

- Add explicit management route modules, likely under `/management/overlay-outputs` and `/management/overlay-clients`, instead of overloading overlay browser-source routes.
- Keep route authorization hash-based: overlay HTTP and WebSocket verification uses a protected key verifier and does not need to decrypt the recoverable route key.
- Store an encrypted-at-rest recoverable route key for each active overlay key so authorized management list endpoints can return full copyable URLs later.
- Decrypt recoverable route keys only inside management-authenticated URL listing/create/regenerate flows, and treat decryption failure as a user-visible recoverability problem that requires regeneration.
- Prefer service-level URL generation over UI-side path assembly so future host/port changes are centralized and tested.
- Keep connected-client listing behind management auth and rate limiting, with runtime-only client metadata including `id`, `scope`, `moduleId`, `purpose`, `connectedAt`, and `lastSeenAt`.
- Include `userAgent` as optional management-only runtime metadata when available, and do not include `remoteAddress` in the MVP response unless a later support need justifies it.
- Treat regeneration as output/purpose replacement: revoke every active key matching `overlayId`, `scope`, `moduleId`, and `purpose`, then create one new active key and return one new copyable URL.

## Initial Implementation Plan

1. Confirm the final app serving URL contract and runtime secret-store path from remote `main`.
2. Define core/server DTOs for overlay outputs, recoverable route-key display state, key lifecycle actions, and connected clients.
3. Add repository/service support for hash-based authorization plus encrypted-at-rest recoverable route keys.
4. Add management routes and service methods over the existing overlay access repository/gateway.
5. Update the management API and overlay outputs panel to use real lifecycle endpoints.
6. Add tests for encrypted route-key recovery, service behavior, route authorization, UI copy/regenerate/revoke flows, and e2e behavior against the real endpoints.

## Risks / Trade-offs

- Existing hash-only keys may not allow reconstructing prior plaintext URLs. Mitigation: mark legacy hash-only records as requiring regeneration, then create new keys with encrypted recoverable route-key material.
- Secret-store initialization or decryption failure can make URLs temporarily unrecoverable. Mitigation: fail closed, show non-secret recovery guidance, and support explicit regeneration.
- URL generation can drift from overlay routes. Mitigation: centralize path builders and use them in routes/tests/UI.
- Revoking or regenerating a key can interrupt live OBS sources using that output. Mitigation: make revoke/regenerate explicit, scoped to one output/purpose, and confirmed in UI.

## Handoff

- Merge this change to remote `main` before starting `serve-overlay-safe-assets`, which depends on the final overlay output and key contract.

## Open Questions

1. Should every module get default live/test outputs automatically, or should users explicitly create outputs?
