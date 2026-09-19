# Media-synchronized duration and audio fades verification

## Behavior

- New Alerts and Screen Effect variants use media-linked duration; existing saved content without a mode remains Custom.
- Alert duration uses visible local audio/video layers with a 5-second fallback. Screen Effects use video and separate sound with a 10-second fallback. Both cap at 120 seconds.
- Stored asset metadata is authoritative at playback admission. A bounded repair action probes legacy timed media with missing duration.
- Each local audio source has independent fade-in and fade-out settings. Browser overlays, local previews and named-device playback calculate the same linear absolute-time envelope. Overlapping fades are proportionally shortened.
- Replays retain the admitted duration and source lengths. TTS remains outside the fade model.

## UX review

- Applicable UX areas: focused Alert editor, Screen Effect hierarchy/editor, asset metadata, explicit save behavior and local preview.
- Failure and empty states explain the fallback and offer **Retry duration** when a timed asset has no readable metadata.
- Controls use labeled radio buttons, checkboxes and numeric inputs with standard keyboard behavior. The existing editors retain Undo, Redo, Revert and Save semantics.
- Storybook includes the media-linked duration and enabled-fades state. Focused Testing Library coverage exercises duration selection, repair and fade defaults.

## Automated evidence

- `corepack.cmd pnpm lint`: passed.
- `corepack.cmd pnpm typecheck`: passed for the complete workspace.
- `corepack.cmd pnpm build`: passed. Vite reported the existing large-chunk advisory.
- `corepack.cmd pnpm exec vitest run --reporter=dot --maxWorkers=1`: 241 files and 2,083 tests passed.
- Node script tests: 9 tests passed.
- Storybook production build: passed.
- Storybook Chromium interaction and accessibility run: 23 suites and 234 tests passed.
- Affected Playwright journeys for Alerts, audio routing, alert video/audio, Screen Effects and full-app visual UX: 25 tests passed.
- Desktop focused playback and routing tests: 28 tests passed; desktop typecheck passed.
- `openspec.cmd validate add-media-synced-duration-audio-fades --strict`: passed.
- `git diff --check`: passed.

## Live workflow evidence

- Rebuilt the production web and server bundles and started one local instance at `http://127.0.0.1:39187`; `/health` returned `status: ok`.
- In the Alert editor, the Alert inspector showed **Match longest media** and **Custom**, disabled the numeric duration while linked, and explained the 5-second fallback when no readable timed media was present.
- In the Screen Effects manager and editor, the live hierarchy showed sets, effects and collapsible variants plus **New variant**. The editor retained the centered local preview, local sound, mute control, weighted variants and duration controls.
- Enabling a Screen Effect source's **Fade in** control revealed the 500 ms default duration. Undo restored the saved draft, so live verification did not persist test changes.
