## Why

The merged management UI is coherent but the post-merge UX audit found paths that can lose unsaved work, misleading load-failure states, inaccessible custom controls, narrow layouts that hide primary actions, and overlay behavior that can fail after resize or disconnect. These issues should be corrected before treating the refactor as complete because they affect configuration safety and live browser-source reliability.

## What Changes

- Route every internal management correction link through the existing dirty-navigation guard and preserve selected provider, set, alert, profile, and diagnostic context in URLs.
- Render retry-only load failures instead of editable fallback defaults or false empty states, and convert raw validation payloads into concise operator-safe messages.
- Keep the alert editor as a focused route while restoring breadcrumb/set/alert context and using the available viewport with independently scrolling panes.
- Replace narrow-width desktop-table dependence with compact navigation and action-first responsive rows where primary controls would otherwise require horizontal scrolling.
- Complete keyboard behavior for editor tabs, asset selection, and canvas layer selection using existing native and Diagnostics patterns.
- Add a dependency-free locale/formatting foundation using `Intl`, document `lang`/`dir`, correct pluralization and unit inconsistencies, and support bidirectional user-generated overlay text.
- Add overlay WebSocket reconnect/backoff, fixed-profile viewport scaling, and truly empty production failure rendering.
- Show required browser-source dimensions and setup guidance, and allow revealed route keys to be hidden again.
- Remove duplicate route headings, hard-coded management colors, and dead pre-refactor CSS touched by this work.
- Add focused unit, Storybook, and Playwright coverage for failure, keyboard, reconnect, scaling, and responsive states.
- Keep alert-editor action failures out of the workspace layout, auto-dismiss them after eight seconds, and retain their reference IDs in Diagnostics.
- Present transient management action success, failure, warning, and state feedback through one non-reflowing green, red, or yellow toast pattern across Alerts, Assets, Providers, Diagnostics, and Settings while keeping blocking and corrective messages inline.
- Present one user-facing actor name variable whose live value matches preview while retaining legacy template compatibility.
- Replace the generic alert-template picker with the approved event-specific aliases and one shared preview, test, and live template context.

## Capabilities

### New Capabilities

- `management-ui-resilience`: Safe navigation, load/error presentation, responsive primary workflows, accessible composite controls, and locale-aware formatting for the management UI.
- `overlay-browser-resilience`: Reconnecting browser-source transport, fixed-profile scaling, and transparent fail-closed production rendering.

### Modified Capabilities

- `alert-configuration-management`: The focused alert editor retains management context, uses the available desktop/tablet viewport, and remains explicitly guarded on narrow mobile screens.
- `overlay-output-management`: Browser-source management presents required profile dimensions and setup guidance, and revealed route keys can be re-masked without reloading.

## Impact

- Affects `apps/web` management routing, foundation components, providers, Alerts, Assets, Diagnostics, Settings, overlay transport/rendering, CSS, stories, and browser tests.
- Updates the Fastify-served web shell only to derive document language and direction from the frontend locale contract.
- Reuses existing typed management APIs, route-key authorization, design tokens, modal foundation, actionable error content, and Diagnostics tab behavior.
- Adds no runtime dependencies and does not add a router, component library, i18n package, resizable-pane framework, OBS integration, or mobile canvas authoring.
