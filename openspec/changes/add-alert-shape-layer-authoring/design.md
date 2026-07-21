## Context

The alert layer contract already includes `{ type: "shape", fill }`, profile layouts can position it, the resolver emits an overlay shape instruction, and the editor canvas plus production overlay can render it. The remaining gap is authoring: the layer picker omits Shape and the inspector has no fill control.

`add-alert-visual-style-controls` establishes the validated color format and shared color input this change should reuse.

## Goals / Non-Goals

**Goals:**

- Make the existing simple shape layer creatable and editable.
- Preserve all standard layer behaviors across profiles and copy/backup workflows.
- Keep editor preview and production overlay rendering identical.

**Non-Goals:**

- New geometric primitives, gradients, strokes, paths, SVG import, boolean operations, masks, groups, or a drawing tool.

## Decisions

### Keep one rectangle shape with one solid fill

Shape continues to mean a rectangular layer whose profile geometry supplies position and size and whose layer data supplies one validated RGBA fill. Rounded panels remain available through text-box styling; shape-specific radius or stroke is not added here.

Alternative considered: define multiple primitive types. Rejected because rectangles cover backgrounds, bars, and badges without a new shape hierarchy.

### Add through the existing layer workflow

Shape appears beside Text, Image, Video/GIF, Audio, and TTS. Creation uses service-owned layer ID generation and a visible default fill and geometry. The existing list supplies select, rename, visibility, order, duplicate, delete, and animation behavior.

Alternative considered: add a canvas drawing gesture. Rejected because the current type-first layer flow is accessible, tested, and sufficient.

### Reuse the visual-style color contract

The inspector uses the shared native color/text control and core color normalizer from `add-alert-visual-style-controls`. No second color type or picker dependency is introduced.

Alternative considered: keep `fill` as any non-empty string. Rejected because invalid CSS could be persisted and render differently between preview and OBS.

### Treat shape as a normal visual layer everywhere

Profile copy, design copy, duplication, migration, backup/restore, local preview, Send test, and live resolution retain shape data exactly as they retain other layer types. Unsupported older code must ignore no known layer; the existing renderer coverage becomes a compatibility test.

## Risks / Trade-offs

- [A newly created shape covers other content] -> Use a low default order or place it immediately behind the selected layer and keep order controls visible.
- [Editor and overlay color handling drift] -> Use the same normalized color and shared rendering mapper.
- [Scope expands into a design tool] -> Accept only a rectangular solid-fill shape in this change.

## Migration Plan

1. Land and verify `add-alert-visual-style-controls` on `origin/main`.
2. Tighten shape fill validation with compatibility parsing for existing valid CSS hex colors.
3. Add creation defaults and inspector controls through the existing layer commands.
4. Extend stories and tests for add, edit, reorder, copy, save, preview, and live rendering.
5. Roll back the authoring controls without deleting already-saved shape layers.

## Open Questions

None.
