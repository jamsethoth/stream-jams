# Slice 13: Browser Source Overlay

**Goal:** Implement the authenticated browser-source runtime for module-specific and unified overlays, including HTTP overlay routes, WebSocket registration/delivery, React overlay rendering, lifecycle reporting, and Playwright coverage for a rendered test alert.

**Base requirements:** `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` Slice 13.

**Architecture:** Keep authorization and routing at the Fastify boundary, keep delivery filtering in a testable server gateway, and keep browser code free of Node/Fastify imports. Overlay clients receive normalized overlay compositions and playback instructions only; management sessions, source events, and provider payloads do not cross the overlay runtime boundary.

## Sub-Slice 13.1: Overlay HTTP Routes

**Objective:** Add live/test, module-specific, and unified overlay HTTP routes that use path-segment overlay keys and expose initial composition snapshots.

**Files or areas:** `apps/server/src/http/routes/overlays.ts`, `apps/server/src/app.ts`, `apps/server/src/http/routes/overlays.test.ts`.

**Implementation steps:**

- Register module routes at `/overlay/modules/:moduleId/:purpose/:overlayKey` and `/overlay/modules/:moduleId/:purpose/:overlayKey/composition`.
- Register unified routes at `/overlay/unified/:purpose/:overlayKey` and `/overlay/unified/:purpose/:overlayKey/composition`.
- Resolve route access through `createOverlayAuthPreHandler` with `overlayId: "default"`.
- Resolve module snapshots through `OverlayCompositionService.resolveModuleOutput`.
- Resolve unified snapshots through `OverlayCompositionService.resolveUnifiedOutput` using registered module IDs.
- Return an overlay shell for page routes and JSON composition for composition routes.

**Positive test cases:**

- A valid module live key returns a shell route and a module composition.
- A valid unified test key returns a shell route and a unified composition.
- Disabled modules are filtered by the composition service.

**Negative test cases:**

- Missing route key returns `OVERLAY_ROUTE_KEY_REQUIRED`.
- Live/test key mismatch returns `OVERLAY_ROUTE_KEY_UNAUTHORIZED`.
- Module/unified key mismatch returns `OVERLAY_ROUTE_KEY_UNAUTHORIZED`.

**Non-trivial assertions:**

- Overlay responses contain no management session identifiers, raw route keys, source event objects, or provider payloads.
- Composition route uses the requested purpose and scope, not client-provided query data.

**Validation commands:**

- `pnpm test -- apps/server/src/http/routes/overlays.test.ts apps/server/src/http/middleware/overlay-auth.test.ts`

**Acceptance criteria:**

- Live/test overlays are isolated.
- Module-specific and unified overlays are isolated.
- Disabled modules do not render in either output mode.

- [x] Complete.

## Sub-Slice 13.2: Overlay WebSocket Gateway

**Objective:** Add authenticated WebSocket registration, reconnect-safe client tracking, scoped playback delivery, and playback lifecycle reporting hooks.

**Files or areas:** `apps/server/src/websocket/overlay-gateway.ts`, `apps/server/src/websocket/overlay-gateway.test.ts`, `apps/server/src/http/routes/overlays.ts`, `apps/server/package.json`, `pnpm-lock.yaml`.

**Implementation steps:**

- Add Fastify WebSocket support with `@fastify/websocket`.
- Add module and unified WebSocket routes under `/overlay/ws/...` using the same path-segment key model.
- Register clients with `overlayId`, `moduleId`, `purpose`, and `scope`.
- Authorize registration through `OverlayAccessService.verifyRouteAccess`.
- Send only sanitized gateway messages: registration acknowledgements, playback instructions, and errors.
- Deliver module-scoped instructions only to matching module clients.
- Deliver unified-scoped instructions only to matching unified clients.
- Unregister clients on close so reconnects do not require a server restart.
- Parse client lifecycle messages for start, completion, and failure.

**Positive test cases:**

- A valid module client registers and receives only matching module instructions.
- A valid unified client registers and receives only matching unified instructions.
- A closed client can reconnect and receive later playback.
- Started/completed/failed client reports invoke the reporter with client and instruction identifiers.

**Negative test cases:**

- Wrong purpose, scope, module, or key denies registration.
- Management-shaped payloads are not sent to overlay clients.
- Malformed lifecycle messages are ignored or reported as client errors without crashing the gateway.

**Non-trivial assertions:**

- Delivery count reflects only authorized matching clients.
- Outbound playback messages include `instruction` and not queue snapshots, management state, or source events.

**Validation commands:**

- `pnpm test -- apps/server/src/websocket/overlay-gateway.test.ts apps/server/src/http/routes/overlays.test.ts`

**Acceptance criteria:**

- Overlay WebSocket connections are authenticated.
- Overlay can reconnect without requiring a server restart.
- Overlay does not receive management-only data.

- [x] Complete.

## Sub-Slice 13.3: React Overlay Runtime

**Objective:** Add a transparent fullscreen overlay app that fetches composition snapshots, connects to the overlay WebSocket, renders module snapshots, renders playback instruction media, and reports playback lifecycle.

**Files or areas:** `apps/web/src/main.tsx`, `apps/web/src/overlay/OverlayApp.tsx`, `apps/web/src/overlay/overlay-client.ts`, `apps/web/src/overlay/components/`, `apps/web/src/overlay/*.test.tsx`, `apps/web/src/App.css`.

**Implementation steps:**

- Route `/overlay/...` browser paths to `OverlayApp` from the existing React entrypoint.
- Parse module and unified overlay route parameters from `window.location.pathname`.
- Fetch initial composition from `.../composition`.
- Connect to `/overlay/ws/...` by converting the current HTTP origin to `ws:` or `wss:`.
- Render the transparent fullscreen root and only enabled module snapshots.
- Render image/GIF, video, text, audio, and browser-speech instruction shapes.
- Report `started`, `completed`, and `failed` lifecycle events through the overlay client.

**Positive test cases:**

- Image and GIF instructions render as image elements with placement styles.
- Video instructions render as video media with placement styles.
- Text instructions render visible overlay text with placement styles.
- Audio and browser-speech instructions render/trigger non-visual playback surfaces.
- A composition with a disabled module renders no module instructions.

**Negative test cases:**

- Invalid overlay paths render a route error state without opening a WebSocket.
- Failed composition fetch renders an overlay error state without exposing raw keys.

**Non-trivial assertions:**

- The overlay root is transparent and viewport-filling.
- Layout style uses instruction coordinates, dimensions, and z-index.
- Rendered text and lifecycle events are driven by normalized overlay instructions.

**Validation commands:**

- `pnpm test -- apps/web/src/overlay`

**Acceptance criteria:**

- Browser overlay renders image, GIF, video, text, and audio instruction shapes.
- Browser overlay reports playback start, completion, and failure to the server.

- [x] Complete.

## Sub-Slice 13.4: Playwright Overlay Flow

**Objective:** Add browser-level validation that a test overlay URL renders a test alert.

**Files or areas:** `playwright.config.ts`, `tests/e2e/overlay.spec.ts`, `package.json`, `.github/workflows/ci.yml`, `pnpm-lock.yaml`.

**Implementation steps:**

- Add Playwright Test as the repository e2e runner.
- Configure a Vite web server for Playwright.
- Mock the test overlay composition endpoint with a normalized alert instruction.
- Mock the WebSocket path or provide a browser-side WebSocket test shim.
- Assert the test overlay route renders the test alert text in the browser.
- Update `pnpm test:e2e` and CI so the e2e test runs instead of the placeholder.

**Positive test cases:**

- `/overlay/modules/alerts/test/ovl_test` renders the mocked test alert text.

**Negative test cases:**

- The rendered page does not display the raw `ovl_` key.

**Non-trivial assertions:**

- Playwright verifies real browser rendering through the Vite app route.

**Validation commands:**

- `pnpm test:e2e`

**Acceptance criteria:**

- The browser-visible overlay path has Playwright coverage.

- [x] Complete.

## Reconciliation Checklist

- [x] Add live and test overlay HTTP routes using route keys.
- [x] Add module-specific overlay HTTP routes using module-scoped route keys.
- [x] Add unified overlay HTTP routes using unified route keys.
- [x] Add authenticated overlay WebSocket connections.
- [x] Register overlay clients with overlay ID, module ID, purpose, and output scope.
- [x] Deliver playback instructions only to matching module-specific or unified overlay clients.
- [x] Render transparent fullscreen overlay root.
- [x] Render module snapshots from `OverlayCompositionService`.
- [x] Render image, GIF, video, text, and audio playback instructions.
- [x] Report playback start, completion, and failure to the server.
- [x] Unit test gateway client registration and authorization.
- [x] Component test overlay rendering for image, video, text, and audio instruction shapes.
- [x] Playwright test that a test overlay renders a test alert.
- [x] Commit with message `feat: add browser source overlay`.

## Final Validation

- [x] `pnpm lint` passed locally.
- [x] `pnpm typecheck` passed locally.
- [x] `pnpm test` passed locally: 59 files, 224 tests.
- [ ] `pnpm test:e2e` is implemented but blocked locally by missing Linux browser library `libnspr4.so` on Ubuntu 26.04 without sudo access; CI validate is pinned to Ubuntu 24.04 and runs `pnpm exec playwright install --with-deps chromium` before `pnpm test:e2e`.
- [x] `pnpm build` passed locally.
- [x] `git diff --check` passed locally.
- [x] Diff self-review completed; generated Playwright artifacts are ignored and not committed.
