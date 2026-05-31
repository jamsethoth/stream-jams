# Slice 21: MVP Hardening And End-To-End Verification

**Goal:** Harden the completed MVP flows with Playwright coverage and a concise runbook for local operation.

**Base requirements:** `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` Slice 21.

## Scope

In scope:

- Add Playwright coverage for management alert configuration, overlay playback routing, overlay security boundaries, and settings persistence/error handling.
- Add minimal management UI affordances and HTTP client methods needed to create alert collections/rules from the browser.
- Harden overlay playback handling so browser clients ignore playback instructions that do not match their route scope, purpose, overlay, or module.
- Add an MVP runbook covering startup, port changes, overlay URLs, Twitch connection, and diagnostics export.

Out of scope:

- Replacing the existing mocked Playwright architecture with a full backend-driven e2e harness. The current e2e suite runs against Vite with network/WebSocket mocks; this slice broadens those browser-visible contracts.
- Committing host-level Playwright system dependency changes. On this Ubuntu 26.04 workstation, local e2e verification used a temporary extracted NSS/NSPR library path because sudo package installation requires an interactive password.
- Adding a complete visual alert rule editor. The creation UI stays intentionally minimal for MVP hardening.

## Sub-Slice 21.1: Management Alert Creation Flow

**Objective:** Extend the alert management client/UI enough to create a collection and a rule with a default variant from the browser, then cover that with Playwright.

- [x] Complete. Added alert creation client methods, minimal collection/rule forms, unit tests, and `tests/e2e/management-alerts.spec.ts`.

## Sub-Slice 21.2: Overlay Playback And Security E2E

**Objective:** Add Playwright tests for live/module/unified playback, disabled module exclusion, test overlay isolation from live events, and revoked-key failure behavior.

- [x] Complete. Added overlay playback/security specs and browser-side playback route filtering.

## Sub-Slice 21.3: Settings E2E And Runbook

**Objective:** Add Playwright coverage for port persistence and invalid-port rejection, then add `docs/mvp-runbook.md`.

- [x] Complete. Added settings e2e coverage, separated saved server config from local drafts, and documented MVP operation.

## Reconciliation Checklist

- [x] Add E2E test for management UI creating a collection, alert rule, variant, and test alert.
- [x] Add E2E test for live overlay receiving a synthetic event.
- [x] Add E2E test for module-specific Alerts overlay receiving a synthetic event.
- [x] Add E2E test for unified overlay rendering enabled modules and excluding disabled modules.
- [x] Add E2E test that test overlay does not receive real provider events.
- [x] Add E2E test that a revoked overlay key cannot connect.
- [x] Add E2E test that port update persists and invalid ports are rejected.
- [x] Add runbook covering startup, port changes, overlay URLs, Twitch connection, and diagnostics export.
- [x] Run full verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.
- [x] Commit with message `test: harden mvp flows`.

## Final Validation

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test` - 79 files, 304 tests.
- [x] `env LD_LIBRARY_PATH=/tmp/playwright-deps/extract/usr/lib/x86_64-linux-gnu pnpm test:e2e` - 8 tests.
- [x] `pnpm build`
- [x] `git diff --check`

## Playwright Chromium Note

Root cause of the local Chromium blocker was missing host NSS/NSPR shared libraries: `libnspr4.so`, `libnss3.so`, and `libnssutil3.so`. `pnpm exec playwright install-deps chromium --dry-run` reports that Playwright 1.60.0 cannot install dependencies for Ubuntu 26.04, and `sudo apt-get install -y libnspr4 libnss3` is blocked here by sudo password authentication. Local e2e verification succeeded after downloading `libnspr4` and `libnss3` packages to `/tmp/playwright-deps`, extracting them, and setting `LD_LIBRARY_PATH=/tmp/playwright-deps/extract/usr/lib/x86_64-linux-gnu` for Playwright runs.
