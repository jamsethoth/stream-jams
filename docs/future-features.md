# Stream Jams Future Features

This document captures intentionally deferred product and architecture ideas that should not be lost while current work stays tightly scoped.

Each item should become its own design/spec before implementation.

## Startup Module Setup Wizard

**Status:** Deferred.

**Captured:** 2026-06-16.

**Why deferred:** The MVP currently has one Alerts module, so the module definition can stay enabled by default without adding first-run setup flow complexity.

**Future capability:** When multiple overlay modules exist, guide users through choosing which modules to enable and configure during initial startup.

**Design questions to answer before implementation:**

- Which modules should be preselected, if any?
- Can users skip setup and return to it later?
- How should the wizard distinguish module enablement, canvas config, provider setup, and alert rule setup?
- Should incomplete setup disable a module, keep defaults, or mark it needs attention?
- How should the wizard behave for existing users after new modules are added?

**Likely prerequisites:**

- Multiple shipped overlay modules.
- Durable module config persistence.
- Stable per-module setup metadata beyond the MVP Alerts canvas fields.

## Streamer.bot Non-Local Connections

**Status:** Deferred.

**Captured:** 2026-05-31.

**Why deferred:** The first Streamer.bot event-source implementation is local-only. Non-local Streamer.bot connections change the security model because Stream Jams would connect to automation software across a LAN or remote network boundary.

**Future capability:** Allow users to connect Stream Jams to a Streamer.bot WebSocket server that is not bound to the same local machine.

**Design questions to answer before implementation:**

- Which host values are allowed: private LAN only, arbitrary hostnames, or user-confirmed advanced entries?
- Should non-local support require Streamer.bot authentication?
- Should Stream Jams require TLS or a trusted tunnel for remote connections?
- How should management UI warn users about connecting to automation software over a network?
- Should Stream Jams detect and block public or ambiguous network addresses by default?
- How should connection errors distinguish DNS, TCP, WebSocket, authentication, and subscription failures?
- What diagnostics are safe to expose when a remote endpoint may be shared or administered by someone else?

**Likely prerequisites:**

- Completed local Streamer.bot event-source integration.
- Explicit authentication and unauthenticated-mode configuration model.
- Redacted diagnostics for Streamer.bot connection and event payloads.
- Threat model update for non-local provider connections.

**Non-goals for the first local implementation:**

- LAN setup wizard.
- Remote tunnel guidance.
- TLS certificate management.
- Public endpoint support.
- Action execution over a non-local Streamer.bot connection.


## Twitch Secure Configuration And UI Parity

**Status:** Deferred.

**Captured:** 2026-05-31.

**Why deferred:** The MVP Twitch integration currently has a management UI for connection/status, but Twitch app credentials are configured through process environment variables. Streamer.bot planning introduces a stronger explicit configuration model for secure transport defaults, insecure-mode opt-ins, encrypted-at-rest credentials, warning states, and connection diagnostics.

**Future capability:** Bring Twitch integration up to the same configuration and security standard as the Streamer.bot integration where the concepts apply.

**Design questions to answer before implementation:**

- Should Twitch client ID and client secret move from environment variables into management configuration?
- Which Twitch credential values are secrets and which are non-secret configuration?
- Should in-app Twitch credential management require the current runtime OS credential adapter, the future Electron `safeStorage` adapter, or either backend through the shared `SecretStore` contract?
- How should the UI distinguish app credentials, connected broadcaster account, OAuth token status, and EventSub runtime status?
- What warning or blocked state should appear when credential storage is unavailable or temporarily locked?
- Should Twitch credential changes force token revocation, account disconnect, or EventSub reconnect?
- What diagnostics prove Twitch OAuth and EventSub communication are using expected secure upstream endpoints?

**Likely prerequisites:**

- Production-ready OS-backed secret-store selection.
- Provider configuration model that separates non-secret settings from secret refs.
- Streamer.bot secure configuration implementation or equivalent shared provider-settings pattern.
- Server-composition smoke tests that prove runtime uses the selected secret store.

**Known UI gaps from the current Twitch panel:**

- No UI for Twitch app client ID or client secret configuration.
- No UI for credential storage health.
- No explicit secure-communication status beyond relying on Twitch HTTPS endpoints.
- No EventSub subscription selection or scope explanation beyond listing granted scopes.


## Expanded Alert Condition Builder Fields

**Status:** Deferred.

**Captured:** 2026-06-16.

**Why deferred:** The first expanded alert editor should stay small enough to ship and verify. It exposes only normalized `amount`, `tier`, and `rewardId` fields so streamers can cover common cheer, subscription, raid, and channel point cases without opening provider-payload or nested-field complexity.

**Future capability:** Allow alert rules and variants to use a broader accessible field set while keeping the condition builder understandable and provider-safe.

**Candidate fields:**

- Actor identity and display name.
- Message text and channel point user input.
- Channel point reward title.
- Resubscription streak or tenure fields.
- Gift count and other normalized subscription metadata if added.
- Provider metadata only through explicit, documented normalized aliases, not arbitrary raw JSON paths by default.

**Design questions to answer before implementation:**

- Which fields are safe and useful enough to expose as first-class choices?
- Which operators make sense per field type?
- How should the UI explain unavailable fields for event types that do not carry them?
- Should any actor or message fields require moderation warnings because they contain viewer-controlled text?
- Should advanced users ever get raw metadata matching, or should all exposed fields remain normalized aliases?

**Likely prerequisites:**

- A typed field-metadata registry shared by the condition builder and matcher tests.
- Clear event-type-to-field compatibility rules.
- UI tests proving accessible labels, validation, and disabled/unavailable field behavior.


## Interactive Alert Layout Canvas

**Status:** Deferred, but required before the initial app scope can be considered complete.

**Captured:** 2026-06-16.

**Why deferred:** The alert editor slice uses numeric `x`, `y`, `width`, `height`, and `zIndex` controls with a static preview. That is enough to configure and verify layout without taking on direct manipulation, keyboard resizing, snapping, selection, and responsive preview behavior in the same slice.

**Future capability:** Provide an interactive alert layout canvas for direct positioning and sizing of alert visuals/text within the overlay coordinate space.

**Design questions to answer before implementation:**

- What coordinate system and responsive scaling model should the canvas use?
- How should keyboard users move, resize, layer, and inspect selected elements?
- Should the canvas support snapping, guides, aspect-ratio locks, and safe areas?
- How should previews represent browser-source viewport sizes used in OBS?
- How should canvas edits remain equivalent to the numeric layout model so users can switch between direct and precise editing?

**Likely prerequisites:**

- Stable overlay layout schema and renderer behavior from the expanded alert editor.
- Accessibility design for keyboard and screen-reader operation.
- Playwright coverage for visible canvas editing and overlay render parity.


## Alert Configuration Backup, History, And Rollback

**Status:** Deferred.

**Captured:** 2026-06-16.

**Why deferred:** The expanded alert editor uses hard deletes with confirmation and impact summaries, but durable backup/history/rollback is a broader state-management feature that cuts across alert collections, rules, variants, assets, and possibly module config.

**Future capability:** Let users back up current alert/module configuration state, inspect previous snapshots, and restore an earlier known-good configuration after accidental edits or deletes.

**Design questions to answer before implementation:**

- What state is included in a backup: alerts only, module config, asset metadata, asset files, overlay keys, or all local app state?
- Are backups automatic, manual, or both?
- Where are backups stored, and how are they protected from corruption or accidental deletion?
- How should restore handle assets or overlay keys that no longer exist?
- Should restore be all-or-nothing, selective by collection/rule/variant, or both?
- How should the UI preview restore impact before applying a snapshot?

**Likely prerequisites:**

- Durable SQLite-backed runtime state for the relevant configuration domains.
- Export/import or snapshot services with explicit UTF-8/LF JSON serialization and transaction-backed restore.
- Tests proving restore can roll back a hard-delete scenario without partial state.
