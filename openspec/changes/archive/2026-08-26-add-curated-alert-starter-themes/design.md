## Context

Alert creation and the focused editor already operate on validated, editable alert documents with fixed landscape (`1920x1080`) and vertical (`1080x1920`) profiles. This change adds a small built-in catalog at the core boundary, threads an optional selected theme through alert creation, and applies a theme to an existing editor draft without creating a new persisted theme relationship.

The catalog is deliberately asset-free: its generated compositions contain text and solid-fill shape layers only. It must preserve the current local-first security and rendering boundaries: no assets, external fonts, arbitrary CSS/HTML/JS, downloads, marketplace behavior, migrations, or dependencies are added.

## Goals / Non-Goals

**Goals:**

- Provide exactly three universal theme IDs: `clean-signal` (default), `bold-pop`, and `neon-terminal`.
- Generate deterministic, idempotent, schema-validated ordinary editor documents for every canonical event and both target profiles.
- Give alert creation an event-scoped, accessible chooser and make explicit re-theming of an existing draft safe and understandable.
- Preserve all nonvisual alert behavior while replacing visual composition and correctly resetting review state.

**Non-Goals:**

- User-created templates, saved theme links, catalog downloads, marketplaces, import/export, new media/shape capabilities, BL-008, BL-009, BL-040, or unrelated BL-039 cleanup.
- Migrations, external assets or fonts, arbitrary presentation code, new dependencies, or changes to alert matching, playback, persistence ownership, audio, or TTS behavior.

## Decisions

### Keep the catalog in core and materialize documents, not references

Core owns the literal-ID schema, immutable catalog summaries, default, and pure materializer/re-theme operation. It deterministically derives layer IDs and ordering from document ID, theme ID, and semantic role; it returns `alertEditorDocumentSchema.parse(...)` output. The server and web app consume this contract instead of reproducing layouts.

Alternative considered: persist a selected theme ID on each alert. Rejected because catalog edits would otherwise silently affect existing alerts and require a storage/migration lifecycle. Materializing an ordinary editable document gives operators a stable starting point and preserves existing persistence boundaries.

### Use fixed, normalized theme blueprints across both profiles

Each blueprint defines both target-profile rectangles, scaled to fixed dimensions with integer rounding and in-bounds geometry. Each uses a 2.5% internal inset; the eyebrow uses the upper 20–25% and the message takes the remaining panel area.

| Theme | Visual blueprint |
| --- | --- |
| Clean Signal | Translucent navy `#07111DDE` panel with narrow cyan `#53D8FBFF` left accent; system sans, 56px/800 message, fade 300ms ease-out; panel `(15,66,70,22)%` landscape and `(9,66,82,18)%` vertical. |
| Bold Pop | Axis-aligned magenta `#EF3F8FFF`, cyan `#16D9D2FF`, and yellow `#FFD34EFF` blocks behind a dark `#171321F2` panel; rounded sans, 64px/800 message, scale 300ms ease-out; overlapping unrotated rectangles around `(18,67,64,20)%` landscape and `(11,64,78,20)%` vertical. |
| Neon Terminal | Near-black `#020805F2` panel with green `#31F577FF` top rule and shadow; monospace, 52px/700 message, slide-up 300ms ease-out; panel `(14,66,72,20)%` landscape and `(8,64,84,20)%` vertical. |

Implementation-level blueprint choices are fixed as follows so the normalized output has no remaining ranges. Insets are 2.5% of each scaled panel dimension on every side. The eyebrow receives 22.5% of the inset content height and the message receives the exact remainder. All generated text is left-aligned, vertically centered, uses line height `1.05`, and has a transparent, zero-padding text box. Clean Signal uses a 22px/700 cyan eyebrow and a left accent equal to 0.75% of the profile width for the full panel height. Bold Pop uses a 24px/800 yellow eyebrow; its magenta, cyan, and yellow block rectangles are respectively `(16.5,65.5,24,8)%`, `(68,73,15,10)%`, and `(20,82.5,28,6)%` in landscape, and `(8.5,62.5,30,7)%`, `(72,72,18,10)%`, and `(14,82,34,5)%` in vertical. Neon Terminal uses a 20px/700 green eyebrow, a top rule equal to 2.5% of the scaled panel height, and zero-offset green text shadows with 8px eyebrow blur and 12px message blur. Every generated layer uses the theme entrance, fade exit, zero delay, and the approved 300ms ease-out timing. Percentage-to-pixel conversion and all derived inset, split, accent, and rule dimensions use `Math.round`.

The generator accepts canonical event starter metadata and uses the same blueprint for every canonical event. It emits only text and shape layers, and explicit profile layouts retain each profile's availability.

Alternative considered: one adaptive layout with runtime responsive rules. Rejected because supported output profiles are fixed and explicit layouts are easier to validate, preview, and review.

### Preserve the primary message before replacing visuals

The re-theme operation derives the message in this exact order: a text layer named `Message` (case-insensitively), first visible text layer by order, first text layer by order, then the canonical starter message. It preserves the text template/result for the new message layer while replacing all text/shape/image/video composition.

It retains identity, name, event type, matching/variation behavior, cooldown, priority, duration, samples, template variables, audio, and TTS. It disables the alert, marks both profiles `needs-review`, and preserves profile availability.

Alternative considered: preserve every existing visual layer. Rejected because it would not produce a coherent theme or reset media as promised.

### Keep creation compatible and re-theming explicit in the editor

`AlertCreateRequestInput = z.input<typeof alertCreateInputSchema>` is the caller/wire type and retains optional `themeId`; `AlertCreateInput = z.output<typeof alertCreateInputSchema>` is the parsed internal type and has required/defaulted `themeId`. `apps/server/src/http/routes/management-ui.ts` parses unknown `request.body` and passes parsed `input.data` through `ManagementUiService.createAlert` to `AlertSetManagementService.createAlert`; those service signatures use only `AlertCreateInput`. The browser `ManagementApi.createAlert` accepts `AlertCreateRequestInput` for transport compatibility, while `AlertSetsPage` always sends its selected theme. Existing callers that omit it receive Clean Signal.

The editor exposes an `Apply starter theme` flow that opens a confirmation explaining visual replacement, preserved behavior, disabling, and review requirements. Only its `Apply theme` action updates the current draft through the existing updater/history path, retaining undo, save, dirty-state, and live-impact behavior. A warning toast tells the operator to review both profiles and save.

Alternative considered: applying on chooser selection. Rejected because the operation removes visual media and changes live eligibility, so explicit confirmation is required.

### Preview the same bounded materialization in management UI

The chooser has three accessible controlled options and read-only landscape and vertical previews using real catalog materialization and resolved event sample text. Its preview helper delegates to the already exported core `DefaultTemplateRenderer` with `escapeHtml: false`; it does not implement a second placeholder formatter. It uses semantic management tokens outside the preview; fixed blueprint colors are confined to preview output. Production and Storybook reuse real components, not synthetic HTML or interactive canvas controls.

## Risks / Trade-offs

- [A generated layout violates document constraints] → validate every materialized result with the editor-document schema and test all themes, canonical events, and profiles.
- [Re-theming surprises an operator] → require explicit confirmation, preserve nonvisual configuration, disable the alert, reset review state, and show review/save guidance.
- [Catalog changes alter saved alerts] → store ordinary materialized documents only; never persist or resolve a catalog link after application.
- [Duplicated preview/render logic drifts] → render catalog output through a shared read-only preview helper and test interpolation separately.
- [Unknown caller sends a theme ID] → reject it at the typed boundary without partial mutation.

## Migration Plan

1. Add the core ID contract, catalog, materializer, and pure application operation with focused schema and preservation tests.
2. Thread parsed selected/default theme input through existing server alert creation without a migration.
3. Add chooser previews and editor confirmation/application on top of existing management state and history paths.
4. Verify creation and re-theming in browser coverage. Rollback consists of removing the entry points; already materialized alerts remain ordinary valid documents.

## Open Questions

None.
