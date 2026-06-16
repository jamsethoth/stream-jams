# Stream Jams MVP Final Review

**Review date:** 2026-05-31

## Completion Audit

The MVP slice set is implemented in the current branch after the EventSub runtime hardening slice.

One completion-audit gap was found and fixed before this review was written: the Twitch EventSub WebSocket client, API adapter, normalizer, and ingestion service existed, but production startup did not instantiate or connect the WebSocket client. The fix is documented in `docs/superpowers/plans/2026-05-31-stream-jams-eventsub-runtime-wiring.md` and wires EventSub runtime status into startup, OAuth account changes, management status, and diagnostics.

Validation after the hardening slice:

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed: 80 files, 309 tests.
- `env LD_LIBRARY_PATH=/tmp/playwright-deps/extract/usr/lib/x86_64-linux-gnu pnpm test:e2e` passed: 8 Chromium tests.
- `pnpm build` passed.
- `git diff --check` passed.

## Improvement Opportunities

### P0: Replace the development secret store in runtime wiring - resolved

**Repo evidence:** The `replace-dev-secret-store` change moved normal development and production-style runtime startup to the OS-backed credential-store path through runtime composition. `DevSecretStore` is no longer selected by default runtime wiring and remains available only through explicit test seams.

**Why it matters:** Twitch access and refresh tokens are real secrets. OWASP's secrets-management guidance recommends storing secrets in a dedicated secrets-management system and consulting the chosen system's official implementation docs. The product plan also calls for secure secret management. The runtime now stores token material through Windows Credential Manager, macOS Keychain, or Linux Secret Service/libsecret when available, preserves token references across restart, and fails closed for Twitch operations when credential storage is unavailable.

**Sources:** OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

**Validation:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed during the `replace-dev-secret-store` implementation. Coverage includes credential adapter selection, unavailable-store failure behavior, token redaction, and restart-style token retrieval.

### P1: Persist overlay module configuration in the default runtime - resolved

**Repo evidence:** Runtime composition wires `DefaultOverlayModuleConfigService` to `SqliteOverlayModuleConfigRepository`, and the durable `overlay_module_config` table is created by the initial SQLite migration before runtime services are composed. In-memory module config storage remains limited to core/service tests and narrow route fixtures.

**Why it matters:** Module enabled state and wizard configuration are user settings. SQLite is already the MVP local persistence boundary, and SQLite documents transactional, durable behavior for committed local data. Runtime module config now survives local server restarts over the same database.

**Sources:** SQLite transactional guarantees: https://www.sqlite.org/transactional.html

**Validation:** Coverage includes repository tests, API invalid/unknown config rejection, fresh database defaults, UI canvas-config saves, and a restart-style runtime composition smoke test that saves module config, recreates services over the same temp database, and reads it back.

### P1: Add dependency update automation, not only audit reporting

**Repo evidence:** CI runs dependency review on PRs and CodeQL. `.github/workflows/dependency-audit.yml` runs `pnpm audit` weekly but is intentionally non-blocking. There is no `.github/dependabot.yml`.

**Why it matters:** Audit/reporting tells maintainers about known vulnerability or freshness issues, but it does not create routine update PRs. GitHub documents Dependabot version updates as repository `dependabot.yml` configuration that raises PRs, and Dependabot alerts as the default-branch vulnerability alerting layer.

**Sources:** Dependabot version updates: https://docs.github.com/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates
Dependabot alerts: https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts

**Suggested next step:** Add `.github/dependabot.yml` for npm/pnpm and GitHub Actions, group low-risk updates, and decide whether the non-blocking audit should become blocking after the current baseline is triaged.

### P1: Add at least one production-entrypoint integration smoke test

**Repo evidence:** Unit and route coverage is strong, and Playwright covers browser-visible management and overlay behavior. The EventSub gap happened because production composition in `apps/server/src/index.ts` was not exercised; most Playwright tests mock management API responses from the Vite web app.

**Why it matters:** Mocked browser tests are fast and useful, but they do not prove the production service graph is assembled. Fastify supports HTTP injection for server tests without a real network port, and Playwright is best reserved for browser-visible workflows. A thin server-composition smoke test would have caught "client exists but is never instantiated" earlier.

**Sources:** Fastify testing with `inject()`: https://fastify.dev/docs/latest/Guides/Testing/
Playwright CI guidance: https://playwright.dev/docs/ci

**Suggested next step:** Extract `apps/server/src/index.ts` composition into a testable factory, then add a smoke test that builds the production service graph with temp config/database and asserts key adapters are wired: SQLite module config, EventSub runtime, diagnostics, overlays, assets, and playback.

### P2: Make local Playwright dependency handling explicit for unsupported host images

**Repo evidence:** CI uses Ubuntu 24.04 and `pnpm exec playwright install --with-deps chromium`. This workstation is Ubuntu 26.04, where Playwright 1.60.0 cannot run `install-deps`; local Chromium needed NSS/NSPR libraries. `docs/mvp-runbook.md` now documents both the sudo install and non-root extracted-package workaround.

**Why it matters:** Playwright documents that browser binaries and system dependencies are version-specific and that Linux CI agents should either use the CLI dependency installer or a Playwright Docker image. Local developer environments that are newer than Playwright's supported OS matrix can still block UI validation unless the workaround is explicit.

**Sources:** Playwright browser/dependency installation: https://playwright.dev/docs/browsers
Playwright CI guidance: https://playwright.dev/docs/ci

**Suggested next step:** Keep the runbook workaround, and consider a small script such as `scripts/playwright-local-deps-check` that verifies Chromium shared libraries before running e2e tests.

### P2: Add graceful shutdown ownership before packaging

**Repo evidence:** `startServer` returns the Fastify app, and the EventSub runtime now has `disconnect()`, but `apps/server/src/index.ts` does not install signal handling or an app close hook to disconnect provider sockets and close SQLite on process shutdown.

**Why it matters:** The plain local app can tolerate simple process exits during MVP, but packaged desktop supervision should drain HTTP/WebSocket work and close provider/database resources predictably. Fastify documents a shutdown lifecycle with `preClose`/`onClose` hooks when `fastify.close()` runs.

**Sources:** Fastify lifecycle and shutdown: https://fastify.dev/docs/latest/Reference/Lifecycle/

**Suggested next step:** Add a lifecycle owner that registers Fastify `onClose` cleanup for EventSub and database resources, then add signal handling in the future Electron/service supervisor boundary.

### P2: Turn the Electron security posture into concrete acceptance tests when packaging starts

**Repo evidence:** Electron is intentionally deferred, and current browser UI code stays behind HTTP/API boundaries. The repo has stack guidance in `AGENTS.md`, but no Electron package, preload boundary, CSP, or IPC tests yet.

**Why it matters:** This is acceptable for the MVP, but Electron security decisions should be acceptance criteria before packaging rather than cleanup after packaging. Electron's security checklist emphasizes context isolation, sandboxing, restrictive navigation/window creation, and safe IPC exposure.

**Sources:** Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security

**Suggested next step:** When adding Electron, create a packaging slice that starts with security acceptance tests for context isolation, no renderer Node integration, narrow preload APIs, navigation limits, and CSP.
