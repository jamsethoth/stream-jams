## Context

The local service already owns Twitch token exchange, validation, OS credential storage, non-secret account persistence, and EventSub reconnection. Its current Authorization Code Grant requires `TWITCH_CLIENT_SECRET`, and the management UI only exposes a callback URL handoff. That model cannot ship safely in a public Windows or future Electron application.

Twitch Device Code Grant supports public clients without a client secret. The approved product design is recorded in `docs/superpowers/specs/2026-07-16-twitch-device-code-oauth-design.md`.

## Goals / Non-Goals

**Goals:**

- Connect Twitch accounts through public-client Device Code OAuth.
- Keep device codes and tokens out of the browser, logs, diagnostics, URLs, and SQLite.
- Preserve existing token validation, account metadata, credential storage, refresh, and EventSub behavior.
- Give the provider wizard an automatic, actionable authorization flow.

**Non-Goals:**

- Hosted OAuth broker or client secret.
- Authorization Code or Implicit Grant fallback.
- User-managed Twitch developer credentials in Settings.
- Multiple connected Twitch accounts or Electron packaging.

## Decisions

### Ship one public application identity

Use `r6jy78npqxcqe68xpsctkcecti6ba3` as the default Twitch Client ID and retain `TWITCH_CLIENT_ID` as an override. Client IDs are public; a secret is neither required nor accepted by this flow.

Alternative: require every user to register a Twitch app. Rejected because it turns ordinary account connection into developer setup.

### Keep device codes server-side

`POST /twitch/auth/start` obtains a Twitch device authorization, stores the device code in an in-memory map under a random opaque authorization ID, and returns only the ID, verification URI, user code, expiry, interval, and scopes. `POST /twitch/auth/poll` accepts the opaque ID and performs at most one Twitch token request when the polling interval allows it.

Alternative: return the Twitch device code to React and poll Twitch directly. Rejected because it expands sensitive OAuth state into the browser and duplicates Twitch parsing there.

### Use client-driven polling with server enforcement

React schedules polls using Twitch's interval. The service also tracks `nextPollAt`, returning `pending` without an upstream call when the browser polls early. Pending records are deleted on success, terminal failure, or expiry and opportunistically pruned on start/poll.

Alternative: background server timers. Rejected because request-driven polling is smaller, shuts down naturally with the wizard, and requires no lifecycle coordinator.

### Preserve the token-storage pipeline

Successful Device Code exchange feeds the existing validation, current-user lookup, OS credential writes, account repository save, and connection-change callback. Public refresh omits client secret and replaces both rotated tokens atomically through the same pipeline.

Runtime recovery reuses that pipeline. EventSub startup validates the stored access token before subscribing, an hourly timer repeats validation, and an EventSub HTTP 401 triggers one forced refresh instead of reconnecting with the same rejected token. Successful refresh replaces both rotated secrets and reconnects EventSub. Failed refresh leaves a referenced runtime error for the existing reconnect wizard.

The EventSub client also resets a watchdog from Twitch's `keepalive_timeout_seconds` on every welcome, keepalive, and notification. A silent session is closed and recreated with the existing bounded reconnect backoff.

### Replace rather than retain Authorization Code Grant

Remove the callback route, pending state map, callback parser, authorization-code exchange, and `TWITCH_CLIENT_SECRET` runtime input after replacement coverage is green. A second unused grant increases security and maintenance surface.

### Keep provider validation explicit

OAuth completion updates the wizard to `Connected`. The existing `Test connection` action remains required before review so OAuth identity and EventSub intake are validated together without racing EventSub startup.

## Risks / Trade-offs

- **Twitch refresh tokens for public clients rotate and may expire after inactivity** -> replace the stored refresh token on every refresh and direct the user through Device Code OAuth again when refresh fails.
- **Popup opening can be blocked** -> always render the verification URI and user code as a fallback.
- **Browser polling can run too quickly** -> enforce Twitch's interval server-side and treat early polls as pending without an upstream request.
- **Pending in-memory authorization is lost on restart** -> the wizard reports expiry/failure and starts a fresh authorization; no durable draft is required.
- **A malformed Twitch response could leak into state** -> runtime-validate every response and fail closed before persistence.

## Migration Plan

1. Add Device Code API/client/service behavior and tests while existing callers still compile.
2. Replace HTTP and management API contracts with start/poll unions.
3. Update the provider wizard, stories, and browser tests.
4. Remove Authorization Code callback code and client-secret configuration.
5. Update runbook/environment documentation and run all gates.

Rollback is the previous branch commit; no database migration is required because token secret references and account metadata remain unchanged.

## Open Questions

None.
