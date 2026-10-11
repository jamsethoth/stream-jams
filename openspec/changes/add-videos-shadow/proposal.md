# Proposal: Videos Shadow

## Why

On 2026-10-11 the maintainer approved one shared shadow setting for every module that draws a box (Alerts, Music, Timers, Videos), with the browser source margin worked out from the shadow. Videos draws a fixed `0 18px 48px` shadow on its picture, and its browser source reserves no margin, so OBS clips that shadow at the source edge.

## What Changes

- The Videos layout gets an optional `shadow`, using the shared box-shadow fields (`packages/core/src/shared/box-shadow.ts`: X, Y, blur, spread, RGBA color).
- The Videos placement editor gets a collapsed Shadow section: On/Off, the four numbers and the color. The preview draws the shadow.
- When a shadow is saved, the browser source grows by the shared margin on each side and the content box moves past it, so the shadow is not clipped. A transparent shadow (Off) adds no margin, so the box sits exactly at the source edge.
- The desktop overlay draws the same shadow on its picture; its scene canvas and placement do not change.
- Layouts saved without a shadow keep the original CSS shadow and today's source size.

## Out Of Scope

- A shadow on the caption, which keeps its text shadow only.

## Impact

- `packages/core`: Videos layout type, strict schema, plain validator, browser projection and output canvas.
- `apps/web`: Videos placement editor and the shared picture style.
- No migration: existing layouts have no `shadow` field.
