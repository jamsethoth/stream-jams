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


## Shared Browser Sources presentation (2026-10-04)

Alerts, Screen Effects, Timers and Music must use the same compact Browser Sources band: boxed expand/collapse icon, heading typography, subtitle indentation, readiness summary, detail separator and responsive stacking. Share the production presentation component so module styles cannot diverge. Preserve module-specific URL actions, output scopes, credential masking and disclosure state. This is a presentation refinement of existing management surfaces, with no provider or output-contract changes.

Validate all four real module routes at desktop and narrow widths, including keyboard expansion/collapse, and cover collapsed, expanded, empty and refresh-failure states in Storybook.


## Graphical widget bounds (2026-10-04)

Expose a single Edit layout mode for widget bounds and component geometry in the Music preview with an outer corner handle and matching width/height inputs. Pointer resize uses the current grid preference and a scale captured at pointer-down; keyboard arrows remain exact (Shift = 10 px). Escape or pointer cancellation restores the complete starting appearance. Clamp dimensions to the schema and selected output profile, fit content insets and component rectangles, and preserve font sizes. Entering Edit layout seeds the component geometry from the rendered automatic arrangement when needed. Outer handles remain management-only and disabled with active custom CSS. Existing Save and per-profile/per-view persistence apply.


## Independent desktop placement (approved 2026-10-04)

Add a collapsible Desktop overlay placement panel in Music with a 1920×1080 logical desktop preview, drag movement, precise X/Y fields, independent grid/alignment snapping and transient edge/center guides. Save nullable positions independently for full/compact desktop views in Music config, defaulting legacy settings to existing alignment. Apply positions only at the private desktop recipient boundary; browser projections retain their profile alignment. Clamp positions when appearance sizes change. Reset restores alignment. Render desktop availability, display, enablement and Music visibility status with a link to shared Overlay settings. Preview is an unsaved draft and uses the production widget; CSS recovery remains available. No automatic desktop enablement or changes to display selection.

## Desktop scaling (approved 2026-10-04)

Add proportional corner scaling and numeric percentage controls to desktop placement. Persist independent full/compact scales from 10 to 300 percent, defaulting legacy settings to 100 percent. Bound the scaled footprint to the desktop canvas, preserve browser appearance, support keyboard and Escape cancellation, and keep native editing disabled under active custom CSS.

Approved refinement: Configuration remains visible with enablement, initial view, theme, alignment, idle behavior/delay and background opacity. Appearance defaults collapsed with Widget/Artwork/Title/Details/Progress selection; preview component selection opens the matching inspector. Colours use swatch plus validated hex and a separate opacity row. Advanced spacing/text/custom shadow use disclosures, shadow includes Off/Subtle/Strong presets. Reset is scoped to the current profile/view.
