# Proposal: Discord Voice Overlay

## Why

On 2026-10-12 the maintainer asked for a StreamKit-style Discord voice overlay that shows who is in the streamer's current Discord call and who is talking, but brandable with Stream Jams' own editor and available on both the desktop overlay and OBS browser sources. Research is in the project note `notes/discord-voice-overlay-evaluation.md`.

Discord only exposes call membership and speaking state through the desktop client's local RPC API, and only four approved apps (StreamKit, Overlayed, Reactive Images, Stream Deck) may use it for everyone. Any other application works for its owner. The maintainer chose (2026-10-12) to have each streamer create their own Discord application through a guided wizard that automates as much as possible, and to try for Discord approval later to remove the manual steps. Voice activity is overlay-only and does not publish to the central event bus.

## What Changes

- New disabled-by-default **Voice** overlay module with a Discord voice source.
- The server connects to the local Discord desktop client over Windows IPC with the streamer's own Discord application, keeps tokens in the OS secret store, follows whichever call the streamer joins (server voice channel, DM or group DM), and normalizes the roster (participants, speaking, mute/deafen, avatars).
- A setup wizard detects Discord, walks the streamer through creating their application, needs only the Client ID when Discord's Public Client mode with PKCE works (secret fallback otherwise), and verifies the connection by showing their live call.
- Voice renders through the shared module outputs (landscape/vertical browser sources and desktop surfaces) with the shared module editor: layouts, speaking highlight, filters, shared shadow, custom CSS, per-participant name/image overrides (including idle/speaking images) and desktop placement.
- Operator panel shows the current call and can hide the overlay or a participant.
- Backlog: BL-068 (this change) and BL-069 (apply for Discord RPC approval).

## Out Of Scope

- Discord bots, client mods, impersonating StreamKit, scraping StreamKit, and the Discord Social SDK (all rejected in the research note).
- Event bus events for joins or speaking (maintainer decision 2026-10-12).
- Dual-PC companion relay of the Discord connection; it follows the existing dual-PC design when that is built.
- A shared Stream Jams Discord application; BL-069 covers it after approval.
- Controlling Discord (muting, switching channels).

## Impact

- `packages/core`: voice roster, configuration and override schemas; module id `voice`; `voice-source` provider capability; `discord` secret namespace.
- `apps/server`: Discord IPC source, auth/token lifecycle, avatar proxy, Voice runtime, management and overlay routes, migration, backup/restore.
- `apps/web`: setup wizard, Voice editor, overlay renderer, operator panel, stories.
- `apps/desktop`: Voice on desktop surfaces through the existing visual transport.
- Dependency: `@xhayper/discord-rpc` (exact pin) for the IPC transport.
