## Context

The approved design targets a responsive Operator panel usable at 540 x 960, with natural wrapping and scrolling below that size. Existing row metadata, nested padded action groups, and full-width mobile buttons inflate the layout.

## Goals / Non-Goals

Goals: condense repeated rows and controls, retain all playback metadata and manual timer commands, and preserve keyboard access and failure feedback. No global density preference, API changes, scheduler changes, or overlay changes.

## Decisions

Use Operator-scoped CSS, wrapping metadata, and small SVG timer and module action buttons with accessible names and native titles. Module rows use a consistent three-column grid for identity, status, and actions so longer module names do not wrap controls or shift the status below the row. Use native details/summary for timer adjustments so keyboard behavior and retained form values require no additional state. Keep descriptive global safety actions visible. A fixed-size layout was rejected because the panel must resize dynamically.

## Risks / Trade-offs

Long labels and larger inventories require vertical scrolling; wrapping and min-width constraints prevent horizontal overflow. Timer icons need explicit accessible labels and titles. Secondary metadata retains semantic definition labels for assistive technology.

## UX and validation

Reviewed MVP UX sections Operator Console, visual foundation/theme and density, and current multi-module playback specifications. This refines implemented functionality; a global density preference remains backlog. Empty, error, stale, success, and modal behavior are retained. Check focused unit tests, typecheck/build, Operator Storybook interactions and axe checks, and rebuilt served-app Playwright checks at 390, 540, and 1080 pixel widths. The representative 540 x 960 inventory contains one timer, two current items, two module queues, two pending items, and one recent item.
