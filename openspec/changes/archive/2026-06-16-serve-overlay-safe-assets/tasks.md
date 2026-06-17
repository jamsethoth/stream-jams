# Tasks

## 1. Dependency Gate

- [x] 1.1 Fetch latest remote state and verify `serve-local-web-app-shell` is present in `origin/main`.
- [x] 1.2 Verify `add-overlay-output-management` is present in `origin/main`.
- [x] 1.3 Confirm final overlay output URL, route-key, and connected-client contracts before choosing media URL shape.
- [x] 1.4 Confirm `/assets/` remains scoped to built Vite shell assets and does not become the media-serving surface for overlay-safe user assets.
- [x] 1.5 Stop implementation if either dependency is absent from remote `main`.

## 2. Contract Design

- [x] 2.1 Define the overlay-safe media route path and authorization inputs.
- [x] 2.2 Decide whether media authorization uses the overlay route key directly or a derived scoped media token.
- [x] 2.3 Document how missing, unauthorized, and revoked media requests respond.

## 3. Server Implementation

- [x] 3.1 Add overlay-safe media read routes using existing asset repository and asset store abstractions.
- [x] 3.2 Keep management asset routes management-authenticated.
- [x] 3.3 Add MIME type, cache header, and range/streaming decisions appropriate for local browser playback.
- [x] 3.4 Ensure route keys and storage paths are redacted from diagnostics and logs.

## 4. Overlay Client Implementation

- [x] 4.1 Update overlay route parsing or playback instruction handling so asset URLs match the server media contract.
- [x] 4.2 Update visual and audio rendering tests to assert the new URL shape.
- [x] 4.3 Add user-visible failure handling for missing media where the overlay can report playback completion or failure cleanly.

## 5. Verification

- [x] 5.1 Add Fastify route tests for valid media, invalid key, revoked key, missing asset, and wrong-scope requests.
- [x] 5.2 Add overlay React tests for image, video, audio, and missing-media behavior.
- [x] 5.3 Add Playwright coverage that imports or seeds an asset and renders it through an overlay browser-source route.
- [x] 5.4 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and applicable e2e tests.
