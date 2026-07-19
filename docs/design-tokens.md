# Design Tokens

This file documents the management theme contract in `apps/web/src/App.css`. Agents must use these custom properties for new management UI instead of adding fixed theme colors.

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
| `--color-accent-soft` | `#dcefeb` | Selected navigation background |
| `--color-info` / `--color-info-soft` | `#1f5f99` / `#e5f0fa` | Informational status and errors |
| `--color-positive` / `--color-positive-soft` | `#237a45` / `#e1f2e7` | Connected, ready, and successful states |
| `--color-warning` / `--color-warning-soft` | `#8a5a00` / `#fff1cf` | Review and warning states |
| `--color-negative` / `--color-negative-soft` | `#b4232d` / `#fae7e9` | Failure and destructive actions |
| `--color-focus` | `#0a74c9` | Keyboard focus outline |
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
| `32px` | Desktop shell padding |

## Typography

- Font stack: `Inter`, system UI, `Segoe UI`, sans-serif.
- Management H1: `28px`, `1.2` line-height.
- Panel H2: `22px`, `1.25` line-height.
- Panel H3: `16px`, `1.25` line-height.
- Compact labels and table headings: `13px` to `14px`.
- Overlay text: `32px`, `800` weight, `1.15` line-height, `overflow-wrap: anywhere`.
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
