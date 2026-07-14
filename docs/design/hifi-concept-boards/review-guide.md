# Stream Jams High-Fidelity Concept Board Review Guide

Generated from `render_hifi_concepts.py`.

Use this guide to review the MVP UX in workflow order. Review each batch as a set before deciding whether individual screens need revision.

## Batch 1: Setup Home And Core Alert Management

Review goal: confirm the management UI starts from a useful Home page, guides setup through real readiness blockers, and makes the active alert set obvious.

- `Hi-Fi - Home`: setup checklist, active alert set summary, connection status, and next-action links.
- `Hi-Fi - Event Source Setup`: one wizard flow for registering and validating Twitch as an event source.
- `Hi-Fi - Alert Sets Overview`: active selected set overview, alert inventory, validation, and browser-source outputs.

![Hi-Fi - Home](./hi-fi-home.png)

![Hi-Fi - Event Source Setup](./hi-fi-event-source-setup.png)

![Hi-Fi - Alert Sets Overview](./hi-fi-alert-sets-overview.png)

## Batch 2: Alert Editor Workflow

Review goal: confirm the focused editor supports smooth alert switching, profile switching, save/revert behavior, and visible failures.

- `Hi-Fi - Alert Editor Landscape`: focused landscape editor with tree, canvas, timeline area, and right inspector.
- `Hi-Fi - Alert Editor Vertical`: same alert in vertical profile with disabled-needs-review state.
- `Hi-Fi - Alert Editor Send Test Blocked`: explicit non-silent failure when no browser-source client is connected.

![Hi-Fi - Alert Editor Landscape](./hi-fi-alert-editor-landscape.png)

![Hi-Fi - Alert Editor Vertical](./hi-fi-alert-editor-vertical.png)

![Hi-Fi - Alert Editor Send Test Blocked](./hi-fi-alert-editor-send-test-blocked.png)

## Batch 3: Asset Management

Review goal: confirm assets can be found, previewed, tagged, updated globally, and added from alert creation without forcing a workflow detour.

- `Hi-Fi - Assets Library`: searchable/filterable asset table with preview, tags, linked usage, and actions.
- `Hi-Fi - Asset Detail Usage`: preview, metadata, usage links, and replacement impact.
- `Hi-Fi - Asset Picker Upload`: in-editor picker/upload flow with validation and reusable registration.

![Hi-Fi - Assets Library](./hi-fi-assets-library.png)

![Hi-Fi - Asset Detail Usage](./hi-fi-asset-detail-usage.png)

![Hi-Fi - Asset Picker Upload](./hi-fi-asset-picker-upload.png)

## Batch 4: Provider Management

Review goal: confirm provider setup stays capability-based, supports one active provider per capability, and clearly warns about impact when switching.

- `Hi-Fi - Event Sources List Detail`: registered event sources table, active source detail, health, and switching impact.
- `Hi-Fi - TTS Provider Setup`: separate TTS wizard with validation before registration.
- `Hi-Fi - TTS Provider Detail Safety`: provider-owned voice defaults, limits, safety controls, usage, and error state.

![Hi-Fi - Event Sources List Detail](./hi-fi-event-sources-list-detail.png)

![Hi-Fi - TTS Provider Setup](./hi-fi-tts-provider-setup.png)

![Hi-Fi - TTS Provider Detail Safety](./hi-fi-tts-provider-detail-safety.png)

## Batch 5: Diagnostics

Review goal: confirm every failure has a human-readable message, a reference ID, next steps, deep links, and raw evidence for debugging.

- `Hi-Fi - Diagnostics Problems`: grouped user-facing problems with correction links.
- `Hi-Fi - Diagnostics Events`: sortable/filterable normalized event feed with selected-event detail.
- `Hi-Fi - Diagnostics Raw Logs Failure Detail`: raw log inspection with redaction and failure detail.

![Hi-Fi - Diagnostics Problems](./hi-fi-diagnostics-problems.png)

![Hi-Fi - Diagnostics Events](./hi-fi-diagnostics-events.png)

![Hi-Fi - Diagnostics Raw Logs Failure Detail](./hi-fi-diagnostics-raw-logs-failure-detail.png)

## Batch 6: Settings And Backup

Review goal: confirm global settings are not mixed into provider/module setup and backup/restore explains what is included, excluded, and risky.

- `Hi-Fi - Settings Overview`: app preferences, maintenance actions, diagnostics, and version surface.
- `Hi-Fi - Backup Export`: full config/assets export with clear secret exclusions.
- `Hi-Fi - Restore Backup`: restore plan, safety backup, route key regeneration, and live-activity warning.

![Hi-Fi - Settings Overview](./hi-fi-settings-overview.png)

![Hi-Fi - Backup Export](./hi-fi-backup-export.png)

![Hi-Fi - Restore Backup](./hi-fi-restore-backup.png)

## Batch 7: Cross-Cutting Guardrails

Review goal: confirm risky or disruptive actions are explicit, reversible when possible, and never silent.

- `Hi-Fi - Dirty Navigation Guard`: unsaved active-set navigation guard with save, discard, and cancel choices.
- `Hi-Fi - Active Set Save Warning`: active-set save confirmation with live-output impact.
- `Hi-Fi - Destructive Confirmation`: route-key regeneration confirmation with typed confirmation and recovery step.

![Hi-Fi - Dirty Navigation Guard](./hi-fi-dirty-navigation-guard.png)

![Hi-Fi - Active Set Save Warning](./hi-fi-active-set-save-warning.png)

![Hi-Fi - Destructive Confirmation](./hi-fi-destructive-confirmation.png)
