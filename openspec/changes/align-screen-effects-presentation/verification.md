# Verification

## UX scope

Reviewed the MVP UX spec sections Cross-Cutting UX Rules, Alerts Module, Sets Page, Browser Sources and Alert Editor. This change aligns presentation of the existing approved post-MVP Screen Effects module. Queueing and output delivery remain unchanged; the current Screen Effect variant contract is unified while the repository preserves the legacy SQLite storage shape.

The focused editor now fits its shell, with variant navigation, an inline local media preview and independently scrolling inspector. Variant, Effect and Triggers tabs support arrow keys, Home and End with roving focus. Save remains in the header. The module page puts a collapsed source summary above compact searchable effect rows; Copy and Delete use More.

Loading, empty, context failure, unavailable trigger, disabled draft, failed save and live-test confirmation states retain coverage. Draft edits survive inspector switching. URL values remain masked and existing live confirmations remain in place.

## Results

- Screen Effects Vitest: 4 files, 16 tests passed.
- Screen Effects Storybook: 2 suites, 13 scenarios passed, including axe checks and inventory search.
- Screen Effects Playwright: 2 workflows passed against Vite and against the rebuilt production UI served by Vite preview.
- Web TypeScript/project build and desktop-overlay web bundle: passed.
- Changed-file ESLint: passed.
- Storybook production build: passed (existing large-chunk warning remains).
- OpenSpec strict validation: passed.
- Live browser checks at 1366x768, 1024x600, 800x600 and 390x700 confirmed Save remains visible and there is no horizontal page overflow. Laptop regression checks also assert no vertical page overflow and exercise the lowest animation controls.
- Inspected editor and module screenshots. Production editor capture: `test-results/screen-effects-editor-laptop.png` (local ignored artifact).

Validation was scoped to the changed presentation and workflows; full repository, backend and hardware-output suites were not run. Browser tests mock the existing typed service boundaries and do not prove physical audio or OBS output delivery.

## Local draft preview follow-up (2026-09-17)

User approved local sound with a preview mute option. Preview now uses draft layout, shared overlay preset animation styles, bounded duration, enabled video soundtrack and separate-sound volume. Play/Stop and Mute apply only to local media; no admission API or output routes are used. Close releases object URLs and stops playback. Load/playback failures provide recovery guidance.

- Focused editor/preview Vitest: 2 files, 11 tests passed, covering both audio sources, mute, duration, layout, failure, and cleanup.
- Screen Effects Chromium: 3 existing workflows passed; additional real-media audio preview workflow passed separately using a silent WAV, checking volume, mute, automatic stop, close and no live-test requests.
- Editor Storybook: 10 scenarios including preview passed with axe checks.
- Web typecheck/build, Storybook build, changed-file lint and strict OpenSpec validation passed.
- Restarted isolated evaluation runtime on port 39188 and inspected the actual preview dialog in the in-app browser.
- Physical speaker audibility was not asserted; automated audio used a silent fixture.

## Inline preview correction

Preview playback now uses the central editor canvas. The toolbar Preview action starts the same player; Play/Stop and Mute sit below the canvas. The modal and duplicate static media view were removed. Editing or changing variants stops playback, and leaving the editor releases media. No live output behavior changes.

## Unified variant weighting follow-up (2026-09-17)

Screen Effect variants no longer expose Default and Weighted kinds. Every enabled variant participates in one weighted pool, the editor shows expected chances, and a local 1,000-selection simulation reports expected and observed distribution without saving or sending a live-test request. The repository reads legacy `default` and `weighted` rows and writes the neutral legacy marker `weighted` only in SQLite storage.

- Core Screen Effect tests: 4 files, 36 tests passed; core typecheck passed.
- Affected server Screen Effect and backup tests: 8 files, 110 tests passed; server typecheck passed.
- Screen Effect web tests: 5 files, 24 tests passed; web typecheck and production build passed.
- Full Vitest regression: 234 files, 2,062 tests passed. Deliberate negative-path HTTP and UI diagnostic logs were emitted by passing tests.
- Repository lint, typecheck and build passed. Storybook production build passed with the existing large-chunk warning.
- Focused Screen Effect editor Storybook: 10 scenarios passed with accessibility checks after making the horizontally scrollable simulation region keyboard focusable.
- Screen Effects Playwright: 4 Chromium workflows passed, including 25%/75% chance labels, a 1,000-selection total, retained weight after reload, and no Screen Effect mutation request from simulation.
- `openspec.cmd validate align-screen-effects-presentation --strict`: passed.
