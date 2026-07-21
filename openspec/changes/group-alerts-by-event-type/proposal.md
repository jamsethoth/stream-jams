## Why

Alert Sets and the focused editor currently present every default and variation in flat lists, which makes sibling relationships and event coverage difficult to scan as the catalog grows. The existing canonical event catalog plus `AlertInventoryRow.eventType`, `kind`, and `parentAlertId` already contain the hierarchy needed to present collapsible event groups without changing runtime matching or persistence.

## What Changes

- Group alert inventory and focused-editor navigation by canonical event type, nesting each variation beneath its owning default while preserving multiple defaults per event.
- Show every canonical event group, including empty groups with an event-scoped Add alert action, and retain unknown stored event types in an `Other` group.
- Add derived default, variation, enabled, and validation-status summaries to event headers without introducing event-level enablement or persisted group records.
- Make disclosures, search/filter expansion, row actions, mutation focus, empty/loading/error states, and narrow Alert Sets layouts keyboard-accessible and predictable.
- Reuse condition and priority summaries from `improve-alert-variation-authoring`; do not duplicate its field catalog, relative-chance logic, or sample evaluator.
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
- Reuses `alertStarterTemplates`, the existing flat set-detail response, stable rule/variation route IDs, validation issues, current mutation endpoints, and BL-004 condition-summary behavior.
- Adds no database migration, server hierarchy DTO, event-group endpoint, runtime matcher change, dependency, event-level enabled state, or provider-specific grouping.
