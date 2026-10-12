# Proposal: Streamer.bot Named Triggers

## Why

On 2026-10-11 the maintainer asked whether Stream Jams could watch Twitch chat for commands or words and trigger alerts or effects. The evaluation (project notes, "Twitch chat triggers") found it feasible over EventSub `channel.chat.message`, but the maintainer pointed out that Stream Jams is meant to work alongside Streamer.bot, which already handles chat commands, permissions and cooldowns, and chose to rely on it instead.

One gap stops Streamer.bot from driving different module behavior today. Every `CPH.WebsocketBroadcastJson` broadcast reaches Stream Jams as the same Streamer.bot event, `General` / `Custom` (`docs/videos.md`, Streamer.bot section). Alert rules match only provider, source and event type (`packages/core/src/alerts/alert-matcher.ts`), and Screen Effects and timer rules use the same three fields through the shared selector (`packages/core/src/event-bus/selector.ts`). A `!hype` action and a `!lurk` action in Streamer.bot therefore look identical to every module. Videos works around this for itself with a payload marker (`"source": "StreamJams", "type": "VideoRequest"`).

The maintainer chose (2026-10-12) named triggers that work like channel point rewards: one general event, with each rule picking one name, plus an optional message carried through the same alert moderation as other viewer text.

## What Changes

- **Named trigger marker**: a Streamer.bot broadcast with `"source": "StreamJams", "type": "Trigger", "name": "<name>"` is a named trigger. The name is read once at intake, validated as a bounded identity and lower-cased. An optional `message` (viewer text, for example the words after `!hype`) and the existing `userName` / `user.name` field travel with it.
- **Rules pick a name**: Alert rules (Streamer.bot event alerts), Screen Effect triggers and timer event rules can select "Streamer.bot trigger" plus one name. A rule with a name matches only broadcasts carrying that name. Existing `General` / `Custom` rules without a name keep matching every custom broadcast, as today.
- **Picker**: the name is typed, with suggestions from names Stream Jams has received recently. Streamer.bot does not publish a list of the names its actions send, so there is no "unavailable" check like the reward catalog's.
- **Message**: in Alerts the message fills the existing `{message}` template value and TTS text, through the active alert moderation policy. Screen Effects and timers ignore it.
- **Test**: the manual simulation of a Streamer.bot event accepts a trigger name and message, so each editor's Test sends exactly what a real broadcast would.
- **Docs**: a Streamer.bot section with the marker and a `CPH.WebsocketBroadcastJson` example.

## Out Of Scope

- Reading Twitch chat directly (EventSub `channel.chat.message`). Evaluated and deferred: Streamer.bot covers it. It can be added later as another producer of named triggers.
- Videos: Streamer.bot already queues videos with the `VideoRequest` marker, so Videos does not gain named-trigger selection.
- Per-name cooldowns, permissions or argument parsing. Streamer.bot owns those; modules keep their existing cooldowns.
- Wildcard or pattern matching on names.

## Impact

- `packages/core`: external identity, selector, alert identity and effect trigger schemas gain an optional `triggerName`; alert external event gains `message`.
- `apps/server`: Streamer.bot intake (`effect-trigger-adapter.ts`) reads the marker; alert consumer carries the message through moderation; manual simulation; a management route listing recently received names from the bus journal.
- `apps/web`: Alert, Screen Effect and timer rule editors gain the trigger name field with suggestions; stories and Playwright coverage.
- No migration: names live inside existing JSON identity and selector columns, and rows without a name keep their stored identity strings.
- New `streamerbot-named-triggers` capability; modified `central-event-bus` selector requirement.
