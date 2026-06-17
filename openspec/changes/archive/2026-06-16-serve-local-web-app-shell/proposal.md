# Proposal: Serve Local Web App Shell

## Why

The product plan and MVP runbook expect Stream Jams to run as a local-first app from one Fastify origin, with the management UI at `/manage` and browser-source overlays on the same `127.0.0.1` service. The current app builds the Vite client separately and the server overlay HTML still points at `/src/main.tsx`, so the assembled local app is not the product users are expected to run.

## What Changes

- Serve the production web bundle from the Fastify server, including `/manage` and Vite asset files.
- Make overlay HTTP routes load the built overlay-capable client bundle instead of Vite source paths.
- Preserve the existing React entry behavior that chooses management or overlay mode from `window.location.pathname`.
- Keep API, management, and overlay authorization boundaries intact when static assets are served.
- Update development scripts/runbook behavior so the documented command starts a usable local app on the configured host and port.
- Add focused validation that proves the server-served management and overlay shells load without a Vite-only source URL.

## Capabilities

### New Capabilities

- `local-app-serving`: Fastify serves the management shell, overlay shell, and built web assets from the local service origin.

### Modified Capabilities

None. No repo-local base specs exist yet for this behavior.

## Impact

- Affected code: `apps/server/src/app.ts`, `apps/server/src/http/routes/overlays.ts`, server runtime wiring, root/package scripts, web build output assumptions, runbook docs, and integration tests.
- Affected systems: local development startup, local production-style startup, OBS/browser-source overlay URLs, and management UI routing.
- Dependencies: none. This change is the base dependency for later overlay URL, overlay asset, security/origin, and production-entrypoint validation work.
