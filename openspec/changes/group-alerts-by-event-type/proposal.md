## Why

Alert Sets and the focused editor currently present every default and variation in flat lists, which makes sibling relationships and event coverage difficult to scan as the catalog grows. The existing canonical event catalog plus the management inventory's event, kind, and parent identity contain the hierarchy needed to present collapsible event groups without changing runtime matching or persistence. The inventory needs only additive authoring-summary fields so both grouped surfaces can describe saved variations without loading each editor document.

## What Changes

- Group alert inventory and focused-editor navigation by canonical event type, nesting each variation beneath its owning default while preserving multiple defaults per event.
- Show every canonical event group, including empty groups with an event-scoped Add alert action, and retain unknown stored event types in an `Other` group.
- Add derived default, variation, enabled, and validation-status summaries to event headers without introducing event-level enablement or persisted group records.
- Make disclosures, search/filter expansion, row actions, mutation focus, empty/loading/error states, and narrow Alert Sets layouts keyboard-accessible and predictable.
- Add management-only inventory metadata for saved conditions, weight, and priority, and broaden only the inventory event value to defensive `string` display support. Creation inputs, persisted rules, editor documents, and runtime matching remain canonical `StreamEventType` boundaries.
- Reuse `formatAlertConditionSummary` and `buildAlertPriorityGroups` from `improve-alert-variation-authoring`; describe saved relative weight with sample-dependent wording without calculating another playback probability.
- Keep the focused editor's existing larger-screen requirement; this change reorganizes its navigation rail but does not add a mobile editor workspace.
- Keep typography, shape, media, animation, timeline, moderation, operator, and playback-contract work in their existing independent backlog changes.
- Require `improve-alert-variation-authoring` to be complete, validated, and present on `origin/main` before implementation begins.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `alert-configuration-management`: Alert inventory and focused-editor navigation become event-grouped disclosures with nested defaults and variations, derived summaries, accessible interaction, and event-scoped creation.

## Impact

- Primarily affects the Alerts inventory, focused-editor navigation, their shared client-side projection, styles, Storybook states, component tests, and management-alerts Playwright coverage.
- Reuses `alertStarterTemplates`, the existing flat set-detail response, stable rule/variation route IDs, validation issues, current mutation endpoints, and BL-004 summary behavior.
- Additively expands each flat `AlertInventoryRow` with saved conditions, weight, and priority; it does not add a nested transport model or endpoint.
- Adds no database migration, persisted group, runtime matcher change, dependency, event-level enabled state, or provider-specific grouping.
