# Design Tokens

This file documents the current visual constants used by `apps/web/src/App.css`. It is a guardrail for agents and reviewers, not a token extraction refactor.

## Color

| Token | Current value | Use |
| --- | --- | --- |
| Page background | `#f7f8fa` | Management app background |
| Surface | `#ffffff` | Management panels, cards, imports |
| Primary text | `#20242c` | Main text and selected nav |
| Secondary text | `#5f6673` | Descriptions and panel subtitles |
| Label text | `#3d4654` | Form labels and small headings |
| Table heading text | `#4a5361` | Uppercase table headings |
| Border | `#d9dee8` | Top-level management borders |
| Soft border | `#e4e8ef` | Table rows and internal dividers |
| Input border | `#c8ced8` | Inputs, dashed empty states, previews |
| Primary action | `#166c5f` | Save/copy/action buttons and selected nav underline |
| Disabled action | `#a7b2bd` | Disabled buttons |
| Diagnostic background | `#eef7f3` | Success/info diagnostic surface |
| Diagnostic border | `#cde6dc` | Diagnostic border |
| Diagnostic text | `#24564d` | Diagnostic text |
| Overlay text | `#ffffff` | Browser-source text output |
| Overlay text shadow | `rgba(0, 0, 0, 0.72)` | Text legibility over stream content |

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

The current default is to document the existing CSS values and leave extraction to a future refactor.

Current CSS documentation:

- Pros: no production CSS churn, easy review, no regression risk from renaming or inheritance changes, enough context for agents.
- Cons: values can drift from this file if CSS changes without doc updates, no runtime theming, harder to reuse outside `App.css`.

Extracting CSS custom properties:

- Pros: single source of truth in CSS, easier future theming, clearer reuse across management and overlay surfaces.
- Cons: touches many selectors, increases regression surface, needs visual review, and can obscure whether a slice intended behavior or pure token movement.

Decision: keep documentation-only tokens for this guardrails change. Revisit extraction when a UI redesign, theming, or component-library change needs it.
