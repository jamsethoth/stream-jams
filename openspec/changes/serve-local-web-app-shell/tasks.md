# Tasks

## 1. Preflight

- [x] 1.1 Fetch latest remote state and confirm this work starts from current `origin/main`.
- [x] 1.2 Confirm no prior remote-main change already serves `/manage` and built overlay assets from Fastify.
- [x] 1.3 Record the final URL contract that dependent changes must use after this lands.

## 2. Server Web Shell

- [x] 2.1 Enable Vite production manifest output for the web build.
- [x] 2.2 Add explicit `@fastify/static` asset registration scoped to the built web output directory; do not hand-roll Fastify static serving behavior.
- [x] 2.3 Add a readable server helper for serving the management shell at `/manage` from the Vite manifest-driven asset list.
- [x] 2.4 Redirect `/` to `/manage`.
- [x] 2.5 Update overlay HTTP shell rendering so it loads built client assets from the Vite manifest instead of `/src/main.tsx`.
- [x] 2.6 Ensure health, API, management-auth, overlay-auth, and WebSocket routes keep their existing behavior.

## 3. Scripts And Developer Runability

- [x] 3.1 Keep a fast Vite-based development path for UI iteration and add or document a separate production-style local runtime command served by Fastify.
- [x] 3.2 Update package scripts so the documented local runtime command works in environments where Corepack provides pnpm but a plain `pnpm` shim is absent.
- [x] 3.3 Document the fast frontend-development path separately from the production-style local app path.
- [x] 3.4 Update `docs/mvp-runbook.md` with the final startup and URL behavior.

## 4. Backend Error Correlation

- [x] 4.1 Add a root Fastify error handler that logs server-side failures with a generated error ID and request ID.
- [x] 4.2 Return safe backend error envelopes with error type, user-safe message, and error ID for HTTP failures where a response is possible.
- [x] 4.3 Add or update frontend API error handling so backend error envelopes are shown through a visible management UI notification or diagnostic.

## 5. Verification

- [x] 5.1 Add server inject coverage for `/manage` returning a built-asset shell.
- [x] 5.2 Add server inject coverage proving `/` redirects to `/manage`.
- [x] 5.3 Add server inject coverage proving overlay shells no longer reference `/src/main.tsx`.
- [x] 5.4 Add server inject coverage for static asset scoping and backend error envelopes.
- [x] 5.5 Add a production-style smoke test that starts the assembled app or composes it with temp paths and verifies management and overlay shell routes.
- [x] 5.6 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the applicable e2e smoke coverage.

## 6. Handoff

- [x] 6.1 Push and merge this change to remote `main` before starting `add-production-entrypoint-smoke-tests`, `add-overlay-output-management`, `serve-overlay-safe-assets`, or runtime security/origin work.
- [x] 6.2 Note any intentional serving limitations in the runbook and in follow-up OpenSpec tasks.
