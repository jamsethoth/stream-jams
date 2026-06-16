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
- Local development keeps a Vite-based hot-reload path for fast UI iteration, but the documented local runtime path uses the production Vite build served by Fastify and must not require the Vite dev server.

## Decisions

- Keep the industry-standard split between development and runtime: a fast Vite development command may remain for UI iteration, while a separate documented local runtime command starts the production-style Fastify-served app that users and browser-source overlays should run.
- Redirect `/` to `/manage` so the root route has one clear local-app entrypoint.
- Use `@fastify/static` for built Vite files and a small shell route for `/manage` and overlay HTML. Do not hand-roll Fastify-related static file serving, path traversal protection, content-type handling, or sendfile behavior without an explicit design update and maintainer approval.
- Keep API routes unprefixed for now because existing frontend code calls paths such as `/playback` and `/twitch/auth/status`. Introducing `/api` is a separate migration.
- Prefer a server helper such as `registerWebShellRoutes` over embedding static-file details in `buildStreamJamsApp`, so the app composition remains readable.
- Replace the hardcoded overlay `/src/main.tsx` script with a shell generated from the Vite manifest. The server reads the manifest produced by the Vite production build and renders the script, stylesheet, and preload tags needed for the built entry, so production assets use hashed filenames correctly while management and overlay routes can keep route-specific shell metadata and body styling.
- Use a root Fastify error handler for server-side errors that logs full backend detail with a server-generated error ID and request ID, then returns a safe error envelope to HTTP callers. Frontend API clients should surface that envelope through the management UI's error presentation, such as a toast or equivalent visible diagnostic that includes the error type and unique ID. Detailed stack traces, filesystem paths, secrets, and internal implementation data stay in backend logs only.

## Initial Implementation Plan

1. Fetch latest `origin/main` and verify this change is not already present.
2. Enable Vite manifest output for the web build.
3. Add server-side static asset support through `@fastify/static` and a small web-shell registration module.
4. Update `/manage`, `/`, and overlay routes to return production-compatible shell behavior.
5. Add the root error envelope/logging path and frontend-visible handling for backend error envelopes.
6. Adjust scripts so the documented local runtime command starts a usable app in this Windows/Corepack environment while retaining a fast frontend-development path.
7. Add server inject tests for `/manage`, `/`, overlay shell HTML, static-asset scoping, and error envelopes, plus a browser-visible smoke test if the test environment supports it.
8. Update runbook instructions and any stale final-review notes.

## Risks / Trade-offs

- Vite manifest parsing can make server startup depend on build output shape. Mitigation: isolate manifest lookup behind a small tested helper and fail with a clear message when the web bundle is absent.
- Development ergonomics may regress if every UI change requires a rebuild. Mitigation: keep a documented dev path that preserves fast frontend iteration while also supporting the production-style local app.
- Serving static files from the same origin can accidentally expose internal files if the root is wrong. Mitigation: serve only the explicit built output directory and test traversal-resistant behavior.
- Error envelopes can accidentally expose implementation detail if they reuse raw exception messages. Mitigation: map server-side failures to safe error types and user-safe messages, while logging full detail only in backend logs with the matching error ID.

## Open Questions

None.
