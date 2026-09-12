## 1. Baseline and Windows capability gate

- [x] 1.1 Fetch current remote state, verify this slice is still unimplemented, and branch from `origin/main`. Read this proposal, design and all normative scenarios; preserve unrelated work and commit the slice specification before or with implementation when authorized.
- [x] 1.2 Add focused tests and the smallest overlay-window adapter under `apps/desktop/src/overlay/` for transparent, non-focusable, click-through, no-taskbar behavior and explicit display binding.
- [x] 1.3 Package a neutral transparent-video probe at 1080p and 1440p with `app.disableHardwareAcceleration()` retained. Record input/focus, mixed-DPI displays, hidden management and bounded native Quit evidence in `docs/verification/shared-desktop-overlay.md`; leave the gate incomplete if a backend decision is required.

## 2. Surface contracts and persistence

- [x] 2.1 Add core surface configuration/recipient schemas alongside `overlay-modules` and `overlays`; test complete-order validation, unique registered IDs, opacity bounds, monitor identity and module/occurrence/generation acknowledgement identity.
- [x] 2.2 Add typed surface repositories and the next-numbered SQLite migration. Test fresh disabled desktop defaults, atomic invalid/failed writes, restart persistence and preservation of existing unified membership/order.
- [x] 2.3 Extend backup/restore validation with monitor bindings disabled/unbound on import; test legacy backups, failed-restore rollback and exclusion of clients/credentials.
- [x] 2.4 Extend registry/composition tests for new modules hidden at the bottom, global disable precedence, independent surface order and unaffected module-specific sources.

## 3. Desktop visual delivery

- [x] 3.1 Add private host/preload/renderer transport under `apps/desktop/src/overlay/` and wire through `desktop-ipc.ts`, `service-worker.ts`, supervisor and `main.ts`; test owned sender/top-frame validation, sandboxing and absence of management credentials.
- [x] 3.2 Add bounded local asset-ID resolution with existing asset validation/read limits; test unauthorized paths/URLs, missing/oversized/malformed media and transparent failure.
- [x] 3.3 Extend server recipient tracking with desktop prepare/start/stop/complete/error messages. Test desktop-only Alerts, no OBS dependency, reviewed Landscape eligibility, independent audio, stale acknowledgements and duration-plus-5-second expiry.
- [x] 3.4 Implement selected-display bounds/DPI updates, opacity, disconnect hiding and explicit rebinding. Test no fallback, CLI unavailable state and management close-to-tray without interrupting the HUD.
- [x] 3.5 Reuse `OverlaySurface.tsx` with isolated module stacking and stable occurrence keys. Test internal z-index containment, reorder without restart, visual visibility without audio changes and re-show at current media offset.
- [x] 3.6 Test bounded teardown/recovery: 10-second ownership lease, one automatic recreation then explicit Retry, no interrupted replay, all affected desktop obligations settled on host failure, and idempotent Quit.

## 4. Settings and UI coverage

- [x] 4.1 Add protected surface-management routes and typed web calls; test auth/CSRF/origin/rate-limit rejection, invalid reorder, failed persistence and stale capabilities.
- [x] 4.2 Add Settings controls for explicit desktop enable/display/opacity and independent desktop/unified layers. Keep module Browser sources in context; cover draft/save, keyboard up/down, loading, empty, unavailable and actionable failures.
- [x] 4.3 Add production-component Storybook stories with tiny neutral fixtures for overlapping modules, layer changes, missing display and CLI capability. Add focus/accessibility and fail-transparent assertions without overlay credentials.
- [x] 4.4 Add Playwright settings/persistence/order workflows and packaged desktop input/focus/lifetime tests where automation can verify them; ensure asset/device selection never automatically emits a test.

## 5. Acceptance and handoff

- [ ] 5.1 Run affected regressions and `corepack.cmd pnpm lint`, `typecheck`, `test`, `build`, `build-storybook`, `test:storybook:ci`, `test:e2e`, and `test:desktop`; classify every non-passing gate instead of calling partial checks a full pass.
- [ ] 5.2 Rebuild/restart only the authorized affected runtime, wait for health, reload management and verify real desktop plus OBS playback with neutral media. Record physical input/display/background/shutdown evidence in the verification document.
- [ ] 5.3 Reconcile all scenarios with code/tests/evidence, run `openspec.cmd validate add-shared-desktop-overlay-surface --strict`, and update product/runbook/backlog after implementation and spec sync. Do not publish, merge or claim Screen Effects implemented in this slice.
