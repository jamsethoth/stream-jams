## Why

The alert document, canvas, and production overlay already understand simple shape layers, but users cannot create or configure one in the focused editor. Exposing the existing capability provides useful backgrounds, bars, and badges without introducing a larger composition system.

## What Changes

- Add Shape to the editor's layer picker with a visible, bounded default size and fill.
- Let users edit a shape's solid fill, name, visibility, geometry, order, and existing preset animation settings.
- Preserve shape layers through save, profile copy, design copy, duplicate, backup/restore, preview, Send test, and live playback.
- Reuse the validated color control introduced by `add-alert-visual-style-controls` instead of creating a second color-input model.
- Keep gradients, strokes, masks, clipping, boolean shape operations, freehand drawing, groups, and custom SVG/HTML out of this change.
- Require `add-alert-visual-style-controls` to be complete and present on `origin/main` before implementation begins.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `alert-configuration-management`: The focused alert editor exposes simple shape-layer creation and authoring using the existing layer, profile, preview, and live-rendering workflows.

## Impact

- Primarily affects the focused alert editor, alert canvas, layer defaults, validation, production overlay rendering coverage, stories, and browser tests.
- Reuses the existing `shape` layer contract and renderer plus the visual-style color control.
- Adds no new dependency, asset format, drawing engine, or advanced composition model.
