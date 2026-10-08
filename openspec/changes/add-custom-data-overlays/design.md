## Context

The goal is an easy visual way to build custom counters, labels and goals. In review on 2026-10-08, Jams decided:

- Stream Jams listens to events from tools it already connects to, such as Streamer.bot, rather than accepting inbound connections from producers.
- All event sources feed one central event bus (BL-025, its own change), and data overlays are one of its consumers (slice 2).
- V1 values are integer and text only. Money and decimal come with a real money source.
- Twitch goals are treated as a list. A binding follows the active goal of a type by default (slice 3).
- Every module needs Operator tools, desktop overlay and browser source output, and a management UI (project convention).

The full review, with sources, is in [the 2026-10-08 review](../../../docs/design/2026-10-08-custom-data-overlays-review.md).

Existing pieces this change builds on:

- The module registry, and module enablement.
- Shared overlay surfaces. Each surface orders modules as layer rows (`shared-overlay-surfaces`).
- The Music layout editor (`apps/web/src/management/music/MusicLayoutEditor.tsx`), editor snapping, the asset picker and target profiles.
- The Operator app (`apps/web/src/operator/`) and its timer adjust controls, which are the model for value controls.
- Typed SQLite repositories, migrations and configuration backup.

Prior art reviewed:

- [Streamlabs sub goals](https://streamlabs.com/content-hub/post/how-to-set-up-sub-goal-widget): starting amount, target and styling.
- [StreamElements widget data](https://support.streamelements.com/hc/en-us/articles/10474424314642-Widget-Data-Overview): session data resets after a stream, goal data persists.
- [OBS text sources](https://obsproject.com/kb/text-sources) and [Streamlabs labels](https://support.streamlabs.com/hc/en-us/articles/217176088-Setting-up-Stream-Labels): text shown independently of the tool that produces it.

## Goals / Non-Goals

**Goals**

- Shared durable values with live Operator control.
- Goals over values.
- Reset groups.
- Several independent canvases.
- One formatter and projection for editor, preview, browser and desktop.
- Safe backup and restore.

**Non-goals**

- Event-driven updates, Twitch data and templates (later slices).
- Money and decimal values (BL-020 dependency).
- An inbound producer API (BL-064).
- Value-change animation (BL-065).
- Scheduled resets.
- Per-canvas layer rows on shared surfaces.
- Scripts, expressions, nested groups and design-tool composition (NP-001, NP-006).

## Decisions

### 1. Values live outside canvases

A value has:

- a stable opaque ID,
- a unique name (case-insensitive after trimming),
- a kind (`integer` or `text`),
- a reset default,
- its current content,
- a revision,
- timestamps,
- an optional reset group.

Renaming a value keeps every reference. Kinds are fixed: changing a value's kind means creating a new value and rebinding, so saved meanings never change silently.

- Integer content is a JavaScript safe integer. Operations that would leave the safe range are rejected.
- Text content is plain text of at most 2 KiB.

Values persist across restarts. Nothing in this slice resets a value implicitly: not a restart, hiding, disabling or deleting a canvas, or disabling the module.

Alternative considered: counters embedded in each widget. Rejected because two layouts showing "deaths" would each own a count, so reset and update ownership would be ambiguous.

### 2. Goals reference values

A goal references one integer value and has one of two modes.

- **Fixed target:** progress runs from 0 to the target.
- **Saved baseline:** the goal stores a baseline and an amount to add. Its target is the baseline plus that amount. "Restart goal" captures the value's current content as the new baseline without changing the value.

A goal projection exposes:

- current value, baseline, target and achieved amount,
- remaining amount (never below zero),
- percentage,
- completed flag,
- display fill clamped to 0..1.

The raw value is never clamped. Completion has no side effect in v1: no reset, no alert.

### 3. Reset groups

A value can belong to one reset group, for example "Session" or "Campaign". Resetting a group writes every member's reset default, and restarts every saved-baseline goal whose value is in the group, in one transaction with one revision bump. Groups are the hook for slice 2's optional "reset on stream online" trigger. This slice has no automatic reset.

### 4. Operator owns live control, Management owns definitions

`management-ui-ux` keeps live controls out of Management. Following that rule and the existing timer pattern:

- **Operator** gets a Data section with:
  - pinned values showing their current content, with +1, −1, a set field and reset,
  - a reset action for each group,
  - a show/hide toggle for each canvas.

  Reset and group reset use a confirmation step, because they discard data. A failed set keeps the entered value for retry, matching the timer adjust control.
- **Management** gets Data and Canvas pages. These create, edit and delete values, goals, groups and canvases, choose which values are pinned in Operator, and show current values read-only with their references.

`set` carries the value's expected revision, so an operator correction cannot overwrite a newer change. `add` and `subtract` carry no revision guard, because deltas commute: two +1 presses that race are both correct.

### 5. Canvases

Each canvas is independently enabled and has:

- a target profile,
- output assignments,
- ordered elements.

V1 elements are:

- text,
- registered local images,
- solid rectangles and ellipses,
- horizontal or vertical progress bars with direction, fill and background colors, and a bounded border.

Every element has a stable ID, an integer layer order, x/y/width/height and a visibility flag. Text and progress elements bind to a compatible value or goal field through a typed picker.

Pointer editing has keyboard and numeric alternatives. Reuse the Music layout editor, snapping and the asset picker where they fit. Extract shared helpers only where both editors need them. Record the editor fit assessment before adding any library.

Proposed bounds, exposed to the UI from one core constant:

| Item | Limit |
| --- | --- |
| Values | 1000 |
| Goals | 250 |
| Canvases | 50 |
| Elements per canvas | 100 |
| Text value length | 2 KiB |

All canvases are one module and occupy one layer row per shared surface. Inside that row, canvases stack in their configured order. One canvas therefore cannot sit above Alerts while another sits below. This limit is accepted for v1.

### 6. Formatting and preview

Formatting is core-owned and shared by the editor, preview, browser and desktop. It covers:

- thousands separators,
- prefix and suffix,
- text wrap or ellipsis,
- goal fields inserted through a picker.

Preview uses its own sample store. It can simulate zero, decrease, completion, over-target and long text, and a missing source, without touching live values. Layout changes apply only on explicit save.

### 7. Outputs and visibility

The server publishes a projection for each canvas, tagged with the runtime ID and an increasing data revision. Module-specific and unified browser sources and the private desktop surface render the same projection.

- Snapshot and subscription are ordered so that no update falls between them.
- Clients discard frames with an older runtime or revision, and reconnect with bounded backoff.
- Data updates never remount other modules' active media.
- Overlay keys reveal only the values referenced by the canvases on that output, never the full catalog. They grant no management or Operator authority.

Visibility rules:

- Unresolved, deleted or type-invalid bindings hide the element, fail closed and transparent, and report the problem in Management.
- Values may carry a source status, which slices 2 and 3 introduce. Elements default to **retain-last with a 10-minute grace**: a stale value keeps showing, and the element hides only after 10 minutes stale or when its source has ended. Each element can choose **hide immediately** instead. A correct number that is a few minutes old is not an error under `docs/ai/overlay-error-presentation.md`. Hiding a follower bar on every API blip would make the overlay flicker.

Module disablement, canvas hiding and global output pause suppress display only. Values keep their content.

### 8. Backup and restore

Backups include values (definition, current content, reset default), goals and baselines, groups, Operator pins, canvases and asset references. Restore:

- validates all references first,
- applies everything in one transaction under the existing maintenance guard,
- starts imported canvases disabled until the user reviews them.

A failed restore leaves the existing profile unchanged.

## Risks / Trade-offs

- **Manual-only updates in this slice.** It is useful on its own for challenge counters and labels, and slice 2 adds automation without changing the value model.
- **One layer row for all canvases.** It is simple and consistent with existing surfaces. Per-canvas rows can follow if users need them.
- **Editor cost.** Reuse existing primitives first, and record library trade-offs before adding a dependency.

## Migration Plan

Add forward migrations for values, goals, groups, pins and canvases through typed repositories with foreign keys enabled. Existing profiles gain a disabled module with no new data. The new module appears as a hidden bottom row on each shared surface, per `shared-overlay-surfaces`. Include the new sections in backup migration tests.

Rollback before first use is the pre-upgrade backup with WAL companions. Once users create data, an older build is not promised to load it. Disabling the module is the reversible fallback.

## Open Questions

None blocking. The bounds in decision 5 are proposals and can be adjusted during implementation review.
