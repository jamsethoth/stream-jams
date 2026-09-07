# Alert audio routing: contracts and persistence foundation

Implementation checkpoint: September 5, 2026. Scope: `add-alert-audio-routing` tasks 2.1–2.5, following the accepted [packaged capability gate](alert-audio-routing.md). This is not end-to-end feature acceptance.

## Implemented boundaries

- Alert documents normalize missing `outputs` to Browser Source enabled and no local routes. Explicit silence stays explicit. Route IDs are unique/nonempty; no per-layer or combined-output mode is introduced.
- Public core contracts cover named routes, devices, canonical audio records, runtime batches/results, and the playback/device-host interfaces. Destination resolution deduplicates by explicit device ID while retaining route identities, never by label and never through default/communications aliases.
- Creation, hydration, variations, alert/set duplication and re-theming retain outputs and existing disabled/needs-review safeguards. Sibling assignments can diverge independently.
- Migration 019 adds `audio_output_routes`, SQLite NOCASE name uniqueness and paired nullable local binding fields. Repository restart tests cover create/rename/bind/unbind/delete.
- Document save checks current route existence inside the same synchronous transaction as persistence. Deletion checks all saved default/variation references inside its own transaction. Tests cover both save-before-delete and delete-before-stale-save outcomes, nested rollback, and deletion while asynchronous binding enumeration is pending. No transaction spans an await.
- Protected APIs: GET/POST `/audio/routes`, PATCH/DELETE `/audio/routes/:routeId`, GET `/audio/devices`, GET `/audio/status`, POST `/audio/routes/:routeId/test`. Rejected authorization, CSRF, origin, malformed-body and rate-limited requests never reach playback. Errors include safe causes, corrective next steps and affected route/alert identities where applicable.
- Rebinding referenced routes requires explicit confirmation. Renaming does not force rediscovery or erase a missing binding. CLI mode preserves route definitions and reports device capability unavailable.
- Tests serialize explicit route-test requests, recheck global mute after enumeration, and retain the maintenance gate until host terminal completion. The host contract requires a bundled one-second test with authoritative mute throughout and silence on success or failure.
- Required backup integration was pulled forward: portable snapshots include route IDs/names and assignments but clear both hardware fields; preflight rejects dangling references, bound portable rows and conflicting names. Internal rollback snapshots preserve exact local bindings. Schema-drift checks cover the new table. Unsupported old archive schemas remain rejected by the existing compatibility policy.

## Verification

Fresh passing checks in this checkout:

- Backend/core regression command below: **499 tests in 56 files**.
- Web fixture regression command below: **158 tests in four files**.
- `tsc -b` for core, server, web and desktop: passed. This rebuilt the affected TypeScript output without weakening compiler options.
- ESLint on this slice's changed/new implementation and fixture files: passed.
- `openspec.cmd validate add-alert-audio-routing --strict` and `git diff --check`: passed.
- Isolated real-loopback runtime smoke: health, unauthorized-route rejection, authenticated create/bind/test, authoritative mute, clean shutdown, restart without a device host, and retained unavailable binding all passed. A fake audio host emitted no sound; temporary data was removed after shutdown.
- The database-schema skill regenerated the explorer directly from **19 migrations and 20 tables**.

```powershell
corepack.cmd pnpm exec vitest run --project=node --pool=threads packages/core apps/server/src/modules/audio apps/server/src/modules/alerts apps/server/src/modules/backup apps/server/src/modules/db/database.test.ts apps/server/src/modules/playback apps/server/src/http/routes/audio-outputs.test.ts apps/server/src/http/routes/management-ui.test.ts apps/server/src/runtime
corepack.cmd pnpm exec vitest run --project=web --pool=threads apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/alerts/editor/AlertCanvas.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/editor-state.test.ts
corepack.cmd pnpm exec tsc -b packages/core/tsconfig.json apps/server/tsconfig.json apps/web/tsconfig.json apps/desktop/tsconfig.json --pretty false
```

The initial schema tests failed against absent outputs/contracts; repository/service modules and HTTP endpoints were then tested before implementation. Backup tests initially failed on missing route mapping/reference checks. Existing fixture failures were repaired without weakening assertions: the schema-17 migration fixture now removes both later migrations, the backup schema-drift test seeds the new table, and typed editor fixtures include normalized outputs. A stale core build caused missing-export service failures; rebuilding core resolved that environment/build-state issue. Unsupported test-helper syntax and two unused mock parameters were corrected rather than changing TypeScript or lint rules.

## Remaining scope and UX boundary

The packaged audio window has not yet been connected to these APIs. Production `audioDeviceHost` injection, canonical queue admission/dispatch, cancellation/watchdogs, mute during active playback, route failure Diagnostics and the Settings/editor controls remain in tasks 3–5. No partially wired controls are exposed. Actual route playback, final OBS capture, restore setup reporting and active-device-playback restore blocking still require later implementation and acceptance.

Relevant frontend guidance: MVP UX sections **Alerts Module**, **Alert Editor** and **Settings And Backup**. This slice only updates typed test/story data to match the normalized contract; it changes no production React markup, interaction states, keyboard behavior or visual output. Therefore full Storybook interaction/a11y and browser-visible Playwright gates were not rerun for this foundation slice; they remain required for the planned UI slice. The source-based loopback smoke above verifies the new backend workflow. Full repository/publishing gates and packaged hardware acceptance are not claimed here.

No OBS/Wave Link settings, OS defaults or physical devices were changed. No live user data was modified and no tones were played. BL-044 remains in its separate investigation. No commit, push, PR, merge, OpenSpec archive or main-spec sync was performed.
