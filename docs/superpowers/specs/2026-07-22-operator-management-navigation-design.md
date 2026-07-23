# Operator And Management Navigation Design

## Context

Management currently links to the operator console from the sidebar footer, while the operator console links back from its page header. The inconsistent placement makes switching surfaces harder to predict.

This is a navigation-consistency correction within `add-alert-playback-operator-controls`. It does not add playback behavior or merge the management and operator surfaces.

## Decision

Place the surface-switch link in the rightmost action position of both page headers:

- Standard management pages show `Open Operator Console` in the management page header.
- The operator console shows `Back to management` in the operator page header.
- Both links use the same secondary-action visual treatment.
- The management `Local` status remains in the header immediately before the surface-switch link.

Use normal anchor navigation without `target="_blank"`. An ordinary click stays in the current tab. Ctrl/Cmd-click, middle-click, and browser context-menu actions retain native link behavior. Existing `beforeunload` protection continues to warn when same-tab navigation would abandon dirty management state.

At mobile widths, each header action reflows below its title using the same ordering and full-width treatment. The focused alert editor keeps its existing focused navigation because it does not render the standard management page header.

## Implementation Boundary

- Add an action slot to the existing `PageHeader` component rather than creating another header abstraction.
- Move the management link out of `ManagementNavigation`; keep `Local only` in the sidebar footer.
- Reuse one CSS class for both surface-switch links.
- Keep route ownership and management navigation interception unchanged.

## Validation

- Component tests verify the management header link uses `/operator` without a `target` attribute.
- Operator tests verify the return link uses `/manage` with the shared visual treatment.
- Storybook shows the management link in the real management shell.
- Playwright verifies ordinary same-tab navigation and browser-native link semantics.
- Live desktop and narrow-width checks confirm matching relative placement and keyboard focus visibility.

## Alternatives Rejected

- A fixed viewport-corner control would conflict with responsive content and transient UI.
- Adding management-style sidebar navigation to the operator console would weaken its focused operational layout.
- Always opening a new tab removes user choice and can disorient keyboard and assistive-technology users.
