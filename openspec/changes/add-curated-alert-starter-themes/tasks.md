## 1. Core Theme Contract And Materialization

- [x] 1.1 Add the validated three-ID theme contract, immutable catalog summaries, and Clean Signal default to core alert-management contracts.
- [x] 1.2 Add `AlertCreateRequestInput` from the optional-theme schema input and required/defaulted `AlertCreateInput` from schema output; reject unknown IDs without mutation.
- [x] 1.3 Implement deterministic, schema-validated theme materialization for all canonical events and both fixed profiles using the approved text/solid-fill blueprints.
- [x] 1.4 Implement pure existing-document re-theming with primary-message precedence, visual replacement, nonvisual preservation, disabled state, and profile review reset.
- [x] 1.5 Add focused core tests for catalog bounds, defaulting, all event/theme/profile combinations, geometry, determinism, idempotency, validation, and preservation/fallback behavior.

## 2. Server Creation Integration

- [ ] 2.1 Parse optional wire input in the HTTP route, pass required `AlertCreateInput` through management services, and thread selected/default theme IDs through alert creation and lazy/default editor-document paths while keeping handlers thin.
- [ ] 2.2 Add server and HTTP tests for explicit selection, omitted-theme compatibility, invalid input atomicity, and themed document creation.
- [ ] 2.3 Run affected server tests and typecheck.

## 3. Management Theme Selection And Preview

- [ ] 3.1 Create a controlled accessible event-scoped theme chooser with all three options and disabled-state behavior.
- [ ] 3.2 Create shared read-only landscape and vertical theme previews that delegate non-HTML interpolation to the exported core `DefaultTemplateRenderer` and reuse validated materialized output.
- [ ] 3.3 Add production-component Storybook stories and focused chooser/preview/interpolation tests.
- [ ] 3.4 Run affected web tests, typecheck, and Storybook build.

## 4. Add Alert And Editor Re-theming Workflows

- [ ] 4.1 Integrate the chooser into Add alert, reset a fresh flow to Clean Signal, and always submit the selected `themeId`.
- [ ] 4.2 Add an explicit focused-editor starter-theme confirmation that describes visual replacement, behavior preservation, disabling, and review requirements.
- [ ] 4.3 Apply confirmed themes through the existing draft updater/history path and show review-and-save guidance without changing cancel behavior.
- [ ] 4.4 Add management API, Add alert, and editor tests for selection, error preservation, confirmation, undo, save/live-impact behavior, media removal, preserved audio/TTS, and review state.
- [ ] 4.5 Run affected web tests, typecheck, and production build.

## 5. End-To-End Verification

- [ ] 5.1 Add browser coverage for creating an event alert with a selected theme and for explicit re-theming with preserved nonvisual behavior and reset review gates.
- [ ] 5.2 Run focused Playwright coverage, relevant repository quality gates, and strict OpenSpec validation.
