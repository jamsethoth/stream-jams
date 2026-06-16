# Design: Add Production Entrypoint Smoke Tests

## Context

The current test pyramid has strong route and unit coverage, but production composition has already drifted: Playwright starts Vite, mocks management responses, and does not verify the Fastify-served app. This change creates a thin, maintainable smoke layer around the real server graph so integration gaps are caught early without turning every browser workflow into an end-to-end test.

## Goals / Non-Goals

**Goals:**

- Exercise the single runtime server composition factory used by the CLI entrypoint, with temporary config/database paths in tests.
- Verify `/manage`, valid overlay shell routes, `/health`, and representative management API routes are reachable.
- Detect accidental use of Vite source paths in server-served HTML.
- Detect runtime wiring regressions for a medium adapter set: diagnostics, overlay modules, playback, overlays, static assets, WebSocket registration, and Twitch runtime status.
- Keep the tests readable and cheap enough to run in CI.

**Non-Goals:**

- Do not replace focused unit, route, or Playwright workflow tests.
- Do not add Playwright coverage in this change; defer assembled-browser smoke coverage until a later browser-visible need is identified.
- Do not perform real Twitch or Speaker.bot network calls.
- Do not require OBS or a browser source host.

## Dependency Gate

Implementation MUST NOT begin until `serve-local-web-app-shell` has landed in remote `main`. The first task must fetch `origin/main`, verify that `/manage` and overlay shell serving are present, and only then add tests against that behavior.

## Assumptions

- Server startup can be factored into a single runtime composition factory without weakening production startup behavior.
- Temporary SQLite/config directories are acceptable for production-composition tests.
- Network sockets can be avoided for smoke coverage by using Fastify `inject()` and WebSocket injection helpers.
- Durable overlay module config smoke coverage depends on `persist-overlay-module-config`; until that change lands, this slice documents the blocked follow-up rather than pulling durable config work into scope.

## Decisions

- Extract a single runtime composition factory used by the CLI entrypoint and by smoke tests. The factory must assemble the same application graph for local, CI, and future deployed or non-production modes. Differences between environments must be expressed through explicit configuration, temp resource paths, and boundary adapters for external services, not separate app composition branches.
- Allow environment differences only through inputs such as data/config paths, SQLite path, web build directory, selected secret-store adapter, external provider clients, logger settings, clocks, ID generation, and other explicit boundary adapters.
- Prefer Fastify `inject()` for HTTP shell/API checks and WebSocket injection helpers for overlay socket registration because they avoid port conflicts and are fast in CI.
- Do not add Playwright coverage in this slice. Browser execution remains deferred until a concrete served-shell regression requires it.
- Add production-entrypoint smoke coverage to `pnpm test` so it runs in the existing local and CI validation path.
- Keep adapter assertions behavior-oriented where possible, such as saving module config and reading it back through a recreated service rather than checking private classes.
- For this slice, mandatory adapter assertions are health, `/manage`, module and unified overlay shells, built static assets, overlay WebSocket registration, diagnostics, playback, overlay modules, and Twitch runtime status using deterministic local doubles.

## Initial Implementation Plan

1. Confirm `serve-local-web-app-shell` is present in remote `main`.
2. Extract or reuse the single runtime app composition factory with explicit configuration, temp-path overrides, and boundary-adapter inputs.
3. Add Fastify-inject smoke tests for health, `/manage`, overlay shells, representative API routes, static assets, and WebSocket registration.
4. Add behavior-oriented adapter checks for diagnostics, playback, overlay modules, and Twitch runtime status with local doubles.
5. Add the production-entrypoint smoke suite to `pnpm test` and CI without adding Playwright coverage.
6. Document the durable overlay module config restart check as blocked on `persist-overlay-module-config` if that dependency has not landed.

## Risks / Trade-offs

- Composition tests can become brittle if they assert implementation class names. Mitigation: assert behavior and public routes first.
- Starting real sockets can cause flaky port conflicts. Mitigation: prefer Fastify injection and temp paths.
- Mocking too much can recreate the current blind spot. Mitigation: only mock true external services and keep the app graph real.
- A factory split could accidentally create separate local/test/production code branches. Mitigation: require the CLI and smoke tests to call the same composition factory, with differences represented only as configuration and explicit boundary adapters.
- Durable module config smoke coverage may be blocked by another change. Mitigation: do not pull that scope into this slice; leave a named follow-up tied to `persist-overlay-module-config`.

## Resolved Guidance

1. Production-entrypoint smoke coverage belongs in `pnpm test`.
2. Use Fastify injection only for this change; do not add Playwright coverage yet.
3. Use the medium adapter assertion set: health, `/manage`, overlay shell/static assets/WebSocket registration, diagnostics, playback, overlay modules, and Twitch runtime status.
4. Keep one runtime composition path. Local, CI, production, and future non-production deployments differ by configuration and boundary adapters, not by separate application graphs.
5. Leave the durable overlay module config restart assertion as a documented follow-up until `persist-overlay-module-config` lands.
