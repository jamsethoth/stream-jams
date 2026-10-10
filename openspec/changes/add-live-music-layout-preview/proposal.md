# Proposal: Show The Playing Track In The Music Layout Preview

## Why

On 2026-10-10 the maintainer asked to see the connected Pear source drive the Music component layout preview and update live. The preview always rendered a fixed sample track, so long titles, missing albums or real artwork could only be checked in OBS or the desktop overlay.

## What Changes

- A management-only `GET /management/music/now-playing` route returns the selected source's status and its current normalized snapshot, or `null` while the source is not connected and fresh.
- The Music page polls it once a second while the page is visible. When a track is playing, the production-renderer preview, metadata and desktop placement preview show that track and its artwork; otherwise they show the sample track.
- Artwork loads through the authorized management client as a blob URL and is revoked when the track changes.
- A status line says whether the preview shows the sample or the playing track. Live playback runs only while the Music module is enabled, so the sample hint says to enable it when it is off.

## Out Of Scope

Publishing anything to live outputs from the preview, changing the selected source, and new overlay code. Only management code changes, so overlay bundles are unaffected beyond the shared bootstrap hash.

## Impact

- `apps/server`: music runtime coordinator, management service and routes.
- `apps/web`: Music page, music API client and a live preview hook.
- `music-widget-overlay` spec: preview isolation requirement.
