# Tasks

## 1. Preflight

- [ ] 1.1 Fetch latest remote state and confirm this work starts from current `origin/main`.
- [ ] 1.2 Confirm no prior remote-main change already serves `/manage` and built overlay assets from Fastify.
- [ ] 1.3 Record the final URL contract that dependent changes must use after this lands.

## 2. Server Web Shell

- [ ] 2.1 Add an explicit Fastify static asset registration scoped to the built web output directory.
- [ ] 2.2 Add a readable server helper for serving the management shell at `/manage`.
- [ ] 2.3 Update overlay HTTP shell rendering so it loads built client assets instead of `/src/main.tsx`.
- [ ] 2.4 Ensure health, API, management-auth, overlay-auth, and WebSocket routes keep their existing behavior.

## 3. Scripts And Developer Runability

- [ ] 3.1 Update package scripts so the documented local startup command works in environments where Corepack provides pnpm but a plain `pnpm` shim is absent.
- [ ] 3.2 Document the fast frontend-development path separately from the production-style local app path if both are retained.
- [ ] 3.3 Update `docs/mvp-runbook.md` with the final startup and URL behavior.

## 4. Verification

- [ ] 4.1 Add server inject coverage for `/manage` returning a built-asset shell.
- [ ] 4.2 Add server inject coverage proving overlay shells no longer reference `/src/main.tsx`.
- [ ] 4.3 Add a production-style smoke test that starts the assembled app or composes it with temp paths and verifies management and overlay shell routes.
- [ ] 4.4 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the applicable e2e smoke coverage.

## 5. Handoff

- [ ] 5.1 Push and merge this change to remote `main` before starting `add-production-entrypoint-smoke-tests`, `add-overlay-output-management`, `serve-overlay-safe-assets`, or runtime security/origin work.
- [ ] 5.2 Note any intentional serving limitations in the runbook and in follow-up OpenSpec tasks.
