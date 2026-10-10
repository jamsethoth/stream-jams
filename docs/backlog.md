# Stream Jams Backlog

This is the canonical index for deferred, planned, and intentionally rejected Stream Jams product work. Detailed product, UX, architecture, and research documents may explain an item, but this file owns its current backlog status, priority, dependency, and OpenSpec link.

## Maintenance Rules

- Add a new deferred idea here before or with detailed notes elsewhere.
- Keep one row per product outcome; link supporting detail instead of copying it into this file.
- Use `Planned` only when an apply-ready OpenSpec change exists, and link that change.
- When implementation, spec sync, and required acceptance are complete, remove the row; durable specs, archives, and Git history retain completed history. A maintained main-branch changelog is still planned under BL-052.
- `Not planned` entries are deliberate product boundaries, not implementation suggestions. Reopening one requires an explicit product decision.
- Priority means: `P0` next critical work, `P1` high value, `P2` useful follow-up, and `P3` low urgency or evidence-dependent.

Completed desktop/tray, portable-artifact, alert-routing, shared desktop-surface, and routed video-soundtrack requirements are maintained in durable OpenSpec capabilities and their archives.

## Alert Authoring And Assets

| ID | Feature | Status | Priority | Dependency or trigger | Detail |
| --- | --- | --- | --- | --- | --- |
| BL-007 | Bulk alert and asset operations | Deferred | P2 | Stable list selection and impact-summary contracts | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-008 | Versioned alert and alert-set package import/export | Deferred | P2 | Stable styled-alert schema and asset packaging | [Product plan](product-plan.md) |
| BL-009 | User-created alert templates and `Save as template` | Deferred | P2 | Implemented bundled starter themes and BL-008 | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-010 | Per-alert TTS voice, rate, volume, pitch, and delay overrides where providers permit | Deferred | P2 | Stable provider-capability contract | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-011 | Advanced condition builder with generic AND/OR groups and additional safe normalized fields | Deferred | P2 | Implemented variation authoring and durable moderation for viewer-controlled text fields | [Future-feature notes](future-features.md#advanced-alert-condition-builder) |
| BL-012 | Media crop, fit, focal-point, and positioning controls | Deferred | P2 | Stable visual-style and overlay presentation contracts | Product decision, 2026-07-20 |
| BL-013 | Additional bounded animation presets | Deferred | P2 | Stable style and animation contracts | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-014 | Alert version history, rollback, soft delete, and selective recovery | Deferred | P2 | Existing backup/restore plus a bounded history policy | [Future-feature notes](future-features.md#alert-version-history-and-rollback) |
| BL-015 | Asset version history and restore | Deferred | P3 | BL-014 recovery model | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-016 | Responsive units, custom profiles, and optional cross-profile layout assistance | Deferred | P3 | Measured need beyond fixed landscape and vertical profiles | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-017 | Translation-ready management UI, selected locales, contrast checks, and alert reduced-motion guidance | Deferred | P3 | Named target locales and accessibility acceptance criteria | Product decision, 2026-07-20 |
| BL-018 | Constrained per-layer timeline and keyframe editor | Long-term | P3 | Preset animations prove insufficient; the implemented text-style contract and BL-013 are stable | Must remain schema-validated and exclude arbitrary code. |
| BL-019 | Full provider-event simulation and persisted custom sample library | Deferred | P3 | Stable normalized catalogs and Diagnostics simulation boundary | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-040 | Shape border and drop-shadow appearance controls | Deferred | P2 | Implemented solid-fill shape layers | Add bounded border color/width and an optional drop shadow; gradients, rounded corners, additional primitives, masks, SVG, and general composition remain out of scope. |
| BL-065 | Data overlay value-change animation and completed-goal styling | Deferred | P3 | Implemented BL-055 canvases | Count-up numbers, animated bar fill, and a completed-goal style; reduced-motion aware. |

## Events, Providers, And Integrations

| ID | Feature | Status | Priority | Dependency or trigger | Detail |
| --- | --- | --- | --- | --- | --- |
| BL-020 | Third-party donations, Twitch charity, and related monetary alerts and money data-overlay values | Deferred | P2 | Currency-safe normalized values and explicit integration identities | [Future-feature notes](future-features.md#third-party-and-charity-donation-events); Creator Goals moved to BL-062; money and decimal data values wait for a real money source |
| BL-021 | Additional event providers | Deferred | P3 | A named provider and canonical event mapping | [Product plan](product-plan.md) |
| BL-022 | Additional TTS providers | Deferred | P3 | A named provider and capability-mapping need | [Product plan](product-plan.md) |
| BL-023 | Non-local Streamer.bot connections | Deferred | P3 | Authentication, transport security, warnings, and updated threat model | [Future-feature notes](future-features.md#streamerbot-non-local-connections) |
| BL-024 | Manual intake controls and stream-start/stream-end automation | Deferred | P3 | A real OBS or platform lifecycle integration | [UI decisions](design/ui-refactor-decisions.md) |
| BL-066 | Durable Alert and Screen Effects playback queues across restart | Deferred | P1 | Central event bus journal and consumer cursors (implemented); project rule that module queues survive restarts (2026-10-08) | [Central event bus design](../openspec/changes/archive/2026-10-08-add-central-event-bus/design.md) |
| BL-026 | Resumable provider setup drafts | Deferred | P3 | Measured abandonment or recovery need in provider setup | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-054 | Additional Music sources: Plex and Spotify | Deferred | P2 | Implemented Music provider contract and authenticated Pear delivery; provider-specific API, authentication and session/endpoint policies | [Music provider design](../openspec/changes/archive/2026-10-05-add-music-widget-module/design.md); this proposal includes interface fit checks, not these adapters |

## Modules, Outputs, And Platform

| ID | Feature | Status | Priority | Dependency or trigger | Detail |
| --- | --- | --- | --- | --- | --- |
| BL-027 | Startup module selection/setup wizard | Trigger reached; deferred | P3 | Alerts and Screen Effects now ship; a bounded onboarding workflow still needs approval | [Future-feature notes](future-features.md#startup-module-setup-wizard) |
| BL-029 | Expanded output management, connected-client history, route-key audit, and OBS-aware readiness | Deferred | P3 | Output workflow outgrows the current Alerts section | [UI decisions](design/ui-refactor-decisions.md) |
| BL-030 | Desktop signing, durable releases, updater/startup/service integration, and `safeStorage` migration | Deferred | P2 | Separately approved release and credential-migration changes; signing waits on a free route (maintainer decision 2026-10-09: no paid certificate; SignPath Foundation, which requires a public open-source repository, is the preferred candidate) | The runnable folder, tray lifecycle, unsigned per-user Squirrel installer, and authenticated short-lived CI artifact publication are implemented ([installer change](../openspec/changes/add-windows-desktop-installer/proposal.md)). Signing, durable release publication, automatic updates, startup-at-login, Windows service, and credential migration remain deferred. [Desktop requirements](../openspec/specs/windows-desktop-runtime/spec.md); [Product plan](product-plan.md) |
| BL-031 | Docker delivery | Deferred | P3 | Supported self-hosted deployment requirement | [Product plan](product-plan.md) |
| BL-032 | LAN overlay mode | Deferred | P3 | Authentication, origin policy, network warnings, and threat model | [Product plan](product-plan.md) |
| BL-033 | User-owned cloud backup destination integration | Deferred | P3 | Stable backup format and explicit provider authorization | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-034 | App-data relocation, configurable retention, release/update checks, and command palette | Deferred | P3 | Individual measured user need | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-035 | Migrate Storybook browser tests away from the deprecated Story Store API | Deferred | P2 | Stable Storybook inventory and defined interaction/accessibility parity | Replace the Story Store-based test runner with the Storybook Vitest addon while preserving Chromium interactions, accessibility checks, and console-failure coverage. [Future-feature notes](future-features.md#evaluate-storybook-vitest-addon) |
| BL-036 | Optional encryption for exported backups | Deferred | P3 | Stable backup format and a defined password/key recovery model | [Product plan](product-plan.md) |
| BL-037 | Alert scheduling | Deferred | P3 | A concrete scheduling workflow and safe clock/time-zone semantics | [Product plan](product-plan.md) |
| BL-038 | Full operator console expansion for intake, event review, and attention workflows | Deferred | P2 | Implemented multi-module playback controls and demonstrated live-operation needs | [MVP UX](design/ui-refactor-mvp-ux-spec.md) |
| BL-048 | Cross-platform desktop overlay support | Deferred | P3 | Windows surface proven; named macOS/Linux packaging, input, display and audio acceptance targets | Windows first. [Shared-surface verification](verification/shared-desktop-overlay.md) |
| BL-049 | Exclusive-full-screen desktop overlay compatibility evaluation | Evidence-dependent | P3 | Demonstrated need beyond windowed/borderless; explicit backend and anti-cheat/support-risk decision | Control DX11's Fullscreen setting failed video acceptance on 2026-10-02; actual exclusive presentation remains unverified. [Test evidence](verification/desktop-overlay-topmost.md). No graphics injection or automatic game-setting changes are authorized by the shared desktop surface or Screen Effects. [Shared-surface requirements](../openspec/specs/shared-overlay-surfaces/spec.md) |
| BL-050 | Optional cloud service deployment with a local desktop bridge | Deferred candidate | P3 | Explicit deployment need, local-device ownership boundary and separately approved authentication/transport model | Current app remains local-first; this does not reopen marketplace or general cloud sync. [Product plan](product-plan.md) |
| BL-051 | Automatic desktop display reconnection after display ID changes | Deferred | P2 | Implemented shared desktop surface; validated Windows hardware-identity matching and an approved persistence/recovery design | Save reliable physical-monitor identity and automatically rebind only when exactly one current monitor matches. Missing or ambiguous identity requires explicit selection; never fall back to the primary display or match solely by name/position. Recovery applies to future effects only, with no interrupted-content replay. Observed during the September 10 test; the user reported a driver update/display refresh, but causality is unconfirmed. [Test evidence](verification/shared-desktop-overlay.md#integrated-representative-video-attempt--september-10); [Windows monitor identity](https://learn.microsoft.com/en-us/windows/win32/wmicoreprov/wmimonitorid). |
| BL-058 | Video duration lookup (YouTube API key, Google device sign-in, muted desktop metadata probe) | Deferred | P2 | Archived `add-video-request-queue`; operator-created Google OAuth client for sign-in | Twitch clip and VOD lengths now come from the Twitch API when a Twitch account is connected (`add-video-metadata-lookup`), so this remains for YouTube (oEmbed gives title and channel but no length), direct files, and Twitch without a connected account. Without it, those unknown-length items queue and are only checked against the limit once the player reports a duration (the desktop player, or YouTube and direct-file browser-source fallback players; Twitch fallback players report none), so an over-limit item starts before it is stopped and held. [Design](../openspec/changes/archive/2026-10-10-add-video-request-queue/design.md) |
| BL-064 | Paired native data input API for external producers | Deferred | P3 | A named producer that cannot use Streamer.bot custom broadcasts | Superseded by listening to Streamer.bot (2026-10-08 decision). If revived: `requestId` optional, revision guard only on `set`, no runtime guard on events, receipts kept 24 to 48 hours with eviction rather than rejection, and bearer auth on the WebSocket upgrade instead of tickets. [Review notes](design/2026-10-08-custom-data-overlays-review.md) |

## Planned Changes And Maintenance Candidates

| ID | Outcome | Status | Priority | Dependency or trigger | Detail |
| --- | --- | --- | --- | --- | --- |
| BL-052 | Main-branch changelog and validation | Planned | P2 | Existing proposal; 0/22 implementation tasks at the September 23 audit | [OpenSpec change](../openspec/changes/add-main-branch-changelog/proposal.md) |
| BL-060 | Audit modules for output parity (desktop overlay and browser source), management and operator tools, and persisted queues | Planned | P1 | Project rule from 2026-10-08 | Covers Alerts, Screen Effects, Timers and Music; findings become per-module changes |
| BL-055 | Custom data overlays: shared values, goals, reset groups, canvases, outputs and Operator controls | Planned | P2 | Proposal review before implementation; slice 1 of 4 | [OpenSpec change](../openspec/changes/add-custom-data-overlays/proposal.md); [review](design/2026-10-08-custom-data-overlays-review.md) |
| BL-061 | Data overlay event rules as a central event bus consumer, plus Streamer.bot global values | Planned | P2 | BL-055 and the central event bus (implemented) | [OpenSpec change](../openspec/changes/add-data-overlay-event-rules/proposal.md); [consumer contract](engineering/event-bus-consumers.md) |
| BL-062 | Twitch follower total and Creator Goals data sources | Planned | P2 | BL-055 | [OpenSpec change](../openspec/changes/add-twitch-overlay-data/proposal.md); follows the active goal of a type by default |
| BL-063 | Data overlay canvas templates and starters | Planned | P2 | BL-055 | [OpenSpec change](../openspec/changes/add-data-overlay-templates/proposal.md) |

## Known Issues

| ID | Issue | Status | Priority | Dependency or trigger | Detail |
| --- | --- | --- | --- | --- | --- |
| BL-044 | Intermittent Windows desktop process-exit delay after audio playback | Investigation resumed; native cause unresolved | P2 | User-approved investigation; retain native shutdown regression coverage | September 7 controls identified and repaired a distinct test-only competing-dialog race without changing production behavior or deadlines. A thirty-minute Neewer-only comparison reproduced growing media-bridge threads/handles, while twenty additional native shutdown controls passed (twelve in-window, two after window-close with Neewer alive, six after normal Quit). A separately approved thread-creation trace identified Neewer's roughly 1.5-second QTimer camera enumeration through Qt/DirectShow as the creating path: 42 media-bridge threads started with no matching exits in the capture. The exact release defect and causal connection to the historical Chromium storage/scheduling delay remain unproven. The subsequent isolated management-session comparison completed four post-playback exits in 250–726 ms: temporary management avoided default-session DIPS but reset the theme, retained audio-session DIPS and demonstrated no shutdown benefit; production remains persistent. [Investigation and test repair](verification/alert-audio-routing.md#september-7-resumed-shutdown-investigation-and-test-only-dialog-repair), [controlled Neewer evidence](verification/alert-audio-routing.md#approved-thirty-minute-neewer-comparison), [creating-stack evidence](verification/alert-audio-routing.md#approved-neewer-thread-creation-trace), [session comparison and adoption decision](verification/alert-audio-routing.md#completed-management-session-comparison-adoption-not-accepted). |

BL-044's diagnostic capability was merged in [PR #99](https://github.com/jamsethoth/stream-jams/pull/99), synced to the canonical [desktop shutdown diagnostics](../openspec/specs/desktop-shutdown-diagnostics/spec.md) and [Windows desktop runtime](../openspec/specs/windows-desktop-runtime/spec.md) specifications, and archived on September 8, 2026 as [`add-desktop-shutdown-diagnostics-recovery`](../openspec/changes/archive/2026-09-08-add-desktop-shutdown-diagnostics-recovery/proposal.md). The original change ID is retained despite excluding the unimplemented recovery helper. The delivered scope is opt-in bounded phase logging and a silent staged plain-Electron comparison, without changing persistent sessions, edit decisions, tray policy or deadlines; no automatic native termination/restart is included. See [implementation and staged evidence](verification/alert-audio-routing.md#september-8-focused-phase-logging-and-staged-reproduction) and the [runbook](verification/windows-desktop-tray-runtime.md#opt-in-shutdown-evidence-september-8). Two subsequent [debugger-free five-minute retained-profile sessions](verification/alert-audio-routing.md#september-8-debugger-free-retained-profile-controls) completed twelve silent queue playbacks and exited normally in 2.73 s and 1.73 s; representative real-use recurrence evidence remains outstanding. These diagnostics are not a demonstrated shutdown mitigation; the native cause remains unresolved and BL-044 stays open.

Supporting evidence for BL-044 is being archived locally at `F:\dev\BL-004-evidence` for future investigation; consult this local archive alongside the linked verification notes.

## Not Planned

| ID | Feature | Reason |
| --- | --- | --- |
| NP-001 | Arbitrary alert HTML, CSS, JavaScript, external libraries, or remote code | Conflicts with safe validation, deterministic rendering, migration, and supportability. |
| NP-002 | Cloud theme marketplace, real-time collaboration, or general cloud synchronization | Conflicts with the local-first product model; BL-033 covers user-owned backup destinations only. |
| NP-003 | Twitch channel-side Celebrations or Twitch-native interactive resub mechanics | Platform-native behavior is not browser-source overlay parity. |
| NP-004 | Wholesale imports from proprietary competitor formats | Brittle service-specific compatibility; BL-008 defines a stable Stream Jams package instead. |
| NP-005 | Multiple overlapping active alert sets by default | Increases duplicate alert/audio risk without demonstrated scene-management value. |
| NP-006 | General-purpose design-tool composition such as arbitrary groups, masks, particles, nested compositions, or freehand drawing | Excess complexity for an alert editor; focused layer features require their own product case. |
