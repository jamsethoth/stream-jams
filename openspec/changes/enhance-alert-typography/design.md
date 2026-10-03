## Context

The user approved custom fonts, outlines with editable color/opacity/thickness, italic, underline, letter spacing, and the PixiJS warp prototype with dynamic grid splits. They explicitly requested a written plan followed by implementation using GPT-6.1 Sol low-effort subagents. This approval supersedes additional skill handoff pauses. Existing alert data uses strict text styles and four font presets; assets already provide persisted files, authenticated delivery, usage and retirement protection.

## Goals / Non-Goals

Goals: reusable font uploads, backward-compatible styles, editable saved deformation, matching editor/browser/desktop rendering, failure reporting, and focused tests. Non-goals: replacing the whole editor with Pixi UI, arbitrary CSS/font URLs, per-glyph editing, animated warps, publishing, and converting the prototype itself into production code.

## Decisions

1. Extend existing assets with `font`. TTF/OTF/WOFF/WOFF2 uploads have a 10 MiB maximum, extension/signature/container validation, normalized MIME, and normal asset IDs. Font files use the existing asset repository/store/authorization and backup lifecycle. Do not probe them as audio/video. Text references participate in availability, usage, deletion/replacement compatibility, and instruction asset-version discovery.
2. Extend `AlertTextStyle` with optional backward-compatible fields: `fontAssetId?: string | null`, `italic?: boolean`, `underline?: boolean`, `letterSpacingPx?: number` (-20..100), `outline?: { color: RGBA; widthPx: number } | null` (0..32), `warp?: AlertTextWarp | null`. Missing fields render as no font override, no decoration, zero spacing, no outline/warp. Preserve unknown-field rejection.
3. `AlertTextWarp = {columns: number[], rows: number[], points: {x:number,y:number}[]}` stores normalized reference coordinates and row-major deformed coordinates. Axes include 0 and 1, strictly increase with minimum gap 0.06, and contain 3..7 entries. Points x=-0.5..1.5 and y=-1..2, finite and count matching rows*columns. Initial axes are [0,.5,1]. Share the approved bounded tensor-product interpolation in core. Split sampling preserves the surface; removal retains outer boundaries and at least three entries. Reset returns an identity grid. Arbitrary folds and overshoot are a documented authoring consequence; renderer rejects nonfinite/excessive geometry. A future spline replacement requires separate visual approval because it changes saved deformation semantics.
4. Keep React/HTML controls and existing editor history. Warp mode suppresses layer move/resize, maps viewport pointer coordinates into layer coordinates, exposes keyboard/numeric editing, split/cancel/remove/reset, and commits one history action per completed drag. Guides never appear live. Warp state is shared text style; normalized points adapt to each profile's layer box.
5. Shared text rendering loads uploaded FontFace from an authorized asset blob/URL before showing text. Plain text retains CSS layout; warped text uses browser Canvas 2D shaping/line layout and a lazily loaded exact PixiJS 8.14.0 MeshPlane, avoiding management-route eager bundles. Preserve line wrapping, alignment, padding, shadow, opacity, underline, and spacing. Use 32 vertices per axis and bounded 2x texture sampling (maximum texture side 4096). Render on changes, clean up on unmount/stale loads; no continuous ticker. Use a shared renderer to produce per-layer canvases, avoiding unlimited WebGL contexts. Font loads must be bounded/cleaned up and replacement-aware.
6. Font/render readiness participates in existing output preparation, with a bounded failure callback. Fail closed live and report through existing playback failure/management error paths. Editor shows actionable errors. Use the same renderer in the editor and OverlaySurface used by browser/desktop output.

## Risks / Trade-offs

- Rasterized outlines change apparent thickness under deformation; intentional and accepted in the prototype. Higher sampling improves edges at a bounded memory cost.
- Global polynomial grids can overshoot; axis count/gap/coordinate and renderer limits bound resource usage. This version preserves the demonstrated interaction instead of silently changing it.
- Fonts can be corrupt or replaced while loading; validate containers and handle FontFace rejection with clear recovery. Never expose storage paths or management authorization through live URLs.
- Schema additions touch old test fixtures; absent fields remain valid and retain existing appearance.

## Migration Plan

Keep legacy documents readable without rewriting them. Add asset table migration only where a media-type check constraint requires it, retaining dependent data. New styles persist through the existing alert save flow. Backup continues to capture font asset files. Rollback to an older binary cannot understand newly saved font/warp data; retain backups before any operator deployment.

## Open Questions

None blocking implementation. Hardware acceptance in OBS and the installed desktop app will be reported separately from browser/build checks.
