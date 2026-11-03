# Design: Overlay Offline Fallback

## Evidence

Real OBS 32.2.2 (CEF 127.0.6533.120), portable copy, with Stream Jams down:

| Navigation | Without a worker | With a worker (spike) |
|---|---|---|
| OBS started | Error page, stays blank | Stored page served |
| "Shutdown source when not visible" source shown | Error page | Stored page served |
| "Refresh browser when scene becomes active" | Error page | Error page (`ReloadIgnoreCache`) |
| Refresh button (`refreshnocache`) | Error page | Error page (`ReloadIgnoreCache`) |
| Page stays loaded through a restart | Recovers | Recovers |

Supporting sources:

- obs-browser in OBS 32.2.2 has no `OnLoadError` handling and no retry setting. It sets a persistent `cache_path`, so service workers persist across OBS restarts.
- `127.0.0.1` is a potentially trustworthy origin, so service-worker registration works over plain HTTP ([MDN Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)).
- A worker script's default maximum scope is its own directory ([MDN register()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)), so `/overlay/offline-worker.js` covers `/overlay/` without a `Service-Worker-Allowed` header.

## Decisions

- **Fallback page, not an offline overlay.** The worker stores one tiny page, not the overlay bundle. Live pages always come from the network, so an upgrade can never leave a stale overlay running, and no keyed response is stored.
- **Meta refresh, no script.** The fallback page reloads itself with `<meta http-equiv="refresh" content="2">`. A meta refresh is a normal reload that the worker handles. The page keeps `default-src 'none'`, matching the transparent rejection page.
- **Network errors only.** The worker answers only when `fetch` rejects. Any HTTP response, including 401 and 503, passes through, so authorization still fails closed.
- **Typed worker, served by the server.** The worker is a TypeScript function that closes over nothing. The server serves `(<function source>)(self, <config JSON>)`. That keeps it typechecked and unit-testable without a second bundler entry.
- **Versioned cache name.** Activation deletes older `stream-jams-overlay-offline-*` caches, and `skipWaiting` lets an updated worker take over on the next navigation.

## Risks

- A reload that bypasses the worker still shows the error page. This is documented, and a backlog row covers the OBS WebSocket follow-up.
- Clearing OBS's browser cache removes the worker until the next successful load.
- The worker sees keyed request URLs while it forwards them, but it stores only the key-free fallback page.
