# Stream Jams Product Plan

Stream Jams is a local-first streaming overlay application for streamers who want to configure modular alert experiences and render them as a browser source in OBS, Streamlabs Desktop, XSplit, vMix, or similar streaming software.

The initial product scope is Twitch alerting: listen for stream events, resolve matching alert rules, and display configured visual and audio elements on a fullscreen transparent overlay canvas.

## Goals

- Run locally on the streamer's machine.
- Provide a browser-source overlay URL for streaming software.
- Provide an admin UI for setup, alert configuration, asset management, preview, and testing.
- Support modular alert elements placed on a fullscreen canvas.
- Support visual media, audio media, alert text, and optional TTS.
- Use secure secret management and authenticated local communication.
- Design provider abstractions so event platforms and TTS providers can be added over time.

## Non-Goals For MVP

- Native OBS plugin support.
- OBS WebSocket automation.
- Cloud sync or hosted overlay rendering.
- Alert marketplace features.
- Scheduled seasonal alert activation.
- Alert pack import/export implementation, though it should be designed for later.
- Multi-platform event ingestion beyond Twitch.

## Output Model

The only supported output model for the MVP is a browser source.

Users will manually add a local overlay URL to their streaming software. The app should not depend on OBS-specific plugins or OBS WebSocket integration.

Example local routes:

```text
http://127.0.0.1:39187/admin
http://127.0.0.1:39187/overlay/main/ovl_<unguessable-key>
http://127.0.0.1:39187/overlay/preview/ovl_<unguessable-key>
```

The app must support a configurable port. The selected port is stored in non-secret local config. On startup, if the configured port is unavailable, the app should show a clear error and suggest available alternatives.

The app should bind to `127.0.0.1` by default. LAN binding is out of MVP scope and should be treated as an advanced future feature because it changes the security model.

## Overlay Access Model

Overlay URLs should use unguessable route keys instead of visible query-string tokens. These keys are not admin credentials; they only grant access to display/playback overlay output.

Rules:

- Program and preview overlays must have separate keys.
- Overlay keys must not grant access to admin configuration APIs.
- Overlay keys can be regenerated from the admin UI.
- Overlay keys must be redacted from logs and diagnostic exports.
- Exported configs should omit or regenerate overlay keys by default.

The admin UI should clearly separate live output from preview output so preview windows do not accidentally play production alerts or audio.

## Core Surfaces

### Admin UI

The admin UI is used to:

- Connect Twitch.
- Configure alert rules and variants.
- Upload and manage visual/audio assets.
- Configure alert collections.
- Configure TTS providers and per-alert TTS behavior.
- Place alert elements on a fullscreen canvas.
- Test events with realistic sample payloads.
- View provider connection status.
- View event, queue, and playback logs.
- Copy browser-source URLs.
- Configure the local app port.

### Browser Source Overlay

The overlay is a fullscreen transparent canvas rendered by the streaming app's browser source. It receives resolved playback instructions from the local backend and renders only the active output it is authorized for.

The overlay should support:

- Transparent background.
- Fixed stream canvas dimensions with responsive scaling.
- Image, GIF, video, text, and audio playback.
- Layering and z-index.
- Enter and exit animations.
- Playback completion reporting.
- Reconnect behavior.

## Twitch MVP Scope

Twitch is the first event provider.

Preferred integration path: Twitch EventSub over WebSocket. This avoids requiring a public webhook endpoint for a locally hosted app.

Initial Twitch event support should include:

- Follow.
- Subscription.
- Resubscription.
- Gifted subscription.
- Community gift.
- Cheer/Bits.
- Raid.
- Channel point redemption.
- Hype Train begin, progress, and end.
- Creator goals.
- Charity donations.

Each event provider should normalize platform-specific payloads into internal event objects before alert matching.

## Alert Model

An alert rule defines:

- Event type.
- Matching conditions.
- Enabled state.
- Collection membership.
- Visual media.
- Audio media.
- Text template.
- Optional TTS behavior.
- Layout placement.
- Priority.
- Cooldown.
- Duration.
- Variants.

An alert variant defines an alternate presentation for the same event rule. Variants may be selected by condition, priority, or weighted random selection.

Alert conditions should support:

- Amount thresholds.
- Exact, minimum, maximum, and range checks.
- Subscription tier.
- Subscription tenure.
- Gift count.
- Raid viewer count.
- Cheer amount.
- Specific channel point reward.
- Event source/platform.

If multiple active alerts match a single event, the default behavior is to play all matching alerts. Queue behavior should prevent collisions where needed, but matching rules should not collapse to a single winner by default.

## Alert Collections

Alert collections are user-facing groups for organization and activation.

Examples:

- Default.
- Halloween.
- Charity Stream.
- Subathon.
- New Game Launch.
- Low Energy.
- High Hype.

Rules:

- Multiple collections can be active at the same time.
- Alerts can be enabled or disabled individually.
- Collections can be enabled or disabled as a group.
- Collection activation is manual for MVP.
- Collection scheduling is out of MVP scope.
- If an alert is disabled individually, it should not play even when one of its collections is active.
- If an alert belongs to multiple enabled collections, it should still only be considered once for a given event.

Alert pack import/export should be included in the broader feature list, but it is not required for the MVP. When implemented, exports must be secret-free by default and handle asset bundling explicitly.

## TTS Provider Abstraction

TTS must be implemented behind a provider abstraction, not as a hard-coded single-provider feature.

Example provider targets:

- Speaker.bot.
- Tangia.
- Streamlabs.
- Built-in local fallback for testing, where feasible.

The TTS provider interface should support:

- Provider connection and configuration.
- Capability discovery.
- Available voices.
- Preview/test speech.
- Speech generation or provider-side playback trigger.
- Failure reporting.
- Fallback behavior.

Provider capabilities must be explicit. The UI should not assume every provider supports the same controls. For example, some providers may support voice, pitch, and rate, while others may only support provider-side action triggers.

Per-alert TTS configuration should support:

- Off/on toggle.
- Provider selection.
- Voice selection where supported.
- Message template.
- Volume where supported.
- Delay.
- Rate and pitch where supported.
- Minimum thresholds, such as only reading cheers above a configured Bits amount.
- Moderation before text is sent to the provider.

The alert runtime should consume normalized TTS playback instructions rather than provider-specific payloads.

## Queue And Playback

The runtime should include a playback queue that handles:

- Sequential alert playback.
- Playing all matching alerts for an event.
- Priority ordering.
- Cooldowns.
- Duplicate event protection.
- Maximum queue length.
- Skip current alert.
- Replay recent alert.
- Pause/resume queue.
- Mute/unmute alert audio.
- Do-not-disturb mode.

Test alerts should use realistic sample payloads per event type so preview behavior matches live behavior.

## Security Requirements

Security is mandatory across secret management, local app communication, and external provider calls.

Secrets include:

- Twitch OAuth access tokens.
- Twitch OAuth refresh tokens.
- Provider API keys.
- TTS provider credentials.
- Overlay route keys.
- Admin session tokens.
- Webhook secrets if webhook transport is ever added.

### Secrets At Rest

- Store secrets in the OS credential store where possible, such as Windows Credential Manager, macOS Keychain, or Linux Secret Service/libsecret.
- Do not store raw secrets in plain JSON config.
- Store only secret references in the local app database/config.
- Redact secrets in logs, diagnostics, crash output, and UI copy actions.
- Export configs without secrets by default.
- Support token revoke/rotate flows from the admin UI.
- Use least-privilege OAuth scopes for provider integrations.

### Communication In Flight

- External provider communication must use HTTPS or WSS.
- TLS verification must not be disabled.
- Prefer authorization headers over query-string secrets when provider APIs allow it.
- Send the minimum necessary event data to TTS providers.
- Sanitize and moderate user-controlled text before sending it to external services.

### Local Communication

- Bind to `127.0.0.1` by default.
- Authenticate overlay routes with unguessable route keys.
- Keep admin and overlay authorization separate.
- Authenticate WebSocket connections.
- Validate all WebSocket and HTTP message schemas.
- Use CSRF protection for admin mutations.
- Restrict CORS to known local origins.
- Treat LAN access as a separate future mode requiring additional protections.

### Threats To Design Against

- Browser-source URL leakage.
- Malicious local processes calling the app.
- Malicious webpages attempting localhost requests.
- Replay of WebSocket/control messages.
- XSS in alert text or admin UI.
- Unsafe HTML in viewer messages.
- Malicious TTS payloads.
- Over-privileged provider tokens.
- Accidental config export with secrets.
- Media path traversal.
- Unsafe remote media URLs.

## Asset Management

The app should manage local assets for alert media.

Feature requirements:

- Upload/import images, GIFs, videos, and audio files.
- Validate file type and size.
- Prevent path traversal.
- Track asset usage.
- Detect missing files.
- Support cleanup of unused assets.
- Avoid remote media URL fetching in MVP unless security controls are explicitly designed.

Supported formats and size limits should be finalized during implementation planning.

## Observability And Diagnostics

The admin UI should provide:

- Twitch connection status.
- TTS provider status.
- Overlay connection status.
- Event ingestion log.
- Alert match log.
- Playback queue log.
- Playback failure log.
- Redacted diagnostic export.

Logs must never expose secrets, overlay keys, OAuth tokens, auth headers, or signed URLs.

## MVP Feature Set

The MVP should include:

- Local admin UI.
- Configurable local port.
- Browser-source program overlay.
- Browser-source preview overlay.
- Unguessable overlay route keys.
- Twitch OAuth connection.
- Twitch EventSub WebSocket ingestion.
- Normalized Twitch event model.
- Alert rules and variants.
- Manual alert collections.
- Visual media and audio playback.
- Text templates with event variables.
- TTS abstraction with at least one practical provider or local fallback.
- Test alerts with sample event payloads.
- Playback queue.
- Basic event/playback logs.
- Secure secret storage.
- Redacted diagnostics.

## Post-MVP Feature List

- Alert pack import/export.
- Additional event providers.
- Additional TTS providers.
- LAN overlay mode.
- Encrypted config backup/export.
- More advanced moderation tools.
- Alert scheduling.
- Shared/community alert packs.
- Cloud sync, if ever desired.

## Reference Research

- [OBS Browser Source](https://obsproject.com/kb/browser-source)
- [OBS Stream Alerts FAQ](https://obsproject.com/kb/faq-stream-alerts)
- [StreamElements overlay docs](https://docs.streamelements.com/overlays/getting-started)
- [StreamElements AlertBox setup](https://support.streamelements.com/hc/en-us/articles/16789217829778-Setting-Up-Twitch-Alerts-with-StreamElements-Overlays)
- [Twitch EventSub docs](https://dev.twitch.tv/docs/eventsub/)
- [Twitch EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Twitch Alerts setup](https://help.twitch.tv/s/article/setup-alerts-by-twitch)
- [Twitch Alerts customization](https://help.twitch.tv/s/article/alerts-by-twitch-customization)

## Explicit Assumptions

- The app is local-first and runs on the streamer's machine.
- Twitch is the first event provider.
- Browser source is the only supported output model for the MVP.
- Users manually add browser-source URLs to their streaming software.
- No OBS WebSocket or native OBS plugin features are planned for the MVP.
- Multiple alert collections can be active at once.
- All matching active alerts play for a single event.
- Alert collection activation is manual for the MVP.
- Import/export is planned but not required for the MVP.
- Secrets are stored outside plain config.
- Admin UI and overlay routes have separate authorization.
- The local server binds to `127.0.0.1` by default.
- Configurable port support is required.

## Open Implementation Questions

- Which desktop packaging path should be used: plain Node app, packaged desktop app, Docker, or installer?
- Which local data store should be used for config and event logs?
- Which TTS provider should be implemented first?
- What exact file formats and size limits should be supported for media assets?
- How much of the moderation/filtering system belongs in MVP versus post-MVP?
