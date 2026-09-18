## 1. Asset duration ingestion

- [ ] 1.1 Add `MediaMetadataProbe`, timed-media pipeline tests, and exact `music-metadata@11.15.0` server adapter; run the focused pipeline and adapter Vitest files.
- [ ] 1.2 Add migration 024, repository round trips, backup compatibility, asset-library projection, and runtime wiring; run focused database, repository, route, backup, and service tests.

## 2. Shared timing and envelope contracts

- [ ] 2.1 Add compatibility-safe duration modes, candidate collection, and deterministic duration resolution; run core playback, management, and Screen Effect tests.
- [ ] 2.2 Add compatibility-safe fade authoring fields, normalized envelope fields, proportional clamping, and absolute-time gain calculation; run core audio and schema tests.

## 3. Server resolution and repair

- [ ] 3.1 Add cached stored-duration lookup with mutation invalidation and bounded legacy repair endpoint; run asset catalog, repair route, and API tests.
- [ ] 3.2 Resolve and snapshot authoritative durations for Alert and Screen Effect test/live playback; run coordinator, queue, service, and backup tests.

## 4. Playback transports

- [ ] 4.1 Apply normalized envelopes in browser overlay media and preview hooks; run focused web media and overlay tests.
- [ ] 4.2 Apply normalized envelopes in desktop device audio with timer cleanup and late-join handling; run desktop player and routing tests.

## 5. Management authoring

- [ ] 5.1 Add Alert duration-mode, explanation, warning, repair, and per-source fade controls with preview parity; run focused editor, Storybook, and Alert Playwright tests.
- [ ] 5.2 Add matching per-variant Screen Effect controls and inline preview parity; run focused editor, Storybook, browser, and desktop Screen Effect tests.

## 6. Documentation and complete verification

- [ ] 6.1 Update product/operator docs and write the verification evidence ledger.
- [ ] 6.2 Run changed-area lint, workspace typecheck, full serial Vitest, build, Storybook build/accessibility, and affected browser/desktop Playwright journeys.
- [ ] 6.3 Strict-validate OpenSpec, run diff checks, rebuild one local instance, and verify both live management workflows.
