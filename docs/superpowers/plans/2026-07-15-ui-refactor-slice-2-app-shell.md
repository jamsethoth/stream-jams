# UI Refactor Slice 2: App Shell, Routing, And Design Foundation

Status: complete.

OpenSpec change: `refactor-management-ui-ux`.

## Scope

Replace component-local tabs with the approved sidebar shell and a dependency-free route model. Add the reusable interaction primitives required by later management screens while keeping every current panel reachable.

## Route Model

- `/` and `/home`: Home, temporarily adapting the current Dashboard panel.
- `/event-sources`: Event sources, temporarily adapting Twitch setup.
- `/tts-providers`: TTS providers.
- `/modules/alerts`: nested Alerts module.
- `/assets`, `/diagnostics`, `/settings`: stable product areas.
- `/legacy/modules`, `/legacy/overlays`, `/legacy/playback`: explicit temporary adapters for current panels removed from primary navigation.
- Unknown management paths resolve to Home without adding a router dependency.

Navigation uses native links, `window.history.pushState`, and `popstate`. Stable route IDs remain separate from display labels.

## Interaction Foundation

- A context-based dirty-state registration and guarded navigation flow supports Save and leave, Discard, and Cancel. `beforeunload` also warns while registered state is dirty.
- One destructive confirmation dialog supports action, scope, consequence, recovery, and optional typed confirmation.
- Actionable errors expose summary, cause, next step, severity, timestamp, reference ID, and correction link.
- Masked values remain concealed by default and expose explicit reveal and copy actions with success or failure feedback.
- System, Dark, and Light theme preferences are low-risk view state stored locally and applied through CSS variables.

## Verification

1. Add failing route, management-shell, dirty-navigation, and primitive tests.
2. Implement the minimum route model, shell, context, and components.
3. Update current panel navigation tests and Storybook stories.
4. Run focused tests, typecheck, lint, Storybook build/test, full unit tests, production build, strict OpenSpec validation, and Playwright management coverage.
