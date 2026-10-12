# Tasks

## 0. Spike (maintainer's Windows PC and Discord)

- [ ] 0.1 Connect over IPC with a newly created owner application; confirm `READY` user, `AUTHORIZE` with `rpc` + `identify`, PKCE exchange with Public Client and no secret (else secret fallback), whether `redirect_uri` is needed, and voice/speaking events in a server channel, a DM call and a group DM. Record results in `design.md`.

## 1. Core

- [ ] 1.1 Voice snapshot, configuration, appearance and override schemas; `voice` module id; `voice-source` capability; `discord` secret namespace.

## 2. Server

- [ ] 2.1 Add `@xhayper/discord-rpc` (exact pin); Discord IPC source with bounded reconnect and channel following.
- [ ] 2.2 Auth: PKCE (or secret fallback) exchange, secret-store persistence, refresh, revoked handling without automatic re-prompt.
- [ ] 2.3 Setup controller for the wizard: Discord detection, authorization with 60 s cancellable deadline, error-to-step mapping.
- [ ] 2.4 Avatar proxy with host allowlist, size bounds and cache; bundled default avatars.
- [ ] 2.5 Voice runtime, overlay routes, management routes, migration for config and overrides, backup/restore without secrets.

## 3. Outputs

- [ ] 3.1 Voice renderer for browser sources and desktop surfaces, shared shadow and custom CSS confinement.

## 4. Management

- [ ] 4.1 Setup wizard with screenshots, copy and paste helpers and live verification.
- [ ] 4.2 Voice editor (browser sources, preview, configuration, appearance, CSS, desktop placement) and override list.
- [ ] 4.3 Stories for wizard steps, editor states and renderer states.

## 5. Operator

- [ ] 5.1 Voice panel: status, current call, speaking indicators, overlay and participant hide toggles.

## 6. Verification

- [ ] 6.1 Unit tests against a fake IPC server: connect, auth success/denied/timeout, refresh, revoked, channel switch, leave, reconnect limits, redaction.
- [ ] 6.2 Playwright: wizard happy path and each mapped error, editor save/preview isolation, operator hide.
- [ ] 6.3 Maintainer completes setup from scratch on Windows and checks OBS and desktop overlay in a live call.
