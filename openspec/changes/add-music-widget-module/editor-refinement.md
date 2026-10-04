# Music editor refinement

User request, October 4, 2026: align Music with the Alerts module, place browser sources before preview, put configuration and custom CSS in separate disclosures, mirror graphical colour selection with hex values, and allow preview components to move and resize alongside numeric inputs.

## Implementation

- Keep the current Music feature branch because the requested editor depends on its unmerged implementation. Refresh remote state without replacing ongoing work.
- Reuse the Alerts disclosure structure and RGBA picker. Browser sources come first, then the sample preview, Configuration, and Custom CSS. Secondary panels initially collapse; summaries retain enablement, selected view/profile, link availability and CSS validation state. Preview profile/view selection remains visible. The CSS disable recovery action remains outside the collapsible CSS panel and outside the widget shadow root.
- RGB picker, alpha slider and validated eight-digit hex input update the same draft value. Invalid hex leaves the last valid colour intact and presents an inline error. Configuration controls load on expansion to preserve route budgets.
- Add explicit Edit layout mode for artwork, title, details, progress and time. Capture real production-renderer rectangles before switching from automatic to authored layout. Drag, resize and numeric X/Y/width/height share one bounded geometry contract. Keyboard movement, cancellation, target scaling and scrolling are covered. Resizing text changes its box, not its font size.
- Persist optional per-profile/per-view component rectangles, defaulting old config to automatic layout. Keep rectangles inside widget bounds, including widget resize and projection clipping. Reset restores automatic layout. Use the same production renderer for preview and live/private output; guides and handles are management-only. Active custom CSS may override native layout, so visual editing is disabled until CSS is disabled; saved source is retained.
- All edits remain unsaved preview drafts until the existing Save action. Keep independent profiles/views, assets, dirty navigation, CSS validation and backup/restore boundaries. No provider, credential, audio or output authorization behavior changes.

## Verification

Affected schema, geometry, renderer, editor and management tests; actual Storybook interaction/a11y/console checks; built-service Playwright drag/numeric/save/reload/live parity; web/desktop overlay build, route budgets, strict TypeScript, changed-file lint and OpenSpec validation. Rebuild the desktop runnable folder after the frontend change so the user's current executable reflects the updated editor. Physical authenticated provider acceptance remains separately recorded.

Applicable UX sections: Alerts Browser Sources, Alert Editor Canvas/Inspector, Assets, Target Profiles, Save/Auto-Save and Error Handling. This refinement implements requested Music editing behavior within the current local-first module; future providers and a general-purpose graphics editor remain deferred.
