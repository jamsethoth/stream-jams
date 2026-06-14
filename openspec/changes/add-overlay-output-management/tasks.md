# Tasks

## 1. Dependency Gate

- [ ] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [ ] 1.2 Confirm final module and unified overlay route URL formats from remote `main`.
- [ ] 1.3 Stop implementation if the app-shell serving contract is absent or unresolved.

## 2. Domain And API Contract

- [ ] 2.1 Define overlay output, key lifecycle, and connected-client DTOs in the appropriate shared/server boundary.
- [ ] 2.2 Add centralized path builders for module and unified overlay HTTP/WebSocket routes.
- [ ] 2.3 Decide and document whether existing hashed keys can produce copyable URLs or require regeneration.

## 3. Server Implementation

- [ ] 3.1 Add management-authenticated routes for listing overlay outputs.
- [ ] 3.2 Add management-authenticated routes for creating, regenerating, and revoking route keys.
- [ ] 3.3 Add management-authenticated routes for connected overlay client status.
- [ ] 3.4 Ensure all route-key secrets are redacted from logs, diagnostics, and non-secret API responses.

## 4. Web Implementation

- [ ] 4.1 Replace optional empty-list behavior in the overlay outputs API with real error handling for implemented endpoints.
- [ ] 4.2 Update the overlay outputs panel to create, copy, regenerate, revoke, and refresh outputs.
- [ ] 4.3 Show clear empty, loading, error, and connected-client states.

## 5. Verification

- [ ] 5.1 Add service and repository tests for key lifecycle behavior.
- [ ] 5.2 Add Fastify route tests for management auth, overlay auth separation, and key lifecycle endpoints.
- [ ] 5.3 Add UI tests for overlay output actions and copy behavior.
- [ ] 5.4 Add Playwright coverage for copying a real output URL from the management UI.
- [ ] 5.5 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and applicable e2e tests.

## 6. Handoff

- [ ] 6.1 Merge this change to remote `main` before starting `serve-overlay-safe-assets`, which depends on the final overlay output and key contract.
