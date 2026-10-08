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

Provider-required slots need a configured source of the matching kind; the current implemented source is Twitch follower total. Missing template images retain a flagged editor placeholder with their original asset ID and stay hidden live until replaced with a registered image. Backups include user templates, while bundled starters are supplied by the application.

## Twitch follower totals

The Twitch source panel explicitly creates provider-owned follower-total values for the connected broadcaster. The server refreshes the authoritative total every 60 seconds, including decreases, and handles failures with backoff and provider rate-limit deadlines. Provider-owned values are read-only in Operator and cannot join reset groups.

A source has no visible value until its first successful validation. A temporary failure retains the last good value for ten minutes, then hides dependent live content. Invalid, disconnected or changed-account bindings are hidden. Switching broadcasters invalidates old bindings; switching back does not silently restore them. Select a new source explicitly.

The optional `channel:read:goals` scope is separate from existing alert permissions. Creator Goal event integration and goal binding controls remain blocked by the central event bus prerequisite. Follower polling works independently of that prerequisite. No real-account verification is implied by disposable-provider tests.

## Persistence and outputs

Backups include saved values, reset defaults, goal baselines, groups, pins, canvases and image references. Portable restore validates references before mutation and disables restored canvases for review. Runtime identities, connection status and credentials are not portable data. Restored provider values stay hidden until the source is validated again.

Browser outputs use purpose-scoped overlay keys; those keys cannot authorize Management or Operator APIs. Private desktop output uses the existing local image grants. Shared data updates preserve other modules' media. Missing or invalid content fails transparent on live outputs.

Event-driven counters, automatic stream-online resets, Streamer.bot globals and native Twitch Creator Goals are pending the dependencies recorded in the [scenario trace](verification/data-overlays-scenarios.md). The current Management/Operator endpoints are authenticated application controls; a general external producer API has not been introduced.

See the [implementation plan](superpowers/plans/2026-10-08-data-overlays-implementation.md) and [verification evidence](verification/data-overlays-scenarios.md) for the candidate's exact scope and remaining acceptance work.
