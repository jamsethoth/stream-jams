# Data overlays

Data overlays display shared integer or plain-text values and goals on freeform canvases. Values persist independently of canvases: hiding, disabling or deleting a canvas does not reset its data. Resets are manual by default.

## Create and operate a counter

1. Open **Data** in Management and create an integer or text value. Set its reset default, optionally assign a reset group, and pin it for Operator access.
2. Optionally create a goal over an integer value. A fixed-target goal uses an absolute target. A saved-baseline goal measures an additional amount from a saved starting count; restarting the goal captures a new baseline.
3. Open **Modules → Data overlays**, create a canvas and choose its output profile. Add text, registered images, rectangles, ellipses or progress bars. Bind text or progress to a compatible value or goal.
4. Save the canvas and explicitly enable the module, canvas and desired outputs. New Data rows on shared surfaces start hidden; include and show the Data row when using a unified browser source or desktop surface.
5. Use **Operator** for live increments, decrements, guarded sets, resets, group resets, goal restarts and canvas visibility. Management edits definitions and displays current content read-only.

One value can feed several elements and canvases. Goal text and bars share the same calculation. Counts beyond the target remain visible while bar fill is capped; a count below a saved baseline can show negative achieved progress. Values must be safe integers; text is limited to 2 KiB of UTF-8. Money and decimal values are deferred.

If a set conflicts with a newer update, Operator retains the entered correction and shows the current value. Review it before retrying. Group resets reset all member values and restart their dependent saved-baseline goals in one transaction. Canceling a reset changes nothing.

## Author and preview

Canvas editing supports pointer, keyboard and numeric positioning with shared bounds and snapping. Layer visibility, ordering, duplication, styling and bindings remain drafts until saved. Preview simulations use private sample state and never alter live values. Production browser and desktop outputs show only valid, visible elements; errors and missing references belong in Management.

Each canvas supports at most 100 elements. The catalog supports 1,000 values, 250 goals and 50 canvases. Names are unique within each catalog after trimming and case normalization. Referenced values, goals and registered canvas images cannot be deleted until their references are removed.

## Templates

Start a canvas from **Counter badge**, **Goal bar**, **Latest supporter** or **Combined goals panel**. Map each typed slot to a compatible existing value or goal, or create new custom data in the same step. Creation is atomic: a rejected mapping leaves no partial values, goals or canvas. New canvases start disabled for review.

Save a whole canvas or a checked selection as a user template. Templates retain layout, styling and slots; they do not retain live counts, goal baselines or provider account identity. Inserting a template adds ordinary independent elements. Editing a saved template does not change existing canvases.

Provider-required slots need a configured source of the matching kind: Twitch follower total or Creator Goal. Templates omit the selected Twitch goal and binding account as well as live amounts. Missing template images retain a flagged editor placeholder with their original asset ID and stay hidden live until replaced with a registered image. Backups include user templates, while bundled starters are supplied by the application.

## Twitch follower totals

The Twitch source panel explicitly creates provider-owned follower-total values for the connected broadcaster. The server refreshes the authoritative total every 60 seconds, including decreases, and handles failures with backoff and provider rate-limit deadlines. Canonical follow events request an early authoritative refresh, throttled to once per ten seconds; they never increment the total locally. Provider-owned values are read-only in Operator and cannot join reset groups.

A source has no visible value until its first successful validation. A temporary failure retains the last good value for ten minutes, then hides dependent live content. Invalid, disconnected or changed-account bindings are hidden. Switching broadcasters invalidates old bindings; switching back does not silently restore them. Select a new source explicitly.

## Live Twitch Creator Goals

Connect Twitch with the optional `channel:read:goals` permission, then use **Data → Twitch data sources** to create a Creator Goal binding. The default follows the newest active goal of a chosen type. A pinned binding follows one selected goal only. Both create a shared value and fixed-target Data goal that existing text and progress elements can use on any canvas.

Management lists active goals, their current amounts and targets, units and each binding's selected goal. Follower goals use followers; subscription and new-subscription points use sub points; subscription-count goals use subscriptions. Unknown goal types remain listed but cannot be selected.

Progress updates arrive through the central event bus. Ending a goal hides its elements. A binding by type follows the next matching goal automatically; a pin stays ended until you explicitly rebind it. Rebinding preserves the Data IDs, so canvas references remain intact. Twitch owns current amounts and targets; Stream Jams offers source selection, naming and deletion but no edits to Twitch itself.

The source snapshots after all three goal subscriptions become active and resnapshots on reconnect. It buffers progress during a snapshot and ignores old-account responses and obsolete replay. Temporary subscription failures retry while alerts remain connected. Missing or revoked permission shows reconnect guidance. No real-account verification is implied by disposable-provider tests.

## Persistence and outputs

Backups include saved values, reset defaults, goal baselines, groups, pins, canvases and image references. Portable restore validates references before mutation and disables restored canvases for review. Runtime identities, connection status and credentials are not portable data. Restored provider values stay hidden until the source is validated again.

Browser outputs use purpose-scoped overlay keys; those keys cannot authorize Management or Operator APIs. Private desktop output uses the existing local image grants. Shared data updates preserve other modules' media. Missing or invalid content fails transparent on live outputs.

Event-driven custom counters and automatic stream-online resets remain separate implementation work against the central bus. Streamer.bot globals still require real sanitized fixtures. The current Management/Operator endpoints are authenticated application controls; a general external producer API has not been introduced.

See the [original implementation plan](superpowers/plans/2026-10-08-data-overlays-implementation.md), [historical Data verification](verification/data-overlays-scenarios.md) and [live Creator Goals evidence](verification/live-creator-goals.md) for the candidate's scope and remaining acceptance work.
