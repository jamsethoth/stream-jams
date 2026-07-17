# Stream Jams MVP UX Refactor Spec

This spec consolidates the UI refactor decisions from `docs/design/ui-refactor-decisions.md`.
The decision log remains the raw history. This document is the implementation-facing MVP UX source.

## Goals

- Rebuild the management UI as an offline setup and configuration console.
- Make live monitoring and moderation a separate operator surface, design-only for this refactor.
- Replace broad dashboard behavior with focused setup, validation, editing, diagnostics, and backup flows.
- Keep every failure visible, human-readable, actionable, and traceable by reference ID when available.
- Support two fixed alert output profiles for MVP: landscape and vertical.
- Keep implementation sliceable: backend model and APIs first, then management shell and UI surfaces.

## Non-Goals

- No full live operator console implementation in this MVP.
- No OBS integration or OBS-aware readiness in this MVP.
- No multiple active providers per capability.
- No multiple active alert sets.
- No custom canvas profiles.
- No arbitrary custom HTML/CSS/JS alert layers.
- No timeline/keyframe editor.
- No user-created template library.
- No cloud backup/sync integration.
- No broad auto-save for domain state.

## Product Surfaces

### Management UI

Management UI is the MVP product surface. It is for offline setup, configuration, asset management, diagnostics, backup/restore, and alert design.

It must not become a live moderation dashboard. Runtime-impacting changes require explicit actions such as `Set active`, `Activate set`, `Enable`, `Save`, or `Restore from backup`.

### Operator Console

Operator console is a future `/operator` route and Penpot/design-artifact scope for this refactor. It should remain separate from management.

The design north star:

- Center `Now playing` and `Queue`.
- Top status strip for intake health.
- Side rail for normalized recent events.
- `Attention` area for actionable live problems only.
- Direct runtime actions only: pause/resume intake, replay alert, skip current alert, clear queue, mute TTS.
- Configuration fixes deep-link back to management.
- Raw event details link to Diagnostics instead of making raw logs part of the default operator view.

## Information Architecture

Use a sidebar-first app shell.

Top-level navigation:

- `Home`
- `Event sources`
- `TTS providers`
- `Modules`
  - `Alerts`
- `Assets`
- `Diagnostics`
- `Settings`

Rules:

- Do not nest `Event sources` or `TTS providers` under a generic Configuration item.
- `Overlays` is not a primary nav item. Browser-source URLs live inside the module that owns the output.
- Browser-source URLs are separate per module and target profile.
- Sidebar shows stable product areas.
- Breadcrumbs appear on nested pages and focused editor surfaces.
- Focused editor breadcrumb includes `Modules / Alerts / Set / Provider / Event / Alert`.
- Routes use stable IDs internally; editable names are display text only.

## Visual Foundation

Use a hybrid product personality:

- Management shell: operational, quiet, dense, scannable.
- Alert editor: creator-studio style, visual, preview-heavy.
- Home, integrations, assets, diagnostics, and settings: restrained and utilitarian.
- Canvas/editor surfaces may use richer controls where they serve alert design.

Design system:

- Build local Stream Jams components with design tokens and CSS variables.
- Use Carbon guidance for IA, shell, forms, tables, status, and density.
- Use Material 3 and modern component practice for interaction polish where useful.
- Prefer accessible primitives for dialogs, menus, tabs, popovers, selects, sliders, tooltips, sheets, and switches.
- Do not adopt MUI or Carbon React as primary component library.
- Do not adopt Tailwind at start. Reevaluate later if component adoption makes it worthwhile.

Theme and density:

- Support System, Dark, and Light.
- Default to system preference.
- Comfortable density by default.
- Tables and alert trees may be denser than forms.
- Global density preference is backlog.

Accessibility:

- Meet WCAG 2.2 AA contrast for app UI.
- All controls keyboard usable.
- Canvas positioning and sizing have exact inspector/form alternatives.
- Status never relies on color alone.
- Reduced-motion mode disables nonessential UI animation and editor preview autoplay unless manually triggered.

Responsive scope:

- Management configuration supports desktop and tablet widths.
- Mobile remains readable for status and simple edits.
- Canvas editor is desktop-required for MVP and shows a clear larger-screen message on narrow mobile.

## Cross-Cutting UX Rules

### Save And Auto-Save

- Domain state requires explicit save or confirmation.
- Do not auto-save provider connection settings, active provider selection, alert activation, alert editor changes, asset replacement/delete, route-key regeneration, or restore/import behavior.
- Auto-save is allowed for low-risk view state: theme, sidebar collapsed state, filters/sort, visible columns, editor zoom/pan/grid visibility, selected target profile, and dismissed noncritical tips.
- Navigation away from dirty domain forms or editor changes must warn.

### Error Handling

No failure is silent.

Every user-facing failure should include:

- Human-readable summary.
- Known cause when available.
- Next step.
- Severity.
- Timestamp when useful.
- Reference/log ID when available.
- Deep link to correction surface when applicable.

Diagnostics must be searchable by reference ID.

### Confirmation Pattern

Use one app-wide destructive confirmation pattern.

Confirmation shows:

- Action name.
- Affected scope.
- Consequences.
- Recovery path if one exists.

Typed confirmation is reserved for high-risk actions such as restoring backup, deleting an in-use asset, or regenerating route keys for a connected/recently connected output.

Lower-risk deletes use normal confirmation.

## Home

Home replaces Dashboard.

Home shows setup readiness and next actions, not live moderation.

MVP Home content:

- Setup checklist for event sources, TTS providers, starter alert set review, and browser-source output URLs.
- Checklist completion derived from app state, not manual checkboxes.
- Provider checklist items complete only when provider validates.
- Starter alert review completes when the default set has at least one enabled valid alert or user marks starter review done.
- Active alert set summary: set name, blocker/warning counts, enabled alert count, active target profiles.
- Top active actionable problems only, with links to Diagnostics or correction screens.

Rules:

- Checklist items deep-link to the relevant provider wizard, Alerts selected default set, or Browser sources section.
- Integration readiness cards are not whole-card links.
- Provider name/status area links to provider detail; explicit actions handle test, edit, connect, or set active.
- Home does not show raw logs.
- Manual dismiss applies to tips only, not readiness tasks.

## Integrations

Readiness is tracked only for external service/app boundaries:

- Twitch.
- Streamer.bot.
- Speaker.bot.
- Future event/TTS providers.

OBS/browser-source verification is not readiness in MVP because browser-source URLs are manually copied.
OBS can become readiness only if OBS WebSocket integration is added later.

### Provider Setup

- One wizard per setup flow.
- Wizard must complete before provider is registered.
- Failed validation stays in wizard with human-readable error, retry action, next step, and reference ID linking to Diagnostics.
- Exiting incomplete setup discards setup state.
- Draft/resumable setup is backlog.

Provider activation:

- Any number of providers may be registered per capability.
- At most one provider per capability can be active in MVP.
- If no active provider exists, successful setup sets new provider active.
- If active provider already exists, new provider is registered inactive and user can choose `Set active`.
- `Save provider` stores settings.
- `Set active` changes runtime behavior.
- `Test connection` validates provider without activating it.
- Event-source rows are selected by clicking the row or using the provider-name selection control; a separate `View` action is not shown.
- Event-source rows expose `Activate` or `Deactivate` in the Actions column.
- Activation and deactivation always show affected scope, consequences, and recovery before requiring confirmation.
- Deactivating the active event source may leave no event source active. Its registration, settings, and alert mappings remain saved.
- Deactivation stops routing new events and disconnects that source's live runtime while preserving registration, settings, and last validation state.
- TTS providers retain the active-provider switching flow; deactivation is not exposed in the TTS provider list.

Event-source rows do not show a setup state because provider setup must validate before registration and partial registrations are not persisted in MVP.
Event-source rows show:

- `Usage`: `In use` or `Not in use`, reflecting explicit activation.
- `Live status`: `Starting`, `Healthy`, `Reconnecting`, or `Error` for the source in use; inactive sources show `Not running`.

Live status is transient runtime evidence, not the saved validation result. Last validation and known setup errors remain in provider details.
The Event sources page refreshes live status every five seconds without a page reload and preserves the selected provider. If refresh fails, the last known state remains visible and an actionable refresh error is shown.
When live status is `Error`, the provider runtime or event-ingestion pipeline generates a reference ID at the distinct failure source and records redacted diagnostic evidence with that same ID. Repeated status reads reuse the reference for the same occurrence; a recovered or later failure receives a new ID. Selecting the provider shows the current runtime cause, a human-readable next step, occurrence time, and reference ID in the right detail panel. The error includes an `Open diagnostics` link filtered by reference ID. The table retains the compact `Error` status instead of repeating the full failure inline.
Event-source copy should not hardcode one-active-provider language so future multi-active provider support remains possible.

### Activation Impact Checks

Alert rules match canonical event type plus explicit conditions, not an ingestion provider kind or specific registered provider.

Provider kind remains authoring metadata for event catalogs, sample payloads, and editor organization. For example, a canonical `Raid` alert authored from the Twitch catalog can receive either direct Twitch EventSub or Streamer.bot-ingested Twitch raids.

When setting a provider active:

- Event-source changes keep alerts matched when the source supplies the same canonical event types.
- An explicit `ingestProvider` condition can intentionally restrict a rule and is reflected in impact counts.
- Missing canonical event support produces specific unmatched counts and warnings when provider capability discovery is available.
- TTS provider activation similarly checks active alerts that use TTS.

### TTS Providers

TTS provider setup should include `Test voice` when supported.

TTS provider page owns provider-wide safety controls:

- Default voice.
- Volume/rate limits.
- Max length.
- Future filtering controls.

MVP uses provider default voice only.
Alert-level voice override is backlog and only allowed when provider permits it.

TTS provider page shows:

- `Connection`.
- `Used by alerts` count/link.

Default `Test voice` uses fixed safe sample text.
Custom TTS test text is optional and local to the test.

## Assets

Assets is the global media library. Module workflows can create/select assets inline, but Assets page is the review and maintenance surface.

### Asset Library

Primary view:

- Table/list with thumbnails.
- Preview/details panel on desktop.
- Expandable/stacked details on narrow widths.
- Search and filters: type, usage, status, missing/broken, unused, module/set/event linkage, and tags.
- `Unused` filter and manual delete action.

Asset details show:

- Preview.
- Type.
- Size.
- Dimensions or duration when applicable.
- Created/updated timestamps.
- File health.
- Usage links.

Usage links open alert editor with set/event/alert/profile context selected.

### Asset Creation And Picker

Alert editor opens asset picker drawer/dialog without leaving edit flow.

Picker supports:

- Select existing asset.
- Upload new asset.
- Search.
- Context-aware type filters.
- Compact usage count/link.
- Tag filters.

Inline uploads:

- Create global assets.
- Link by asset ID.
- Allow display name.
- Allow optional user-defined tags.
- Validate file type and size before completion.
- Show inline errors with allowed types/size and next step.

Tags:

- Freeform.
- Case-insensitive.
- Trimmed and de-duplicated.
- Autocomplete from existing tags.
- Editable after upload.
- Multi-tag filters use AND behavior by default.

### Asset Changes

- Modules reference assets by asset ID, not copied file paths.
- Selecting a different asset for a layer changes only that layer reference.
- Global file replacement stays in Assets page/details.
- Replacing an in-use asset shows affected alert usages before applying.
- Confirmed replacement keeps asset ID and refreshes preview, file size/type/duration/dimensions, and compatibility warnings.
- Deleting an in-use asset is blocked or requires explicit reassignment.
- Unused assets are never auto-deleted and still require confirmation.
- Asset version history and restore are backlog.

Audio rows show icon/waveform placeholder plus play control.
Image and video rows show thumbnails.

## Alerts Module

`Modules > Alerts` defaults to active alert set overview.

MVP tabs:

- `Sets`
- `Editor`
- `Settings`

`Output` or `Browser sources` lives on Sets page in MVP, not a separate tab.

### Starter State

- Default alert set is auto-created.
- Starter examples include Follow, Raid, Subscriber/Cheer where supported, and Custom event.
- Starter examples include landscape and vertical profiles.
- Starter examples are disabled and `Needs review` by default.
- Starter review happens in real Alerts surface, not a global wizard.
- Home links to `Modules > Alerts > Sets` with `Default` selected.
- Starter rows offer `Preview`, `Edit`, `Enable`, and `Mark starter review done`.
- `Mark starter review done` is set-level and does not enable alerts.

### Alert Sets

- One active alert set in MVP.
- Alert set names are unique app-wide, case-insensitive.
- Stable IDs drive routes and references.
- `Save` persists edits.
- `Activate set` changes live behavior.
- Direct delete of active set is blocked.
- If only one set exists, delete is disabled and user can reset/recreate defaults.
- Editing active set shows persistent `Editing active alert set` banner.
- Saving active-set edits warns only when enabled/live outputs change.
- Warning names affected target profiles and event types.
- Editing inactive sets shows subtle `Inactive set: changes will not affect live alerts until activated`.
- Draft/publish model is backlog.

### Sets Page

Sets page contains:

- Active alert set overview.
- Set switch/activation.
- Alert inventory for selected set.
- Validation summary.
- Browser-source output section.

Status rules:

- Use composable badges: `Enabled`, `Disabled`, `Needs review`, `Invalid`, `Warning`, `Live`.
- Badges should be actionable where practical.
- Validation groups by target profile, then event type.
- Validation details show severity, affected profile/event/alert, cause, and fix action/deep link.
- Blockers prevent `Activate set`.
- Warnings allow activation with confirmation.
- Inactive valid set action: `Activate`.
- Inactive set with blockers: `Review blockers`.
- Inactive set with warnings: `Activate...`.
- Active set action: `Open` or `Edit`.

### Browser Sources

Output section shows per target profile:

- Landscape URL.
- Vertical URL.
- Copy action.
- Route-key regeneration.
- Last connected client.
- Test send controls.
- `Connected`, `Disconnected`, or `Never connected`.

Rules:

- URL display masks route keys by default.
- Actions include `Reveal` and `Copy`.
- Revealed state is temporary and not persisted.
- Copy success/failure gives immediate feedback.
- Copy failures include next step and reference ID when applicable.
- Route-key regeneration is per module and target profile.
- Regeneration requires typed confirmation when key is in use or has recent connections.
- Regeneration can use normal confirmation when no client ever connected.
- Regeneration warns user to update OBS/browser-source URLs.

Separate Output tab is backlog if output management grows.

### Alert Structure

Hierarchy:

- Set
- Provider catalog context
- Event type
- Variation

Rules:

- Event type has default design.
- Variation is conditional alert under event type.
- Variation starts from event default and can diverge.
- Users can rename alerts and variations.
- Alert/variation names need only be unique within parent event type.
- Provider catalog and event type labels are system-defined; provider catalog context is not an implicit runtime eligibility condition.
- Registered provider instances can have nicknames on integration pages.
- Empty event types remain visible with `Add alert`.
- `Add alert` opens template chooser scoped to provider/event type.

MVP variation conditions:

- Raid viewer threshold.
- Subscription tier/month threshold.
- Cheer bits threshold.
- Follow usually has no condition beyond default.

MVP actions:

- `Create variation from default`.
- `Duplicate variation`.
- `Duplicate alert within the same event type and set`.
- `Reset to event default`.
- `Copy design from...`.

Duplicate alerts and sets are disabled and `Needs review` by default.
`Copy design from...` copies layers, assets, typography, animation, and profile layouts only by default.

Bulk operations are high-priority backlog. Tables/lists should leave room for future multi-select.

## Alert Editor

MVP editor is canvas-first and template-assisted.

Layout:

- Left: selected set alert tree.
- Center: alert preview canvas.
- Right: inspector with layer list and alert/event controls.
- Toolbar: `Preview`, `Send test`, save/revert controls, target profile switch.

Focused editor:

- Distinct route such as `/manage/modules/alerts/editor/:alertId`.
- Hides or collapses main sidebar.
- Keeps breadcrumb/header context.
- Keeps alert tree visible for fast switching.
- Editor tree shows only selected alert set.
- Tree supports search in MVP.
- Tree shows compact invalid/warning/needs-review badges.
- Editor provides set switcher, but does not show all sets in one tree.

Dirty-state rules:

- Editor saves one alert/variation at a time.
- Save persists shared settings and touched target-profile layouts.
- Save button remains `Save`; nearby dirty summary explains scope.
- Dirty navigation guard: `Save and leave`, `Discard`, `Cancel`.
- Switching set, alert, or target profile with unsaved changes uses same guard.
- `Revert changes` applies current unsaved alert edits immediately when undo can restore; otherwise confirmation modal.
- Version history is backlog.

### Canvas

Canvas supports:

- Free positioning/resizing.
- Exact inspector values: `x`, `y`, `width`, `height` in target-profile pixels.
- Snap/grid and reset-to-template.
- Safe-area guides per target profile.
- Safe-area toggle.
- Fit-to-view, 100%, zoom in/out, zoom percent display.
- Checkerboard/neutral background to communicate transparency.
- Toggleable test background color.

MVP snapping:

- Grid.
- Canvas edges.
- Center lines.

Backlog:

- Percent/responsive units.
- Snapping to other layers.
- Snapping off toggle.

Layers outside safe area do not block saving.

### Inspector And Layers

Tabs:

- `Layers`: layer list and selected layer controls.
- `Alert`: alert name, enabled target profiles, output actions, duration defaults.
- `Event`: condition fields, sample data, template variables.

Rules:

- Selected-layer fields appear only under `Layers`.
- No layer selected: show layer list and `Add layer`.
- Add layer menu is type-first: Text, Image, Video/GIF, Audio, TTS, Shape if enabled.
- New text layers start visible with `{userName}` where useful or `New text`.
- Layer ordering supports move forward/backward.
- Drag reorder is allowed if cheap.
- Single-layer selection only in MVP.
- Layer visibility toggle exists in MVP and affects live output after save.
- Layer lock, multi-select, groups, masks, and preview-only isolation are backlog.

MVP layer types:

- Text.
- Image.
- Video/GIF.
- Audio as non-visual layer.
- TTS as non-visual layer.
- Shape only if needed for simple backgrounds/badges.

No arbitrary custom HTML/CSS/JS in MVP.

### Animation

MVP animation is preset-based:

- Entrance animation.
- Exit animation.
- Duration.
- Delay.
- Easing preset.

Timeline/keyframe editing is backlog.

### Preview And Send Test

`Preview`:

- Always available.
- Editor-only render path.
- Uses selected sample payload.
- Plays visual animation in canvas.
- Audio and TTS muted by default.
- Optional `Play audio` / `Play TTS`.

`Send test to overlay`:

- Uses normalized alert playback pipeline after selecting test target.
- Requires connected browser-source client for selected target profile.
- Disabled or blocked with clear next steps when no output is connected.
- Targets selected alert and selected target profile by default.
- Secondary action menu can send to landscape, vertical, or both connected outputs.
- Includes audio and TTS by default when alert uses them.
- Provides `Include audio` and `Include TTS` toggles for current editor session.
- Marks events as test in logs/history.

Full provider-event simulation through all enabled flows is Diagnostics/backlog.

Preview controls:

- Toolbar owns `Preview` and `Send test`.
- Canvas-local controls handle replay, pause/play, seek/scrub for current preview.
- No send-test action inside canvas controls.

### Sample Payloads

- Built-in sample payloads per event type.
- Samples are separate from real provider events and never live data.
- Selector lives in `Event` inspector tab.
- Toolbar shows selected sample.
- Built-in samples include normal and edge cases: long username, high-value raid/cheer/subscription when relevant.
- Custom sample edits are local to current editor session.
- Invalid sample fields show inline validation and disable preview/send-test until fixed or reset.
- `Reset sample` restores built-in default.
- Persisted custom sample library is backlog.

### Target Profiles

MVP profiles:

- `Landscape 16:9` at `1920x1080`.
- `Vertical 9:16` at `1080x1920`.

Rules:

- Alert rules/content shared across profiles.
- Layout geometry stored per profile.
- No automatic cross-profile geometry sync.
- Editor remembers zoom/pan per profile for current session.
- Users can copy layout between profiles.
- Copying into edited target requires confirmation.
- Copying into empty/unreviewed target applies directly.
- Copied target profile becomes `Needs review`.
- Disabled profiles can be opened/edited and show `Disabled for live output`.
- Enabling profile runs validation.
- Hard failures block enable; warnings require confirmation.
- Newly generated vertical layouts default disabled and `Needs review`.
- `Needs review` clears only through explicit `Mark reviewed`.
- `Activate set` requires at least one valid target profile.
- Disabled profiles do not block activation.

Blocking validation:

- Required asset missing/unreadable.
- Text template uses unavailable variable.
- Visual layer duration missing/invalid.
- Geometry invalid.
- Alert has no output action.
- TTS is only output and no valid active TTS provider exists.

Warning validation:

- No visible visual layer.
- Layer extends outside canvas.
- Profile not reviewed since template creation.
- Text may overflow.
- Sound missing.
- TTS provider inactive/missing but alert has visual/audio fallback.
- Resolved sample TTS exceeds provider/default threshold.

## Diagnostics

Diagnostics is one page with tabs:

- `Problems` default.
- `Events`.
- `Raw logs`.

Problems:

- Active issues grouped by severity, then area: Integrations, Alerts, Assets, Output, System.
- Active problems are not dismissible while true.
- Resolved historical entries can be cleared/filtered from view but remain in logs by retention.
- Selected problem includes `Copy error JSON`, which copies the complete sanitized problem view as formatted JSON and reports clipboard success or failure.

Events:

- Normalized app events.
- Columns: type, source, time, status, affected alert/output, reference ID.

Raw logs:

- Visible tab labeled advanced/debug.
- Redacted formatted JSON/event payloads preserve source shape.
- Sortable/filterable raw log of all events from connected event sources.
- Default copy action: `Copy sanitized event`.
- Do not hide behind extra setting.

Rules:

- Redact secrets, tokens, route keys, and personal auth fields before display/export.
- Avoid unredacted sensitive payload storage unless backend debug requirement justifies it.
- Diagnostics bundle export included in MVP.
- Bundle includes sanitized config summary, recent problems, events, raw-log excerpts, app version, reference IDs.
- Bundle excludes secrets, route keys, tokens, and personal auth fields.
- Filters/sort persist for current session only.
- Diagnostics repair actions only when safe and deterministic.
- Correction links into relevant UI are preferred.

## Settings And Backup

Settings includes:

- Full user preferences.
- Complete user config export/import.
- Current app data folder and `Open data folder`.
- Current log retention policy and `Clear old logs now`.
- App version/build and schema version.

Backup/export:

- Complete backup includes user configuration and assets.
- Export produces one `.streamjams-backup` archive.
- Archive contains manifest, app/schema version, config JSON, asset files, and checksums.
- Provider credentials/tokens/secrets excluded.
- Provider metadata included for reconnect.
- Export allowed during event intake/playback.

Restore/import:

- MVP import is `Restore from backup`, replacing current config/assets.
- Import first inspects archive and shows created date, app/schema version, counts, compatibility warnings, and credentials needing reconnect.
- Restore disabled until validation completes.
- Restore creates local safety backup first.
- If safety backup fails, restore stops unless user explicitly overrides.
- Restore generates new overlay route keys by default.
- Restore warns user to update OBS/browser-source URLs.
- Restored providers needing credentials show `Needs reconnect`.
- Restore blocked during live event intake or overlay playback; prompt user to pause intake and clear/finish playback.

Diagnostics export is separate sanitized support/debug data and is not importable.

Backlog:

- Merge import.
- Preserve route keys during restore.
- Moving app data folder.
- Configurable log retention.
- Release notes/update checks/updater.
- Cloud backup/sync to user-selected providers such as Google Drive, OneDrive, and iCloud.
- Command/search palette.

## MVP Implementation Slice Outline

1. Alert domain model and validation contracts
   - Alert set, event type, variation, target profile, asset references, validation severity, output profile state.
   - Include MVP/backlog boundaries in types without implementing future features.

2. Alert management API refactor
   - CRUD for sets/events/variations.
   - Activation, validation, browser-source metadata, route-key regeneration.
   - Test dispatch pipeline for selected alert/profile.

3. Management shell and design foundation
   - Sidebar navigation, layout, theme tokens, status badges, confirmation pattern, error/reference ID presentation.

4. Home and integrations
   - Setup checklist, provider wizards, provider list/detail states, active provider behavior, TTS provider page.

5. Asset library and picker
   - Asset table/details, tags, upload validation, inline picker, usage links, replacement/deletion safeguards.

6. Alerts Sets page and browser-source output
   - Active set overview, set list, alert inventory, validation grouping, activation flow, output URLs and connection status.

7. Focused alert editor
   - Tree/search, target profile switch, canvas, inspector, layers, templates, sample payloads, preview/send-test.

8. Diagnostics
   - Problems, Events, Raw logs, sanitized copy/export, reference ID search, correction links.

9. Settings and backup/restore
   - Preferences, data folder, log retention display, config/assets backup archive, restore validation/safety backup.

10. Penpot design artifacts
   - App shell/Home.
   - Alert set overview.
   - Landscape editor.
   - Vertical editor.
   - Event sources.
   - Assets table.
   - Live operator console future concept.

## Consolidation Notes

- The raw decision log uses both old section names (`Health`, `Playback`, `Logs`) and final Diagnostics tabs. This spec resolves MVP Diagnostics to `Problems`, `Events`, and `Raw logs`.
- The operator console is intentionally kept design-only for this refactor, despite having detailed behavior decisions.
- Multi-provider, multi-active-set, timeline/keyframe, user-created templates, custom profiles, and cloud sync are backlog.
- No blocking UX contradictions remain in the consolidated MVP scope.

## Review Gate

This spec should be reviewed before writing a detailed implementation plan.
