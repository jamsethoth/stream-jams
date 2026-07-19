## 1. Baseline And Navigation Safety

- [x] 1.1 Correct the provider recovery test to await asynchronously loaded detail and verify the focused baseline test passes.
- [x] 1.2 Add shell-level regression tests for guarded internal management anchors, modified clicks, external links, and new-window targets.
- [x] 1.3 Intercept eligible `/manage` anchors at the shell boundary and route them through existing dirty-navigation handling.
- [x] 1.4 Remove the duplicate current-route behavior for the Modules group and keep Alerts as the single current destination.

## 2. Safe Loading And Error Presentation

- [x] 2.1 Add failing tests and stories for initial Settings, Alerts, and Assets load failures.
- [x] 2.2 Render retry-only failure states without editable defaults, false empty messages, or creation/mutation actions.
- [x] 2.3 Add error-banner tests for structured validation failures and render concise operator-safe cause text.
- [x] 2.4 Remove duplicate provider, Settings, and Diagnostics page headings while retaining page-specific actions and metadata.

## 3. Overlay Browser Resilience

- [x] 3.1 Add fake-WebSocket/fake-timer tests for reconnect backoff, reset after open, and cleanup after disposal.
- [x] 3.2 Implement one bounded overlay reconnect loop without changing route-key authorization or playback messages.
- [x] 3.3 Add profile viewport tests for Landscape 1920x1080 and Vertical 1080x1920 at canonical and noncanonical sizes.
- [x] 3.4 Scale and center the fixed profile canvas and make production transport/internal failures render an empty transparent tree.

## 4. Focused Alert Editor

- [x] 4.1 Add tests for loaded-set breadcrumb context, authoritative Back routing, and standard keyboard tab behavior.
- [x] 4.2 Render compact focused-editor context from loaded set/document data and derive Back from the loaded set ID.
- [x] 4.3 Remove the normal route-content width cap for focused routes and use viewport-height, independently scrolling editor regions.
- [x] 4.4 Move the inspector to a full-width workspace row from 701px through 980px and preserve the existing mobile guard at 700px.

## 5. Responsive Primary Workflows And Browser-Source Setup

- [x] 5.1 Add Playwright assertions at 390px, 820px, and 1920px for navigation discovery, primary table actions, and focused-editor workspace use.
- [x] 5.2 Wrap narrow navigation destinations and keep identity, status, and primary actions visible in readiness, provider, alert, and asset inventories.
- [x] 5.3 Collapse narrow Asset filters with a native details/summary control while preserving desktop filters.
- [x] 5.4 Show target-profile dimensions and manual browser-source guidance, and toggle revealed URLs between Reveal and Hide.

## 6. Accessibility, Locale, And Styling Consistency

- [x] 6.1 Add keyboard tests and implement native asset-choice selection plus Enter/Space canvas-layer selection.
- [x] 6.2 Add visible referenced help for disabled in-use asset deletion.
- [x] 6.3 Add shared `Intl` formatters and tests for singular/plural duration, usage, date, number, and binary-byte output.
- [x] 6.4 Set runtime document language/direction, add `dir="auto"` to user-generated overlay text, and add RTL/expanded-copy stories.
- [x] 6.5 Replace hard-coded management action colors with semantic tokens and remove dead pre-refactor CSS touched by this change.

## 7. Integrated Verification

- [x] 7.1 Update production-component Storybook stories for loading, failure, narrow, overlay-resize, reconnect, and fail-closed states.
- [x] 7.2 Run lint, typecheck, unit/integration tests, Storybook build/tests, and Playwright; fix in-scope failures without weakening coverage.
- [x] 7.3 Rebuild and restart the local app, live-verify all management routes plus Landscape and Vertical overlay behavior, and capture completion evidence.
- [x] 7.4 Run `openspec.cmd validate improve-management-ui-ux-audit-followups --strict` and reconcile every requirement against code and tests.
- [x] 7.5 Suppress zero-value problem summaries in Browser sources, Home, and provider activation impact, with focused tests and an all-ready Browser sources story.

## 8. Alert Editor Transient Errors And Variable Review

- [x] 8.1 Add failing editor tests for fixed dismissible action errors, eight-second expiry, and persistent blocking load errors.
- [x] 8.2 Add failing diagnostics tests proving client-only failures and public backend error IDs are searchable by the same visible reference ID.
- [x] 8.3 Implement the minimal authenticated client-error reporting path and correlate backend runtime evidence by public error ID.
- [x] 8.4 Render loaded-editor action errors as a fixed bottom-right surface with manual dismissal and eight-second expiry; update Storybook coverage.
- [x] 8.5 Add failing live-render tests for `{userName}`, then expose only `User name` while retaining hidden `{actor.displayName}` compatibility.
- [x] 8.6 Write a comprehensive normalized-event variable inventory and proposed event-specific editor catalog for product review without exposing unapproved variables.
- [x] 8.7 Run frontend and server validation, strict OpenSpec validation, rebuild/restart, and live-verify error layout, dismissal, expiry, and Diagnostics lookup.
