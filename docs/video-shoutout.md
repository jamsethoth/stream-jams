# Video Shoutouts

The **Video shoutout** module shows a Twitch clip that Streamer.bot has already chosen on its own OBS browser source. Streamer.bot keeps everything about the decision: Twitch auth, clip lookup, chat commands, and who is eligible. Stream Jams validates the clip it receives, plays it, and returns the source to transparent idle.

## Browser source

The module is enabled by default and lists `Video shoutout Live` and `Video shoutout Test` module outputs through the existing overlay output API (`GET /management/overlay-outputs`). Create a key for the output you need and add the copied `/overlay/modules/video-shoutout/<live|test>/<key>` URL as an OBS browser source. Treat that URL as a secret: it carries the overlay key. Video shoutouts do not appear on unified browser sources or the desktop overlay.

A management page for these outputs is not built yet (BL-057 in the [backlog](backlog.md)).

## Streamer.bot event

Stream Jams subscribes to Streamer.bot's `General` / `Custom` WebSocket event when the active Streamer.bot connection advertises it. Send a shoutout with `CPH.WebsocketBroadcastJson` and the marker `"source": "StreamJams", "type": "VideoShoutout"`. Other custom broadcasts never start a shoutout, and neither do follows, raids, subscriptions, cheers, or reward redemptions.

`General` / `Custom` broadcasts, shoutouts included, reach the central event bus like any other Streamer.bot event. A Screen Effect or Streamer.bot event alert that selects `General` / `Custom` therefore also plays for shoutout broadcasts.

| Field | Required | Rule |
| --- | --- | --- |
| `action` | No | `play` (default), `no-clip`, or `clear` |
| `purpose` | No | `live` (default) or `test`, matching the browser source to drive |
| `login` | For `play` | Twitch login, 1–25 letters, digits, or `_` |
| `displayName` | For `play` | 1–64 characters; optional for `no-clip` |
| `clipId` | For `play` | Twitch clip slug |
| `embedUrl` | For `play` | `https://clips.twitch.tv/embed?...` or `https://player.twitch.tv/?...` with `clip=<clipId>` and at least one `parent` |
| `title` | For `play` | 1–200 characters |
| `duration` | For `play` | Clip length in seconds, greater than 0 and at most 120 |
| `avatarUrl` | No | HTTPS image URL; anything else is dropped and the clip still plays |

Twitch only renders an embed whose `parent` matches the page that hosts it. For the default local service that is `parent=127.0.0.1`. Stream Jams renders `embedUrl` exactly as sent, so add the parameter in Streamer.bot.

Example C# action to adapt (the clip-selection logic is yours):

```csharp
using System;
using System.Linq;
using Newtonsoft.Json;

public class CPHInline
{
    public bool Execute()
    {
        CPH.TryGetArg("targetUser", out string login);
        CPH.TryGetArg("targetUserDisplayName", out string displayName);
        CPH.TryGetArg("targetUserProfileImageUrl", out string avatarUrl);
        var clip = CPH.GetClipsForUser(login, 20)?.OrderBy(_ => Guid.NewGuid()).FirstOrDefault();
        object payload = clip == null
            ? new { source = "StreamJams", type = "VideoShoutout", action = "no-clip", displayName }
            : new
            {
                source = "StreamJams", type = "VideoShoutout",
                login, displayName, clipId = clip.Id,
                embedUrl = clip.EmbedUrl + "&parent=127.0.0.1",
                title = clip.Title, duration = clip.Duration, avatarUrl
            };
        CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(payload));
        return true;
    }
}
```

## Playback

One shoutout is active per purpose. A new valid `play` replaces the current clip; nothing is queued or kept as history. The source shows a loading frame until the Twitch player loads, then plays for the clip's `duration` and returns to idle. `clear` returns to idle immediately. `no-clip`, or a player that does not load within 12 seconds, shows a short bounded message ("No clip to show right now" or "Clip unavailable") for five seconds.

Invalid payloads never reach the overlay. The runtime log records the rejection reason and field names only, never URLs or payload values.
