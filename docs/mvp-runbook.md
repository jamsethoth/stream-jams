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

## Overlay Module Config

The Alerts module is enabled by default on a fresh database. Changes to module enablement and canvas size are persisted in SQLite and survive local runtime restarts over the same data directory.

The module config UI only saves schema-backed canvas fields. Alert collections, rules, variants, and media setup live in the alert configuration UI instead of the module config save path.

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

1. Open `Event sources`, choose `Add event source`, select Twitch, and continue.
2. Select `Connect Twitch`. Stream Jams opens Twitch and displays a short code in the wizard.
3. Enter the displayed code in Twitch. Use `Open Twitch` if the browser window was blocked or closed.
4. Return to the wizard and wait for the connected Twitch account to appear.
5. Select `Test connection` to validate both the Twitch account and EventSub intake, then review and register the event source.

This ordinary setup flow needs no `TWITCH_CLIENT_SECRET`, client-secret setup, or OAuth callback URL. `TWITCH_CLIENT_ID` is optional only for local development or fork overrides.

Twitch access and refresh tokens are stored through the OS credential store in both normal development and production-style local startup. Stream Jams uses Windows Credential Manager on Windows, macOS Keychain on macOS, and Linux Secret Service/libsecret on Linux. Token values are not stored in SQLite, config files, diagnostics exports, browser bundles, overlay URLs, or logs.

The `@napi-rs/keyring` dependency is the Node adapter Stream Jams uses to call those industry-standard OS credential stores. It is not a separate secret store or plaintext persistence backend.

If the OS credential store is unavailable, the local app still starts and unrelated features remain usable. Diagnostics show a `runtime-secret-store` provider error, and Twitch connect, refresh, and token-storage operations fail closed with this message:

```text
Credential store is unavailable. Configure Windows Credential Manager, macOS Keychain, or Linux Secret Service/libsecret before connecting Twitch.
```

On Linux, install and unlock a Secret Service-compatible keyring such as GNOME Keyring or KWallet through the desktop session before connecting Twitch. There is no plaintext fallback for real runtime tokens; in-memory or fake secret stores are only for automated tests.

## Channel point reward alerts

When adding a Channel point redemption alert or opening its Event inspector, Stream Jams loads the custom rewards from the linked Twitch broadcaster account. Use `Refresh rewards` to fetch the current titles, costs, and availability; loading is read-only and does not create, edit, or redeem Twitch rewards. Connection, permission, eligibility, and provider errors remain visible without clearing saved selections.

- `Every custom reward, including future rewards` is catch-all coverage with no saved reward condition.
- `Selected rewards` saves stable reward IDs in one shared alert rule. All selected rewards use that alert's design and variations.
- `Select all currently listed` saves a snapshot of the displayed IDs. Rewards added later are not selected automatically; refresh and select them explicitly.
- Disabled, paused, out-of-stock, and user-input rewards remain selectable. Their current status is guidance, not a change to the saved matching rule.
- A saved ID absent from the current catalog appears as `Unavailable reward` with its ID. It survives refresh failures, deleted rewards, account changes, save, and reload until you explicitly remove it.

Potential-overlap guidance lists other enabled alerts that may also match the selection. It does not block saving or choose a winner: all matching active alerts continue to play, subject to the existing queue behavior. Newly created alerts remain disabled and need review before activation.

In the Event inspector, use a selected reward's `Use as sample` action to update only the current session payload's reward ID and title. Initial reconciliation or a changed selection uses the first selected reward when the current sample is outside the selection. Later manual JSON edits remain yours, so you can inspect both match and no-match explanations. Preview and Send test still target the selected alert and do not claim that an outside sample is eligible for live matching. Session samples do not become built-in samples or persist catalog metadata in the alert.

Backups containing the `oneOf` reward-membership condition restore in this and later compatible Stream Jams builds. Older builds do not understand that condition; there is no lossy downgrade. Existing exact-ID (`equals`) reward conditions remain unchanged unless their reward selection is explicitly edited.

## Speaker.bot Connection

1. In Speaker.bot, open `Settings > WebSocket Server`.
2. Keep the local defaults `127.0.0.1`, port `7680`, and endpoint `/`. Enable `Auto Start`, then start the WebSocket server.
3. In Stream Jams, open `TTS providers`, choose `Add TTS provider`, and select Speaker.bot.
4. Enter the matching host, port, and endpoint, test the connection, then register and activate the provider.
5. On the registered provider, enter the Speaker.bot voice alias to use by default and save the safety settings. Voice aliases are created under `Settings > Voice Aliases` in Speaker.bot.
6. In an alert editor, add or select a TTS layer, enable it, and edit only its message template.

Live alerts send one server-side Speaker.bot `Speak` request before the visual/audio instructions fan out to landscape and vertical overlays. Local editor Preview never calls Speaker.bot. If a live request fails, visual and audio playback continues and Diagnostics records one redacted error with a reference ID.

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
