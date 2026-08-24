## Why

Stream Jams currently requires a Twitch OAuth client secret before a streamer can connect an account. A public Windows and future Electron application cannot safely ship that secret, leaving the management onboarding flow unusable in a normal installation.

## What Changes

- Replace Twitch Authorization Code Grant with public-client Device Code Grant.
- Ship the project-owned public Twitch Client ID with an environment override for development and forks.
- Add management-protected start and poll operations that keep Twitch device codes server-side.
- Update the Event Source wizard to open Twitch activation, show the user code and expiry, poll automatically, and present actionable terminal failures.
- Refresh public-client tokens without a client secret while preserving refresh-token rotation.
- Preserve token validation, OS credential storage, non-secret account metadata, and EventSub reconnection.
- **BREAKING** Remove the unused authorization-code callback route and `TWITCH_CLIENT_SECRET` runtime configuration.

## Capabilities

### New Capabilities

- `twitch-device-oauth`: Public-client Twitch account authorization, polling, token refresh, secure token storage, and management onboarding behavior.

### Modified Capabilities

None.

## Impact

- Twitch API client, OAuth service, HTTP routes, runtime composition, and their tests.
- Management API contracts, Event Source setup UI, Storybook stories, and Playwright coverage.
- Local environment template, MVP runbook, and Twitch OAuth design/plan documentation.
- No new dependency or hosted service.
