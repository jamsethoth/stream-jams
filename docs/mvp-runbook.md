# Stream Jams MVP Runbook

## Startup

1. Install dependencies with `corepack pnpm install --frozen-lockfile`.
2. Start the local runtime app with `corepack pnpm start:local`.
3. Open the management UI at `http://127.0.0.1:39187/manage`.
4. Keep Stream Jams on localhost. Management sessions and overlay keys are designed for local operation.

`start:local` builds the Vite web bundle first, then starts the Fastify service that serves `/manage`, overlay shell routes, HTTP APIs, static web assets, and overlay WebSocket endpoints from the same local origin.

For fast frontend iteration, use `corepack pnpm dev`. That path may run Vite for hot reload and is not the production-style local runtime that streamers should use for browser-source overlays.

## Management Security

Management API access uses a local management session plus browser-origin protections. The management session bootstrap response includes a bearer session id and a session-bound CSRF token. The management UI sends the bearer token on management API requests and sends `X-Stream-Jams-CSRF` on state-changing `POST`, `PUT`, `PATCH`, and `DELETE` requests.

Production-style runtime startup allows browser management requests only from the configured local app origin. Development and test origins must be listed explicitly with the comma-separated `STREAM_JAMS_DEV_ORIGINS` environment variable. Requests without an `Origin` header, or with a `null` origin, do not receive permissive CORS headers and still need valid management authorization plus CSRF proof for mutations. Unknown explicit origins are rejected.

Overlay HTTP routes and overlay WebSocket routes are not management APIs. OBS/browser-source overlays continue to use scoped overlay route keys and do not need management bearer or CSRF credentials.

## Validation

Run `corepack pnpm test` before PRs. This includes unit coverage and the production-entrypoint smoke coverage that composes the local runtime through the same factory as the CLI entrypoint, then validates the Fastify-served management shell, overlay shells, static assets, overlay WebSocket registration, and representative management APIs without starting Vite or Playwright.

Run `corepack pnpm test:e2e` for browser-visible management and overlay workflows when the local Playwright browser setup is available. Run `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm build` before opening a PR.

## Runtime Logs

The runtime writes structured JSONL log files under the app data `logs` directory. Log files roll over hourly with names like `runtime-YYYYMMDDHH.jsonl`, use `INFO` level and 48-hour retention by default, and are redacted before persistence.

Runtime logs are intended for local troubleshooting of provider activity, management security decisions, playback transitions, diagnostics exports, and operational errors. Log metadata is allowlisted per event; raw provider payloads and raw provider HTTP error bodies are not persisted. OAuth tokens, overlay route keys, authorization headers, credential references, and sensitive URLs are redacted.

## Dependency Updates

Dependabot version updates are configured in `.github/dependabot.yml` for weekly grouped npm workspace dependency updates and weekly grouped GitHub Actions updates. Review Dependabot PRs like normal dependency changes: read the changelog or release notes for behavior changes, let CI run, and keep lockfile changes scoped to the update PR.

CI workflow defaults remain least-privilege. Normal validation workflows use read-only repository contents permissions, and jobs that need additional permissions declare them at the job level.

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

Twitch access and refresh tokens are stored through the OS credential store in both normal development and production-style local startup. Stream Jams uses Windows Credential Manager on Windows, macOS Keychain on macOS, and Linux Secret Service/libsecret on Linux. Token values are not stored in SQLite, config files, diagnostics exports, browser bundles, overlay URLs, or logs.

The `@napi-rs/keyring` dependency is the Node adapter Stream Jams uses to call those industry-standard OS credential stores. It is not a separate secret store or plaintext persistence backend.

If the OS credential store is unavailable, the local app still starts and unrelated features remain usable. Diagnostics show a `runtime-secret-store` provider error, and Twitch connect, refresh, and token-storage operations fail closed with this message:

```text
Credential store is unavailable. Configure Windows Credential Manager, macOS Keychain, or Linux Secret Service/libsecret before connecting Twitch.
```

On Linux, install and unlock a Secret Service-compatible keyring such as GNOME Keyring or KWallet through the desktop session before connecting Twitch. There is no plaintext fallback for real runtime tokens; in-memory or fake secret stores are only for automated tests.

## Diagnostics Export

1. Open `Diagnostics` in the management UI.
2. Adjust `Diagnostics limit` when a smaller export is enough.
3. Select `Reload diagnostics` to confirm the current event, match, playback, and provider-error view.
4. Select `Export diagnostics`.
5. Use `Export with recent logs` only when troubleshooting needs bounded recent runtime log entries.
6. Share only the exported redacted payload when troubleshooting.

The default diagnostics export includes safe log settings, log location metadata, retention metadata, and file window metadata. It does not include runtime log entries. The debug export is a separate CSRF-protected management action and includes only bounded, recent, redacted runtime log entries. Review the exported payload before sending it outside the local machine.

## Local UI Test Note

CI installs Playwright dependencies on Ubuntu 24.04 with `pnpm exec playwright install --with-deps chromium`. On this Ubuntu 26.04 workstation, Playwright 1.60.0 cannot run `install-deps`; Chromium needs `libnspr4` and `libnss3`.

If sudo is available, install the missing system packages:

```sh
sudo apt-get install -y libnspr4 libnss3
```

If sudo is not available, a local extracted package workaround is enough for e2e validation:

```sh
mkdir -p /tmp/playwright-deps/downloads /tmp/playwright-deps/extract
cd /tmp/playwright-deps/downloads
apt-get download libnspr4 libnss3
for package in *.deb; do dpkg-deb -x "$package" /tmp/playwright-deps/extract; done
cd /home/jams/dev/stream-jams
env LD_LIBRARY_PATH=/tmp/playwright-deps/extract/usr/lib/x86_64-linux-gnu pnpm test:e2e
```
