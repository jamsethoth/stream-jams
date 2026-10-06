# Design Tokens

This file documents the management theme contract in `apps/web/src/App.css`. Agents must use these custom properties for new management UI instead of adding fixed theme colors.

`ManagementPresentationProvider` is the single preference owner (`stream-jams-theme`: system/light/dark). `management-theme.ts` maps Mantine typography, spacing/radii and color variables to this contract; `management-mantine.css` supplies semantic control and portal overrides after Mantine's CSS layer. Operator shares the management provider and stylesheet. App.css remains the shared native token source for private overlays; do not import the management stylesheet there.

Mantine teal denotes the accent, red negative/destructive, green positive, yellow warning and blue information. Filled, light and outline variants resolve to the matching semantic token pair. Do not use a library palette color to invent a new status meaning. Defaults keep small fields, wrapping command labels, 6px control/8px panel radii and reduced-motion support. Portals inherit root tokens and the resolved scheme in both document directions.

Standard control presentation belongs to the management-only theme adapter, including toast dismiss commands and semantic invalid borders. Workflow CSS owns layout and specialized surfaces; it must not recolor descendant Mantine label/error text with broad `p`, `span`, `label`, or `input` selectors. Preserve external error/help IDs through the documented input slot and use the compatible boolean error state. Shared native consumers keep their existing App.css/timer selectors. See [migration verification](verification/management-component-consistency.md) for route and exception evidence.

## Color

| CSS custom property | Light value | Use |
| --- | --- | --- |
| `--color-canvas` | `#f4f6f8` | Management app background |
| `--color-surface` | `#ffffff` | Inputs, sidebar, and base surfaces |
| `--color-surface-subtle` | `#edf1f4` | Selected, grouped, and code surfaces |
| `--color-surface-raised` | `#ffffff` | Dialogs and temporary raised UI |
| `--color-text` | `#161a20` | Primary text |
| `--color-text-muted` | `#596370` | Descriptions, labels, and metadata |
| `--color-border` | `#c9d0d8` | Standard borders and dividers |
| `--color-border-strong` | `#8e99a6` | Emphasized controls and dialog borders |
| `--color-accent` | `#087a6a` | Primary actions and selected navigation |
| `--color-accent-hover` | `#056457` | Hovered primary actions |
| `--color-accent-soft` | `#dcefeb` | Selected navigation background |
| `--color-info` / `--color-info-soft` | `#1f5f99` / `#e5f0fa` | Informational status and errors |
| `--color-positive` / `--color-positive-soft` | `#237a45` / `#e1f2e7` | Connected, ready, and successful states |
| `--color-warning` / `--color-warning-soft` | `#8a5a00` / `#fff1cf` | Review and warning states |
| `--color-negative` / `--color-negative-soft` | `#b4232d` / `#fae7e9` | Failure and destructive actions |
| `--color-negative-hover` | `#941c25` | Hovered destructive actions |
| `--color-focus` | `#0a74c9` | Keyboard focus outline |
| `--color-on-action` | `#ffffff` | Text on primary and destructive action fills |
| Overlay text | `#ffffff` | Browser-source text output |
| Overlay text shadow | `rgba(0, 0, 0, 0.72)` | Text legibility over stream content |

Dark values are defined under `:root[data-theme="dark"]`. System mode uses the same dark values through `prefers-color-scheme`; Light always overrides system preference.

## Spacing

| Value | Use |
| --- | --- |
| `4px` | Compact tab gap |
| `6px` | Label/input gaps, small card radius |
| `8px` | List gaps, card radius |
| `10px` | Table cell vertical padding, compact controls |
| `12px` | Form gaps, diagnostic padding, action gaps |
| `14px` | Internal item padding, buttons |
| `16px` | Mobile shell padding, section gaps |
| `18px` | Workspace gaps |
| `20px` | Panel padding and subsection spacing |
| `24px` | Header bottom margin and header gaps |
| `--space-page` (`28px`, `16px` at the compact breakpoint) | Shell page padding |

## Typography

- Font stack: `Inter`, system UI, `Segoe UI`, sans-serif.
- Management and Operator text uses only the type scale below. `App.css` defines it as `--font-size-*` custom properties and `management-theme.ts` mirrors it as Mantine `fontSizes` and `headings.sizes`. `scripts/management-type-scale.test.mjs` rejects raw `font-size` values in management and Operator CSS.

| Token | Size | Use |
| --- | --- | --- |
| `--font-size-xs` | `12px` | Metadata, captions, table headings, `small` |
| `--font-size-sm` | `14px` | Labels, buttons, inputs, secondary text, Operator body |
| `--font-size-md` | `16px` | Management body text, `h4` |
| `--font-size-lg` | `18px` | `h3` subsection titles |
| `--font-size-xl` | `20px` | `h2` section, editor and dialog titles |
| `--font-size-page` | `26px` | Page titles (`PageHeader`, Operator `h1`) |

- Unstyled headings inside the management shell, Operator and dialogs default to these steps; a component selector may pick another step but never a raw size.
- Commands use Mantine sizes from the theme at weight `600`. The `App.css` control font reset applies only to native (non-Mantine) controls, so it cannot override Mantine's layered sizes.
- Overlay text uses the validated per-layer typography and box-style contract; `alert-text-style.ts` projects it to CSS. Do not impose one fixed font size or weight on every authored layer.
- Letter spacing should stay `0`.

## Radius

- Current management radius is `6px` for inputs, diagnostics, metrics, and output URL code.
- Current larger component radius is `8px` for top-level panels, fieldsets, variants, and repeated output/module items.
- Do not increase radii for stylistic effect unless a broader design change is approved.

## Overlay Safe Area

- Treat the overlay as a `100vw` by `100vh` transparent canvas.
- Prefer a 16:9 design target for preview stories.
- Keep critical text and visual elements away from the outer edge of the canvas.
- Avoid visible debug chrome on production overlay routes.

## CSS Custom Property Decision

Decision: the management refactor uses CSS custom properties as the runtime theme source of truth. New management components must consume semantic tokens. Overlay rendering may retain fixed transparent-canvas colors where the output contract requires them.
