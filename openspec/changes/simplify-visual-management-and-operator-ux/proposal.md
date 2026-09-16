## Why

Representative visual and keyboard audits found six usability problems that slow live operation and make common management pages unnecessarily dense: an unfocused operator confirmation, current playback below queue controls, unused alert catalog noise, oversized mobile navigation, misaligned Screen Effects checkboxes, and always-expanded secondary asset filters. These corrections improve scanability and keyboard safety without changing APIs, persistence, matching, or playback behavior.

## What Changes

- Move the operator clear-queue confirmation into the shared modal surface with trapped focus, Escape/Cancel dismissal, and reliable focus restoration.
- Place current playback before module queue controls and compact the operator layout so active playback is immediately visible on supported phone and desktop viewports.
- Hide event types with no configured alerts by default in Alert Sets and focused-editor navigation, with an explicit control to reveal the full catalog and complete-catalog access in alert creation.
- Replace the wrapped mobile management navigation with a compact inline disclosure while preserving route guards and the desktop sidebar.
- Align Screen Effects output and embedded-media audio checkboxes with their labels using existing scoped checkbox styling.
- Keep Search and Type visible in Assets while collapsing Usage, Health, Module, Set, Event, and tags behind a persistent More filters disclosure with an active count and reset action.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alert-playback-operator-controls`: Define safe modal confirmation behavior and prioritize active playback in the operator surface.
- `alert-configuration-management`: Default grouped alert surfaces to configured event types while retaining full-catalog authoring access and actionable empty/filter states.
- `management-ui-ux`: Define compact, guarded mobile navigation disclosure behavior.
- `screen-effects`: Require inline, label-associated binary output and media-audio controls.
- `asset-library-management`: Define primary versus collapsed secondary filters, active-filter counting, persistence, and clearing behavior.

## Impact

The change is limited to existing React components, scoped CSS, Storybook stories, Vitest tests, and Playwright workflows in `apps/web` and `tests/e2e`. It adds no dependencies, server changes, API changes, migrations, routes, persistence records, or live-output behavior changes.
