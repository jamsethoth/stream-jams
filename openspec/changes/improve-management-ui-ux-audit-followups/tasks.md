## 1. Baseline And Navigation Safety

- [ ] 1.1 Correct the provider recovery test to await asynchronously loaded detail and verify the focused baseline test passes.
- [x] 1.2 Add shell-level regression tests for guarded internal management anchors, modified clicks, external links, and new-window targets.
- [x] 1.3 Intercept eligible `/manage` anchors at the shell boundary and route them through existing dirty-navigation handling.
- [x] 1.4 Remove the duplicate current-route behavior for the Modules group and keep Alerts as the single current destination.

## 2. Safe Loading And Error Presentation

- [ ] 2.1 Add failing tests and stories for initial Settings, Alerts, and Assets load failures.
- [ ] 2.2 Render retry-only failure states without editable defaults, false empty messages, or creation/mutation actions.
- [ ] 2.3 Add error-banner tests for structured validation failures and render concise operator-safe cause text.
- [ ] 2.4 Remove duplicate provider, Settings, and Diagnostics page headings while retaining page-specific actions and metadata.

## 3. Overlay Browser Resilience

- [ ] 3.1 Add fake-WebSocket/fake-timer tests for reconnect backoff, reset after open, and cleanup after disposal.
- [ ] 3.2 Implement one bounded overlay reconnect loop without changing route-key authorization or playback messages.
- [ ] 3.3 Add profile viewport tests for Landscape 1920x1080 and Vertical 1080x1920 at canonical and noncanonical sizes.
- [ ] 3.4 Scale and center the fixed profile canvas and make production transport/internal failures render an empty transparent tree.

## 4. Focused Alert Editor

- [ ] 4.1 Add tests for loaded-set breadcrumb context, authoritative Back routing, and standard keyboard tab behavior.
- [ ] 4.2 Render compact focused-editor context from loaded set/document data and derive Back from the loaded set ID.
- [ ] 4.3 Remove the normal route-content width cap for focused routes and use viewport-height, independently scrolling editor regions.
- [ ] 4.4 Move the inspector to a full-width workspace row from 701px through 980px and preserve the existing mobile guard at 700px.

## 5. Responsive Primary Workflows And Browser-Source Setup

- [ ] 5.1 Add Playwright assertions at 390px, 820px, and 1920px for navigation discovery, primary table actions, and focused-editor workspace use.
- [ ] 5.2 Wrap narrow navigation destinations and keep identity, status, and primary actions visible in readiness, provider, alert, and asset inventories.
- [ ] 5.3 Collapse narrow Asset filters with a native details/summary control while preserving desktop filters.
- [ ] 5.4 Show target-profile dimensions and manual browser-source guidance, and toggle revealed URLs between Reveal and Hide.

## 6. Accessibility, Locale, And Styling Consistency

- [ ] 6.1 Add keyboard tests and implement native asset-choice selection plus Enter/Space canvas-layer selection.
- [ ] 6.2 Add visible referenced help for disabled in-use asset deletion.
- [ ] 6.3 Add shared `Intl` formatters and tests for singular/plural duration, usage, date, number, and binary-byte output.
- [ ] 6.4 Set runtime document language/direction, add `dir="auto"` to user-generated overlay text, and add RTL/expanded-copy stories.
- [ ] 6.5 Replace hard-coded management action colors with semantic tokens and remove dead pre-refactor CSS touched by this change.

## 7. Integrated Verification

- [ ] 7.1 Update production-component Storybook stories for loading, failure, narrow, overlay-resize, reconnect, and fail-closed states.
- [ ] 7.2 Run lint, typecheck, unit/integration tests, Storybook build/tests, and Playwright; fix in-scope failures without weakening coverage.
- [ ] 7.3 Rebuild and restart the local app, live-verify all management routes plus Landscape and Vertical overlay behavior, and capture completion evidence.
- [ ] 7.4 Run `openspec.cmd validate improve-management-ui-ux-audit-followups --strict` and reconcile every requirement against code and tests.
