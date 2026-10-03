## Why

Operator rows and nested control groups waste vertical space in small streaming workspaces. The panel needs to remain responsive and usable at 540 x 960 rather than assume a large desktop viewport.

## What Changes

- Condense Operator headers, rows, metadata, section spacing, and module actions.
- Use accessible timer action icons and expandable manual time adjustments.
- Keep responsive wrapping and natural vertical scrolling at smaller sizes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `multi-module-playback-operations`: Require compact responsive Operator controls at 540 x 960.

## Impact

Operator React component, scoped CSS, Storybook interactions, and browser acceptance checks. No API, persistence, dependency, or scheduler changes.
