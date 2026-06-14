# Design: Serve Local Web App Shell

## Context

Stream Jams is intended to be a local Node/Fastify service that serves the management UI, overlay UI, HTTP APIs, static assets, and WebSocket endpoints from `127.0.0.1` by default. Today the root dev script starts Fastify and Vite side by side, Playwright runs only the Vite app, and server-rendered overlay HTML references `/src/main.tsx`, which is a Vite development path rather than a server-served production asset.

## Goals / Non-Goals

**Goals:**

- Make `http://127.0.0.1:39187/manage` the management UI entrypoint when running the local service.
- Make module-specific and unified overlay HTTP routes load the same built client bundle without requiring a separate Vite server.
- Keep client code browser-only and preserve the existing React management/overlay routing split.
- Keep Fastify route handlers readable by separating static-shell serving from domain route registration.
- Add validation that fails if server HTML references Vite source paths or if `/manage` is missing.

**Non-Goals:**

- Do not add Electron packaging.
- Do not add LAN/remote serving.
- Do not redesign the management UI or overlay UI.
- Do not implement overlay URL lifecycle management; that is handled by `add-overlay-output-management`.

## Dependency Gate

There is no upstream feature dependency. Implementation MUST start from the latest `origin/main`, confirm the serving gap still exists, and land in remote `main` before dependent changes start implementation.

## Assumptions

- The web app remains a single Vite build whose entrypoint can render either management or overlay mode based on the request path.
- Fastify can serve built assets from `apps/web/dist` or a copied package artifact without introducing a new frontend framework.
- Local development may use Vite middleware/proxy or a build-watch path, but production-style startup must not require the Vite dev server.

## Decisions

- Use Fastify static serving for built Vite files and a small shell route for `/manage` and overlay HTML. This keeps the server responsible for the local app surface while leaving React/Vite responsible for the client bundle.
- Keep API routes unprefixed for now because existing frontend code calls paths such as `/playback` and `/twitch/auth/status`. Introducing `/api` is a separate migration.
- Prefer a server helper such as `registerWebShellRoutes` over embedding static-file details in `buildStreamJamsApp`, so the app composition remains readable.
- Replace the hardcoded overlay `/src/main.tsx` script with a shell generated from the Vite manifest or a stable copied `index.html`, so production assets use hashed filenames correctly.

## Initial Implementation Plan

1. Fetch latest `origin/main` and verify this change is not already present.
2. Add server-side static asset support and a small web-shell registration module.
3. Update overlay routes to return production-compatible shell HTML.
4. Adjust scripts so the documented local command starts a usable app in this Windows/Corepack environment.
5. Add server inject tests for `/manage` and overlay shell HTML, plus a browser-visible smoke test if the test environment supports it.
6. Update runbook instructions and any stale final-review notes.

## Risks / Trade-offs

- Vite manifest parsing can make server startup depend on build output shape. Mitigation: isolate manifest lookup behind a small tested helper and fail with a clear message when the web bundle is absent.
- Development ergonomics may regress if every UI change requires a rebuild. Mitigation: keep a documented dev path that preserves fast frontend iteration while also supporting the production-style local app.
- Serving static files from the same origin can accidentally expose internal files if the root is wrong. Mitigation: serve only the explicit built output directory and test traversal-resistant behavior.

## Open Questions

1. Should `pnpm dev` run a production-style built web bundle by default, or should it keep Vite for hot reload and add a separate `pnpm dev:local` production-style command?
2. Should `/` redirect to `/manage`, return health metadata, or stay unhandled?
3. Should missing web build output fail server startup, return a clear `/manage` 503, or be tolerated only in API-only test mode?
