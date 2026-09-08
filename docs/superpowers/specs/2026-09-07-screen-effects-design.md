# Screen Effects and shared outputs: approved design

Date: 2026-09-07. Design and interaction direction approved in conversation; implementation has not started. Repository baseline: `61642ae6dbfacbb51809ab26c737ccff92b60a42` (merged Windows desktop runtime and alert audio routing).

## Delivery sequence

| Slice | Deliverable | Dependency |
| --- | --- | --- |
| [Shared desktop overlay](../../../openspec/changes/add-shared-desktop-overlay-surface/proposal.md) | Shared Windows visual recipient and per-surface module layers, demonstrated with Alerts | Merged desktop runtime |
| [Routed video audio](../../../openspec/changes/add-routed-video-audio-controls/proposal.md) | User-controlled soundtracks in Alerts and reusable media-audio controls | Merged audio routing; can be tested independently of slice 1 |
| [Screen Effects](../../../openspec/changes/add-screen-effects-module/proposal.md) | Effect authoring, event triggers, independent queue, merged Operator | Slices 1 and 2 implemented and specs synced |

Each slice has its own design, normative scenarios, implementation tasks, and acceptance gates. Do not describe downstream artifact readiness as dependency completion. Work one independently reviewable implementation slice at a time.

The [implementation-plan index](../plans/2026-09-08-screen-effects-implementation.md) links three detailed execution plans with file targets, interfaces, red/green regression steps, and acceptance evidence. Planning has not started production implementation.

## Product boundaries

- Local-first, Windows first. Cloud deployment is a possible later direction, not part of this build. Cross-platform desktop support is deferred in the canonical backlog.
- No marketplace, paid-content infrastructure, viewer uploads, remote media fetching, arbitrary scripts, third-party plugin loader, graphics injection, or automatic manipulation of games.
- OBS continues to receive browser sources. Desktop output is an additional recipient, not OBS automation.
- One enabled desktop window on one explicitly selected monitor. Windowed/borderless applications are the supported target; exclusive full-screen compatibility is not promised.
- Existing video-shoutout work remains a separate unimplemented proposal. Example music layers in the mockup do not authorize a music module.

## Shared visual surface

The existing desktop process owns a transparent, frameless, click-through, non-focusable, topmost window, separate from management and the device-audio player. The surface remains ready while management is hidden. It does not appear as a normal taskbar window or steal focus when content starts. It has persisted enablement, monitor identity, and opacity; first use requires explicit enablement and monitor selection. A missing monitor hides output and surfaces an actionable management warning; it never chooses another monitor by name, position, or primary-display fallback.

The local service composes normalized module instructions for a first-class desktop recipient. Recipient identity includes surface, module, occurrence, and renderer generation. Desktop readiness and acknowledgements are independent of OBS clients. CLI startup preserves desktop settings but reports that recipient unavailable. Device audio does not depend on either visual recipient.

In v1 the desktop uses the existing Landscape logical canvas, uniformly fitted to the selected monitor without stretching. Alerts retain active-set, enabled-profile, and review safeguards; choosing desktop output never enables an unreviewed profile. Later display-resolution changes recalculate bounds and scale without changing the monitor identity.

Each desktop or unified OBS surface owns ordered module rows with visibility independent of module-wide enablement. Top row is topmost. New modules join hidden at the bottom. Migration preserves existing unified OBS module membership and paint order. CSS stacking isolation keeps internal module z-index below higher module layers. Reordering does not restart playback; hiding removes only that surface's visual contribution and does not mute audio. Re-showing may render the remainder of an active occurrence at its current offset, never restart or replay it. Module-specific OBS sources are unaffected.

## Audio belongs to the item

There is no new top-level Shared audio product page and no new global mixer. The mockup's page demonstrated reusable controls that belong inside each Alert or Screen Effect editor. Named device routes remain in the existing Audio settings.

Each alert default/variation and each effect variant has one explicit audio output selection: `browserSource` plus `deviceRouteIds`. No per-layer destinations or special "both" enum. Each enabled audio layer has its own volume; the item-wide destination selection applies to every such layer. Visual destinations and audio destinations are independent.

Each video layer has `Play embedded audio` and a volume control. The approved mockup defaults new layers on; old saved alert video layers remain off when migrated. Adding a separate sound does not silently change the video setting. Both sources can play together, with a nonblocking notice. This applies equally to Alerts and Screen Effects. Editor drafts, Undo/Redo, explicit Save, live-impact confirmation, duplication, and variation-copy behavior retain existing safeguards.

Visual video elements stay internally muted. Enabled soundtracks are resolved once as media-audio instructions and use the same browser/device routing path as explicit sounds. Keep the logical layer and occurrence identity to avoid a soundtrack copy per visual profile or desktop layer. Reuse route binding snapshots, same-device alias deduplication, fail-closed missing routes, authoritative mute, and bounded stop acknowledgement. OBS Desktop Audio or monitoring can independently recapture a selected device; routing to headphones is not a guarantee that OBS cannot hear it.

Synchronization is coordinated media timing, not sample-perfect clock synchronization across OBS and devices. Use one occurrence timing envelope and media offset. Late recipients seek to the current offset or fail closed; they do not start from zero or extend the occurrence. A short local video fixture with known audio/visual markers is a release gate before expanding beyond the existing uploaded-audio formats. No new decoder/extraction dependency is assumed.

## Screen Effects

An effect owns its ID, name, optional description/category, enabled state, validated event bindings, cooldown, priority, and default plus weighted variants. Each variant contains trusted local visual media and optional sound, or sound alone, plus duration, existing bounded layout/style/animation values and output selections. Start with one coordinated visual layer and one optional explicit audio layer per variant; video supplies its optional embedded soundtrack. This is not a general-purpose composition editor.

Use a Landscape logical layout and existing fixed output profiles; fit the effect canvas uniformly into each output. New effects are disabled until explicitly enabled. No asset plays while merely browsing, choosing a file/device, or changing a slider. Explicit Preview/Test is bounded, obeys safety state, and identifies affected output destinations.

Resolve a configured Twitch reward by stable broadcaster/reward ID, not its display title. Reuse normalized channel-point events from the active provider and the existing reward catalog. Streamer.bot custom triggers match configured source/type values within its existing subscribed external-event boundary. Never treat payload fields as commands, asset paths, routes, or executable content. The existing single-active-provider selection remains; no second provider connection is introduced. Adding effect bindings does not silently alter the provider or subscriptions.

Deduplicate within each module so one event can legitimately trigger both an Alert and an effect but redelivery cannot trigger either twice. Apply module/effect cooldowns and a bounded queue before admitting work. Select one weighted variant exactly once and snapshot its content, layer audio switches, volumes, route IDs, priority, and duration. A replay uses that same selected variant with a new occurrence ID and fresh device bindings; it does not reroll or use a later edited effect definition.

Screen Effects has one active occurrence across all of its outputs. Pending effects use priority descending and FIFO within equal priority; priority never interrupts an active effect. Alerts use their own independent queue and may be active simultaneously. Proposed implementation defaults are 100 pending effects, 25 recent occurrences per module, 10-second effect duration with a 1–120-second supported range, and priority 0. These are configurable/bounded implementation choices, not claims about competitor limits. Persist definitions and safety/configuration, not an active or pending playback backlog for automatic restart.

## Operator and failure behavior

The real `/operator` remains separate from management and does not gain the mockup's editing navigation. Its merged projection shows all current module occurrences, pending rows ordered by enqueue timestamp, and recent rows by completion timestamp, with stable tie-breaks and explicit module labels/positions. Display order is not global playback order.

Skip/remove/replay requests include module and occurrence identity; clearing targets a named module's pending queue. A stale skip must not skip that module's replacement occurrence. Global pause, mute, and DND remain one authoritative durable safety state. Per-module queue pause is separately durable. Global resume does not clear a module pause. Pause lets current items finish. DND preserves the current runtime's queue-advancement protection; pending work remains held rather than being silently discarded. The mockup's simplified DND rejection is not a change to the existing admission contract. Mute affects both modules' browser and device media audio; it does not cancel visual playback.

Ordinary completion or skip stops only the selected occurrence. Audio, desktop, and OBS recipient completion/failure settle independently, with a duration plus 5-second outer watchdog. Device stop acknowledgement retains its 2-second deadline. If the shared audio renderer must be destroyed to guarantee silence, every affected occurrence is explicitly failed at that destination; do not claim this exceptional host failure is isolated. Healthy browser/desktop visual recipients can finish and both queues release failed obligations.

Loss of desktop host, service ownership, monitor, or media decoding fails closed. A stale acknowledgement from an old generation cannot mutate a current occurrence. Interrupted media is never replayed automatically after host recreation or app restart. Production overlays show no diagnostic text; management and Operator retain last-known stale snapshots and actionable failures.

## Research basis

Reviewed 2026-09-07. Product claims are feature evidence, not evidence of internal implementation or guaranteed exclusive-full-screen compatibility.

| Official evidence | Useful feature direction | Deliberately excluded |
| --- | --- | --- |
| [HUDFX](https://www.hudfx.io/) describes videos/GIFs on OBS browser sources and a companion that puts them over gameplay; [setup](https://hudfx.io/setup) distinguishes the two outputs. | Dual visual recipients, coordinated surprise media, explicit tests | Twitch-extension storefront and content collection integration |
| [Blerp](https://blerp.com/streaming) describes reward-bound sounds, random sound groups, custom video/GIF assets, cooldowns, pause and live history. | Local variants, reward IDs, media plus audio, queue safety and operator history | Marketplace/library ingestion, viewer suggestions/uploads, monetization, TTS expansion |
| [Lumia overlays](https://lumiastream.com/services/overlays) describes browser sources, event-driven media, layered alerts and HUDFX; its [HUD guide](https://forum.lumiastream.com/t/what-is-a-lumia-stream-hud-and-how-to-use-it/579) describes an on-screen overlay and opacity. | Reusable module composition, visual layering and desktop opacity | Lighting, input automation, arbitrary custom HTML/JS, nested design-tool groups |

Lumia's [March 2023 support answer](https://forum.lumiastream.com/t/hud-not-working/741) recommends borderless mode for some games. It is dated support evidence, not proof of current universal behavior. HUDFX's marketing page does not establish how its companion handles true exclusive full-screen. Stream Jams therefore targets windowed/borderless output and does not infer a graphics-hook implementation from competitor marketing.

## Verification and decision gates

1. Shared surface: packaged Windows transparency, input pass-through/focus, explicit display disconnect/reconnect, mixed DPI, background playback and bounded shutdown. Run neutral 1080p and 1440p video fixtures while retaining `app.disableHardwareAcceleration()`; measure smoothness and process exit before committing to this renderer strategy.
2. Routed video audio: supported allowlisted video soundtracks on Browser Source, one explicit device, two distinct devices and combined paths; mute/skip/seek, no doubled sound, old-alert silent migration, duration/byte limits and missing codec behavior. Automated silent sinks do not replace physical endpoint checks.
3. Screen Effects: duplicate events, cooldowns, queue saturation, weighted snapshot/replay, both modules concurrently, stale targeted actions, shared-recipient failures, private IPC/HTTP boundaries, route references, backup/restore and new-module defaults. Include Storybook, Playwright and real OBS plus desktop verification.

Use the repo's frontend guide for implementation coverage and proportional gates. The approval mockup is interaction evidence, not production code, a pixel-for-pixel redesign, or proof of desktop/OBS/audio feasibility.
