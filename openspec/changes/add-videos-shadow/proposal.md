# Proposal: Videos Shadow And Caption

## Why

On 2026-10-12 the maintainer also asked for the real video or clip name and channel under the video, in a selectable font. Until now the caption showed only the submitted title and the requester.

On 2026-10-11 the maintainer approved one shared shadow setting for every module that draws a box (Alerts, Music, Timers, Videos), with the browser source margin worked out from the shadow. Videos draws a fixed `0 18px 48px` shadow on its picture, and its browser source reserves no margin, so OBS clips that shadow at the source edge.

## What Changes

- The Videos layout gets an optional `shadow`, using the shared box-shadow fields (`packages/core/src/shared/box-shadow.ts`: X, Y, blur, spread, RGBA color).
- The Videos placement editor gets a collapsed Shadow section: On/Off, the four numbers and the color. The preview draws the shadow.
- When a shadow is saved, the browser source grows by the shared margin on each side and the content box moves past it, so the shadow is not clipped. A transparent shadow (Off) adds no margin, so the box sits exactly at the source edge.
- The desktop overlay draws the same shadow on its picture; its scene canvas and placement do not change.
- Layouts saved without a shadow keep the original CSS shadow and today's source size.
- The stream caption shows the provider title when known (else the submitted title), and the provider channel before "Requested by" on its second line. Management and Operator queues are unchanged.
- The Videos layout gets an optional `captionFont` (the shared font presets), chosen under Caption in the placement editor. Absent keeps the default font.

## Out Of Scope

- A shadow on the caption, which keeps its text shadow only.
- Caption font size, weight and color, which stay tied to the caption's two-line reserve.

## Impact

- `packages/core`: Videos layout type, strict schema, plain validator, browser projection and output canvas.
- `apps/web`: Videos placement editor and the shared picture style.
- No migration: existing layouts have no `shadow` field.
