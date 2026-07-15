# UI Refactor Slice 5: Assets Library And Picker

Status: completed.

OpenSpec change: `refactor-management-ui-ux`.

## Scope

Replace the metadata-only Assets table with the approved global library and add a reusable in-context picker for the focused alert editor. Keep raw file transfer on the existing authorized asset routes while adding typed library metadata, health, usage, replacement-impact, and deletion contracts.

## Backend Contract

- Persist display name, normalized tags, and created/updated timestamps separately from immutable asset identity and derived file metadata.
- Derive health without loading complete media files and derive usage from alert rules, sets, event types, and target-profile metadata.
- Preserve an asset ID during replacement so compatible references continue resolving; require impact confirmation for in-use replacement.
- Block deletion while references exist and require explicit user confirmation for unused deletion.
- Keep existing management authorization, rate limiting, validation limits, media storage, and overlay-safe file delivery.

## UI Contract

- Assets provides search plus type, usage, health, module, set, event, and tag filters; selected tags use AND matching.
- The table opens a preview/detail inspector with metadata, editable display name/tags, health, and deep links for every usage.
- Replacement and deletion dialogs state affected usages and required follow-up before submitting destructive actions.
- The reusable picker filters compatible media, previews existing selections, and validates/registers a file with display name and tags without leaving editor context.
- Every failed operation presents a human-readable reason, corrective next step, and reference ID that is also logged.

## Verification

1. Add failing metadata repository, library service, media replacement, route, API-client, component, picker, and contract tests.
2. Add the asset-library metadata migration and wire the service into runtime composition.
3. Rebuild Assets and add picker acceptance stories for empty, populated, filtered, detail, upload failure, replacement impact, deletion guard, and selection/upload states.
4. Run focused tests, lint, typecheck, full tests, build, Storybook build/tests, Playwright, strict OpenSpec validation, and responsive visual checks.

## Verification Results

- Focused asset component tests: 8 passed.
- Full unit and integration suite: 113 files and 510 tests passed.
- Playwright: 13 workflows passed, including the asset library workflow.
- Storybook: production build passed; 13 suites and 43 story tests passed.
- Repository lint, typecheck, and production build passed.
- Desktop and mobile library layouts plus the mobile picker were visually checked at representative responsive widths.
