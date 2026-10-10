# Videos

The **Videos** module plays requested videos from Twitch, YouTube and allowed direct-file hosts. Every request goes into a saved queue. Nothing plays until the operator starts it, unless a trusted caller sends a request with `autoplay` set. It replaces the retired **Video shoutout** module; Streamer.bot `VideoShoutout` broadcasts still work and are queued as Twitch clips.

Requirements live in the [OpenSpec change](../openspec/changes/add-video-request-queue/proposal.md). The desktop mirror (one player in the desktop app, mirrored to every output) is still being built; until it lands, each browser source plays the current video itself from a shared clock (see [Playback](#playback)).

## Allowed links

Requests are links. Stream Jams builds every player URL itself and never renders a submitted URL as given.

| Source | Accepted links |
| --- | --- |
| YouTube | `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, `/live/`, with optional `t` or `start` offsets |
| Twitch clip | `clips.twitch.tv/<slug>`, `clips.twitch.tv/embed?clip=<slug>`, `twitch.tv/<channel>/clip/<slug>` |
| Twitch VOD | `twitch.tv/videos/<number>`, with an optional `t` offset |
| Direct file | `.mp4` or `.webm` on a host you add to **Allowed direct-file hosts** |

Links must use HTTPS and carry no login, port or `#` fragment. Anything else is rejected and never queued. Rejections are logged with a reason and field names only, never the link.

## Queue

- **Play next** plays the first waiting video and then stops.
- **Play all now** plays every video that was waiting at that moment, with the configured gap between them. Videos added later wait for the next press.
- **Pause queue** lets the current video finish and holds the rest. **Resume queue** continues a Play all run.
- **Skip** ends the current video. During a gap it starts the next one immediately. **Stop** ends playback and the run. **Clear** removes everything waiting.
- Items can be removed or reordered while they wait.

The Operator Console lists the queue's **Recent** videos below the waiting list, like the Alerts and Screen Effects Recent list: the 10 newest videos that finished in the live or test queue being viewed, newest first, each with its title (or link), requester, source, link host, how it was requested, whether it **Played** or **Failed**, and when it finished. Skipped and stopped videos count as played; removed and cleared videos are left out. **Replay** works like Alerts' Replay: it adds the same video to the end of the queue as a new request from the Operator, and it waits there for Play next or Play all now; it never starts on its own. The usual rules apply again: the module must be on, the link must still be allowed (a direct file whose host was removed is refused), the queue must have room, and a video over the current length limit waits held. Like other queue commands it carries the queue revision, so a replay against a changed queue is refused with "The queue changed; try again." The Videos page keeps its **Failed recently** list.

Videos whose known length is over **Maximum length** are held in the queue as **Over the length limit**. **Play anyway** plays a held video once, ignoring the limit, and that playback is never cut. Raising the limit releases held videos that now fit.

Requests can carry the length (`durationSeconds`, or `duration` in the retired shoutout payload). A video without a length is queued normally, shows "Length unknown", and plays with Play next, Play all now or autoplay like any other video. When the player reports its real length and it is over the limit, the queue stops it at once, puts it back in the queue held as Over the length limit at its original place (it is not counted as played or failed), and continues as if it had been skipped: the gap, the Play all run and Pause queue apply as usual. The desktop player reports the length; without the desktop app, browser sources playing YouTube or direct files report it as soon as their player knows it, so the video may show for a moment before it is stopped. Twitch players on browser sources report no length, so an unknown-length Twitch clip plays to its end without the desktop app. Automatic length lookup before playback is BL-058 in the [backlog](backlog.md). Videos held for an unknown length by an older version are queued again on the next start.

The queue is saved. After a restart, a video that was playing or paused goes back to the head of the queue and waits; nothing replays on its own.

## Ways to request a video

| Path | Who can autoplay |
| --- | --- |
| Management and operator pages | The operator, with the Play buttons |
| Local automation API | Installations granted `videos:control` |
| Streamer.bot broadcast | Only when **Streamer.bot autoplay** is on (default) and the payload sets `autoplay: true` |
| Channel point rewards | Never; redemptions always queue |

### Local automation API

Pair an installation as described in the [automation API](automation-api.md) and request the Videos scopes: `videos:read`, `videos:submit` and `videos:control` (submit and control need read). All routes take `Authorization: Bearer <installation token>`, reject browser `Origin` headers and unknown fields, and use `purpose` `live` or `test`.

| Route | Scope | Body |
| --- | --- | --- |
| `GET /automation/v1/videos/:purpose` | `videos:read` | none |
| `POST /automation/v1/videos/:purpose/requests` | `videos:submit` | `link`, optional `title` (≤200), `requester` (≤64), `durationSeconds`, `autoplay` (honored only with `videos:control`) |
| `POST /automation/v1/videos/:purpose/commands` | `videos:control` | `expectedRevision` and `command`: `play-next`, `play-all`, `pause-queue`, `resume-queue`, `skip`, `stop`, `clear`, `remove` + `itemId`, `play-anyway` + `itemId`, `reorder` + `itemIds` |
| `POST /automation/v1/videos/:purpose/current/:action` | `videos:control` | `pause`, `resume` or `seek`, with `expectedItemId` and, for seek, `positionMs` |

The state response has `revision`, `queuePaused`, `runRemaining`, `gapEndsAtEpochMs`, `serverTimeEpochMs`, the `items` with their status and readable `link`, `recent` (the 10 newest played or failed items, newest first, with `finishedAt`), and `current` with phase, position, duration and which controls work. A request returns 201 with the queued item, or 422, 409 (module off) or 429 (queue full) with `VIDEO_REQUEST_REJECTED` and a `reason`. A stale `expectedRevision` returns 409 `VIDEO_QUEUE_CONFLICT`: refresh, then decide again. Never retry a command automatically.

### Streamer.bot

Stream Jams listens to Streamer.bot's `General` / `Custom` WebSocket event when the active Streamer.bot connection advertises it. Send `CPH.WebsocketBroadcastJson` with the marker `"source": "StreamJams", "type": "VideoRequest"`:

| Field | Required | Rule |
| --- | --- | --- |
| `action` | No | `play` (default) queues the link; `clear` stops the current video |
| `purpose` | No | `live` (default) or `test` |
| `link` | For `play` | An allowed link |
| `title`, `requester` | No | Up to 200 and 64 characters |
| `durationSeconds` | No | Length in seconds; over the limit, the request is held for Play anyway. Without it the request queues and is checked when the player reports its length |
| `autoplay` | No | `true` starts playback when Streamer.bot autoplay is on |

```csharp
CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(new {
    source = "StreamJams", type = "VideoRequest",
    link = "https://clips.twitch.tv/" + clip.Id, title = clip.Title,
    requester = displayName, durationSeconds = clip.Duration, autoplay = true
}));
```

The retired `VideoShoutout` payload is still accepted: `clipId` becomes a Twitch clip link, `displayName` the requester and `duration` the length. It no longer needs `embedUrl` or a `parent`. `action: "no-clip"` shows "No clip to show right now" for five seconds. Ordinary stream events, such as follows and raids, never queue videos.

`General` / `Custom` broadcasts, video requests included, reach the central event bus like any other Streamer.bot event. A Screen Effect or Streamer.bot event alert that selects `General` / `Custom` therefore also plays for video request broadcasts. Diagnostics, Event intake, shows the Videos outcome of each one: admitted, no match (no Videos marker, or the module is off) or failed (rejected; the log names the reason and fields).

### Channel point rewards

Map a reward to a purpose on the Videos page. A redemption's text is used as the link and the viewer's name as the requester. Redemptions always queue and never autoplay. A redemption with no valid link is logged and skipped; refunds stay with Twitch or Streamer.bot.

## Browser sources and audio

Videos has live and test module outputs and also appears on unified browser sources. Create a key on the Videos page or in Browser sources, and add the copied URL to OBS as a browser source. Treat the URL as a secret: it carries the overlay key.

With **OBS audio** on, the browser source plays the video's sound so OBS can capture it (tick **Control audio via OBS** on the source). With it off, the browser source is muted.

While the desktop app runs, it can also play the sound on chosen audio devices. Tick the devices on the Videos page. Each device has an optional delay (0 to 500 ms) to line it up with the others. To line up OBS instead, use the source's **Sync Offset** in OBS Advanced Audio Properties.

## Playback

A browser source shows nothing while idle. While a video plays, it shows the video with the title and requester underneath.

### Placement

The **Placement** section of the Videos page sets where the video appears and how big it is, on the same 1920 x 1080 canvas Timers and Music use. Drag the box in the preview to move it, or its corner to resize it; the box keeps its proportions while you drag. Snap to grid and Snap to alignment work as in the other editors, and the X, Y, width and height fields and arrow keys (Shift for 10 px) set exact values. The picture is the largest 16:9 frame that fits in the box with the title and requester below it, anchored to the box's bottom center; small boxes shrink the caption. **Save Videos settings** applies the placement to every Videos output at once: module and unified browser sources, the desktop overlay and the mirror. **Reset to default placement** restores the original look, centered and 72% of the canvas wide near the bottom, which is also what earlier saved settings get. The box must be at least 240 x 180 px and stay on the canvas; anything else is refused when saved and never rendered.

### Desktop mirror

While the desktop app runs, it plays each video once in a hidden player and mirrors the picture and sound to the desktop overlay and to every browser source over a local-only connection. All outputs show the same frame, so pause, resume and seek apply everywhere at once, including Twitch. The desktop overlay shows the picture muted; sound comes from OBS and the chosen devices. The Videos page shows whether the mirror is active. Expect about 100 to 150 ms of delay.

If a browser source loses the mirror, it reconnects on its own. Stopping or skipping a video ends its sound on every output.

The mirrored picture shows only the video: YouTube and Twitch control bars, titles and play buttons are hidden from the start. For Twitch clips the desktop player also picks the best quality the clip offers. Without the desktop app, YouTube players start without controls, but Twitch embeds keep their own overlay.

### Without the desktop app

Each browser source runs its own player:

- **YouTube** and **direct files** follow the shared clock. Pause, resume and seek apply to every output, and an output more than 750 ms off the clock jumps back to it.
- **Twitch** plays from its start until the queue ends it. Pause and seek for Twitch need the desktop app.
- YouTube and direct-file players report the video's length to the service once per video, so an unknown-length video over **Maximum length** is stopped and held as Over the length limit (see [Queue](#queue)). Twitch players report none.

A video whose player does not load within 15 seconds is marked failed and the run moves on. Invalid data never reaches the screen: the browser source stays transparent and the failure is logged.
