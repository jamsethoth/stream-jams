# UI Refactor Slice 6: Focused Alert Editor MVP

Status: implementation in progress.

OpenSpec change: `refactor-management-ui-ux`.

## Scope

Build the distinct alert-editor route and the approved canvas-first workflow on persisted alert-editor documents. Keep management authorization, global asset identity, alert-set ownership, normalized playback, and profile-scoped browser-source boundaries intact.

## Domain And Backend Contract

- Persist validated `AlertEditorDocument` records behind a typed repository and migrate existing alert rules into deterministic editor documents on first open.
- Save one alert at a time, updating the existing alert rule/variant runtime projection and its management profile metadata without adding a parallel live-alert model.
- Preserve independent landscape and vertical layer geometry, profile enabled/review state, layer visibility/order, preset animation fields, and built-in samples.
- Resolve profile-targeted live and test playback through the existing queue and overlay delivery path; mark tests distinctly and reject sends when no matching browser-source client is connected.
- Add authorized get/save/send-test routes and typed client methods with actionable error mapping.

## Editor UI Contract

- Add `/manage/modules/alerts/editor/:alertId` to the local route model with stable set/event/profile query context and a focused shell that collapses the primary sidebar.
- Provide selected-set alert search/switching, landscape/vertical profile switching, canvas, safe-area/grid/background controls, zoom controls, toolbar actions, and Layers/Alert/Event inspector tabs.
- Support Text, Image, Video/GIF, Audio, and TTS layers. Shape remains omitted because no approved MVP screen requires it.
- Keep one selected layer, exact geometry fields, visibility/order controls, asset picker integration, preset animation fields, drag/keyboard positioning, and resize handles synchronized with the same profile layout state.
- Provide session undo/redo, explicit save, immediate revert when history allows, dirty navigation guards, built-in/session sample editing, always-available preview, and connected-output Send test.
- Show a larger-screen requirement below the supported editor width while preserving readable context.

## Verification

1. Add failing domain, repository, service, route, API-client, route-model, editor interaction, and playback-profile tests.
2. Implement persistence, runtime projection, profile-targeted playback, and authorized editor APIs.
3. Build the focused editor and its Storybook states for landscape, vertical review, no selection, selected layer, Event samples, dirty state, and blocked Send test.
4. Add Playwright coverage for deep-link context, profile edits, explicit save/dirty guard, local preview, and blocked/connected Send test.
5. Run focused and full tests, lint, typecheck, build, Storybook build/tests, Playwright, strict OpenSpec validation, CodeGraph sync, and responsive visual checks.
