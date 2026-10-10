# Documentation Map

Use this map to distinguish current behavior, pending work, and historical evidence. Documentation was reconciled against `origin/main` commit `fec768c58a8b27a6921e87ea1ac8d4a346a8c05d` on September 23, 2026; see the [repository audit](audits/2026-09-23-repository-complexity-and-documentation-audit.md) for findings and verification limits.

## Current Sources

| Question | Source |
| --- | --- |
| How do I run or operate the application? | [Runbook](mvp-runbook.md) |
| How do I configure Timers or Stream Deck HTTP actions? | [Timers](timers.md); [implementation verification and remaining manual acceptance](verification/timers.md) |
| How do I configure Music and brand its widget? | [Music provider setup](music-providers.md), [styling surface](music-styling.md), and [dated verification/acceptance](verification/music-widget-module.md) |
| What Music behavior is required? | [Canonical Music source](../openspec/specs/music-source-providers/spec.md) and [widget/output](../openspec/specs/music-widget-overlay/spec.md) capabilities; [scenario trace](verification/music-widget-scenarios.md) records automated and physical evidence |
| How do I queue and play requested videos (Twitch, YouTube, Streamer.bot, rewards, REST)? | [Videos](videos.md); [mirror feasibility check](verification/video-mirror-feasibility.md) |
| How do native integrations pair and control timers/queues? | [Local automation API v1](automation-api.md) |
| How does a module consume stream events? | [Event bus consumers](engineering/event-bus-consumers.md) |

| What product boundaries are intentional? | [Product plan](product-plan.md); its MVP sections describe the first delivery boundary, and later sections describe approved additions |
| What is still pending? | [Canonical backlog](backlog.md), including links to planned OpenSpec changes |
| What implemented behavior is required? | [Canonical OpenSpec capabilities](../openspec/specs); source and tests establish what actually runs when a discrepancy is found |
| What work is being proposed or completed? | [Active OpenSpec changes](../openspec/changes); task completion and archive status are distinct |
| What are the frontend conventions? | [Frontend guide](ai/frontend-agent-guide.md), [UI guidelines](ui-guidelines.md), [design tokens](design-tokens.md), and [UX spec](design/ui-refactor-mvp-ux-spec.md) |
| How was the management component migration verified? | [Management component consistency](verification/management-component-consistency.md): F1–F7, all 14 routes, native exceptions, independent stage reviews and final local gates |
| What versions and checks are authoritative? | [Root manifest](../package.json), package manifests, lockfile, TypeScript configurations, and [CI workflow](../.github/workflows/ci.yml) |
| How is provider security exercised against real runtimes and installed apps? | [Provider security acceptance](verification/provider-security.md), a dated matrix with commands, prerequisites, results, and physical verification limits |
| What was physically or interactively verified? | Dated records under [verification](verification), especially [desktop](verification/windows-desktop-tray-runtime.md), [shared surfaces](verification/shared-desktop-overlay.md), and [Screen Effects](verification/screen-effects.md) |

## Implemented Repository Shape

- `packages/core` owns browser-compatible contracts, schemas, matching, queues, media timing, and shared domain rules; `packages/test-support` owns reusable test helpers.
- `apps/server` owns Fastify, SQLite repositories and migrations, secrets, providers, assets, diagnostics, and runtime composition.
- `apps/web` serves route-based management, `/operator`, browser-source overlays, and the private desktop-overlay renderer.
- `apps/desktop` owns the Electron service process, management window, tray, private audio player, and private desktop overlay. Windows x64 runnable-folder packaging and short-lived verified CI artifacts are implemented.
- Alerts, Screen Effects, Timers, and Music are registered modules. Music is disabled by default and uses an authenticated selected source with server-authoritative snapshots. Alerts and Screen Effects retain independent playback queues; Timers use an independent server-authoritative lifecycle. Shared surfaces and global safety controls coordinate their outputs without combining their schedulers.
- Screen Effects supports one active set, unified weighted variants, draft variant removal, media-based duration, fades, and percentage media gain. Per-effect cooldown, default/weighted authoring kinds, and Screen Effect animation controls are no longer current authoring features.
- Registered local media uses version-pinned bounded streams for management previews, browser sources and private desktop recipients. The [local media specification](../openspec/specs/local-media-streaming/spec.md) defines integrity, ownership and resource bounds; [streaming acceptance](../openspec/changes/archive/2026-10-05-stream-local-media/final-acceptance.md) records validation and measurement limits for the change.

Installers, signing, automatic updates, non-Windows desktop delivery, LAN mode, Docker product delivery, and cloud hosting remain outside current delivery. Playwright's Docker test infrastructure is separate from product delivery.

## Active Change Reconciliation

The October 5, 2026 UTC reconciliation archived 21 completed changes under [the change archive](../openspec/changes/archive), using the `2026-10-05-` prefix. Before archival, canonical requirements were synchronized for automatic local-output rebinding, persistent event timers, repository error provenance, and the compact Operator panel. Other completed changes were already synchronized; newer timing, streaming, variant-removal and menu requirements were preserved rather than overwritten by older deltas. Historical acceptance limits remain with their archived records.

Six changes remain active:

| Change | Remaining work |
| --- | --- |
| [add-main-branch-changelog](../openspec/changes/add-main-branch-changelog/tasks.md) | Unimplemented proposal, 22 unchecked tasks; no root changelog or enforcing workflow |
| [add-video-shoutout-overlay-module](../openspec/changes/add-video-shoutout-overlay-module/tasks.md) | Unimplemented proposal, 23 unchecked tasks; no registered video-shoutout module |
| [add-custom-data-overlays](../openspec/changes/add-custom-data-overlays/proposal.md) | Slice 1 of 4 for data overlays: values, goals, reset groups, canvases, outputs and Operator controls; 21 unchecked tasks, awaiting approval |
| [add-data-overlay-event-rules](../openspec/changes/add-data-overlay-event-rules/proposal.md) | Slice 2: data rules as a central event bus consumer, plus Streamer.bot globals; 19 unchecked tasks; depends on slice 1 and the bus change |
| [add-twitch-overlay-data](../openspec/changes/add-twitch-overlay-data/proposal.md) | Slice 3: Twitch follower total and Creator Goals; 11 unchecked tasks; depends on slice 1 |
| [add-data-overlay-templates](../openspec/changes/add-data-overlay-templates/proposal.md) | Slice 4: canvas templates and starters; 10 unchecked tasks; depends on slice 1 |

Persistent event timer recovery and correction requirements are now in [the canonical capability](../openspec/specs/persistent-event-timers/spec.md). The base Timer change is now [archived](../openspec/changes/archive/2026-10-05-add-timer-overlay-module/tasks.md) after the [focused packaged output/cue matrix](verification/timers.md#focused-packaged-timer-output-acceptance-2026-10-05) passed. Its base capabilities are synchronized into [Timer overlay](../openspec/specs/timer-overlay-module/spec.md) and [Timer automation](../openspec/specs/timer-automation-api/spec.md) specifications; the original idle-on-restart wording was reconciled with implemented paused recovery. Physical HTTP-button testing was user-confirmed, and Stream Deck plugin/profile certification remains outside Stream Jams scope.

The Music change is now [archived](../openspec/changes/archive/2026-10-05-add-music-widget-module/tasks.md) after completed automated checks and user-confirmed physical acceptance, including the artwork/responsiveness and flicker corrections. Its canonical source, widget and snapping requirements are synchronized. The [dated delivery record](verification/music-widget-module.md) and [scenario trace](verification/music-widget-scenarios.md) distinguish user observations from disposable-fixture checks; physical revocation of the user's registration was not performed. BL-028 is complete; Plex and Spotify remain separate BL-054 work. Archival does not merge or publish PR #154.

## Historical Records

Dated files under `superpowers/plans`, `superpowers/specs`, `verification`, and `audits`, archived OpenSpec changes, the July MVP review, and design captures preserve the evidence and decisions from their recorded date. Their test counts, host details, old labels, unchecked plan checklists, and pre-implementation descriptions do not establish current status. Do not rerun an old implementation plan solely because its original checklist is unchecked.

Keep historical measurements intact. Correct broken links, add a scope/date clarification when a snapshot appears current, and route current status to canonical specs and the backlog. A successful automated test does not refresh earlier physical-device, OBS, account, or native-shutdown acceptance evidence.
