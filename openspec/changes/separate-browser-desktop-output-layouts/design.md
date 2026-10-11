## Context

The operator wants to position ordinary browser-source content in OBS without editing the Windows desktop overlay placement. The confirmed scope removes public test and unified browser sources, preserves landscape/horizontal and vertical layouts for Alerts, Music and Timers, uses stable content canvases for Music/Timers/Videos, and retains full-scene positioning for Alerts and Screen Effects. Timers also needs independently editable visual configuration like Music.

Current Music profiles contain full/compact appearance and full-scene alignment; applyMusicDesktopPlacement already applies custom placement only at the private desktop recipient. Timer profiles combine scene position, region size, orientation and capacity, while TimerStack calculates typography and styling internally. VideoBox uses one saved scene placement in browser, desktop and management previews. Output management still enumerates test and unified records even where module UI filters them out.

Applicable UX areas: module browser-source panels, Timers editor, Music appearance/desktop placement, Settings overlay surfaces, cross-cutting save/error/confirmation rules, and transparent overlay failures. This is a requested product-contract change; it does not enable deferred LAN, device or provider features. Existing unpublished Data overlays work is outside this branch and must be rebased/reconciled separately against this contract when delivered.

## Goals / Non-Goals

**Goals:** Browser placement is fixed locally; desktop coordinates and scale never change browser bounds or position. Content envelopes stay constant through ordinary playback changes. Existing desktop positions and visual defaults migrate without silent reset. Source panels expose only usable ordinary outputs and accurate OBS dimensions.

**Non-Goals:** No timer lifecycle changes, per-definition appearance overrides, arbitrary Timer CSS, additional timer animation system, new orientation profiles for Videos/Effects, or changes to audio/provider/queue ownership. Internal preview/test identities are not indiscriminately deleted merely because public test URLs are removed.

## Decisions

### Output-specific projection at the recipient boundary

Keep one normalized module content model and reusable renderer, with explicit browser-content versus desktop-scene presentation. Core projection/geometry helpers calculate validated local bounds. Server browser/private recipient adapters choose the presentation; React consumes the resulting typed projection. Browser clients cannot choose desktop access or gain management privileges.

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

Preserve validated Music CSS support, but it must not reposition the root output using desktop coordinates or define the canvas size. Arbitrary CSS overflow outside the declared envelope is clipped. Shadows from supported visual controls are included; unbounded CSS effects are not inferred through DOM measurement.

### Timer appearance and placement

Each landscape/vertical profile independently owns card width/height, stack orientation, visible capacity, gap, padding, corner radius, border width/color, background opacity/color, label/value font preset/size/weight/color, icon size, and running/paused/completed accents. Reuse existing typed font/asset/color controls and preset vocabulary where compatible. Offer current appearance as the default preset and a preview with representative running, paused, completed and overflow content. Keep sizes bounded and labels ellipsized/wrapped within declared bounds.

These are module profile settings shared by browser and desktop content, not separate timer definitions or separately running timers. A change to vertical appearance does not mutate landscape appearance. Desktop placement owns scene x/y/z-order and scale; moving or scaling it cannot resize/reposition browser content. Avoid an independent second appearance copy for desktop.

Migrate existing timer region geometry into slot/card geometry and desktop placement, preserving orientation/capacity and apparent existing desktop size. Preserve the renderer's current visual defaults, including size-derived typography, by materializing equivalent initial profile values. No running timer identity, deadline, recovery state or event rule changes.

### Remove public test/unified outputs without widening capabilities

Stop enumerating, creating, regenerating or copying those outputs. Remove unified Settings surface controls and public route registration. Revoke/deactivate their persisted keys; do not reuse them as ordinary module keys or redirect them into live routes. Apply the same rejection to shell, media/artwork, composition and WebSocket access. Retain overlay-versus-management authorization, key redaction and encrypted management recovery.

Ordinary existing live module routes/keys remain valid, including landscape/vertical profile scoping. The internal URL path may retain the word live; removing a public choice does not require breaking working ordinary URLs. Management tests use an explicit ordinary-output recipient path while preserving existing internal test queue/history semantics. Verify that preview actions remain isolated where intended and do not accidentally consume live queues or duplicate desktop/browser playback or audio.

### Migration and source UI

Version and validate configuration migrations for Timers and Videos as needed. Seed independent visual defaults from existing settings; move desktop position into desktop-only fields. Keep asset IDs and Music appearance/CSS intact. Preserve existing horizontal/vertical layout selection and normal drafts/save behavior.

Module panels show each remaining source, ready/setup status, exact width and height and copy/reveal/regenerate controls. Content-size modules explain that OBS positions the source and desktop placement affects only desktop. Alerts/Effects explain full-scene geometry. After migration show that test/unified OBS sources must be removed and ordinary Music/Timers/Videos sources need their width/height updated; do not expose revoked URLs or secrets in notices.

## Risks / Trade-offs

- Existing OBS source dimensions cannot be changed by the app → retain working ordinary URLs, show precise replacement dimensions and update guidance.
- Migrated Timer styles could change visually → compare pre/post default and saved profiles, including desktop edge scaling and overflow.
- CSS and shadows can exceed bounds → reserve supported effects deterministically, clip unsupported overflow and test long text/custom CSS.
- Internal test identities also drive queue/media ownership → remove public output choices independently and add negative delivery/ownership tests.
- The older Data worktree adds another module → this change defines behavior only for modules currently on main; Data delivery must adopt the new inventory and explicitly decide content versus full-scene geometry before merge.

## Migration Plan

Build typed migrations and disposable upgrade/backup/restore coverage before switching production projections. Keep a pre-upgrade configuration/database backup including SQLite WAL companions. Existing ordinary keys survive; test/unified keys become inactive. A rollback uses the prior app with its pre-upgrade backup rather than interpreting the new schema in old code. No real user profile is used during automated acceptance.

## Verification And Review

Exercise same saved content in browser and private desktop output; move/scale desktop placement and assert browser pixels, bounds and local coordinates remain identical. Cover both profiles, long/short/empty content, Music full/compact/hide, all timer states/counts/overflow, video caption/aspect variants, and full-scene dynamic Alerts/Effects. Check removed keys/routes/API requests and persisted legacy profiles fail closed. Verify ordinary keys and management preview/test behavior after restart and backup/restore.

Run affected core/server/web/desktop unit checks, strict typecheck, lint, build, OpenSpec strict validation, updated Storybook interaction/accessibility/console gates and rebuilt disposable Playwright output workflows. Any physical OBS or desktop acceptance is reported separately from automated evidence. One independent review is sufficient before delivery.

## Open Questions

No unresolved product choice is required to write this design. The proposed Timer appearance scope and migration guidance require written-spec review before implementation. Detailed task sequencing follows that review.
