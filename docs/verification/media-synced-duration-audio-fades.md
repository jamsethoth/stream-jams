# Media-synchronized duration and audio fades verification

## Behavior

- New Alerts and Screen Effect variants use media-linked duration; existing saved content without a mode remains Custom.
- Alert duration uses visible local audio/video layers with a 5-second fallback. Screen Effects use video and separate sound with a 10-second fallback. Both cap at 120 seconds.
- Stored asset metadata is authoritative at playback admission. A bounded repair action probes legacy timed media with missing duration.
- Each local audio source has independent fade-in and fade-out settings. Browser overlays, local previews and named-device playback calculate the same linear absolute-time envelope. Overlapping fades are proportionally shortened.
- Alert and Screen Effect local-media volumes are displayed as 0%-200% and persist as normalized 0-2 gain. Preview, browser-source and named-device playback amplify values above 100%; TTS provider safety volume remains provider-bounded.
- Replays retain the admitted duration and source lengths. TTS remains outside the fade model.

## UX review

- Applicable UX areas: focused Alert editor, Screen Effect hierarchy/editor, asset metadata, explicit save behavior and local preview.
- Failure and empty states explain the fallback and offer **Retry duration** when a timed asset has no readable metadata.
- Controls use labeled radio buttons, checkboxes and numeric inputs with standard keyboard behavior. The existing editors retain Undo, Redo, Revert and Save semantics.
- Media volume controls share one percentage component with explicit 0% and 200% bounds.
- Storybook includes the media-linked duration and enabled-fades state. Focused Testing Library coverage exercises duration selection, repair and fade defaults.

## Automated evidence

- ESLint over all changed TypeScript and TSX files: passed. The repository-wide `eslint .` command also scanned retained untracked CI evidence and reported two generated fixture files outside the product source.
- `corepack.cmd pnpm typecheck`: passed for the complete workspace.
- `corepack.cmd pnpm build`: passed. Vite reported the existing large-chunk advisory.
- `corepack.cmd pnpm exec vitest run --reporter=dot --maxWorkers=1`: 242 files and 2,096 tests passed after removing the unused legacy desktop volume helper and its three isolated tests.
- Node script tests: 9 tests passed.
- Storybook production build: passed.
- Storybook Chromium interaction and accessibility run: 23 suites and 236 tests passed.
- Affected Playwright journeys for Alert video/audio and Screen Effects: 5 tests passed.
- Desktop focused playback and routing tests: 28 tests passed; desktop typecheck passed.
- `openspec.cmd validate add-media-synced-duration-audio-fades --strict`: passed.
- `git diff --check`: passed.

## Live workflow evidence

- Rebuilt the production web and server bundles and started one local instance at `http://127.0.0.1:39187`; `/health` returned `status: ok`.
- In the Alert editor, the Alert inspector showed **Match longest media** and **Custom**, disabled the numeric duration while linked, and explained the 5-second fallback when no readable timed media was present.
- In the Screen Effects manager and editor, the live hierarchy showed sets, effects and collapsible variants plus **New variant**. The editor retained the centered local preview, local sound, mute control, weighted variants and duration controls.
- Enabling a Screen Effect source's **Fade in** control revealed the 500 ms default duration. Undo restored the saved draft, so live verification did not persist test changes.
- The rebuilt Screen Effect editor displayed **Embedded audio volume (%)** as 100, accepted the 200 maximum, enabled Save, and restored the saved value through Undo without persisting the check.
