# Music sources and Pear Desktop

Music is a disabled-by-default overlay module. A Music source is selected independently of event and TTS providers. Selecting a source does not enable the widget. The server owns the provider connection and credentials; browser sources and desktop renderers receive only normalized Music state and authorized local artwork references.

## Connect Pear Desktop

The supported protocol baseline is Pear Desktop **3.12.0**. Verify the version installed on the computer before relying on the connection; the protocol fixture in tests does not prove compatibility with another release. In Pear Desktop, enable its local API and set its authentication scheme to **AUTH_AT_FIRST**. Keep Pear and Stream Jams on the same computer. Stream Jams defaults to `http://127.0.0.1:26538/`; it accepts loopback IPv4/IPv6 or `localhost` only. The default HTTP/WebSocket transport is local and unencrypted. HTTPS/WSS is allowed with normal certificate validation. Do not put credentials, paths, query parameters, or a remote host in the Pear address.

In Stream Jams, open **Music sources**, choose **Add Pear Desktop**, enter a name, and choose a transport. **Automatic** tries authenticated WebSocket first and falls back to authenticated local polling only if the socket is unavailable. **WebSocket** requires an authenticated initial `PLAYER_INFO`; merely opening the socket is not success. **Local polling** uses the authenticated song endpoint. Click **Pair Pear Desktop**, approve the request in Pear within 60 seconds, then **Test connection** and **Save source**. An empty current song can pass the test. Test connection does not select a different provider or enable Music. A later source remains available until explicitly selected.

Pear approves a `POST /auth/{clientId}` request. Stream Jams stores the resulting token in its existing durable secret store. REST requests use a bearer header; Pear requires a token query parameter on its WebSocket route, which remains server-only. Do not copy Pear token material into an OBS URL, CSS, logs, backup, or support report. A portable restore preserves display settings and non-secret registration metadata but requires new pairing; it never restores live playback.

Open **Music appearance and branding** to enable the module, choose Landscape or Vertical and full or compact appearance, and save. Create or open the Music **live** or **test** output for that profile, then copy its Stream Jams output URL into an OBS browser source. A unified output can include Music when its surface visibility allows it. These output URLs contain purpose-scoped route keys: treat them as private and regenerate a leaked key in output management. Desktop surface membership is explicitly selected in output settings; a fresh surface does not include Music automatically. Appearance preview uses sample metadata and cannot publish it to live output.

## Recovery and troubleshooting

| Symptom | Action |
| --- | --- |
| Pairing stays pending, is denied, or expires | Keep Pear running, check its local API and `AUTH_AT_FIRST` setting, approve the fresh request in Pear, and retry. A cancelled or expired attempt cannot be reused. |
| WebSocket test fails, but polling works | Verify Pear 3.12.0 or a compatible release and its authenticated WebSocket support. Select Automatic or Local polling only if that transport meets your intended setup. Authentication failures never trigger an automatic downgrade. |
| Music says `auth-required` after restart or revocation | Reopen the selected source, pair again, test, and use **Replace authorization**. Use **Reconnect source** after restoring Pear availability; it does not silently start another approval flow. |
| Music remains transparent | Confirm module enablement, selected source, current song, output profile/surface visibility, and a valid output key. Empty, stale, disconnected and auth-failed state intentionally clears all artwork, branding and progress. Status in Music sources distinguishes these cases. |
| Branding image or font is unavailable | Review Music asset diagnostics and the Assets library, then select a healthy compatible asset. The widget uses a native visual fallback; missing media must not expose a broken image or setup text in live output. |
| Custom CSS hides content | Use **Disable custom CSS** outside the preview, then edit or clear the stored CSS. An invalid draft leaves the last valid preview and live style intact. See [Music styling](music-styling.md). |

Stream Jams keeps its listener on loopback and does not change Pear settings. A real installation check should record the installed Pear version, AUTH_AT_FIRST, pairing approval, restart, revocation, track change, pause, seek, reconnect, OBS pixels, and desktop pixels/input/audio separately from protocol fixture tests. Do not include tokens or output URLs in the record.

## Add another provider adapter

This is the contract for future source work, not a promise that a provider API or account is available.

1. Add a typed provider kind, setup schema, capability mapping, registration descriptor, and migration where needed. Keep one active `music-source` selection; do not alter event-source selection.
2. Implement provider-specific authorization and durable secret-store access on the server. Validate endpoint and redirect policy for that provider. Setup, connection test, registration and runtime status remain distinct. Do not expose credentials or raw transport URLs to React.
3. Implement `MusicSourceAdapter` with `testConnection`, `start`, `getSnapshot`, and idempotent `stop`. Emit bounded, complete, monotonic `MusicSnapshot` values. Normalize provider observations into nullable position/duration, ordered artists and safe attribution. Distinguish empty playback from malformed data, and never inherit old-track optional metadata.
4. Resolve artwork through an explicit origin/destination, size, MIME and decode policy; return an opaque generation-scoped reference through existing authorized output routes. A provider must not create a generic URL proxy.
5. Add contract fixtures for authentication, empty/partial/new-track state, transport failure, stale data, cancellation, late callbacks, source switch, secret redaction and artwork rejection. Exercise the built service/browser output as well as pure adapters. Physical provider and OBS acceptance remains a separate record.

Plex and Spotify are future [BL-054](backlog.md) work. Their API access, authentication, session selection, endpoint policy, rate limits and display obligations need separate research and proposals. The Music renderer and projection contract do not depend on either adapter.
