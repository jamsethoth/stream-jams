# Browser and desktop output layout design

The maintained written design for this change is [OpenSpec design](../../../openspec/changes/separate-browser-desktop-output-layouts/design.md), with its [proposal](../../../openspec/changes/separate-browser-desktop-output-layouts/proposal.md) and [requirements](../../../openspec/changes/separate-browser-desktop-output-layouts/specs/output-specific-module-rendering/spec.md).

Status: written specification approved by the user on 2026-10-10. The [agent implementation plan](../plans/2026-10-10-browser-desktop-output-layouts.md) is being implemented in ordered slices with parent review and per-slice pushes.

Confirmed scope: remove test and unified browser sources; keep landscape and vertical layouts for Alerts, Music and Timers; use stable content-sized canvases for Music, Timers and Videos independent of desktop placement; retain full-scene positioning for Alerts/Screen Effects; introduce independent per-profile Timer appearance controls.

Manual Test/Send actions enter the shared event bus with manual provenance and use ordinary queues and outputs. Videos has one ordinary queue/player; no separate test queue or management test output remains. Local editor previews do not dispatch events. Performance expectations and before/after acceptance checks are recorded in the maintained design.
