## Why

Alert sets persist a second Landscape/Vertical enablement and review state even though live playback and alert editing already use each saved alert document's target-profile state. This split-brain model hides valid saved-test targets and makes set activation, Home, and Browser Source UI report stale profile status.

## What Changes

- **BREAKING** Remove alert-set-level target-profile enablement and review fields from management contracts, persistence, backup mappings, and UI.
- Derive read-only alert-set profile usage and activation eligibility from saved alert documents.
- Require activation to have at least one playable enabled alert/profile while applying blockers and warnings only to relevant in-use profiles.
- Select saved-test targets from enabled, reviewed profiles on the saved alert document without treating Browser Source connectivity as profile state.
- Keep Browser Source readiness and listener telemetry independent from alert configuration.
- Migrate SQLite and portable backup handling without rewriting or discarding per-alert profile state.
- Align canonical UX and OpenSpec documentation with the single source of truth.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alert-configuration-management`: Alert-set activation, profile summaries, and saved-test targeting derive from alert documents instead of set metadata.
- `management-ui-ux`: Home and Alerts surfaces present derived profile usage without a second enablement or review state.
- `overlay-output-management`: Browser Source cards report output readiness and connectivity independently from selected alert-set profiles.
- `configuration-backup-restore`: Current backups omit obsolete set-profile columns while compatible legacy data preserves authoritative alert documents.

## Impact

- Core management schemas and activation evaluation.
- Alert-set management and SQLite metadata repositories, migrations, and tests.
- Portable configuration snapshot validation and restore compatibility.
- Alerts and Home management UI, typed fixtures, Storybook stories, and Playwright workflows.
- Canonical OpenSpec and MVP UX documentation.
