# UI Refactor Slice 3: Home And Provider Setup

Status: complete.

OpenSpec change: `refactor-management-ui-ux`.

## Scope

Replace the temporary Dashboard, Twitch, and TTS route adapters with setup-focused Home, Event sources, and TTS providers screens. Implement provider registration as a real persisted management capability instead of UI-only state.

## Backend Contract

- Persist provider kind, capability, nickname, non-secret configuration, secret reference, validation state, intake state, active state, available voices, and TTS safety settings.
- Validate provider setup before registration. A failed validation returns an actionable error and does not create a registration.
- Keep validation, registration, and activation separate. A successful first registration for a capability becomes active; later registrations remain inactive until explicitly activated.
- Enforce one active registration per capability in a SQLite transaction and with a partial unique index.
- Keep Streamer.bot credentials in the runtime secret store. Provider views and exports never return credentials.
- Use provider adapters for Twitch, Streamer.bot, Speaker.bot, and browser speech so management behavior is not coupled to one integration.

## UI Contract

- Home shows derived setup tasks, active alert-set summary, top actionable problems, and connections. It does not show live queue or raw logs.
- Event sources uses a selectable list/detail layout and a guided add-source wizard. Connection and intake are distinct states.
- Event-source rows select directly without a `View` action and expose confirmed `Activate` or `Deactivate` actions. Deactivation may intentionally leave no active event source without deleting its configuration.
- TTS providers uses the same list/detail model with a separate wizard, fixed safe voice test, usage count, and provider-owned safety controls.
- Validation failures remain inside the wizard with a summary, next step, retry action, and reference ID.
- Activation impact is loaded before `Set active`; blockers prevent activation and warnings require explicit confirmation.

## Verification

1. Add failing schema, repository, service, route, API-client, and screen tests.
2. Implement the provider migration, repository, adapter boundary, and management service.
3. Implement Home and provider screens plus first-run, partial, configured, validation-failure, and activation-warning stories.
4. Run focused tests, typecheck, lint, full unit tests, build, Storybook build/tests, management Playwright coverage, strict OpenSpec validation, and visual responsive checks.
