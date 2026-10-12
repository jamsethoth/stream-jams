# Proposal: Timer Stack Direction

## Why

On 2026-10-11 the maintainer asked for Timer stacks that suit any corner of the screen. For example, a stack in the bottom-left corner should list timers from the bottom up, with the soonest timer at the bottom and the "+N more" badge on top. Until now, stacks always filled from the top or the left, with the badge after the last card.

## What Changes

- Timer appearance gets an optional `reverse` flag. The management editor's Orientation select becomes "Stack direction", with four choices: Top to bottom, Bottom to top, Left to right, Right to left.
- A reversed stack fills from the bottom (vertical) or the right (horizontal), and the overflow badge moves to the opposite end.
  - Slots and the badge are mirrored inside the existing reserved footprint. The browser canvas size and the saved desktop placement never change with direction.
- Desktop placement gets an optional `reverse` override. The editor's "Desktop direction" offers "Same as browser" (the default) or either direction for the current orientation.
- Timer appearance gets an optional `shadow` (the Music widget's shadow fields, now shared in `packages/core/src/shared/box-shadow.ts`). The browser source margin is sized from it instead of a fixed 48/40/48/56px, so turning the shadow off puts the stack at the source's top-left corner. Configs without a shadow keep the original shadow and margin.
- Sort order is unchanged: least time remaining first, paused timers after running ones, and finished timers held at the front.

## Out Of Scope

- A separate desktop orientation (vertical on the desktop but horizontal in OBS).
- Changing how the desktop scale is anchored.

## Impact

- `packages/core`: Timer types, schema and output geometry; shared box-shadow schema and margin helper (used by Music too).
- `apps/web`: Timer stack editor.
- Existing saved configs have no `reverse` or `shadow` field and keep today's direction, shadow and source size, so no migration is needed.
