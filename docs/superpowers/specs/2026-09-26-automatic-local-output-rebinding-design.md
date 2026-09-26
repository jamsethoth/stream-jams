# Automatic local output rebinding

## Context

Stream Jams persists explicit Chromium audio-device IDs for named audio routes and an explicit Electron display ID for the desktop overlay. On the affected Windows installation, those IDs changed across an app or Windows restart even though the user-visible device and display names remained the same. The saved audio routes therefore appeared as missing beside newly enumerated devices with identical labels, and the saved desktop display ID `772614963` appeared as missing while the same `VG27A` display was enumerated under a different ID.

The existing fail-closed behavior is intentional: missing audio never falls back to the default output or Browser Source, and a missing desktop display never falls back to the primary display, coordinates, or another monitor. That behavior remains the default. This change adds an explicit, per-binding opt-in that can repair identity churn only when one current endpoint has the exact previously saved label.

The applicable MVP UX boundaries are Audio outputs under Settings, the Desktop overlay configuration under Overlay surfaces, actionable management diagnostics, local-only output bindings, and unchanged separation between visual and audio delivery. Native Windows endpoint identity, fuzzy matching, coordinate-based monitor matching, and a generic device-identity subsystem remain outside this slice.

## Product behavior

### Audio routes

Each bound named audio route gains an `Automatically follow this exact device name` checkbox. It is off by default for existing routes and newly created routes.

Selecting and saving a device continues to persist the enumerated device ID and the authoritative label returned by the desktop host. When automatic following is enabled and that ID is unavailable, Stream Jams compares the saved label with the current enumerated labels using exact, case-sensitive equality:

- exactly one match updates the route to that device's current ID;
- no match leaves the route in its existing missing-device state;
- more than one match is ambiguous and leaves the route missing.

Unbinding a route clears its device ID and label and disables automatic following. Manually selecting a replacement updates both the ID and label; the checkbox retains the value submitted with that save. Automatic recovery affects only playback admitted after the durable update. Active occurrences retain their original immutable destination snapshot.

### Desktop display

The Desktop overlay configuration gains an `Automatically follow this exact display name` checkbox. It is off by default.

Saving a selected display persists its enumerated display ID and authoritative Electron label. If the ID later becomes unavailable and automatic following is enabled, Stream Jams applies the same exact, unique, case-sensitive label rule. One match durably replaces the saved display ID before the desktop overlay is made ready. Zero or multiple matches leave the overlay unavailable.

Existing desktop configurations have no saved display label. They remain valid with automatic following disabled and require one manual display selection and save before the option can be enabled. Clearing the display selection clears its label and disables automatic following. Disabling the desktop overlay does not erase a valid binding or its preference.

If a selected display disappears during active playback, the existing fail-closed behavior remains: the window hides, the interrupted work settles as unavailable, and nothing is replayed. A later automatic match can make the surface ready only for future work.

### Operator feedback

The current `Device missing` and desktop `Unavailable` states remain visible whenever matching is disabled, impossible, ambiguous, or could not be persisted. Their guidance distinguishes the relevant cause:

- automatic following is off;
- the saved label is unavailable;
- several endpoints have the same label;
- the replacement could not be saved.

After a successful automatic update, management shows a session-scoped notice such as `Updated automatically to VG27A using its exact saved name.` The notice does not expose opaque device IDs and is cleared by a later manual binding change or process restart without another recovery.

The checkbox is disabled when no endpoint is bound or when a legacy desktop binding has no saved label. Its accessible description states that matching is exact, ambiguous names remain unavailable, and no default endpoint is used.

## Selected approach

Use one small framework-independent exact-match function for the common rule, while keeping audio-route and desktop-surface reconciliation in their existing domain services. Both domains need the same cardinality decision, but they have different repositories, host transports, runtime consequences, and mutation rules. A generic local-device binding subsystem would add indirection without removing those differences.

The server remains authoritative for reconciliation. Browser code may request the opt-in but cannot supply or overwrite a trusted endpoint label. Audio labels come from the current audio-device inventory, and display labels come from the current Electron display inventory.

### Alternatives rejected

**Native Windows stable identities.** Replacing Chromium and Electron identities with Windows Core Audio and display-configuration identities would require a native bridge, platform-specific lifecycle handling, packaging work, and a migration between two identity systems. It is disproportionate to this recovery case and would not remove the need for safe ambiguity handling.

**Automatic label matching for every binding.** This would silently weaken existing fail-closed behavior and could send private audio or desktop visuals to a same-named replacement without the operator choosing that risk.

**Fuzzy labels, coordinates, or primary/default fallbacks.** These can select the wrong physical endpoint. They are explicitly excluded.

**One global checkbox.** Audio routes can carry different privacy and capture consequences, so consent is per route. Desktop matching has a separate checkbox because it is a different output and risk boundary.

## Contracts and persistence

`AudioOutputRoute` and the `audio_output_routes` table add `autoFollowDeviceName` / `auto_follow_device_name`, a non-null boolean stored as `0` or `1`. The database migration assigns `0` to every existing row. Create and patch contracts accept the boolean, but the service continues to derive `deviceLabel` from the selected current `deviceId`. A route is valid with automatic following enabled only when both ID and label are present.

The persisted desktop surface adds:

- `displayLabel: string | null`;
- `autoFollowDisplayName: boolean`.

Compatibility parsing assigns `displayLabel: null` and `autoFollowDisplayName: false` when those fields are absent. The management update contract accepts the selected display ID and checkbox state, while the surface service derives the saved label from the current desktop inventory. Automatic following requires a non-null ID and label. Runtime and transport configuration carry the saved label and option for status reporting but continue to position the window by the resolved display ID.

The management response exposes these fields so a saved form round-trips exactly. While the current process has a reconciliation outcome to report, the response also exposes a typed session-scoped notice for successful recovery or ambiguity guidance. It does not expose an alternative endpoint as selected until persistence succeeds.

Portable backup behavior remains deliberately local-safe. Export already unbinds audio routes and disables and clears the desktop binding. Export and restore also write both automatic-follow fields as false and clear the desktop label. A restored configuration cannot auto-bind on another machine until the operator explicitly selects a current device or display and opts in again.

## Reconciliation flow

Reconciliation runs after the desktop host provides an authoritative current inventory during startup and after a later inventory refresh caused by device or display topology change.

For each opted-in binding whose saved ID is absent:

1. Validate that the saved label is present.
2. Collect current endpoints whose labels equal it exactly and case-sensitively.
3. Continue only when the collection contains exactly one endpoint.
4. Persist the new ID through the existing configuration-mutation transaction or maintenance gate.
5. Re-read or construct the committed binding and apply it to the runtime.
6. Record a session-scoped successful-reconciliation notice.

The runtime never uses an inferred ID before persistence succeeds. A failed write leaves the old binding authoritative and unavailable. Reconciliation is idempotent: once the persisted ID is current, subsequent inventory refreshes do nothing.

Audio route updates use the route repository and preserve the stable route ID, name, and references from Alerts and Screen Effects. Desktop updates preserve enablement, opacity, and layer order. Neither path restarts, retargets, or replays active work.

Concurrent manual saves remain authoritative. Reconciliation must compare or update against the same binding version inside the configuration mutation boundary; if the operator changed the binding first, the stale automatic update is discarded. Multiple matching routes may independently update to the same device, preserving the existing playback-time deduplication by explicit device ID.

## Failure and safety behavior

- Matching never considers a default or communications audio alias.
- Matching never considers a primary display, coordinates, bounds, scale factor, or label substring.
- Blank labels cannot enable automatic following.
- Duplicate exact labels are an actionable ambiguity, not a tie to break by enumeration order.
- An unavailable desktop host preserves settings and reports that reconciliation could not run.
- An enumeration failure performs no writes.
- A persistence failure performs no ephemeral reroute and leaves existing settings authoritative.
- A renderer or player failure after a successful rebind follows the existing bounded recovery behavior and does not cause another identity match.
- Automatic recovery applies to future playback only and does not replay missed or interrupted content.

## Management UI

The Audio outputs route card places `Automatically follow this exact device name` below the device selector. It participates in the route card's existing dirty state and `Save output` action. Changing the checkbox alone enables Save. Missing-device help explains whether the saved exact name is absent or ambiguous and continues to state that audio will not fall back.

The Desktop overlay form places `Automatically follow this exact display name` below the display selector. It participates in the surface form's existing dirty, Save, and Revert behavior. The summary remains `Needs attention` while a binding cannot be resolved and returns to its normal ready state after a committed automatic update.

Both controls use native checkboxes, explicit labels, keyboard focus, and concise explanatory text. No confirmation modal is needed because the operator explicitly opts in and the matching rule is shown beside the control.

Storybook covers ready, opted-out missing, opted-in no-match, opted-in ambiguous, automatically updated, and legacy-display-without-label states. Existing desktop and audio settings layouts remain otherwise unchanged.

## OpenSpec changes

The implementation change updates the canonical requirements rather than treating label recovery as an exception hidden in code:

- `alert-audio-routing` changes the different-ID scenario from mandatory manual rebinding to opt-in exact-name reconciliation, while retaining no-fallback behavior;
- `shared-overlay-surfaces` permits the same opt-in exact-name reconciliation and continues to prohibit label guessing when the option is off or the match is not unique;
- `configuration-backup-restore` requires portable exports and restores to clear labels, bindings, and automatic-follow consent for machine-local outputs.

The OpenSpec proposal and implementation plan will use one slice because the same observed startup problem, matching rule, management settings surface, and backup boundary apply to both domains. The services remain separately testable and can be implemented in ordered tasks.

## Verification

- Pure core tests cover exact unique matches, case differences, no match, duplicate labels, blank labels, and unchanged current IDs.
- Audio schema, migration, repository, and service tests cover default-off compatibility, binding-derived labels, opt-in patching, durable startup reconciliation, persistence failure, concurrent manual change, unbinding, and future-playback-only behavior.
- Desktop schema, repository, service, host, and runtime tests cover legacy JSON, trusted label persistence, changed IDs, duplicate monitor names, unavailable enumeration, durable-before-ready ordering, disconnection during playback, and no replay.
- Backup tests prove exported and restored audio routes are unbound with automatic following off and desktop surfaces are disabled with ID and label cleared and automatic following off.
- Management component tests cover checkbox enablement, dirty/save/revert behavior, accessible labels, all missing and ambiguity guidance, and successful-reconciliation notices.
- Storybook visual and accessibility checks cover the new route and display states.
- Playwright covers opting in for an audio route and desktop display, simulating new IDs with the same unique labels across restart, observing the durable ready state, and verifying duplicate labels remain unavailable.
- Packaged Windows verification uses the actual enumerated audio devices and displays to confirm settings survive an app restart, while synthetic automated coverage owns the forced-ID-change cases.
- Run focused tests first, then affected lint, typecheck, unit, build, Storybook, Playwright, packaged-app, strict OpenSpec, and diff checks before publication.

## Delivery

Implementation will be specified by one dedicated OpenSpec change and delivered as one independently reviewable pull request. It does not add native dependencies or alter the Windows installer boundary. The live installed app is not modified during design or planning; packaged verification occurs only after implementation and rebuild.
