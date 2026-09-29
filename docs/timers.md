# Timers

Timers are reusable, server-authoritative countdown definitions for stream activities such as wearing oven mitts after a channel-points reward. Open **Modules → Timers** to create and operate them.

## Authoring and output

Each definition has a stable name and duration, plus optional icon, start sound, and end sound assets. Select Browser Source, one or more named device-audio routes, both, or neither. Selecting both audio paths intentionally sends the cue to both; OBS Desktop Audio or monitoring can capture a named device again, so verify the OBS mixer if you hear duplicates.

Configure Landscape and Vertical independently. Each profile has a bounded region, vertical or horizontal stacking, and a maximum visible count. The maximum divides the region into stable equal-sized slots, so an underfilled stack does not stretch its timer cards. Long names truncate visually while retaining their accessible name, and additional active timers appear as a `+N more` badge. Browser-source and desktop visibility remain independent surface choices.

One run may be active per definition. Start, pause, resume, stop, or restart it from the Timers page or Operator Console. Restart creates a new generation from the latest saved definition. Editing a definition while it is active does not rename, reroute, or retime that admitted run; the next start/restart uses the saved changes. A completed timer remains visible at zero for three seconds. Active runs are intentionally memory-only and disappear when Stream Jams restarts; definitions and layout persist.

## Stream Deck and generic HTTP actions

In **Modules → Timers → Automation credential**, choose **Create credential** or **Rotate credential**. Copy the returned value immediately: Stream Jams stores only a verifier and will not show the raw bearer again. Rotation invalidates the previous value immediately. Revoke disables all existing Timer HTTP actions until a new credential is created.

Configure a generic HTTP action against the local Stream Jams origin. Use the exact header below, replacing the placeholder locally. Do not put the credential in screenshots, logs, exported profiles, shared Stream Deck profiles, query strings, or request bodies.

```text
Authorization: Bearer <TIMER_AUTOMATION_CREDENTIAL>
```

Available routes are:

```text
GET  http://127.0.0.1:39187/automation/timers
POST http://127.0.0.1:39187/automation/timers/<TIMER_ID>/start
POST http://127.0.0.1:39187/automation/timers/<TIMER_ID>/pause
POST http://127.0.0.1:39187/automation/timers/<TIMER_ID>/resume
POST http://127.0.0.1:39187/automation/timers/<TIMER_ID>/stop
POST http://127.0.0.1:39187/automation/timers/<TIMER_ID>/restart
```

Command bodies must be absent or `{}`. Duration, asset, output, and authoring overrides are rejected. Repeating a command is safe: the response includes `changed: false` when the requested state already applies. Discovery returns only IDs, labels, and the allowlisted current state; it does not expose assets, outputs, or management data.

These endpoints are loopback-only, reject browser-origin requests, and accept only the Timer automation bearer. Management sessions and overlay route keys cannot authorize them, and the Timer bearer cannot authorize management or overlay routes. LAN control is not supported.

## Backup and recovery

Portable configuration backups include Timer definitions, profile layout, referenced asset IDs, and named audio-route IDs. They exclude active runs and the automation credential/verifier. Restored timers start idle, named device routes require the same explicit rebinding rules as other routed audio, and a new automation credential must be created. If restore fails and rolls back, the destination's prior operational credential state is restored.

Stop active timers before restoring a backup, including paused timers; a completed timer also blocks restore during its three-second hold. New timer commands are rejected while configuration replacement is underway.

The Timers page refreshes runtime state and Browser Source connectivity every five seconds while visible, without replacing unsaved definition or layout edits. A failed refresh keeps the last known state and shows a stale-state warning. The Operator Console reports timer refresh failures independently from alert playback.

Timer icons accept still images and GIFs on browser and desktop outputs. Replacing an asset or restoring a backup cannot substitute audio/video for an icon or a non-audio asset for a cue. When a configured stack reaches a profile edge, its entire rendered footprint scales down just enough to retain the overflow badge below vertical stacks or beside horizontal stacks. Space is reserved even without overflow so the capacity-sized cards do not jump when the badge appears.

## Initial boundaries

Timers count down only. Temporary one-off definitions, count-up/overtime, scheduled starts, automatic Twitch/Streamer.bot event bindings, custom target profiles, overlapping runs of the same definition, LAN access, and a custom Stream Deck plugin are not included. Streamer.bot or Stream Deck can call the generic loopback HTTP API when their own trigger logic should start a timer.
