## 1. Confirm Scope And Baseline

- [x] 1.1 Obtain written-spec review of the updated design, including the user-selected native controls plus Advanced CSS and uploaded branding image, before implementation planning/execution. Approved October 4, 2026; [implementation plan](../../../docs/superpowers/plans/2026-10-04-music-widget-module.md).
- [x] 1.2 Refresh origin/main, confirm the target branch/worktree and unimplemented Music scope, and record the source widget commit and supported Pear version in verification evidence.
- [x] 1.3 Map each reference widget feature to the new contract/UI and read applicable frontend/module/secret/backup guidance; evaluate an established CSS parser and any missing safe-fetch/image-validation primitive, documenting maintenance/license/stack fit before adding exact dependencies.

## 2. Core Contracts And Provider Registration

- [x] 2.1 Add bounded Music track/snapshot/status/capability/config schemas and adapter interfaces with positive, negative, empty, unknown-duration and malformed-input tests.
- [x] 2.2 Move the shared module presentation contract out of timer ownership, preserve timer-stack behavior, add music-widget and update all browser/private-desktop validators with compatibility tests.
- [x] 2.3 Extend provider kinds/capabilities and add the next SQLite migration for registration constraints/indexes; verify existing providers and one-active-per-capability invariants survive migration/failure.
- [x] 2.4 Add music selection/config repository/service integration, independent activation/deactivation and disabled module defaults with restart and source-switch tests.
- [x] 2.5 Add a reusable adapter contract harness with push, polling-only and selected-session fixtures; prove renderer-independent snapshots and idempotent cancellation/stop.

## 3. Pear Pairing And Authenticated Adapter

- [x] 3.1 Implement typed loopback endpoint/config validation, stable local pairing identity, matched HTTP/WS schemes and explicit cancellable 60-second pairing; cover allow, deny, timeout, cancellation and rejected endpoints.
- [x] 3.2 Integrate provisional server-only credentials with durable SecretStore and validated registration; cover store/database failures, compensation, reconnect and explicit credential replacement without exposing token material.
- [x] 3.3 Implement authenticated REST observation and WS initialization requiring validated PLAYER_INFO; cover empty initialization, selected-transport testing, 1008/401/403 and WS-only unsupported endpoints.
- [x] 3.4 Implement auto/authenticated polling fallback, serialized polling, bounded reconnect, freshness reconciliation, generation ownership and complete disposal; cover rate limiting and no auth downgrade.
- [x] 3.5 Port and strengthen Pear normalization for full/partial metadata, pause/resume, seeks and missing fields; add regressions for HTTP 204 clearing, publication after disconnect and polling-driven idle reset.
- [x] 3.6 Test redaction of HTTP/WS/WSS query tokens, authorization metadata, nested exceptions and credential references through diagnostics and management responses.

## 4. Music Runtime Artwork And Persistence

- [x] 4.1 Implement authoritative snapshot revisions, shared appearance epoch, interpolation/projection and transparent stale/disconnected state; test rapid switch, fresh-recipient resync, clock offsets and slow consumers.
- [x] 4.2 Implement constrained artwork fetching, destination/redirect/DNS policy, raster validation, bounded cache and opaque references; cover malformed/oversized content, rebinding/private-address rejection, aborts and placeholder behavior.
- [x] 4.3 Integrate artwork delivery with management, purpose-scoped browser and private-desktop authorization; test wrong-purpose/revoked keys, arbitrary-URL rejection and obsolete generation access.
- [x] 4.4 Extend backup mappings, schema-drift checks and restore behavior for Music config/CSS/style version/branding images/fonts/metadata; validate style and asset references, exclude credentials/pairing identity/cache/playback, require fresh pairing and test rollback/secret cleanup failure.
- [x] 4.5 Add Music branding image/font usages to asset reference, replacement and retirement checks for every profile/view; verify valid replacements refresh authorized versioned delivery and incompatible references are rejected.

## 5. Management And Shared Rendering

- [x] 5.1 Add typed Music setup/status/config clients and a Music sources integration workflow for pairing, testing, selection and reconnect; preserve validation-before-registration and refresh stale status at least every five seconds.
- [x] 5.2 Add Music module management with enablement, profile layouts, view/theme/opacity/alignment/idle settings, saved appearance controls, dirty-state handling and output links.
- [x] 5.3 Implement shared React full/compact Music rendering, metadata/artwork fallback, progress, scrolling/reduced-motion text and approved custom appearance using existing font assets.
- [x] 5.4 Add management mock preview and explicit test-output delivery using the production renderer; prove previews do not activate/change a provider or leak fixture state to live output.
- [ ] 5.5 Register module/unified output composition and opt-in desktop surface delivery; preserve layer visibility, profile bounds, route-key/private authorization, click-through and no-audio behavior.
- [x] 5.6 Add production-component tests and Storybook states/interactions for appearance, long/missing text, unknown duration, empty/loading, pairing denial, auth-required, reconnect, stale status, dirty edits and keyboard accessibility.
- [x] 5.7 Implement and test the shared bounded CSS parser/policy, including escaped syntax, custom-property indirection, resource loading, permitted at-rules, selector restrictions and inline validation locations; do not substitute regex-only filtering.
- [x] 5.8 Add the versioned styling surface, managed Shadow DOM frame and CSS apply/disable/clear behavior; verify layout/animation/container rules, native-control precedence, reduced motion and isolation from host/sibling content.
- [x] 5.9 Add accessible Advanced CSS editing with preview-only drafts, explicit save, last-valid-result preservation and an always-accessible disable action; cover these flows in production-component stories/tests.
- [x] 5.10 Add branding image picker/upload, per-profile/full/compact fit/position/opacity, width/height/content insets and aspect-ratio action; render fill/image/content layers with transparent-image and load-failure stories/tests.

## 6. Automated Integration And Live Acceptance

- [x] 6.1 Add a disposable authenticated Pear protocol service and integration tests for real HTTP/WS pairing, first-frame readiness, revocation, reconnect/fallback, empty playback and shutdown; avoid real credentials in fixtures/logs.
- [x] 6.2 Add Playwright coverage for setup/test/selection, saved appearance and preview, polling idle regression, module/unified routes, key denial/revocation and recovery; exercise real production components and service boundaries.
- [ ] 6.3 Add focused desktop coverage for the new presentation variant, authorized artwork/font loading, explicit surface membership, shutdown and independent alert/Music behavior.
- [ ] 6.4 Run lint, typecheck, tests, build, Storybook build/test, applicable Playwright/desktop suites and strict OpenSpec validation; classify and resolve relevant failures without weakening tests.
- [x] 6.5 Rebuild/restart affected local services, wait for health, reload management/output and verify the changed workflow against the new build.
- [ ] 6.6 Record actual Pear version and authenticated pairing/restart/revocation/track/seek/pause/reconnect acceptance, plus OBS browser-source and Windows desktop visual acceptance; mark any unavailable physical check with its exact missing dependency.
- [x] 6.7 Add browser acceptance for custom CSS layouts/disable/errors, rejected network-loading CSS with request interception, scope isolation, branded layer ordering, fit modes, independent opacity and no residual branding after idle/disconnect.
- [ ] 6.8 Verify the same branded custom layout across management preview, module/unified output and private desktop, including saved restart/backup round trips and asset replacement/missing-image recovery.

## 7. Documentation And Requirement Reconciliation

- [x] 7.1 Document Pear AUTH_AT_FIRST setup, local transport, endpoint/version compatibility, credential recovery, styling compatibility, output setup and troubleshooting with secret-free examples.
- [x] 7.2 Add a short provider onboarding guide covering typed setup/schema registration, adapter normalization/authentication, safe artwork policy and required contract fixtures; describe Plex/Spotify as future design checks only.
- [x] 7.3 Reconcile every specification scenario against code/tests and recorded acceptance; sync completed canonical specs and remove only the implemented BL-028 outcome when completion criteria are met.
- [x] 7.4 Document supported CSS selectors/variables, precedence, permitted rules, standalone selector migration, recovery and branding-image setup using a checked-in non-secret sample branded layout.

## Final acceptance boundary

Tasks 5.5, 6.3, 6.4, 6.6 and 6.8 remain **[blocked]** for physical/private-desktop acceptance, not missing implementation. Browser output, authorization, CSS/branding, restore and provider-art paths have automated evidence in [verification](../../../docs/verification/music-widget-module.md) and the [66-scenario map](../../../docs/verification/music-widget-scenarios.md). The full software gates passed at their recorded checkpoints, with affected checks after later corrections. The packaged startup failure was traced to native companion DLLs inside ASAR and corrected; packaged no-source Music and Timer checks subsequently passed. Pear HTTPS and AUTH_AT_FIRST rejection are verified; actual approval/revocation and OBS/private desktop Music pixels remain pending. LockApp process presence does not establish that Windows is locked. Required remaining dependencies are an isolated native-host SecretStore or authorized disposable keyring namespace, an actual paired source and interactive physical acceptance. BL-028 remains only for this acceptance boundary; BL-054 remains future provider work. Canonical spec synchronization records implemented software behavior, not physical certification.


## 8. User-Requested Editor Refinement

See [editor refinement](editor-refinement.md).

- [x] 8.1 Align Browser sources/Preview/Configuration/Custom CSS structure and independent disclosures, retaining visible CSS recovery.
- [x] 8.2 Mirror graphical RGB/opacity controls and validated RGBA hex input without committing invalid values.
- [x] 8.3 Add bounded saved component layout, management-only drag/resize/keyboard editing, numeric geometry and automatic-layout reset.
- [x] 8.4 Verify draft/save/reload/live and backup/default compatibility, proportional Storybook/browser coverage, builds/budgets, typecheck/lint and strict specs; rebuild the desktop runnable folder and synchronize the completed requirement.


## 9. Approved Shared Snapping Refinement

- [x] 9.1 Share bounded pointer move/resize snapping with a 10px grid, screen-space alignment tolerance and eligible peer/canvas targets.
- [x] 9.2 Add independent default-enabled snapping toggles and transient guides to Music and Alerts, preserving exact numeric/keyboard edits and draft/save behavior.
- [x] 9.3 Verify geometry, UI, browser workflow, Storybook and affected package checks; synchronize the capability/current UX and rebuild the runnable desktop app.
