# Stream Jams Product Plan

Stream Jams is a local-first streaming overlay application for streamers who want to configure modular alert experiences and render them as a browser source in OBS, Streamlabs Desktop, XSplit, vMix, or similar streaming software.

The initial product scope is Twitch alerting: listen for stream events, resolve matching alert rules, and display configured visual and audio elements on a fullscreen transparent overlay canvas.

## Goals

- Run locally on the streamer's machine.
- Provide a browser-source overlay URL for streaming software.
- Provide a management UI for setup, module configuration, alert configuration, asset management, test output, and event testing.
- Support modular alert elements placed on a fullscreen canvas.
- Support future overlay modules beyond alerts, such as a music widget.
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
- Implementing non-alert overlay modules in the MVP.
- Packaged desktop application delivery in the first implementation pass.
- Docker image delivery in the MVP.

## Output Model

The only supported output model for the MVP is a browser source.

Users will manually add a local overlay URL to their streaming software. The app should not depend on OBS-specific plugins or OBS WebSocket integration.

The app should support two browser-source URL styles:

- **Module-specific overlay URLs:** separate URLs for individual overlay modules, giving streamers independent control in OBS or similar software.
- **Unified overlay URLs:** one combined URL that renders enabled modules together on a shared canvas.

Alerts are the first module, but the output model should not assume alerts are the only module.

Example local routes:

```text
http://127.0.0.1:39187/manage
http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_<unguessable-key>
http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_<unguessable-key>
http://127.0.0.1:39187/overlay/unified/live/ovl_<unguessable-key>
http://127.0.0.1:39187/overlay/unified/test/ovl_<unguessable-key>
```

The app must support a configurable port. The selected port is stored in non-secret local config. On startup, if the configured port is unavailable, the app should show a clear error and suggest available alternatives.

The app should bind to `127.0.0.1` by default. LAN binding is out of MVP scope and should be treated as an advanced future feature because it changes the security model.

## Overlay Access Model

Overlay URLs should use unguessable route keys instead of visible query-string tokens. These keys are not management credentials; they only grant access to display/playback overlay output.

Rules:

- Live and test overlays must have separate keys.
- Module-specific and unified overlay URLs must have separately scoped keys.
- Overlay keys must not grant access to management/configuration APIs.
- Overlay keys can be regenerated from the management UI.
- Overlay keys must be redacted from logs and diagnostic exports.
- Exported configs should omit or regenerate overlay keys by default.

The management UI should clearly separate live output from test output. Test overlay URLs should only show test-scoped events. Live overlay URLs should show both test-scoped events and real events from integrated event sources.

## Core Surfaces

### Management UI

The management UI is used to:

- Connect Twitch.
- Configure alert rules and variants.
- Enable, disable, and configure overlay modules.
- Run module configuration wizards/forms.
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

## Overlay Module Platform

Stream Jams should be designed as a modular overlay platform. Alerts are the first usable module, but future modules should be able to render their own overlay elements without being forced into the alert model.

Example future modules:

- Music widget.
- Stream goal widget.
- Chat widget.
- Sponsor or shoutout widget.
- Countdown or timer widget.

Core concepts:

- **Overlay module:** a feature package with its own configuration schema, management wizard/form, runtime state, and overlay renderer.
- **Module instance:** a configured instance of an overlay module. A user may eventually have more than one instance of the same module.
- **Module-specific overlay output:** a browser-source URL that renders one module or module instance.
- **Unified overlay output:** a browser-source URL that renders all enabled modules selected for that output.
- **Module registry:** the system that lists available modules, their capabilities, configuration schema, renderer entry point, default layout, and enabled state.

Module rules:

- Every overlay module can be enabled or disabled independently.
- A disabled module must not render in module-specific or unified overlay outputs.
- Each module must expose a wizard/form-driven configuration flow in the management UI.
- Each module must define its own service boundary and avoid coupling module logic into shared HTTP handlers or React shell components.
- Modules may provide separate live and test outputs.
- A unified overlay should compose enabled modules through normalized render instructions rather than importing module internals directly.

MVP module scope:

- Implement the overlay module platform foundation.
- Implement the Alerts module.
- Do not implement a music widget in MVP, but keep the module interfaces compatible with a future `stream-jams-music-widget` integration.
- Support exactly one configurable canvas per module in the MVP. The module canvas controls placement for that module's overlay elements, and the configured canvas can be exposed through live and test browser-source variants.

## Twitch MVP Scope

Twitch is the first event provider.

Preferred integration path: Twitch EventSub over WebSocket. This avoids requiring a public webhook endpoint for a locally hosted app.

The first Twitch milestone should start with a limited event set:

- Follow.
- Subscription.
- Resubscription.
- Cheer/Bits.
- Raid.
- Channel point redemption.

The event model and provider boundary should leave room for later Twitch events:

- Gifted subscription.
- Community gift.
- Hype Train begin, progress, and end.
- Creator goals.
- Charity donations.

Each event provider should normalize platform-specific payloads into internal event objects before alert matching.

## Alert Model

Alerts are implemented as the first overlay module. Alert-specific rules, collections, event matching, TTS, and playback queue behavior should live inside the Alerts module service boundary while using shared platform services for assets, secrets, overlays, diagnostics, and module configuration.

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

MVP visual customization starts with basic placement, media, and text settings. The model must leave room for later font, color, animation, transition, and style controls without changing the alert service boundary.

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

Alerts should play sequentially by default.

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

The first target provider is Speaker.bot.

Future provider targets:

- Tangia.
- Streamlabs.
- Built-in local fallback for testing, where feasible.

The TTS provider interface should support:

- Provider connection and configuration.
- Capability discovery.
- Available voices.
- Test speech.
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

Test alerts should use realistic sample payloads per event type so test behavior matches live behavior.

## Logging

Logging is a first-class feature of the local app.

Requirements:

- Default log level is `INFO`.
- Log level is configurable in app settings.
- Logs roll over hourly by default.
- Log retention is configurable in app settings.
- Default retention deletes log files older than 48 hours.
- Every log line should include timestamp, level, message, module/service name, code location or stable source identifier, correlation ID, processing ID where applicable, and sanitized structured metadata.
- Event ingestion, alert matching, queue processing, overlay dispatch, provider calls, asset operations, management actions, and security decisions should log at appropriate levels.
- Logs must be redacted before writing secrets or sensitive values.
- Correlation IDs should trace one source event or management action across services.
- Processing IDs should distinguish asynchronous work items in multi-threaded or concurrent execution.

## Security Requirements

Security is mandatory across secret management, local app communication, and external provider calls.

Secrets include:

- Twitch OAuth access tokens.
- Twitch OAuth refresh tokens.
- Provider API keys.
- TTS provider credentials.
- Overlay route keys.
- Management session tokens.
- Webhook secrets if webhook transport is ever added.

### Secrets At Rest

- Store secrets in the OS credential store where possible, such as Windows Credential Manager, macOS Keychain, or Linux Secret Service/libsecret.
- Do not store raw secrets in plain JSON config.
- Store only secret references in the local app database/config.
- Redact secrets in logs, diagnostics, crash output, and UI copy actions.
- Export configs without secrets by default.
- Support token revoke/rotate flows from the management UI.
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
- Keep management and overlay authorization separate.
- Authenticate WebSocket connections.
- Validate all WebSocket and HTTP message schemas.
- Use CSRF protection for management mutations.
- Restrict CORS to known local origins.
- Treat LAN access as a separate future mode requiring additional protections.

### Threats To Design Against

- Browser-source URL leakage.
- Malicious local processes calling the app.
- Malicious webpages attempting localhost requests.
- Replay of WebSocket/control messages.
- XSS in alert text or management UI.
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

Media import strategy:

- MVP should use a hybrid media approach.
- The first implementation should validate and accept common browser-safe media formats without requiring transcoding.
- The asset pipeline must be designed so import-time transcoding can be added later without changing alert or module service boundaries.
- The end state for the feature is proper import-time transcoding/normalization for media formats that are useful to streamers but not ideal for browser-source playback.

## Technology And Distribution Strategy

Selected mandatory implementation stack:

- Frontend: React, Vite, and TypeScript.
- Backend: Node.js, Fastify, and TypeScript.
- Real-time transport: WebSocket served by the local backend and consumed by browser overlays.
- Local data store: SQLite behind typed repository interfaces.
- Runtime validation: Zod or JSON Schema at HTTP, WebSocket, provider, and persistence boundaries.
- Testing: Vitest, Testing Library, and Playwright.
- Eventual desktop shell: Electron.

This stack is locked for implementation. It is selected because it keeps management UI, overlay UI, backend services, service interfaces, provider adapters, and tests in TypeScript while the product architecture is still forming. Runtime schemas remain mandatory because TypeScript does not validate external payloads, database rows, or WebSocket messages at runtime.

Dependency resolution must be deterministic. All direct npm dependencies and dev dependencies must be pinned to exact versions without semver ranges such as `^`, `~`, `>`, or `*`, transitive dependencies must be locked in the committed `pnpm-lock.yaml` with integrity data, and release/build automation must install from the committed lockfile using frozen-lockfile behavior. It must not be possible for the app to produce a different artifact or behavior without a repository change. This is especially important for npm ecosystem dependencies because compromised package releases and supply-chain attacks can otherwise alter builds without local source changes.

SQLite must be accessed through repository interfaces rather than directly from domain services, HTTP handlers, React components, or overlay renderers. Repository implementations are responsible for SQL, migrations, row mapping, transaction boundaries, and persistence-specific validation.

The first implementation remains a plain local app. Electron is the selected packaged desktop target once the MVP stabilizes. The codebase should be designed so an Electron shell can launch or supervise the local Node/Fastify service and load the management UI without rewriting domain logic. Electron-specific work should live at the application shell boundary; browser UIs should not directly access filesystem, secret storage, SQLite, or Node APIs.

Supported platform goals:

- Development and local hosting should support Windows, macOS, and Linux where practical.
- Windows is the primary streamer platform target.
- Electron packaging should target Windows first, with macOS and Linux support where practical.
- Browser-source output should remain compatible with OBS, Streamlabs Desktop, XSplit, vMix, and similar software that supports browser/webpage sources.
- Platform-specific secret storage should use OS-native credential storage where available.

Docker is a nice-to-have after the local MVP. A Docker image could support self-hosted or cloud-hosted deployments, but it changes secret storage, browser-source URL exposure, network binding, TLS, and remote access assumptions. Docker support should therefore be designed as a separate deployment mode rather than the default local streamer mode.

## Observability And Diagnostics

The management UI should provide:

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

- Local management UI.
- Configurable local port.
- Browser-source live overlay.
- Browser-source test overlay.
- Module-specific browser-source URLs.
- Unified browser-source URLs.
- Unguessable overlay route keys.
- Overlay module registry and enable/disable controls.
- Wizard/form-driven module configuration.
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
- Music widget module.
- Additional overlay widget modules.
- Additional event providers.
- Additional TTS providers.
- Electron packaged desktop application.
- Docker image for self-hosted/cloud-hosted deployments.
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
- The first implementation stack is React, Vite, Node.js, Fastify, TypeScript, and SQLite behind typed repository interfaces.
- npm/pnpm dependencies are pinned to exact versions and builds install from the committed lockfile with frozen-lockfile behavior.
- The first implementation is a plain local app.
- Electron is the selected packaged desktop shell after the MVP stabilizes.
- Docker/cloud hosting is a nice-to-have future deployment mode.
- Browser source is the only supported output model for the MVP.
- Users manually add browser-source URLs to their streaming software.
- No OBS WebSocket or native OBS plugin features are planned for the MVP.
- Alerts are the first overlay module, not the only long-term overlay feature.
- The MVP includes the module platform foundation but only implements the Alerts module.
- Future modules may use separate module-specific overlay URLs or participate in unified overlay URLs.
- Multiple alert collections can be active at once.
- All matching active alerts play sequentially for a single event.
- Speaker.bot is the first target TTS provider.
- The first Twitch milestone starts with follow, sub/resub, cheer, raid, and channel point redemption.
- Alert collection activation is manual for the MVP.
- Import/export is planned but not required for the MVP.
- Secrets are stored outside plain config.
- Management UI and overlay routes have separate authorization.
- The local server binds to `127.0.0.1` by default.
- Configurable port support is required.

## Open Implementation Questions

- Which Electron packaging, signing, installer, and auto-update toolchain should be used after the MVP stabilizes?
- What exact file formats and size limits should be supported for media assets in the initial validation-only importer?
- How much of the moderation/filtering system belongs in MVP versus post-MVP?
- Should future modules be loaded only from code shipped with the app, or should a plugin-style external module system be supported later?
- Should the future music widget be integrated by sharing code from `stream-jams-music-widget`, embedding it as a module package, or communicating with it as a separate local service?
