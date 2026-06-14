# Design: Add Production Entrypoint Smoke Tests

## Context

The current test pyramid has strong route and unit coverage, but production composition has already drifted: Playwright starts Vite, mocks management responses, and does not verify the Fastify-served app. This change creates a thin, maintainable smoke layer around the real server graph so integration gaps are caught early without turning every browser workflow into an end-to-end test.

## Goals / Non-Goals

**Goals:**

- Exercise the production server composition or a directly equivalent factory with temporary config/database paths.
- Verify `/manage`, valid overlay shell routes, `/health`, and representative management API routes are reachable.
- Detect accidental use of Vite source paths in server-served HTML.
- Detect runtime wiring regressions for key adapters such as overlay module config, secret store selection, diagnostics, overlays, assets, playback, and Twitch runtime status.
- Keep the tests readable and cheap enough to run in CI.

**Non-Goals:**

- Do not replace focused unit, route, or Playwright workflow tests.
- Do not perform real Twitch or Speaker.bot network calls.
- Do not require OBS or a browser source host.

## Dependency Gate

Implementation MUST NOT begin until `serve-local-web-app-shell` has landed in remote `main`. The first task must fetch `origin/main`, verify that `/manage` and overlay shell serving are present, and only then add tests against that behavior.

## Assumptions

- Server startup can be factored into a testable factory without weakening production startup behavior.
- Temporary SQLite/config directories are acceptable for production-composition tests.
- Network sockets can be avoided for most checks by using Fastify `inject()`, with Playwright reserved for one assembled-browser smoke if needed.

## Decisions

- Extract production composition into a small factory if it is not already available. The CLI entrypoint should call the factory; tests should use the same factory with injected temp paths and mock external clients.
- Prefer Fastify `inject()` for HTTP shell/API checks because it avoids port conflicts and is fast in CI.
- Add one optional browser smoke only if shell HTML requires browser execution to catch routing or asset regressions.
- Keep adapter assertions behavior-oriented where possible, such as saving module config and reading it back through a recreated service rather than checking private classes.

## Initial Implementation Plan

1. Confirm `serve-local-web-app-shell` is present in remote `main`.
2. Extract or reuse a production app composition factory with explicit dependencies and temp-path overrides.
3. Add smoke tests for health, `/manage`, overlay shells, representative API routes, static assets, and WebSocket registration.
4. Add adapter-oriented checks for durable runtime dependencies.
5. Wire the smoke suite into existing scripts/CI without duplicating slow e2e coverage.

## Risks / Trade-offs

- Composition tests can become brittle if they assert implementation class names. Mitigation: assert behavior and public routes first.
- Starting real sockets can cause flaky port conflicts. Mitigation: prefer Fastify injection and temp paths.
- Mocking too much can recreate the current blind spot. Mitigation: only mock true external services and keep the app graph real.

## Open Questions

1. Should this be part of `pnpm test`, a separate `pnpm test:smoke`, or both?
2. Is one Playwright assembled-app smoke required here, or should browser execution remain in the app-shell change?
3. Which runtime adapters should be mandatory smoke assertions before this is considered complete?
