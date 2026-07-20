# Stream Jams MVP Final Review

**Review date:** 2026-07-20

## Completion Audit

The closed MVP specifications are implemented in the current branch. The final audit compared the archived changes, the two active completion candidates, the approved UX decisions, and the production runtime without promoting post-MVP backlog items into closure requirements.

The final live pass found and fixed three closure defects: saving an alert with an active TTS provider left the editor falsely dirty; an active legacy overlay key used the removed `module-only` purpose; and backup validation rejected valid nullable TTS configuration. Schema migration 12 revokes unsupported legacy output keys, and the backup validator now accepts its nullable JSON columns.

Validation after the final fixes:

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed: 133 files, 878 tests.
- `pnpm build` passed.
- `pnpm build-storybook` passed.
- `pnpm test:storybook:ci` passed: 12 suites, 106 tests.
- `pnpm test:e2e` passed: 20 Chromium tests.
- Strict OpenSpec validation passed for `refactor-management-ui-ux` and `add-speakerbot-tts-provider`.
- `git diff --check` passed.

The rebuilt production service passed its health check and live verification: the Speaker.bot connection and direct voice test were confirmed; Home reported 4 of 4 setup items complete; a temporary Speaker.bot-enabled variation saved cleanly, queued to the connected Landscape output, rendered and cleared in the browser-source overlay, and was removed afterward; the editor showed its actionable larger-screen fallback at 390 px; Diagnostics showed no active problem; data-folder and retained-log maintenance actions succeeded; and Settings reported a backup-ready summary of 56 configuration records and 2 assets.

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

### P1: Add dependency update automation, not only audit reporting - resolved

**Repo evidence:** `.github/dependabot.yml` now configures weekly grouped Dependabot version updates for npm workspace dependencies and GitHub Actions. CI still runs dependency review on PRs, CodeQL, and the intentionally non-blocking weekly `pnpm audit` workflow.

**Why it matters:** Audit/reporting tells maintainers about known vulnerability or freshness issues, but it does not create routine update PRs. GitHub documents Dependabot version updates as repository `dependabot.yml` configuration that raises PRs, and the Dependabot options reference defines package ecosystems, schedules, and grouping options. Normal CI workflow permissions remain least-privilege: validation and audit workflows use `contents: read`, while CodeQL and dependency review declare only their required job-level additions.

**Sources:** Dependabot options reference: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
GitHub Actions `GITHUB_TOKEN` permissions: https://docs.github.com/en/actions/tutorials/authenticate-with-github_token

**Validation:** `.github/dependabot.yml` uses Dependabot config syntax version `2`, `package-ecosystem: "npm"` at the repository root, `package-ecosystem: "github-actions"` at the repository root, weekly schedules, and groups for production dependencies, development dependencies, and GitHub Actions. Existing workflow permission blocks were reviewed and remain read-only by default except for documented job-level security scan and dependency review needs.

### P1: Add at least one production-entrypoint integration smoke test - resolved

**Repo evidence:** `apps/server/src/runtime/runtime-composition.smoke.test.ts` exercises the same runtime composition factory used by the CLI entrypoint. It covers Fastify-served management and overlay shells, static assets, WebSocket registration, management APIs, runtime adapters, and restart-style durable configuration.

**Why it matters:** Mocked browser tests remain useful for browser workflows, while the smoke suite proves the production service graph is assembled without depending on a real network port.

**Sources:** Fastify testing with `inject()`: https://fastify.dev/docs/latest/Guides/Testing/
Playwright CI guidance: https://playwright.dev/docs/ci

**Validation:** The smoke suite runs inside the confirmed 133-file, 878-test `pnpm test` gate and is required by CI-equivalent validation.

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
