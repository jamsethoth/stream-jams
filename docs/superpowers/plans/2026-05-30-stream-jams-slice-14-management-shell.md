# Slice 14: Management Shell

**Goal:** Implement the MVP management shell around existing alert, asset, module, config, overlay, and playback surfaces with route-level management session handling and browser-level navigation coverage.

**Base requirements:** `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` Slice 14.

**Architecture:** Keep management UI code browser-only. Management actions go through API client interfaces, and tests use mocked APIs so panels can be exercised without server imports. HTTP mode centralizes management session creation and bearer headers in one client helper instead of duplicating auth logic in every panel.

## Sub-Slice 14.1: Management App Shell And Navigation

**Objective:** Replace the single-page placeholder shell with a tabbed management app that exposes dashboard, modules, overlays, playback, settings, alerts, and assets surfaces.

**Files or areas:** `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/management/ManagementApp.tsx`, `apps/web/src/management/navigation/`.

**Tests:**

- Renders dashboard by default from mocked API responses.
- Switching navigation shows the selected panel without reloading the app.
- Existing alerts and assets panels remain reachable.

- [x] Complete.

## Sub-Slice 14.2: Management API Boundary

**Objective:** Add a unified management API client with cached session handling and mock-friendly methods for dashboard, config, modules, overlay URLs/clients, and playback.

**Files or areas:** `apps/web/src/management/management-api.ts`, existing panel wiring.

**Tests:**

- Component tests can inject a mocked `ManagementApi`.
- HTTP client creates one management session and sends bearer headers for protected routes.
- HTTP methods call fetch routes instead of importing server code.

- [x] Complete.

## Sub-Slice 14.3: Dashboard, Settings, Modules, Overlays, Playback

**Objective:** Implement the core management workflows required by the MVP shell.

**Files or areas:** `apps/web/src/management/dashboard/`, `settings/`, `modules/`, `overlays/`, `playback/`.

**Tests:**

- Dashboard shows Twitch status, overlay status, queue status, and recent errors.
- Settings displays and updates local host/port.
- Module management lists module definitions and enabled state, renders module wizard fields, and saves module config changes.
- Overlay screen displays copyable module-specific and unified live/test URLs and separates live/test labels.
- Playback controls call pause, resume, skip, replay, mute, unmute, and do-not-disturb API methods.
- Connected overlay clients render with live/test labels.

- [x] Complete.

## Sub-Slice 14.4: Playwright Management Flow

**Objective:** Add browser validation for management navigation and copyable overlay URL display.

**Files or areas:** `tests/e2e/management.spec.ts`, `playwright.config.ts`.

**Tests:**

- `/manage` opens the management shell.
- Navigation reaches the Overlays panel.
- A mocked module-specific test overlay URL is visible and copyable.

- [x] Complete.

## Reconciliation Checklist

- [x] Add dashboard with Twitch status, overlay status, queue status, and recent errors.
- [x] Add settings screen for local port display and update.
- [x] Add module management screen listing available modules and enabled state.
- [x] Add module wizard/form host that renders module-provided configuration steps.
- [x] Add overlay screen with copyable module-specific and unified live and test URLs.
- [x] Add playback controls for pause, resume, skip, replay, mute, unmute, and do-not-disturb.
- [x] Add connected overlay client list with live and test labels.
- [x] Add route-level management session handling.
- [x] Component test each management panel.
- [x] Playwright test core management navigation and copyable overlay URL display.
- [x] Commit with message `feat: add management shell`.

## Final Validation

- [x] `pnpm lint` passed locally.
- [x] `pnpm typecheck` passed locally.
- [x] `pnpm test` passed locally: 60 files, 227 tests.
- [x] `pnpm test:e2e` was attempted locally through `pnpm exec playwright test tests/e2e/management.spec.ts`; Chromium fails before test execution because `libnspr4.so` is missing in this Ubuntu 26.04 environment.
- [x] `pnpm build` passed locally.
- [x] `git diff --check` passed locally.
- [x] Diff self-review completed; generated Playwright artifacts were removed.
