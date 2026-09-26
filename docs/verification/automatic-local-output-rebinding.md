# Automatic local output rebinding verification

Verified on Windows on 2026-09-26 from `codex/automatic-local-output-rebinding`.

## Automated evidence

- `corepack.cmd pnpm lint` — passed.
- `corepack.cmd pnpm typecheck` — passed.
- `corepack.cmd pnpm test` — passed: 250 Vitest files, 2,164 Vitest tests, and 14 Node checks.
- Focused management UI regressions — passed: 4 files and 32 tests.
- Focused Live TTS regression — passed: 1 test, 124 unrelated tests skipped.
- `corepack.cmd pnpm --filter @stream-jams/web build-storybook` — passed.
- `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci` — passed: 23 suites and 243 tests.
- `corepack.cmd pnpm test:e2e` — passed: 52 Chromium tests, including audio consent, desktop consent, trusted-label omission, and the 16 by 16 pixel Live TTS checkbox.
- `corepack.cmd pnpm desktop:package` — passed and produced `apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe`.
- `corepack.cmd pnpm test:desktop` — passed: 24 packaged-Electron tests, including isolated audio enumeration, production overlay delivery, lifecycle, worker, and media decoding checks.
- `openspec.cmd validate add-automatic-local-output-rebinding --strict --json` — passed.
- `openspec.cmd validate --all --strict --json` — passed: 45 of 45 registry items.

## Behavior covered

- Matching is exact, case-sensitive, and unique; missing, case-mismatched, and duplicate labels do not fall back.
- Audio and desktop reconciliation is opt-in, persists before use, handles concurrent changes, and affects future occurrences only.
- Browser-authored desktop updates omit the server-owned display label.
- Portable backups clear local IDs, labels, and automatic-follow consent.
- Audio and display consent controls default off, disable when a trusted label is unavailable, and expose no-match, ambiguous, and rebound guidance.
- Live TTS reuses the compact native checkbox presentation.

## Packaged and hardware boundary

The runnable Windows package was rebuilt and exercised with isolated temporary profiles. The desktop suite enumerated this machine's current explicit audio outputs and verified the production audio and overlay transports without changing the user's existing Stream Jams profile. Physical device IDs were not forced to churn; deterministic synthetic tests cover changed-ID, ambiguity, persistence-failure, and restart reconciliation behavior.

## Independent review follow-up

An independent read-only PR review found three important edge cases. The corrective patch now snapshots audio bindings before enumeration, reconciles display topology changes during serialized settings refreshes, and permits an opted-out legacy missing display to be disabled without inventing a label. The focused service and HTTP suite passed 31 tests; lint and typecheck passed. A post-review full unit rerun passed 2,165 of 2,166 tests and hit the pre-existing five-second timeout in the unrelated media-matched Alert Editor timing test; that exact test passed immediately in isolation. The earlier clean full run passed all 2,164 then-existing tests.
