## 1. Empty Alert Documents

- [x] 1.1 Add failing server regressions for empty new alerts, first-run starters, and default reset while preserving copied designs
- [x] 1.2 Add a schema-valid empty alert document factory and route new/default creation paths through it
- [x] 1.3 Remove active create-time theme selection from the management request contract and server error guidance

## 2. Management UI

- [x] 2.1 Add failing component regressions showing Add alert has no theme chooser and submits no theme
- [x] 2.2 Remove theme selection from Add alert and update its empty-alert guidance and failure copy
- [x] 2.3 Add failing editor regressions showing Apply starter theme is absent
- [x] 2.4 Remove focused-editor starter-theme controls and theme-specific session state while retaining theme implementation modules

## 3. Browser Workflows And Documentation

- [x] 3.1 Update Storybook scenarios for empty creation and the editor without re-theming controls
- [x] 3.2 Update Playwright workflows to verify empty creation and removed theme entry points; retain server regressions for reset and copy semantics
- [x] 3.3 Update canonical alert configuration and MVP UX requirements to describe empty starter/new/reset defaults

## 4. Verification

- [x] 4.1 Run strict OpenSpec validation, focused regressions, lint, typecheck, and the full test suite
- [x] 4.2 Run web and Storybook builds, Storybook interactions/accessibility, and relevant Playwright workflows
