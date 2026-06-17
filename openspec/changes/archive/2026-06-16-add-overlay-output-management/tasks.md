# Tasks

## 1. Dependency Gate

- [x] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [x] 1.2 Verify `replace-dev-secret-store` is present in `origin/main`.
- [x] 1.3 Confirm final module and unified overlay route URL formats from remote `main`.
- [x] 1.4 Confirm the runtime secret-store path can protect recoverable overlay route keys.
- [x] 1.5 Stop implementation if the app-shell serving contract or durable secret-store contract is absent or unresolved.

## 2. Domain And API Contract

- [x] 2.1 Define overlay output, key lifecycle, and connected-client DTOs in the appropriate shared/server boundary, including runtime client `id`, `scope`, `moduleId`, `purpose`, `connectedAt`, `lastSeenAt`, and optional `userAgent`.
- [x] 2.2 Add centralized path builders for module and unified overlay HTTP/WebSocket routes.
- [x] 2.3 Define the encrypted-at-rest recoverable route-key record shape and its relationship to the existing key hash verifier.
- [x] 2.4 Document legacy hash-only key behavior: existing unrecoverable keys require regeneration before full URLs can be copied.

## 3. Server Implementation

- [x] 3.1 Add management-authenticated routes for listing overlay outputs.
- [x] 3.2 Add management-authenticated routes for creating, regenerating, and revoking route keys, with regeneration replacing all active keys for the selected `overlayId`/`scope`/`moduleId`/`purpose`.
- [x] 3.3 Add management-authenticated routes for connected overlay client status.
- [x] 3.4 Store key hashes for authorization and encrypted recoverable route keys for management URL display.
- [x] 3.5 Ensure raw route keys, encrypted route-key payloads, and secret references are redacted from logs, diagnostics, and non-secret API responses.

## 4. Web Implementation

- [x] 4.1 Replace optional empty-list behavior in the overlay outputs API with real error handling for implemented endpoints.
- [x] 4.2 Update the overlay outputs panel to create, copy, regenerate, revoke, and refresh outputs.
- [x] 4.3 Show clear empty, loading, error, and connected-client states.

## 5. Verification

- [x] 5.1 Add service and repository tests for key lifecycle behavior, encrypted recovery, legacy hash-only handling, decryption failure, and output/purpose-wide regeneration.
- [x] 5.2 Add Fastify route tests for management auth, overlay auth separation, encrypted URL listing, and key lifecycle endpoints.
- [x] 5.3 Add UI tests for overlay output actions, copy behavior, recoverability errors, and regenerate confirmation.
- [x] 5.4 Add Playwright coverage for copying a real recovered output URL from the management UI after a restart-style setup.
- [x] 5.5 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and applicable e2e tests.
