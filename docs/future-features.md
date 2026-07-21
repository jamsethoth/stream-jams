# Stream Jams Future Features

This document retains detailed rationale for selected deferred ideas. [`docs/backlog.md`](backlog.md) is the canonical index for current status, priority, dependencies, and promoted OpenSpec work.

Add future items to the backlog first. Add or update a section here only when an item needs design questions or architectural context that does not fit the index. Each implemented item still requires its own approved OpenSpec change.

## Third-Party And Charity Donation Events

**Status:** Deferred.

**Captured:** 2026-07-18.

**Why deferred:** The normalized Twitch event expansion can preserve the existing Twitch source-platform model. Donations introduce monetary values, currencies, provider-specific identities, and multiple upstream integrations, so combining them would hide a separate domain and source-model change inside an event catalog update.

**Future capability:** Normalize donation events from integrations such as Streamlabs, StreamElements, Ko-fi, and Twitch charity campaigns into provider-independent alert events.

**Design questions to answer before implementation:**

- Which upstream integrations and donation meanings belong in the first supported set?
- How should amounts, currencies, fees, refunds, anonymous donors, messages, and campaign identities normalize?
- Should Twitch charity donations be distinct from creator-directed third-party donations?
- How should one active event-source provider discover and subscribe to donation integrations exposed through Streamer.bot?
- Which monetary and donor fields are safe for alert conditions, templates, logs, exports, and TTS?
- How should duplicate donations be detected when more than one integration reports the same transaction?

**Likely prerequisites:**

- An explicit non-Twitch source-platform identity model.
- A currency-safe normalized monetary value type.
- Fixture-backed provider mappings and redaction rules for every supported integration.
- UX for grouped donation event choices and provider-specific readiness.

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


## Evaluate Storybook Vitest Addon

**Status:** Deferred.

**Captured:** 2026-06-19.

**Why deferred:** The first frontend guardrails slice establishes Storybook build and `@storybook/test-runner` as the CI baseline. Adding the Vitest addon at the same time would change the test execution model before the story inventory is stable.

**Future capability:** Evaluate Storybook's Vitest addon for running component, interaction, and accessibility checks closer to the existing Vitest workflow.

**Design questions to answer before implementation:**

- Does the addon reduce duplicate Storybook/test-runner configuration or add useful coverage?
- Can it share the existing Vitest setup without weakening the current `pnpm typecheck` and Storybook CI gates?
- How does it report failures in GitHub Actions compared with the test-runner?
- Does it handle the overlay fullscreen stories and management async-state stories cleanly?

**Likely prerequisites:**

- Stable Storybook story inventory for the management shell and overlay renderer.
- Passing Storybook build and test-runner gates in CI.
- A small comparison branch or spike with timing, failure output, and maintenance notes.


## Advanced Alert Condition Builder

**Status:** Deferred.

**Captured:** 2026-06-16.

**Why deferred:** The implemented editor and planned variation-authoring change cover typed operators for safe normalized event fields. Generic nested logic, actor/message targeting, and advanced provider-specific fields remain a separate product and moderation problem.

**Future capability:** Allow alert rules and variants to combine broader safe normalized fields through understandable AND/OR groups without exposing arbitrary provider payload paths.

**Candidate fields:**

- Actor identity and display name.
- Message text and channel point user input.
- Channel point reward title.
- Additional normalized event fields not covered by the planned variation-authoring controls.
- Provider metadata only through explicit, documented normalized aliases, not arbitrary raw JSON paths by default.

**Design questions to answer before implementation:**

- Which fields are safe and useful enough to expose as first-class choices?
- Which operators make sense per field type?
- How should the UI explain unavailable fields for event types that do not carry them?
- Should any actor or message fields require moderation warnings because they contain viewer-controlled text?
- Should advanced users ever get raw metadata matching, or should all exposed fields remain normalized aliases?

**Likely prerequisites:**

- The typed field-metadata registry planned by `improve-alert-variation-authoring`.
- Clear event-type-to-field compatibility rules.
- UI tests proving accessible labels, validation, and disabled/unavailable field behavior.


## Alert Version History And Rollback

**Status:** Deferred.

**Captured:** 2026-06-16.

**Why deferred:** Complete configuration backup and guarded restore are implemented. Fine-grained version history, soft delete, selective rollback, and retention policy remain a separate state-management feature.

**Future capability:** Let users inspect prior alert versions, recover deleted alerts, and restore a selected alert or set without replacing the complete application configuration.

**Design questions to answer before implementation:**

- Which edits and destructive actions create a version?
- How many versions are retained, for how long, and under what storage bound?
- Should recovery operate on one alert, one set, or a selected group?
- How should a historical version reference assets that were replaced or deleted?
- How should the UI preview live-output impact before applying a rollback?

**Likely prerequisites:**

- Existing transactional configuration backup/restore and alert document persistence.
- A bounded version-retention model and asset-reference policy.
- Tests proving selective recovery does not partially replace live configuration.
