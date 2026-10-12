# Design: Streamer.bot Named Triggers

## Marker

```csharp
CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(new {
    source = "StreamJams", type = "Trigger", name = "hype",
    userName = args["userName"], message = args["rawInput"]
}));
```

Streamer.bot delivers it as `General` / `Custom`, like the `VideoRequest` marker. Stream Jams reads it in `createStreamerBotEffectTriggers` (`apps/server/src/modules/screen-effects/effect-trigger-adapter.ts`), where it already builds the `streamerbot-event` trigger with a sanitized `summary` and `userName`:

| Field | Rule |
| --- | --- |
| `name` | Required for a named trigger. Trimmed and lower-cased, then 1 to 64 characters of `a-z`, `0-9`, `_`, `-`. Anything else makes the broadcast an ordinary unnamed `General` / `Custom` event, and Diagnostics notes "invalid trigger name" without echoing it. |
| `message` | Optional string. Control characters removed, cut to 500 characters. |
| `userName` / `user.name` | Existing rule, unchanged. |

The `streamerbot-event` effect trigger gains `triggerName` and `message`, both optional, so journaled rows from before this change still parse.

## Matching

`triggerName` is added, optional, to the external identity everywhere it is stored: the selector's `external` match, `ExternalAlertIdentity` and the manual `simulate-external` identity.

- Match without `triggerName`: exactly today's behavior (provider, source, type).
- Match with `triggerName`: also requires the event's `triggerName` to be equal. The selector UI only offers a name for `General` / `Custom`; the schema rejects it on any other identity.

This keeps one identity shape instead of a new match kind, so Alerts (which store `externalIdentity`, not a selector), Screen Effects and timers all get names through the field they already share. `eventTriggerSelectorIdentity` appends the name only when present, so stored rows keep their identity strings and need no migration.

Subscriptions are unchanged: a named rule declares `General` / `Custom`, which the Streamer.bot source already subscribes to while advertised.

### Why the payload may select here

The `central-event-bus` rule that payload content never selects exists so untrusted text cannot pick media, routes or behavior. The trigger name is extracted at intake into a bounded identity, the same way the `VideoRequest` marker is, and it can only match rules the user wrote with that exact name. It cannot name a file, URL, route or action. The message never selects anything.

## Alerts message

`ExternalAlertEvent.message` changes from always `null` to the sanitized message or `null`. It then flows through the existing template context (`createAlertTemplateContext`) as `{message}` and through the active alert moderation policy, including TTS, like any other viewer-controlled alert text. Effects and timers do not read it.

## Recent names

`GET /management/streamerbot/trigger-names` returns up to 50 distinct names from accepted bus journal rows, newest first, with when each was last received. No new storage: the journal already keeps 7 days or 10,000 rows. Names are bounded identities, so listing them leaks nothing a log could not.

## Overlap with existing rules

An unnamed `General` / `Custom` rule still fires for every custom broadcast, named or not (and for `VideoRequest` broadcasts, as today). Editors show a hint on unnamed `General` / `Custom` rules: "Matches every Streamer.bot custom broadcast. Pick a trigger name to match one."
