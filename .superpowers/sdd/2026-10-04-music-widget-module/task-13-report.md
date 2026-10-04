# Task 13 report — Music appearance, CSS and branding

Status: implemented on `codex/add-music-widget-module`. No user Music source, saved settings, or production output was changed during verification.

## Behavior and follow-on interfaces

- `/manage/music` lazy-loads `MusicPage`. The page reads and saves the existing versioned Music module config through `GET/PUT /management/overlays/modules/music/config`; `createMusicApi(client)` adds `getMusicConfig`, `saveMusicConfig`, and `listMusicOutputs`. It reads Music live/test output metadata from the existing `/management/overlay-outputs` boundary, and uses the existing key creation/regeneration methods for selected-profile URLs. Output keys are never placed in fixtures, stories, or logs.
- Landscape and vertical profiles each retain independent full and compact appearance, branding, fonts, initial view, theme, alignment, idle behavior, and opacity. View geometry and insets remain bounded with positive content dimensions. Numeric drafts tolerate intermediate invalid text; letter spacing accepts fractions. Theme reset replaces only the selected view's base appearance and preserves its branding and the module CSS.
- Branding uses the native asset picker and supports per-view image, width/height, insets, fit, position, and opacity. An explicit image-aspect action uses validated image dimensions, clamps the resulting height, and shows the resulting field value. Image and title/detail font assets can be selected or cleared independently.
- The preview renders the production `MusicWidget` with sample metadata and the selected profile/view geometry, using only unsaved local changes. Full title, artist, and album metadata remain accessible in management outside the pointer-disabled preview. CSS source has a lazy-loaded local AST validation result with line/column diagnostics and last-valid preview; source can be disabled or cleared with keyboard-reachable controls outside the widget Shadow DOM. An invalid draft cannot be saved.
- `saveValidatedMusicConfig(service, input)` is the server save boundary. It parses the shared Music config schema and calls `validateMusicCss` from the lazy core subpath before durable save, including when CSS is disabled. Its only invalid-CSS exception lets a user disable an already saved, corrupt stylesheet when the source, contract version, every other config value, and module enablement are unchanged. The source is preserved. Direct HTTP regression proves rejection leaves durable config unchanged.
- The page uses the shared dirty-navigation source. A late save response cannot replace newer draft edits; Save-and-leave returns false if newer edits remain. Loading, validation, output-key actions, and save responses are guarded on unmount. Clipboard denial shows an actionable error.

## UX scope

Applied `docs/design/ui-refactor-mvp-ux-spec.md` Management UI, Output Profiles, Asset Library, Error Handling, and Accessibility sections, plus `docs/ui-guidelines.md`, `docs/design-tokens.md`, and `docs/ai/overlay-error-presentation.md`. The editor uses native management controls, existing asset selection, status/error/dirty-navigation patterns, and token-based styling. Transparent live overlays still receive only saved validated config; preview diagnostics stay in management. Provider transport and playback controls remain outside this task.

## Files and reasons

- `apps/server/src/modules/music/music-config-save.ts` and test: shared save-boundary CSS policy, narrow corrupt-source recovery, and direct HTTP durability regression.
- `apps/server/src/runtime/runtime-composition.ts`: route the generic Music save through the policy after asset validation.
- `vitest.config.ts`: resolve the core CSS policy subpath in server tests without an eager root export.
- `apps/web/src/management/music/music-api.ts` and test: typed generic config and Music output calls with response checks.
- `apps/web/src/management/music/MusicAppearanceEditor.tsx`, `MusicBrandingEditor.tsx`, and `MusicCssEditor.tsx`: bounded per-view controls, native asset selection hooks, and accessible CSS diagnostics.
- `apps/web/src/management/music/MusicPage.tsx`, `music.css`, test, and stories: saved/draft orchestration, output actions, fixture preview, dirty navigation, nine focused tests, and six browser-visible states.
- `apps/web/src/management/ManagementApp.tsx`, `routing/management-route.ts` and test: lazy Music route and Modules navigation.
- `apps/web/src/management/music/MusicSourcesPage.tsx`: link from source setup to appearance.
- `apps/web/src/App.test.tsx`, `management/ManagementApp.test.tsx`, and `stories/mock-apis.ts`: typed Music API fixtures for existing app/story checks.

## Verification and remaining gates

- Measured RED: the server guard test initially failed because the implementation was absent. GREEN: server save guard and direct Fastify HTTP regression 3/3; Music page 9/9; route and typed API 25/25. Intentional Modules navigation change required updating one route expectation. A test-only CSS typing issue and a real duplicate React key issue were corrected before green.
- Web and server TypeScript project build, changed-file ESLint, and production Vite build passed. Route budgets: bootstrap 68.39/100, overlay 138.90/150, operator 131.19/175, management 249.21/250 KiB gzip. The Music page is lazy loaded; no CSS policy export was added to the core root.
- Storybook production build passed. The scoped Chromium runner passed all six Music appearance stories with accessibility and `--failOnConsole`; its local server was stopped afterward. The Load Error story stubs only its expected diagnostic and forwards other console errors.
- Full repository suite and disposable-service end-to-end checks are reserved for Tasks 15–16 integration. No live Pear account or user output was used. The management route has 0.79 KiB gzip headroom, so later additions should continue to use lazy imports or reduce its bundle.
