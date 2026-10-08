## Why

Streamers show counters, goals, latest-supporter labels and challenge text with dedicated widgets, bot variables, text files or hand-coded browser overlays. Stream Jams should let them build these visually, keep the data across restarts, control it live from Operator, and show the same result on the OBS browser source and the desktop overlay.

This change is the first of four reviewable slices of BL-055. It delivers a usable feature on its own: values that the operator changes by hand, goals over those values, and canvases that display them. Later slices add automatic updates, Twitch data and templates.

| Slice | Change | Adds |
| --- | --- | --- |
| 1 | `add-custom-data-overlays` (this change) | Values, goals, reset groups, canvases, outputs, Operator controls, backup |
| 2 | [`add-data-overlay-event-rules`](../add-data-overlay-event-rules/proposal.md) | Rules over normalized events, Streamer.bot custom broadcasts and Streamer.bot globals |
| 3 | [`add-twitch-overlay-data`](../add-twitch-overlay-data/proposal.md) | Twitch follower total and Creator Goals |
| 4 | [`add-data-overlay-templates`](../add-data-overlay-templates/proposal.md) | Bundled and saved canvas templates |

Slices 2, 3 and 4 depend on this change and are independent of each other.

## What Changes

- Add a disabled-by-default Data Overlays module with several saved canvases. Canvases hold text, registered local images, solid rectangles and ellipses, and horizontal or vertical progress bars, with positioning, layer order, styling and keyboard-accessible editing.
- Add shared named values that live outside any canvas. V1 supports two kinds: integer and text. Several elements and canvases can show the same value, and deleting a canvas never deletes data.
- Add goals over integer values, with a fixed target or a saved baseline ("50 more followers from here").
- Add reset groups, such as "Session", so one action resets several values together.
- Add Operator controls for live use: +1, −1, set and reset for pinned values, reset for a whole group, and show/hide for each canvas. Management keeps definitions and layout.
- Render the same projection on module-specific and unified browser sources and on the private desktop overlay.
- Keep values across restarts. Nothing resets on its own in this slice.
- Include values, goals, groups and canvases in backup and restore.

## Out of scope

- Automatic updates from events (slice 2), Twitch data (slice 3) and templates (slice 4).
- Money and decimal values. These wait for a real money source; see BL-020.
- An inbound HTTP or WebSocket API for external producers. Stream Jams listens to tools it already connects to (slice 2). A paired native input API stays in the backlog as BL-064.
- Value-change animation, such as count-up numbers or animated bar fill, and completed-goal styling. These are tracked as BL-065.
- Custom HTML or JavaScript, arbitrary expressions, masks, nested groups, freehand drawing, and a new queue or audio channel. NP-001 and NP-006 still apply.

## Capabilities

### New Capabilities
- `shared-overlay-values`: persistent integer and text values, goals, reset groups, reference-safe lifecycle.
- `data-overlay-canvases`: canvas authoring, formatting, preview, output projections, and visibility rules.
- `data-overlay-operator-controls`: live value, group and canvas controls in Operator.

### Modified Capabilities
- `configuration-backup-restore`: include data overlay definitions and current values.

## Impact

Core owns value and goal schemas, formatting and goal projection. Server owns typed SQLite repositories and migrations, management and Operator APIs, snapshots and backup. Web owns Data and Canvas management, the Operator section and overlay rendering. Desktop uses the existing private shared surface with no new window.

Frontend work follows `docs/ai/frontend-agent-guide.md`. No new dependency is assumed; the editor fit assessment decides whether one is needed. Tracked as BL-055.
