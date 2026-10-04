# Task 12 report — Music source setup and status

Status: implemented on `codex/add-music-widget-module`. No user Pear instance, saved settings, or production output was changed.

## Behavior and exact follow-on interfaces

- `GET /management/music/status` returns `musicManagementStatusSchema`: `{enabled, selectedProviderId, status, missingAssetIds: {landscape, vertical}}`. Saved enablement, selected registration, live connection state, and missing branding/font assets are independent. `MusicManagementService.getStatus()` reads the current module and registration, `MusicRuntimeCoordinator.getStatus()`, and `AssetLibraryService.resolveMusicAssets()` for both profiles. It returns asset IDs only, never raw artwork URLs or private handles.
- `POST /management/music/providers/:providerId/reconnect` calls `MusicManagementService.reconnect(providerId)` and returns the same status schema. It reconciles only an active Music registration; inactive sources remain selected only when explicitly activated through the generic provider route.
- Existing `POST/GET/DELETE /management/music/pairing` now validate public `musicPairingAttemptViewSchema`. `POST /management/music/providers/:providerId/credential` accepts only `{pairingAttemptId, configuration}` through `musicCredentialReplacementInputSchema` and returns `musicCredentialReplacementResultSchema`: `{validation, runtimeReconcilePending, credentialRetirementPending}`. All routes use existing management authorization; overlay credentials fail.
- `ProviderManagementService.replaceMusicCredential()` reserves a server-only approved Pear claim, validates the candidate token, writes a fresh secret reference, re-reads the current record, and commits the same provider ID with its current active bit. A narrow queue serializes replacement attempts. Validation, keyring, database, or claim failure leaves the old credential and registration intact, removing the provisional secret. Music activation and deactivation no longer rewrite a stale credential field. After durable commit, the claim is consumed, runtime reconciliation is attempted, and the former secret is retired. A runtime callback failure is reported as a committed replacement with `runtimeReconcilePending: true`; the user can retry through the reconnect route. A failed old-secret deletion is reported as `credentialRetirementPending: true`; the old entry is unused but may remain in the OS keyring. No durable cleanup retry exists yet, so the UI says this plainly.
- The web typed boundary is `createMusicApi(client): MusicApi`, composed into `createHttpManagementApi()`. Methods: `beginMusicPairing`, `getMusicPairing`, `cancelMusicPairing`, `getMusicStatus`, `reconnectMusicSource`, `replaceMusicCredential`. Generic `validateProvider`, `registerProvider`, `activateProvider` and `setOverlayModuleEnabled("music", enabled)` remain authoritative for their existing workflows. No token input or response was added.
- `/manage/music-sources` lazy-loads `MusicSourcesPage`; it offers explicit pair, transport test, save or replacement, selection, enablement, reconnect, and cancellation. It polls while visible every 4 seconds, retains the last status on refresh failure, marks it stale, cancels on unmount, and guards late pairing, detail, action and status responses. Auth-required and missing-asset diagnostics are separate. Task 13 should link its Music module editor to this source route; Task 14 should preserve only non-secret registration metadata and require fresh pairing after restore; Task 15 can exercise this page against a disposable Pear fixture without changing the public API.

## UX scope

Applied `docs/design/ui-refactor-mvp-ux-spec.md` sections Management UI, Integrations, Provider Setup, Error Handling, Diagnostics, and the `docs/ui-guidelines.md` Status Freshness and Accessibility rules. This is MVP source setup/status. Appearance editing, CSS and branding controls remain Task 13; Plex/Spotify adapters remain backlog BL-054. The page uses the existing management shell, provider form styles, error banners, toast, dirty navigation guard, and role/label controls. Storybook has Empty, Connected, Authorization Required, Reconnecting, Stale Status, Missing Assets, Pair Approved, Pair Denied, and Load Error production-component states.

## Files and reasons

- `packages/core/src/music/management.ts`, `packages/core/src/index.ts`: strict shared pairing/status/replacement schemas and public types.
- `apps/server/src/modules/music/music-management-service.ts` and test: saved/live/asset status and guarded reconnect.
- `apps/server/src/modules/providers/provider-management-service.ts`, `sqlite-provider-registration-repository.ts`, and provider tests: fresh-secret replacement, compensation, serialized races, and narrow Music deactivation.
- `apps/server/src/http/routes/music-management.ts`, `music-management.test.ts`, `management-ui.ts`, `runtime/runtime-composition.ts`: authenticated routes and runtime wiring.
- `apps/web/src/management/music/music-api.ts` and test: typed HTTP boundary.
- `apps/web/src/management/music/MusicSourcesPage.tsx`, test, and stories: native setup, live status, errors, controls, and browser-visible states.
- `apps/web/src/management/ManagementApp.tsx`, `management-api.ts`, `routing/management-route.ts` and route test: lazy route, typed client composition, navigation and Music enablement.
- `apps/web/src/App.test.tsx`, `management/ManagementApp.test.tsx`, `stories/mock-apis.ts`: complete typed management fixtures for the new API.

## Verification and remaining gates

- The prescribed Corepack RED command could not start because its global pnpm cache raised `EPERM`; this is an environment failure, not a product test result. Installed workspace Vitest/TypeScript/ESLint binaries were used.
- Affected run: 9 test files, 127 tests passed. Subsequent focused additions: provider management 30 tests passed; Music Sources page 9 tests passed, including denial/expiry, late selection/pairing, cancellation, and 4-second stale refresh/unmount. TypeScript project build, targeted ESLint and `git diff --check` passed.
- Production Vite build and route budget gate passed: management 246.85/250 KiB gzip; the lazy Music Sources chunk is 3.45 KiB gzip. Bootstrap 68.37/100, overlay 137.95/150, operator 130.78/175 KiB.
- Storybook production build passed with sandbox escalation after its manager cache crossed a read-restricted path. Scoped Chromium Storybook runner passed 9 Music stories with `--failOnConsole`. Its local server was stopped afterward.
- Full repository gates and disposable-service Playwright/E2E are deferred to the final integration checkpoint (Task 15/16). A real Pear approval was intentionally not performed. The retained unused keyring entry after an exceptional retirement failure is disclosed above; cleanup needs an explicit maintenance path if a later checkpoint requires automatic recovery.
