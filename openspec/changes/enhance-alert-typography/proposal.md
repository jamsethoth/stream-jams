## Why

Alert text needs reusable uploaded fonts and richer styling to remain readable and match streamer branding. The approved PixiJS prototype demonstrated freely draggable warp handles with dynamic row/column splits.

## What Changes

- Add reusable font assets with validated upload, authenticated delivery, usage tracking, and protected deletion.
- Add text outline color/opacity/thickness, italic, underline, and letter spacing while preserving legacy appearance.
- Persist bounded warp grids and expose direct editing, splitting, removal, reset, and undo/redo.
- Share font loading and warped text rendering across editor, browser sources, and the desktop overlay.

## Capabilities

### New Capabilities
- `alert-advanced-typography`: Uploaded fonts, text decoration, outlines, and editable text deformation.

### Modified Capabilities

Existing alert and asset behavior is extended by the new capability; legacy requirements remain applicable.

## Impact

Core typography/asset schemas and asset-reference discovery; server asset upload, metadata, and validation; React editor/assets UI; shared output rendering. Add an exact PixiJS dependency for GPU mesh rendering. No arbitrary CSS, remote font URLs, or management credentials enter playback data.
