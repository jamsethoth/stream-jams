# Stream Jams MVP Runbook

## Startup

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Start the local app with `pnpm dev`.
3. Open the management UI at `http://127.0.0.1:39187/manage`.
4. Keep Stream Jams on localhost. Management sessions and overlay keys are designed for local operation.

## Port Changes

1. Open `Settings` in the management UI.
2. Change the `Port` field to an available localhost port between `1` and `65535`.
3. Select `Save server settings`.
4. Restart the local server so the process binds to the saved port.
5. Reopen the management UI with the new port.

Invalid ports are rejected by the browser before save. Ports that pass browser validation but are unavailable are rejected by the server and should be replaced with an open localhost port.

## Overlay URLs

1. Open `Overlays` in the management UI.
2. Copy the needed output URL.
3. Add the URL as a browser source in OBS or the local streaming tool.
4. Use live URLs for production overlay output and test URLs only for preview/test output.

Overlay route keys are secrets. Do not paste them into chat, logs, screenshots, or public issue text. If a key is exposed, revoke it and copy a fresh URL from the management UI.

## Twitch Connection

1. Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in the local environment before startup.
2. Open `Twitch` in the management UI.
3. Select `Connect Twitch` and complete the Twitch authorization flow.
4. Return to the management UI and verify the connected account and EventSub status.
5. Use `Refresh Twitch` after token or connection issues, and `Disconnect Twitch` before switching accounts.

## Diagnostics Export

1. Open `Diagnostics` in the management UI.
2. Adjust `Diagnostics limit` when a smaller export is enough.
3. Select `Reload diagnostics` to confirm the current event, match, playback, and provider-error view.
4. Select `Export diagnostics`.
5. Share only the exported redacted payload when troubleshooting.

The diagnostics export redacts sensitive values such as OAuth tokens, overlay keys, auth headers, and signed URLs. Review the exported payload before sending it outside the local machine.

## Local UI Test Note

CI installs Playwright dependencies on Ubuntu 24.04 with `pnpm exec playwright install --with-deps chromium`. On this Ubuntu 26.04 workstation, Playwright 1.60.0 cannot run `install-deps`; Chromium needs `libnspr4` and `libnss3`. If sudo is available, install them with `sudo apt-get install -y libnspr4 libnss3`.
