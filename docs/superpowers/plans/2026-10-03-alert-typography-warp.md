# Alert typography and warp implementation plan

> **For agentic workers:** Use subagent-driven development. The user requested planning followed directly by execution with GPT-6.1 Sol low reasoning. Review once at integration, following the repository's at-most-one-review policy.

**Goal:** Deliver reusable custom fonts, richer text styling, and saved dynamically editable warp grids.

**Architecture:** Extend existing assets and saved text styles. React owns editor controls/history; a shared browser renderer handles fonts and PixiJS deformation for editor and live output.

**Tech Stack:** Strict TypeScript, React 19, Fastify, SQLite repositories, Zod, exact PixiJS 8.14.0, Vitest, Storybook, Playwright.

**Spec:** `openspec/changes/enhance-alert-typography/design.md` and `specs/alert-advanced-typography/spec.md`.

## Global constraints

- Preserve strict TypeScript and separate management/overlay authorization; use existing asset delivery URLs.
- Font uploads: TTF/OTF/WOFF/WOFF2, maximum 10 MiB. No arbitrary CSS or external URLs.
- New text fields are optional for backward compatibility. Outline RGBA width 0..32; letter spacing -20..100.
- Warp axes: 3..7 entries, endpoints 0/1, minimum gap 0.06. Row-major finite points x=-0.5..1.5, y=-1..2.
- No prototype files imported by production. No publishing or live user-data modification in this task.

## Review focus

- Old documents/fixtures must preserve appearance and remain valid (Task 1).
- Font replacement/deletion must see references in text layers and normalized playback (Task 2).
- Stale font loads must not display text or fail a newer instruction (Task 3).
- Split/remove/drag undo must retain both grid topology and coordinates (Task 4).
- Multiple text layers, profile scaling, and mixed scripts must not create unbounded GPU resources or change text layout unexpectedly (Task 3/5).

## Task 1: Core style and warp contract

Owner: core subagent. Files: `packages/core/src/alerts/text-style.ts`, new `text-warp.ts` and tests. Parent owns barrel export integration.

Interfaces: optional `fontAssetId`, `italic`, `underline`, `letterSpacingPx`, `outline: {color,widthPx}|null`, `warp: AlertTextWarp|null`. Export `alertTextWarpSchema`, `AlertTextWarp`, `createDefaultTextWarp()`, `evaluateTextWarp(warp,u,v): {x,y}`, `insertTextWarpSplit(warp,axis:'horizontal'|'vertical',position): AlertTextWarp`, `removeTextWarpSplit(warp,axis,index): AlertTextWarp`. Invalid insert/removal returns unchanged grid; parsing rejects invalid stored data.

- [x] Add focused schema and numerical regressions: legacy parsing, strict unknown keys, bounded fields, invalid grid; split preservation at 441 sample points; limits and removal boundaries.
- [x] Implement pure grid operations and schema additions.
- [x] Run focused core tests and typecheck; report exact results.

## Task 2: Font assets and lifecycle

Owner: font subagent. Files: core asset types/schemas/validator/import and usage/reference functions, server asset modules/routes/migrations as necessary, and `apps/web/src/management/assets/` UI/API. Do not edit text-style/warp files or editor files. Coordinate any barrel exports with parent.

Interfaces: `AssetMediaType` gains `font`; existing upload/library/file APIs supply normal `AssetRecord`/`AssetLibraryItem`. Text font reference is `textStyle.fontAssetId`. Existing media pickers must continue excluding incompatible assets.

- [x] Add tests for supported containers, MIME normalization, size/signature rejection and restart persistence.
- [x] Extend asset lifecycle, metadata, type validation and font reference discovery, including deletion/replacement and instruction versions.
- [x] Add font upload/filter/preview behavior to existing asset library; preview as sample text, never image/video.
- [x] Run affected core/server/web tests and typechecks; report remaining integration points.

## Task 3: Shared browser text renderer

Owner: renderer subagent. Files: new `apps/web/src/overlay/components/AlertTextContent.tsx`, renderer/font helpers and tests; `alert-text-style.ts`; `OverlaySurface.tsx`. Parent wires AlertCanvas. Parent owns package.json/lockfile.

Interface: `AlertTextContent` props `{text:string,textStyle:AlertTextStyle,boxStyle?:AlertTextBoxStyle,width:number,height:number,scale?:number,loadFont?:(assetId:string)=>Promise<Blob>,onReady?:()=>void,onError?:(error:unknown)=>void}`. Container owns background/padding box; coordinate with parent if changing interface. Overlay loadFont fetches existing authorized asset URL with instruction assetVersions. Use CSS for unwarped text and shared raster+Pixi path for warped text. No management credentials embedded in URLs.

- [x] Add style projection and rendering lifecycle tests (font failures, stale async loads, cleanup, dynamic strings).
- [x] Implement browser font loading, Canvas text layout, decoration/outline and bounded mesh rendering with lazy Pixi import and shared GPU resources.
- [x] Integrate readiness/failure into OverlaySurface playback preparation, including text-only instructions.
- [x] Run affected tests/typecheck; supply a production story for visual verification or coordinate parent story.

## Task 4: Editor typography and warp interaction

Owner: parent, after contract names are fixed. Files: `AlertEditorPage.tsx`, `AlertCanvas.tsx`, new `AdvancedTypographyControls.tsx` / `TextWarpEditor.tsx`, relevant CSS/tests/stories. Reuse existing RGBA controls, asset API and editor history.

- [x] Add font library selection/upload plus italic/underline/spacing and outline RGBA/width controls.
- [x] Add warp editing UI with direct handles, splits/removal, numeric/keyboard editing and reset. Prevent conflict with layer geometry gestures; commit once per completed drag.
- [x] Wire AlertTextContent with assetApi.getAssetFile in preview; show management errors with recovery.
- [x] Cover saved reload, dirty state and history; add representative Storybook and browser workflow checks.

## Task 5: Integration and verification

Owner: parent, one independent GPT-6.1 Sol low review after integration.

- [x] Install exact PixiJS dependency; confirm management bundle stays lazy and lockfile agrees.
- [x] Reconcile canonical requirements/docs with implementation. Validate OpenSpec strictly.
- [x] Run lint, typecheck, tests, builds, Storybook build/test and applicable Playwright; classify failures accurately.
- [x] Rebuild/start disposable local service, wait for health, verify font/outline/warp workflow and output in browser.
- [x] Record tested boundaries, known limitations and pending hardware acceptance. Keep implementation local unless publishing is requested.

## Execution record

- Planning: user approved prototype and direct implementation; branch `codex/alert-typography-warp` created from fetched `origin/main` 38aac9a. Prototype retained as evidence.
- Ruling: retain bounded prototype interpolation to preserve approved deformation semantics; no speculative spline redesign. Model request interpreted as GPT-6.1 Sol with `low` reasoning (available light setting).


- Implementation: three GPT-6.1 Sol low agents delivered core contracts, font assets and shared rendering; parent integrated editor controls. Follow-up browser coverage and one independent review completed. See [verification record](2026-10-03-alert-typography-verification.md) for exact checks, resolved findings and acceptance boundaries.
