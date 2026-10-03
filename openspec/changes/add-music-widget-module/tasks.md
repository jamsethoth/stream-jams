## 1. Confirm Scope And Baseline

- [ ] 1.1 Obtain written-spec review, resolve the explicitly proposed native-appearance-versus-custom-CSS choice, and record any design amendments before implementation planning/execution.
- [ ] 1.2 Refresh origin/main, confirm the target branch/worktree and unimplemented Music scope, and record the source widget commit and supported Pear version in verification evidence.
- [ ] 1.3 Map each reference widget feature to the new contract/UI and read applicable frontend/module/secret/backup guidance; identify any missing safe-fetch/image-validation primitive and justify an exact maintained dependency only if needed.

## 2. Core Contracts And Provider Registration

- [ ] 2.1 Add bounded Music track/snapshot/status/capability/config schemas and adapter interfaces with positive, negative, empty, unknown-duration and malformed-input tests.
- [ ] 2.2 Move the shared module presentation contract out of timer ownership, preserve timer-stack behavior, add music-widget and update all browser/private-desktop validators with compatibility tests.
- [ ] 2.3 Extend provider kinds/capabilities and add the next SQLite migration for registration constraints/indexes; verify existing providers and one-active-per-capability invariants survive migration/failure.
- [ ] 2.4 Add music selection/config repository/service integration, independent activation/deactivation and disabled module defaults with restart and source-switch tests.
- [ ] 2.5 Add a reusable adapter contract harness with push, polling-only and selected-session fixtures; prove renderer-independent snapshots and idempotent cancellation/stop.

## 3. Pear Pairing And Authenticated Adapter

- [ ] 3.1 Implement typed loopback endpoint/config validation, stable local pairing identity, matched HTTP/WS schemes and explicit cancellable 60-second pairing; cover allow, deny, timeout, cancellation and rejected endpoints.
- [ ] 3.2 Integrate provisional server-only credentials with durable SecretStore and validated registration; cover store/database failures, compensation, reconnect and explicit credential replacement without exposing token material.
- [ ] 3.3 Implement authenticated REST observation and WS initialization requiring validated PLAYER_INFO; cover empty initialization, selected-transport testing, 1008/401/403 and WS-only unsupported endpoints.
- [ ] 3.4 Implement auto/authenticated polling fallback, serialized polling, bounded reconnect, freshness reconciliation, generation ownership and complete disposal; cover rate limiting and no auth downgrade.
- [ ] 3.5 Port and strengthen Pear normalization for full/partial metadata, pause/resume, seeks and missing fields; add regressions for HTTP 204 clearing, publication after disconnect and polling-driven idle reset.
- [ ] 3.6 Test redaction of HTTP/WS/WSS query tokens, authorization metadata, nested exceptions and credential references through diagnostics and management responses.

## 4. Music Runtime Artwork And Persistence

- [ ] 4.1 Implement authoritative snapshot revisions, shared appearance epoch, interpolation/projection and transparent stale/disconnected state; test rapid switch, fresh-recipient resync, clock offsets and slow consumers.
- [ ] 4.2 Implement constrained artwork fetching, destination/redirect/DNS policy, raster validation, bounded cache and opaque references; cover malformed/oversized content, rebinding/private-address rejection, aborts and placeholder behavior.
- [ ] 4.3 Integrate artwork delivery with management, purpose-scoped browser and private-desktop authorization; test wrong-purpose/revoked keys, arbitrary-URL rejection and obsolete generation access.
- [ ] 4.4 Extend backup mappings, schema-drift checks and restore behavior for Music config/fonts/metadata; exclude credentials/pairing identity/cache/playback, require fresh pairing and test rollback/secret cleanup failure.

## 5. Management And Shared Rendering

- [ ] 5.1 Add typed Music setup/status/config clients and a Music sources integration workflow for pairing, testing, selection and reconnect; preserve validation-before-registration and refresh stale status at least every five seconds.
- [ ] 5.2 Add Music module management with enablement, profile layouts, view/theme/opacity/alignment/idle settings, saved appearance controls, dirty-state handling and output links.
- [ ] 5.3 Implement shared React full/compact Music rendering, metadata/artwork fallback, progress, scrolling/reduced-motion text and approved custom appearance using existing font assets.
- [ ] 5.4 Add management mock preview and explicit test-output delivery using the production renderer; prove previews do not activate/change a provider or leak fixture state to live output.
- [ ] 5.5 Register module/unified output composition and opt-in desktop surface delivery; preserve layer visibility, profile bounds, route-key/private authorization, click-through and no-audio behavior.
- [ ] 5.6 Add production-component tests and Storybook states/interactions for appearance, long/missing text, unknown duration, empty/loading, pairing denial, auth-required, reconnect, stale status, dirty edits and keyboard accessibility.

## 6. Automated Integration And Live Acceptance

- [ ] 6.1 Add a disposable authenticated Pear protocol service and integration tests for real HTTP/WS pairing, first-frame readiness, revocation, reconnect/fallback, empty playback and shutdown; avoid real credentials in fixtures/logs.
- [ ] 6.2 Add Playwright coverage for setup/test/selection, saved appearance and preview, polling idle regression, module/unified routes, key denial/revocation and recovery; exercise real production components and service boundaries.
- [ ] 6.3 Add focused desktop coverage for the new presentation variant, authorized artwork/font loading, explicit surface membership, shutdown and independent alert/Music behavior.
- [ ] 6.4 Run lint, typecheck, tests, build, Storybook build/test, applicable Playwright/desktop suites and strict OpenSpec validation; classify and resolve relevant failures without weakening tests.
- [ ] 6.5 Rebuild/restart affected local services, wait for health, reload management/output and verify the changed workflow against the new build.
- [ ] 6.6 Record actual Pear version and authenticated pairing/restart/revocation/track/seek/pause/reconnect acceptance, plus OBS browser-source and Windows desktop visual acceptance; mark any unavailable physical check with its exact missing dependency.

## 7. Documentation And Requirement Reconciliation

- [ ] 7.1 Document Pear AUTH_AT_FIRST setup, local transport, endpoint/version compatibility, credential recovery, styling compatibility, output setup and troubleshooting with secret-free examples.
- [ ] 7.2 Add a short provider onboarding guide covering typed setup/schema registration, adapter normalization/authentication, safe artwork policy and required contract fixtures; describe Plex/Spotify as future design checks only.
- [ ] 7.3 Reconcile every specification scenario against code/tests and recorded acceptance; sync completed canonical specs and remove only the implemented BL-028 outcome when completion criteria are met.
