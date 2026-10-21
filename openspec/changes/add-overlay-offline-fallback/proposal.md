# Proposal: Overlay Offline Fallback

## Why

On 2026-10-21 the maintainer reported that Stream Jams browser sources stop showing content in OBS after Stream Jams is restarted. Investigation in real OBS 32.2.2 (CEF 127) found the cause:

- A source whose page stays loaded recovers after a restart. Its WebSocket reconnect loop works for Timers, Alerts, Music, Videos and Screen Effects.
- A source that loads or reloads while Stream Jams is not listening gets Chromium's `chrome-error://chromewebdata/` page. No Stream Jams code runs there, and obs-browser never retries a failed load ([obs-browser#71](https://github.com/obsproject/obs-browser/issues/71), open since 2017). The source stays blank after Stream Jams is back.
- On 2026-10-20, OBS started at 19:04:50 and loaded every scene's Stream Jams sources at 19:05:07. Stream Jams started at 19:06:22, so those sources stayed blank until each was refreshed.

The same failure follows any navigation during an outage: OBS starting first, a "Shutdown source when not visible" source being shown, "Refresh browser when scene becomes active", or the Refresh button.

## What Changes

- The overlay page registers a service worker limited to `/overlay/`. Only when a navigation under `/overlay/modules/` fails at the network level does the worker answer with a stored fallback page.
- The fallback page is transparent and key-free. It has no script and a strict CSP. A `<meta http-equiv="refresh">` reloads it every 2 seconds, so the real overlay returns by itself once Stream Jams is listening.
- The server serves the worker script and the fallback page at fixed key-free paths under `/overlay/`.
- Navigations always try the network first. HTTP responses, including the transparent 401 key rejection and 503 build errors, pass through unchanged. The worker never stores a keyed response.

## Out Of Scope

- Loads that bypass the service worker. OBS's Refresh button and "Refresh browser when scene becomes active" use `ReloadIgnoreCache`, which skips the worker. A repeat of that action after Stream Jams is back fixes it, as it does today. An OBS WebSocket "refresh sources on startup" integration remains a backlog follow-up.
- A source that has never loaded successfully in that OBS profile, because no worker is installed yet.
- Caching the overlay application itself for offline rendering.

## Impact

- `packages/core`: shared paths for the worker and the fallback page.
- `apps/server`: two public routes beside the overlay routes, plus the worker logic.
- `apps/web`: worker registration in the overlay shell entry.
- OBS stores the worker in its browser cache profile. Clearing that cache removes it until the next successful load.
