# Twitch Device Code OAuth Design

## Goal

Replace the local authorization-code setup with Twitch Device Code OAuth so a streamer can connect an account without configuring or exposing a client secret.

## Current Problem

Stream Jams currently generates an authorization-code URL only when both `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are present. The running app has neither value, so setup fails before Twitch opens. More importantly, a distributed Windows or future Electron app cannot safely ship a reusable client secret.

Twitch documents Device Code Grant as the OAuth flow for public clients, including Windows and Electron-style applications. Public clients use a client ID without a client secret.

Primary sources:

- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/
- https://dev.twitch.tv/docs/authentication/register-app
- https://dev.twitch.tv/docs/authentication/validate-tokens/

## Decision

Use Twitch Device Code Grant with a public client.

- Stream Jams public Twitch Client ID: `r6jy78npqxcqe68xpsctkcecti6ba3`.
- Ship that public ID as the default application identity.
- Keep `TWITCH_CLIENT_ID` as a development/fork override.
- Remove the runtime requirement for `TWITCH_CLIENT_SECRET`.
- Preserve OS credential-store persistence for access and refresh tokens.
- Preserve token validation, broadcaster lookup, persisted non-secret account metadata, and EventSub reconnection.

## Server Contract

### Start

`POST /twitch/auth/start` remains management-session protected. It requests a device authorization from Twitch and returns only browser-safe fields:

```json
{
  "authorizationId": "opaque-local-id",
  "verificationUri": "https://www.twitch.tv/activate?...",
  "userCode": "ABCDEFGH",
  "expiresAt": "2026-07-16T18:30:00.000Z",
  "intervalSeconds": 5,
  "scopes": ["bits:read"]
}
```

The Twitch `device_code` remains server-side in an in-memory pending-authorization map. It must not be returned to the browser, logged, or persisted.

### Poll

`POST /twitch/auth/poll` accepts the opaque `authorizationId` and returns one of:

- `pending`: authorization is still awaiting the user.
- `connected`: token exchange, validation, account lookup, secure storage, and EventSub connection completed.
- `failed`: authorization was denied, expired, invalid, or failed upstream.

Polling before Twitch approval is a normal state, not a user-visible error. The server respects Twitch's returned polling interval and removes pending state after success, terminal failure, or expiry.

### Refresh

Public-client refresh requests send the client ID and current refresh token without a client secret. Twitch refresh-token rotation remains authoritative: every successful refresh replaces the stored refresh token.

### Removed Flow

Remove the authorization-code callback route and callback/state implementation after Device Code coverage replaces them. Keeping two unused OAuth implementations would increase security and maintenance surface without an MVP use case.

## Management UI

`Connect Twitch` starts Device Code OAuth and attempts to open Twitch's returned verification URI in a named browser window. The wizard also renders:

- The short Twitch code.
- An `Open Twitch` fallback link when automatic opening is blocked or closed.
- A waiting status while Stream Jams polls.
- The authorization expiry time.
- A cancel/retry action for failed or expired attempts.

On success, the wizard replaces the waiting state with the connected Twitch account. The existing provider connection test remains the explicit next action because it verifies both OAuth account readiness and EventSub intake before review and registration.

Closing the wizard stops browser polling and discards its UI state. Server-side pending state is ephemeral and expires automatically.

## Failure Behavior

No failure is silent.

- Missing client ID: identify this as an application configuration fault, not a user account fault.
- Twitch unavailable: keep the wizard open and offer retry.
- Authorization denied: state that no account was connected and offer restart.
- Authorization expired: offer a fresh code.
- Polling too quickly: honor Twitch's interval without surfacing noise.
- Invalid or malformed Twitch responses: fail closed.
- Credential-store failure: do not persist account metadata or report connection success.

Errors use the existing actionable management error model with a human-readable summary, next step, stable error code, and request/reference ID when available.

## Security

- No client secret is shipped, configured in the UI, or stored.
- The public client ID may be committed and displayed.
- Device codes, access tokens, and refresh tokens never enter browser responses, logs, diagnostics, URLs, or SQLite.
- Access and refresh tokens remain in the OS credential store.
- Twitch token responses are runtime validated before storage.
- The returned token must validate against the configured public client ID.
- Management authentication and rate limiting remain required for start and poll routes.

## Verification

Test-first coverage will include:

- Device authorization and token-poll request encoding.
- Pending, success, denied, expired, malformed, and upstream-failure responses.
- Public refresh without a client secret and refresh-token replacement.
- Server-side-only device-code storage and expiry cleanup.
- Management auth and rate limiting on start/poll routes.
- Wizard waiting, fallback-link, success, denial, expiry, retry, and popup-blocked states.
- End-to-end onboarding from `Connect Twitch` through connected account and provider registration using mocked Twitch boundaries.
- Storybook states for waiting, success, denied, expired, and blocked-popup fallback.

Run the repository frontend and server gates, Storybook tests, Playwright, strict OpenSpec validation, and a live desktop/mobile browser check before completion.

## Non-Goals

- Hosted OAuth broker.
- Authorization Code or Implicit Grant fallback.
- User-supplied Twitch developer credentials in management settings.
- Multiple connected Twitch accounts.
- Electron packaging.
