# Stream Jams Backlog

This is the canonical index for deferred, planned, and intentionally rejected Stream Jams product work. Detailed product, UX, architecture, and research documents may explain an item, but this file owns its current backlog status, priority, dependency, and OpenSpec link.

## Maintenance Rules

- Add a new deferred idea here before or with detailed notes elsewhere.
- Keep one row per product outcome; link supporting detail instead of copying it into this file.
- Use `Planned` only when an apply-ready OpenSpec change exists, and link that change.
- When implementation is complete and its specs are synced, remove the row; durable specs and the changelog retain completed history.
- `Not planned` entries are deliberate product boundaries, not implementation suggestions. Reopening one requires an explicit product decision.
- Priority means: `P0` next critical work, `P1` high value, `P2` useful follow-up, and `P3` low urgency or evidence-dependent.

## Planned Changes

| ID | Feature | Priority | Dependencies | OpenSpec |
| --- | --- | --- | --- | --- |
| BL-039 | Collapsible event-type grouping for alert inventory and focused-editor navigation | P1 | Variation authoring contract implemented | [`group-alerts-by-event-type`](../openspec/changes/group-alerts-by-event-type/proposal.md) |

## Alert Authoring And Assets

| ID | Feature | Status | Priority | Dependency or trigger | Detail |
| --- | --- | --- | --- | --- | --- |
| BL-007 | Bulk alert and asset operations | Deferred | P2 | Stable list selection and impact-summary contracts | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-008 | Versioned alert and alert-set package import/export | Deferred | P2 | Stable styled-alert schema and asset packaging | [Product plan](product-plan.md) |
| BL-009 | User-created alert templates and `Save as template` | Deferred | P2 | BL-006 and BL-008 | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-010 | Per-alert TTS voice, rate, volume, pitch, and delay overrides where providers permit | Deferred | P2 | Stable provider-capability contract | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-011 | Advanced condition builder with generic AND/OR groups and additional safe normalized fields | Deferred | P2 | BL-004 and BL-005 for viewer-controlled text fields | [Future-feature notes](future-features.md#advanced-alert-condition-builder) |
| BL-012 | Media crop, fit, focal-point, and positioning controls | Deferred | P2 | Stable visual-style and overlay presentation contracts | Product decision, 2026-07-20 |
| BL-013 | Additional bounded animation presets | Deferred | P2 | Stable style and animation contracts | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-014 | Alert version history, rollback, soft delete, and selective recovery | Deferred | P2 | Existing backup/restore plus a bounded history policy | [Future-feature notes](future-features.md#alert-version-history-and-rollback) |
| BL-015 | Asset version history and restore | Deferred | P3 | BL-014 recovery model | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-016 | Responsive units, richer snapping, custom profiles, and optional cross-profile layout assistance | Deferred | P3 | Measured need beyond fixed landscape and vertical profiles | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-017 | Translation-ready management UI, selected locales, contrast checks, and alert reduced-motion guidance | Deferred | P3 | Named target locales and accessibility acceptance criteria | Product decision, 2026-07-20 |
| BL-018 | Constrained per-layer timeline and keyframe editor | Long-term | P3 | Preset animations prove insufficient; the implemented text-style contract and BL-013 are stable | Must remain schema-validated and exclude arbitrary code. |
| BL-019 | Full provider-event simulation and persisted custom sample library | Deferred | P3 | Stable normalized catalogs and Diagnostics simulation boundary | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-040 | Shape border and drop-shadow appearance controls | Deferred | P2 | BL-003 | Add bounded border color/width and an optional drop shadow; gradients, rounded corners, additional primitives, masks, SVG, and general composition remain out of scope. |

## Events, Providers, And Integrations

| ID | Feature | Status | Priority | Dependency or trigger | Detail |
| --- | --- | --- | --- | --- | --- |
| BL-020 | Third-party donations, Twitch charity, creator goals, and related monetary alerts | Deferred | P2 | Currency-safe normalized values and explicit integration identities | [Future-feature notes](future-features.md#third-party-and-charity-donation-events) |
| BL-021 | Additional event providers | Deferred | P3 | A named provider and canonical event mapping | [Product plan](product-plan.md) |
| BL-022 | Additional TTS providers | Deferred | P3 | A named provider and capability-mapping need | [Product plan](product-plan.md) |
| BL-023 | Non-local Streamer.bot connections | Deferred | P3 | Authentication, transport security, warnings, and updated threat model | [Future-feature notes](future-features.md#streamerbot-non-local-connections) |
| BL-024 | Manual intake controls and stream-start/stream-end automation | Deferred | P3 | A real OBS or platform lifecycle integration | [UI decisions](design/ui-refactor-decisions.md) |
| BL-025 | Multiple active providers and provider-specific alert routing | Low evidence | P3 | Demonstrated need that canonical event matching cannot satisfy | [UI decisions](design/ui-refactor-decisions.md) |
| BL-026 | Resumable provider setup drafts | Deferred | P3 | Measured abandonment or recovery need in provider setup | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |

## Modules, Outputs, And Platform

| ID | Feature | Status | Priority | Dependency or trigger | Detail |
| --- | --- | --- | --- | --- | --- |
| BL-027 | Startup module selection/setup wizard | Trigger-based | P3 | Multiple shipped overlay modules | [Future-feature notes](future-features.md#startup-module-setup-wizard) |
| BL-028 | Music widget and additional overlay modules | Deferred | P2 | A separately approved module slice | [Product plan](product-plan.md) |
| BL-029 | Expanded output management, connected-client history, route-key audit, and OBS-aware readiness | Deferred | P3 | Output workflow outgrows the current Alerts section | [UI decisions](design/ui-refactor-decisions.md) |
| BL-030 | Electron packaging, signing, installer, updater, and `safeStorage` migration | Deferred | P2 | Stable local-server MVP and packaging decision | [Product plan](product-plan.md) |
| BL-031 | Docker delivery | Deferred | P3 | Supported self-hosted deployment requirement | [Product plan](product-plan.md) |
| BL-032 | LAN overlay mode | Deferred | P3 | Authentication, origin policy, network warnings, and threat model | [Product plan](product-plan.md) |
| BL-033 | User-owned cloud backup destination integration | Deferred | P3 | Stable backup format and explicit provider authorization | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-034 | App-data relocation, configurable retention, release/update checks, and command palette | Deferred | P3 | Individual measured user need | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-035 | Migrate Storybook browser tests away from the deprecated Story Store API | Deferred | P2 | Stable Storybook inventory and defined interaction/accessibility parity | Replace the Story Store-based test runner with the Storybook Vitest addon while preserving Chromium interactions, accessibility checks, and console-failure coverage. [Future-feature notes](future-features.md#evaluate-storybook-vitest-addon) |
| BL-036 | Optional encryption for exported backups | Deferred | P3 | Stable backup format and a defined password/key recovery model | [Product plan](product-plan.md) |
| BL-037 | Alert scheduling | Deferred | P3 | A concrete scheduling workflow and safe clock/time-zone semantics | [Product plan](product-plan.md) |
| BL-038 | Full operator console expansion for intake, event review, and attention workflows | Deferred | P2 | BL-001 and demonstrated live-operation needs | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-041 | Production web bundle splitting and performance budget | Deferred | P2 | Production entry chunk remains above Vite's 500 kB advisory threshold | Measure management startup, define an initial-load budget, and lazy-load heavy management surfaces, especially the alert editor, without weakening overlay reliability. |

## Not Planned

| ID | Feature | Reason |
| --- | --- | --- |
| NP-001 | Arbitrary alert HTML, CSS, JavaScript, external libraries, or remote code | Conflicts with safe validation, deterministic rendering, migration, and supportability. |
| NP-002 | Cloud theme marketplace, real-time collaboration, or general cloud synchronization | Conflicts with the local-first product model; BL-033 covers user-owned backup destinations only. |
| NP-003 | Twitch channel-side Celebrations or Twitch-native interactive resub mechanics | Platform-native behavior is not browser-source overlay parity. |
| NP-004 | Wholesale imports from proprietary competitor formats | Brittle service-specific compatibility; BL-008 defines a stable Stream Jams package instead. |
| NP-005 | Multiple overlapping active alert sets by default | Increases duplicate alert/audio risk without demonstrated scene-management value. |
| NP-006 | General-purpose design-tool composition such as arbitrary groups, masks, particles, nested compositions, or freehand drawing | Excess complexity for an alert editor; focused layer features require their own product case. |
