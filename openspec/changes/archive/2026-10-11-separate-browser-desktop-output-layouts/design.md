## Context

The operator wants to position ordinary browser-source content in OBS without editing the Windows desktop overlay placement. The confirmed scope removes public test and unified browser sources, preserves landscape/horizontal and vertical layouts for Alerts, Music and Timers, uses stable content canvases for Music/Timers/Videos, and retains full-scene positioning for Alerts and Screen Effects. Timers also needs independently editable visual configuration like Music.

Current Music profiles contain full/compact appearance and full-scene alignment; applyMusicDesktopPlacement already applies custom placement only at the private desktop recipient. Timer profiles combine scene position, region size, orientation and capacity, while TimerStack calculates typography and styling internally. VideoBox uses one saved scene placement in browser, desktop and management previews. Output management still enumerates test and unified records even where module UI filters them out.

Applicable UX areas: module browser-source panels, Timers editor, Music appearance/desktop placement, Settings overlay surfaces, cross-cutting save/error/confirmation rules, and transparent overlay failures. This is a requested product-contract change; it does not enable deferred LAN, device or provider features. Existing unpublished Data overlays work is outside this branch and must be rebased/reconciled separately against this contract when delivered.

## Goals / Non-Goals

**Goals:** Browser placement is fixed locally; desktop coordinates and scale never change browser bounds or position. Content envelopes stay constant through ordinary playback changes. Existing desktop positions and visual defaults migrate without silent reset. Source panels expose only usable ordinary outputs and accurate OBS dimensions.

**Non-Goals:** No timer lifecycle changes, per-definition appearance overrides, arbitrary Timer CSS, additional timer animation system or new orientation profiles for Videos/Effects. Video playback is consolidated to one ordinary queue/player identity. Local editor previews remain non-dispatching visual tools, not alternative event outputs.

## Decisions

### Output-specific projection at the recipient boundary

Keep one normalized module content model and reusable renderer, with explicit browser-content versus desktop-scene presentation. Core projection/geometry helpers calculate validated local bounds. Server browser/private recipient adapters choose the presentation; React consumes the resulting typed projection. Browser clients cannot choose desktop access or gain management privileges. Add an explicit trusted recipient/presentation kind to the internal snapshot request instead of inferring it from public route scope. The desktop currently asks for internal unified snapshots under `desktop:primary`; public unified route removal must not break that path.

The server's composition contains versioned canvas metadata (kind, positive integer width/height, local origin/insets and configuration revision). The same pure geometry calculation supplies management source dimensions, initial HTTP composition, WebSocket initial/reconnect snapshots and saved-config refreshes, including disabled/empty modules. Metadata is independent of the presence of a playback projection. A newer saved revision replaces canvas and content geometry atomically; delayed older config snapshots cannot restore obsolete bounds. Timer clock updates, track polling and video progress do not manufacture new canvas revisions.

For content outputs, OverlaySurface bypasses its current target-profile fit/center transform: a CSS-pixel canvas is anchored at top-left, with fixed dimensions and no viewport-derived scaling. Extra OBS viewport area stays transparent; smaller viewports clip. Full-scene Alerts/Effects and desktop fitting retain their existing behavior. Management previews alone may uniformly scale the complete declared canvas to fit their editor; that preview scale is not saved. A wrong OBS viewport is diagnosed in management, never through visible production overlay text.

An OBS crop workaround would retain coupling and require manual maintenance. Duplicating renderers would cause appearance and timing drift. The chosen boundary reuses content, playback clocks and assets while separating geometry.

### Output inventory

| Module | Browser outputs | Browser geometry | Desktop geometry |
| --- | --- | --- | --- |
| Alerts | Landscape and Vertical | Existing full scene for that profile | Existing dynamic scene positioning |
| Music | Landscape and Vertical | Stable content envelope per profile | Saved desktop position/scale, using selected content appearance |
| Timers | Landscape and Vertical | Stable configured stack envelope per profile | Saved desktop region/position and separate scale |
| Videos | One ordinary output | Stable video-plus-caption envelope | Existing saved scene placement |
| Screen Effects | One ordinary output | Existing full scene | Existing dynamic scene positioning |

Horizontal and vertical name layout variants, not a requirement that compact browser canvases have a 16:9 or 9:16 ratio. Keep existing landscape profile identifiers internally to avoid needless URL/config churn.

### Stable browser bounds

Content renders at a fixed local origin, with only deliberate padding reserved for shadows/borders. Desktop x/y/alignment/z-order/render scale are excluded. Bounds derive from saved visual geometry, not DOM measurements, current text, timer count or playback state. OBS uses the width/height shown next to the URL; the app does not claim it can resize an OBS source automatically.

Music reserves the union of configured full and compact view envelopes, including supported effects. Both views share the same local anchor. Track changes, empty artwork, idle compact/hide and reconnects never resize the source. Timer bounds reserve all configured slots plus the existing overflow badge footprint even when no timer or overflow is visible. Videos reserves the configured picture and caption area, with a fixed picture frame/aspect-fit policy; caption absence and video changes do not resize it. Empty/disabled output remains transparent with the same canvas dimensions. Saved appearance/size/capacity changes can change recommended dimensions; the UI identifies the OBS update required.

Preserve validated Music CSS support and its style contract. Put the output canvas and placement wrappers outside the CSS override scope. Custom CSS may still affect internal components as currently permitted; it cannot resize/translate the outer canvas or change desktop authority. Arbitrary CSS overflow outside the declared envelope is clipped. For native shadow padding use a deterministic per-side extent of `max(0, ceil(2 * blur + spread +/- offset))`, then take the maximum extent across full and compact states; transparent shadows contribute zero. Supported border geometry is border-box. The policy intentionally bounds the visual envelope rather than trying to measure an infinite blur tail. Preserve the existing rule that CSS overriding native geometry disables native desktop positioning controls; do not remove that guard in this change.

Both Music views use the same top-left content anchor offset by the envelope's maximum left/top inset; the envelope reserves maximum native width/height plus shared insets. Timer label text remains single-line ellipsized and countdown right-aligned; it is not changed to wrapping. Overflow text uses a fixed bounded badge with tabular digits and abbreviated large counts, so count magnitude cannot change bounds. Videos retains the existing 16:9 frame calculation and fixed two-line caption reserve from videosPlacementGeometry; do not change its aspect-fit behavior. Notice/no-clip presentation uses the same envelope. Bounds are finite and positive; preserve existing per-module size limits, round the final envelope outward once, and reject invalid compound settings rather than clipping required native content silently.

### Timer appearance and placement

Each landscape/vertical profile independently owns card width/height, stack orientation, visible capacity, gap, padding, corner radius, border width/color, background opacity/color, label/value font preset/size/weight/color, icon size, and running/paused/completed accents. Reuse existing typed font/asset/color controls and preset vocabulary where compatible. Offer current appearance as the default preset and a preview with representative running, paused, completed and overflow content. Keep sizes bounded and labels ellipsized/wrapped within declared bounds.

These are module profile settings shared by browser and desktop content, not separate timer definitions or separately running timers. A change to vertical appearance does not mutate landscape appearance. Desktop placement owns scene x/y/z-order and scale; moving or scaling it cannot resize/reposition browser content. Avoid an independent second appearance copy for desktop.

Migrate existing timer region geometry into slot/card geometry and desktop placement, preserving orientation/capacity and apparent existing desktop size. Preserve the renderer's current visual defaults, including size-derived typography, by materializing equivalent initial profile values. Retain fractional slot geometry from region width/height divided by capacity; do not round each card independently. Calculate the old TimerStack edge-fit scale once from the saved x/y, region, orientation and reserved overflow footprint, and materialize it in desktop placement. It is not baked into browser card sizes or fonts. The desktop then fits the same envelope using its independent scale/position; moving it never modifies the browser geometry. Cover right/bottom edges and both stack orientations with or without visible overflow. No running timer identity, deadline, recovery state or event rule changes.

Desktop uses the landscape appearance as it does today; the vertical profile remains a browser/editor alternative. Preserve each saved profile's old scene placement as desktop-only data so migration does not discard it, but this change does not add portrait desktop rendering. Profile switching in the editor preserves both drafts; saving is atomic across config, and restoring defaults changes only the explicitly selected profile. Timer fonts initially use existing bundled presets; custom font asset selection is outside this change, avoiding an unplanned new asset lifecycle.

Videos separates local content width/height from desktop x/y/scale. Migration preserves its old box width/height as content geometry and old x/y with scale 1 as desktop placement. Desktop drag/rescale updates only desktop fields; content-size controls explicitly affect both visual renderings and the recommended browser size. New desktop placement validates the scaled footprint against the 1920 x 1080 scene. For existing Music, stored desktop positions/scales and desktop fallback alignment are preserved. Full-scene alignment no longer shifts browser Music content.

### Remove public test/unified outputs without widening capabilities

Stop enumerating, creating, regenerating or copying those outputs. Remove unified Settings surface controls and public route registration. Revoke/deactivate their persisted keys; do not reuse them as ordinary module keys or redirect them into live routes. Apply the same rejection to shell, media/artwork, composition and WebSocket access. Retain overlay-versus-management authorization, key redaction and encrypted management recovery.

Ordinary existing live module routes/keys remain valid, including landscape/vertical profile scoping. Keep `/live/` in these existing paths; removing a public choice does not require breaking working ordinary URLs. Profileless legacy live keys for Alerts/Music/Timers are retained only as hidden compatibility outputs bound to their existing legacy behavior (Music/Timers resolve landscape, Alerts retains legacy eligibility); no new profileless key is offered for those modules. Do not relabel a profileless key as a landscape key: exact profile-scope verification remains authoritative. New ordinary APIs reject unsupported scope/purpose/profile combinations before creating secrets. Existing legacy records can be revoked through management without appearing as new setup choices.

### Manual events use the shared bus and ordinary outputs

User clarification: there is no separate test event destination, queue or player. A test is a manually submitted event which did not originate at a subscribed source. It enters the shared bus, runs through applicable consumers and ordinary admission rules, and can affect the same browser, desktop and selected audio outputs as a subscribed event. Whether OBS is streaming is not an application routing condition. Existing explicit live-impact confirmations stay where already required; do not invent OBS detection or a second rehearsal mode.

Separate event provenance from output identity. The bus currently restricts sourceKind to Twitch/Streamer.bot and kind to canonical/external. Introduce a validated manual event variant with sourceKind `manual`, null sourceRegistrationId and null cross-source correlationKey. Do not extend provider-registration types to pretend Manual is a subscribed provider. Retain the intended canonical/external selector identity or explicit module test action as validated data separate from provenance. Normal consumers see the same simulated event identity and apply normal matching; explicit 'test this alert/effect' actions carry a typed target and cannot be mistaken for a general subscribed event. A source-event simulation may legitimately trigger Alerts, Effects, Timers and Videos together. Payload cannot choose recipients, bypass matching/admission or carry arbitrary file/media commands.

Management submissions use existing bearer/origin/CSRF/rate-limit protection. Scoped automation uses its existing grants and bounded typed submission adapter; it cannot acquire permission to inject arbitrary event types. The server assigns manual IDs/timestamps and records original submission channel for diagnostics and autoplay policy. No raw provider credentials, links or payloads appear in bus activity logs. Manual events do not require a connected provider and cannot correlate/merge with real Twitch occurrences. A deliberate repeated click is a new event; a duplicate delivery of the same accepted submission ID is not. Consumers retain journal ordering, independent outcomes, replay-age policy and their existing retry limits. Do not automatically retry uncertain state-changing requests or add a second direct enqueue after publishing.

Dispatching management test actions and direct video requests must be adapted to publish once into the bus. Videos' consumer then calls the existing validated intake exactly once for that accepted submission. Preserve module enablement, allowlist, max-length holds, queue limit, autoplay policy and observed-revision/item guards. Bus acceptance and downstream admission are distinct: surface the module's accepted item or rejection/outcome with its bus identity instead of reporting a queued item solely because journaling succeeded. Use a persistent bus/submission identity receipt or transactionally coupled queue admission/checkpoint for video requests so a crash between enqueue and consumer acknowledgement cannot enqueue them twice. Metadata enrichment remains asynchronous after admission. Queue commands such as pause/skip/clear are commands, not synthetic source events, and retain their existing guarded APIs.

Music and Timer editor examples and asset previews stay local production-renderer previews: inspecting a draft does not publish an event, start timers or fabricate provider playback. A UI action explicitly labelled Test/Send event is the dispatch action and uses the ordinary bus/output path. No new management video-preview transport, polling session, provider player, output URL or auth mechanism is needed.

Production output failure behavior is also shared: a manual event cannot expose the existing test-only 'Enable alert audio' prompt on the stream. Fail transparent, report the bounded failure in management, correct OBS audio setup and submit a new event explicitly. Local editor audio-activation controls remain local. Diagnostics labels manual/subscribed origin rather than a live/test destination. Update the central bus journal/schema validators and activity DTOs for manual provenance while preserving existing provider-only registration types, old journal rows and consumer cursor identities.

### Consolidate Videos playback and retire purpose selection

Remove the Live/Test queue selector, separate test queue state, test primary player, purpose-based mirror receiver selection and purpose controls in source mappings. One ordinary queue owns every subscribed or manually submitted video request. Every output follows the same active item, pause/seek state, mirror session and server clock. With desktop available there is one primary player mirrored to recipients; service-only fallback remains one player per connected browser source as today. Geometry changes never restart those players or reconnect healthy WebRTC peers. Audio remains controlled by selected destinations and existing mute policy.

Keep existing `/videos/live/...` and `/automation/v1/videos/live/...` routes as compatibility spellings for the sole queue. Retire `/test/...` paths with an explicit migration error, rather than silently making formerly isolated callers affect ordinary playback. New typed submission/config contracts have no output-purpose selector. Existing persisted source/reward mappings targeting test normalize to the ordinary destination with an upgrade disclosure; stored raw templates or external clients must be updated and legacy purpose=test payloads are rejected with guidance. Existing live clients keep their grants and validation, and obtain a fresh queue revision after upgrade. Update documentation, Streamer.bot examples, management/Operator contracts, core schemas, primary host IPC and mirrored receiver identity together.

Migrate old test items without silently playing or deleting them. Preserve the existing live queue's item order and statuses. Append old pending/active test items in their old order as held-for-review ordinary entries with autoplay false; preserve IDs, metadata and original submission history. Their explicit Play action is the release gate, independent of length holds. Preserve completed/failed test history as historical ordinary entries with migration provenance, not a second queue. Stop obsolete test primary ownership during upgrade/restart, clear its run/gap state and invalidate old queue revisions/receivers. Startup still requires the normal explicit play action. Preflight capacity/ID conflicts and block with actionable guidance rather than discard entries or exceed queue bounds. Portable backups follow existing runtime exclusion rules; migration of the local database is the operation that preserves queued/history rows. Retain the pre-upgrade backup for rollback.

### Desktop composition survives public unified removal

`SqliteSurfaceRepository` currently derives membership from `supportedOutputs.includes("unified")`; replace that inference with an explicit registered desktop/shared-composition capability before removing public unified support. Keep the internal multi-module composition and private transport as needed; do not globally delete the internal unified discriminator. Preserve desktop module rows, order, visibility, opacity, display binding/follow settings, occurrence identity, media ownership and audio independence. Remove persisted `unified-browser` rows and reject future public unified surface updates. Registry defaults and restart reconciliation must not recreate them. Layer reorder/visibility changes continue to preserve active timing and private media leases.

### Migration and source UI

Version and validate configuration migrations for Timers and Videos as needed. Seed independent visual defaults from existing settings; move desktop position into desktop-only fields. Keep asset IDs and Music appearance/CSS intact. Preserve existing horizontal/vertical layout selection and normal drafts/save behavior.

Module panels show each remaining source, ready/setup status, exact width and height and copy/reveal/regenerate controls. Content-size modules explain that OBS positions the source and desktop placement affects only desktop. Alerts/Effects explain full-scene geometry. After migration show that test/unified OBS sources must be removed and ordinary Music/Timers/Videos sources need their width/height updated; do not expose revoked URLs or secrets in notices.

## Risks / Trade-offs

- Existing OBS source dimensions cannot be changed by the app → retain working ordinary URLs, show precise replacement dimensions and update guidance.
- Migrated Timer styles could change visually → compare pre/post default and saved profiles, including desktop edge scaling and overflow.
- CSS and shadows can exceed bounds → reserve supported effects deterministically, clip unsupported overflow and test long text/custom CSS.
- Manual event injection can trigger multiple ordinary consumers → use authenticated typed events, truthful provenance, existing admission rules and explicit dispatch controls; keep local editor previews non-dispatching.
- The older Data worktree adds another module → this change defines behavior only for modules currently on main; Data delivery must adopt the new inventory and explicitly decide content versus full-scene geometry before merge.

## Migration Plan

Append a new SQLite migration; do not edit historical migrations or reuse the abandoned restore snapshot. Build a pure typed config upgrader used by database upgrade and supported legacy backup preflight. Validate the entire upgraded candidate before persistence; invalid configs fail startup/restore with bounded management diagnostics rather than silently resetting layout. The migration deactivates removed keys and removes only unified-browser surfaces transactionally; retain the desktop row and ordinary key IDs/secret references. On runtime restore, retire affected sockets/mirror recipients before delivering the new state. No partially migrated configuration is published.

Keep a pre-upgrade configuration/database backup including SQLite WAL companions. Ordinary keys survive an in-place database upgrade, but portable backup restore follows the app's existing fresh-key regeneration and credential exclusion policy; it must not preserve source-machine route secrets. Normalize old `overlayOutputs` metadata and `overlay_surfaces` before validation/key regeneration: discard test/unified entries, migrate Timer/Video config, retain valid ordinary profile identities and disclose removed outputs in preflight. New exports omit retired outputs/surfaces. Invalid legacy records are blocked, not guessed. Restart and repeated import cannot resurrect retired keys/surfaces. Portable desktop display ID/label/follow consent are still cleared and desktop remains disabled/unbound; local upgrade preserves them. Restore rollback reinstates the destination's previous config, credentials and maintenance state without starting queues or timers.

A rollback uses the prior app with its pre-upgrade backup rather than interpreting the new schema in old code. No real user profile is used during automated acceptance.

## Verification And Review

Exercise same saved content in browser and private desktop output; move/scale desktop placement and assert browser pixels, bounds and local coordinates remain identical. Cover both profiles, long/short/empty content, Music full/compact/hide, all timer states/counts/overflow, video caption/aspect variants, and full-scene dynamic Alerts/Effects. Check removed keys/routes/API requests and persisted legacy profiles fail closed. Verify ordinary keys and management preview/test behavior after restart and backup/restore.

Run affected core/server/web/desktop unit checks, strict typecheck, lint, build, OpenSpec strict validation, updated Storybook interaction/accessibility/console gates and rebuilt disposable Playwright output workflows. Any physical OBS or desktop acceptance is reported separately from automated evidence. One independent review is sufficient before delivery.


## Performance Expectations And Acceptance

These are code-grounded expectations, not measured improvements. Content-sized OBS viewports can reduce transparent pixel raster/compositing and browser texture allocation relative to a full-scene viewport, but decoder cost, video provider capture size and WebRTC encoding are unchanged. Benefits depend on actual viewport dimensions, effects and GPU behavior. Stable envelopes deliberately reserve empty pixels for Music view changes, timer capacity and captions to avoid layout/resize churn. Desktop still renders the full scene.

Removing connected test/unified sources reduces recipient fan-out, compositor surfaces and duplicate browser renderers; an unused source entry alone costs little. Consolidating Videos removes the possible second test primary/mirror session. Timer appearance uses existing CSS/renderer paths and does not add animation loops. Cache pure geometry by saved config revision and refresh canvas metadata only on config changes, while keeping current playback timing and event-driven updates. Do not introduce DOM-measurement loops, per-frame server geometry work or per-timer polling beyond the existing cadence.

Manual bus submission adds one bounded journal/dispatch operation and consumer outcome recording per accepted event compared with former direct test enqueue. Use the existing journal retention/size bounds, payload limits, duplicate handling, per-consumer sequencing and asynchronous metadata lookup; never double-publish provider events already on the bus. No new background preview service/polling transport is added.

Before delivery compare the same saved fixture/load before and after: idle CPU/memory and message rate; maximum Timer stack and frequent text/track changes; Video mirrored/fallback playback CPU/GPU/frame pacing and audio; mixed subscribed/manual burst admission latency and duplicate counts. Use equal output counts/resolutions for regression comparisons, then separately measure expected savings at the new recommended OBS dimensions. Record environment and observed values; investigate material regressions. Verify no extra provider player, mirror encoder, per-frame canvas updates or unbounded journal/receiver memory. Native OBS/GPU observations are separate from automated browser evidence and no numeric speedup is promised before measurement.
## Open Questions

The user has resolved the Video test destination: manual events enter the shared bus and use the ordinary queue/output. No separate test output, queue or management preview is retained. The user approved this specification on 2026-10-10. The [implementation plan](../../../../docs/superpowers/plans/2026-10-10-browser-desktop-output-layouts.md) defines delivery slices and dependencies; implementation is authorized and in progress with per-slice review/commit/push.

## Code Contract Map And Review Evidence

| Concern | Existing owners | Required integration |
| --- | --- | --- |
| Public authorization and identity | `http/routes/overlays.ts`, `overlay-route-params.ts`, `assets.ts`, `websocket/overlay-gateway.ts`, core overlay key schemas | Retire public scope/purpose choices; preserve exact profile authorization and private composition |
| Canvas delivery | core `overlay-modules/overlay-composition-service.ts`, `overlays/schemas.ts`, web `OverlayApp.tsx`, `OverlaySurface.tsx` | Initial/reconnect and refresh metadata even while empty; fixed browser canvas bypasses scene fitting |
| Timer geometry | core `timers/projection.ts`, web `TimerStack.tsx`, `TimerStackEditor.tsx`, server `timer-runtime-coordinator.ts` | Independent appearance/placement; migration includes old edge scale and fractional slots |
| Music geometry | core `music/projection.ts`, server `music-output-runtime.ts`, web `MusicWidget.tsx` | Preserve desktop-only placement and provider epoch; fixed browser view envelope |
| Video playback | server `videos-runtime.ts`, `video-mirror-director.ts`, runtime `syncVideoOutputs`, web `VideosOverlay.tsx` | Geometry differs by recipient; consolidate queue purpose while retaining single-primary ownership, item guards and server-owned receiver identity |
| Surface persistence | core `surface-configuration.ts`, server `sqlite-surface-repository.ts`, private desktop snapshot sink | Explicit desktop capability and retirement of public unified rows |
| Portable state | `configuration-backup-service.ts`, `sqlite-configuration-snapshot-repository.ts` | Upgrade legacy config before validation; filter retired metadata before fresh-key generation |

Independent review identified five gaps (test-video delivery, desktop registry coupling, legacy restore resurrection, missing canonical deltas, Timer edge-scale migration). The revised design and deltas address each. The later user clarification supersedes the private-preview proposal with one ordinary queue and manual bus events. Spec review does not count as runtime verification.
