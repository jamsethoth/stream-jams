## Context

An `AlertEditorDocument` stores shared layers and profile-specific geometry. Text layers currently contain only a template, while both editor canvas and production overlay impose a fixed bold centered treatment. Styling must remain provider-independent, serializable, boundary-validated, and identical across local preview, Send test, and live output.

The product does not currently support font assets or external web fonts. Introducing those would expand media validation, asset serving, licensing, browser loading, backup, and failure handling, so this change starts with local browser-safe presets.

## Goals / Non-Goals

**Goals:**

- Add useful typography and text-box styling without changing the alert service boundary.
- Preserve existing alert appearance through defaults and migration.
- Keep style values bounded, portable, and safe to translate into CSS properties.
- Maintain preview and production rendering parity.

**Non-Goals:**

- Font uploads, external URLs, rich text, variable-specific accent spans, gradients, filters, blend modes, arbitrary CSS, or keyframes.
- Styling management UI chrome or redesigning the canvas layout.

## Decisions

### Store typed style objects on text layers

Text layers gain `textStyle` and `boxStyle` objects. `textStyle` contains a font preset ID, bounded size, approved weight, bounded line height, horizontal/vertical alignment, color, and optional shadow. `boxStyle` contains background color, padding, corner radius, and optional shadow. The fields are shared across target profiles because layers are shared; profile documents continue to own geometry only.

Alternative considered: store arbitrary CSS strings. Rejected because strings are difficult to validate, unsafe to migrate, and would make editor/overlay parity unreliable.

### Use a fixed local font preset catalog

The first catalog maps stable IDs to browser-safe local stacks such as system sans, rounded sans, serif, and monospace. Documents persist the preset ID, not a raw `font-family` string. Unknown IDs fail validation instead of fetching a resource.

Alternative considered: store any installed font name. Rejected because availability varies across the management browser and OBS browser source.

### Normalize colors and numeric bounds in core schemas

Colors use one canonical hexadecimal RGBA representation. Sizes, line height, padding, radius, offsets, blur, and opacity are finite and bounded. Shared core helpers own parsing and defaults so editor forms, saved documents, backup restore, and server APIs accept the same values.

Alternative considered: rely on browser CSS parsing. Rejected because invalid or browser-specific values would cross persistence and trust boundaries.

### Resolve one presentation model for canvas and overlay

One pure mapping converts validated style contracts into React style values used by both alert canvas preview and `OverlaySurface`. Send test and live playback preserve the same typed style in resolved instructions; no provider payload or raw CSS crosses into the overlay.

Alternative considered: duplicate CSS mapping in editor and overlay components. Rejected because drift is the primary regression risk for authoring controls.

### Use native disclosures for major layer sections

The existing Live TTS, Typography, Text box, Position and size, and Animation preset sections use native `details` and `summary` elements. Sections start open to preserve the current workflow, remain keyboard operable without custom state, and may be collapsed independently without changing alert data.

Alternative considered: add persisted accordion state. Rejected because disclosure state is low-risk transient view state and persistence is unnecessary for this focused usability change.

### Backfill explicit compatibility defaults

Older documents parse with defaults matching the current fixed appearance. A database migration rewrites stored editor documents to the current schema version so backup/export and later edits are deterministic.

Alternative considered: leave defaults implicit forever. Rejected because future style-default changes would silently alter old alerts.

## Risks / Trade-offs

- [OBS and management browsers render a font preset differently] -> Use only local fallback stacks; gate exact shared-mapper output, computed browser CSS, and fixed-viewport outer-box geometry. Keep screenshots optional for human review and use an OBS/Cef browser source as a manual smoke check rather than a pixel-diff gate.
- [Large padding changes effective content size] -> Keep geometry as the outer box, clamp padding, and show overflow in preview exactly as live output will render it.
- [Schema growth makes editor forms noisy] -> Use native controls in one selected-layer style section and omit advanced properties.
- [Migration changes existing appearance] -> Assert compatibility defaults against current CSS and add before/after fixtures.

## Migration Plan

1. Add style schemas, defaults, compatibility parsing, and resolved-instruction fields.
2. Migrate stored text layers to explicit default style objects inside the existing editor-document migration path.
3. Update the shared canvas/overlay style mapper before exposing editor controls.
4. Add controls, stories, component tests, and browser-visible preview/live parity checks.
5. Roll back by retaining the additive stored fields while old code ignores them; do not destructively strip user styles.

## Open Questions

None.
