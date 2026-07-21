## Why

The alert canvas supports free positioning, media, text, and animation, but every text layer still renders with one fixed visual treatment. Basic typography and container styling are the largest user-visible gap between the current editor and a practical alert-authoring experience.

## What Changes

- Add bounded, provider-independent text style fields for a local font preset, size, weight, horizontal and vertical alignment, line height, text color, and text shadow.
- Add simple layer-container styling for background color and opacity, padding, corner radius, and shadow.
- Expose the same validated controls in the focused editor for both landscape and vertical profile designs.
- Render saved styles identically in editor preview, local preview playback, Send test, and live browser-source output.
- Migrate existing alert documents to explicit defaults that preserve their current appearance.
- Keep custom font upload, external font URLs, rich-text markup, arbitrary CSS, gradients, filters, blend modes, and timeline/keyframe editing out of this change.
- Require `refactor-management-ui-ux` and `improve-management-ui-ux-audit-followups` to be complete and present on `origin/main` before implementation begins.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `alert-configuration-management`: Alert layers gain validated typography and simple container-style controls that remain consistent across authoring, preview, test, persistence, backup, and live rendering.

## Impact

- Extends alert editor schemas, stored documents, migrations, backup/restore validation, playback resolution, and overlay instruction contracts in `packages/core` and `apps/server`.
- Extends the focused alert editor, canvas, production overlay renderer, Storybook coverage, and browser tests in `apps/web`.
- Adds no font service, asset type, CSS injection surface, external network dependency, or general-purpose design system.
