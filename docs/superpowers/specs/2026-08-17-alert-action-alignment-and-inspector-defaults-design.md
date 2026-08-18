# Alert Action Alignment And Inspector Defaults

## Goal

Make the Alert Sets inventory actions align consistently across rows and reduce initial visual density in the focused alert editor's right-hand inspector.

## Scope

This change stays within the existing MVP Alert Sets inventory and focused alert editor. It does not change alert data, save behavior, action availability, or disclosure persistence.

## Design

### Alert inventory actions

- Keep the existing uniform flex gap between inline actions.
- Give the Enable/Disable toggle one shared minimum width sized for the wider `Disable` label. This prevents the right-aligned row from shifting earlier actions when the label changes.
- Style the `More` summary with the same compact control height, horizontal padding, border radius, font size, and centered alignment as adjacent compact secondary buttons.
- Preserve all current labels, accessible names, menu behavior, responsive wrapping, and action order.

### Editor inspector disclosures

- Remove the forced-open default from every option disclosure in the right-hand layer inspector: `Live TTS`, `Typography`, `Text box`, `Position and size`, and `Animation preset`.
- Continue using native `details` and `summary` elements so each section remains keyboard accessible and independently expandable.
- Treat collapsed state as an initial view default only. Do not add persistence or force sections closed again after the user opens them.

## Verification

- Add or update component coverage for equal Enable/Disable sizing hooks and the compact More control.
- Update editor component and Storybook interaction coverage to assert that disclosures start collapsed and reveal their controls when opened.
- Run focused tests, lint, typecheck, relevant Storybook checks, and the browser-visible Alert Sets/editor Playwright workflow.
- Rebuild and restart the local app, then verify the Alert Sets action alignment and collapsed editor inspector against the production build.
