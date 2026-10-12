# Design: Discord Voice Overlay

## Discord access model

Discord's local RPC server is the only supported source of another participant's speaking state outside a bot in the call. RPC scopes are "only available to approved partners", except that the `rpc` scope is allowed for the application owner ([Discord OAuth2](https://docs.discord.com/developers/topics/oauth2), [Userdoccers OAuth2](https://docs.discord.food/topics/oauth2)). Each streamer therefore creates and owns a Discord application; Stream Jams never ships a shared application ID until BL-072 succeeds.

Transport is IPC (`\\?\pipe\discord-ipc-0..9`). The WebSocket transport is deprecated and origin-restricted ([Discord RPC](https://docs.discord.com/developers/topics/rpc)). IPC is local to the PC running Discord, so the server process (same PC in single-PC mode) owns the connection.

## Library

`@xhayper/discord-rpc` (ISC, 1.5.1 released 2026-09-24, Node >= 20; Electron 44 ships a newer Node) provides IPC pipe discovery, framing, request/response matching, generic `subscribe`, and the secret-based login and refresh. `discord-rpc` (discordjs/RPC) is abandoned since 2021; `@discordjs/rpc` has only pre-release builds. Stream Jams adds what the library lacks: bounded reconnect, token persistence, PKCE, and channel-follow resubscription. Re-evaluate `@discordjs/rpc` when it ships stable.

## Authentication

1. Connect and receive `READY`, which includes the signed-in user. The wizard uses this to show "Discord found, signed in as X" before any authorization.
2. `AUTHORIZE` with `client_id`, scopes `rpc` and `identify`, and a PKCE `code_challenge` (S256). Discord shows its consent prompt.
3. Exchange the code at `https://discord.com/api/oauth2/token` with `grant_type=authorization_code`, `code`, `client_id` and `code_verifier`, omitting `client_secret`. This requires the application's **Public Client** toggle ([Userdoccers OAuth2](https://docs.discord.food/topics/oauth2)).
4. `AUTHENTICATE` with the access token. Refresh with the `refresh_token` grant before expiry (example lifetime 7 days) and store rotated tokens.

**Secret fallback.** PKCE over RPC is documented only by community docs. If the spike (task 0.1) shows Discord rejects it, the wizard asks for the Client Secret instead, stores it in the OS secret store, and the exchange sends `client_secret` without PKCE. `redirect_uri` is omitted (the library's working path); if the spike shows it is required, the wizard shows one fixed value to add under OAuth2 Redirects. Spike results are recorded in this file before implementation continues.

The access token, refresh token and any client secret live only in the OS secret store under the `discord` namespace. The Client ID is not secret and is saved with the source registration.

## Following the call

On authentication: `GET_SELECTED_VOICE_CHANNEL`, subscribe to `VOICE_CHANNEL_SELECT`, then for the current channel subscribe to `VOICE_STATE_CREATE/UPDATE/DELETE` and `SPEAKING_START/STOP`. On channel change, unsubscribe from the old channel and subscribe to the new one; the roster is replaced, never merged. Leaving a call yields an empty roster with `channel: null`.

## Reconnect

Discord limits RPC connections to two per minute ([Userdoccers RPC](https://docs.discord.food/topics/rpc)). Reconnect uses bounded exponential backoff starting at 5 s and capped at 60 s, never faster than 30 s between attempts after two failures, and runs only while Voice is enabled. Discord not running is a normal "Waiting for Discord" state, not an error. `INVALID_TOKEN` (4009) or close `TOKEN_REVOKED` (4003) triggers one refresh; if refresh fails, live output clears and management asks the user to reconnect. Stream Jams never re-sends `AUTHORIZE` on its own, so Discord never shows repeated prompts.

## Roster model

```
VoiceSnapshot {
  generation, revision, observedAt,
  status: "disabled" | "waiting-for-discord" | "auth-required" | "connected" | "error",
  channel: { id, kind: "guild-voice" | "dm" | "group-dm", name, guildName? } | null,
  participants: [{ id, displayName, avatar: { kind: "proxied", path } | { kind: "default", index },
                   speaking, selfMute, selfDeaf, serverMute, serverDeaf, bot, joinedAt }]
}
```

`displayName` prefers the payload's `nick`, then global name, then username. Participants are capped at 100 (Discord's voice-channel member cap is lower). Order is configurable: join order (default) or alphabetical, with "speaking first" as an option.

## Avatars

Overlays never contact Discord. The server fetches `https://{cdn_host}/avatars/{id}/{hash}.png?size=128` (only the Discord CDN host from `READY`, `cdn.discordapp.com` by default), bounds size and type the same way Music artwork is bounded, caches by hash, and serves it under an overlay-authorized path. Default avatars are bundled locally and chosen by index.

## Overrides

Per-participant overrides keyed by Discord user ID: hidden, display name, idle image and speaking image (asset library assets). Overrides persist, are included in backups, and apply in every output. When only a speaking image exists, idle shows it dimmed.

## Wizard automation

| Step | Automated | Manual |
| --- | --- | --- |
| 1. Find Discord | Detects the IPC pipe and READY user, re-checks every 2 s, shows signed-in account | Start Discord desktop if it isn't running |
| 2. Create app | "Open Developer Portal" opens the default browser at the applications page; suggested name with a Copy button; annotated screenshots | Click New Application, name it, accept terms |
| 3. Copy Client ID | Paste button and live format validation (numeric snowflake); Public Client instruction (or secret field in fallback) | Turn on Public Client, copy Client ID |
| 4. Authorize | Sends AUTHORIZE, says "Check Discord for a prompt", 60 s cancellable timeout | Click Authorize in Discord |
| 5. Verify | Shows the live current call roster with speaking indicators | Join a call to see it (optional) |

Errors map to the step that fixes them: `INVALID_CLIENTID` → step 3; OAuth2 `invalid_client` or `unauthorized_client` → "turn on Public Client" (or re-copy the secret); consent denied → retry step 4; Discord closed → step 1.

Not automated on purpose: creating the application or changing its settings. Discord offers no API for this without the user's own token, and automating the Developer Portal with a user session would be self-botting and against Discord's terms ([Discord Terms](https://discord.com/terms)).

## Future approval (BL-072)

If Discord approves a Stream Jams application, a project Client ID becomes the default (like the Twitch project Client ID) and the wizard collapses to step 4. Approved apps that need a secret keep it on a hosted token service (Overlayed does this); PKCE with a public client would avoid that. User-owned applications remain supported.
