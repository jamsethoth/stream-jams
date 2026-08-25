## Why

The current tab-based management UI does not match the approved setup-first product model or the real alert, provider, output, asset, diagnostics, and recovery workflows. This change turns the reviewed UX specification and high-fidelity boards into an implementation contract so each backend-first slice can land without drifting from the approved design.

## What Changes

- Rebuild the management UI around `Home`, `Event sources`, `TTS providers`, `Modules > Alerts`, `Assets`, `Diagnostics`, and `Settings`.
- Add backend and domain view contracts before each screen depends on them.
- Introduce setup-focused Home and provider flows, alert sets with explicit activation, a focused canvas-first alert editor, a searchable asset library and inline picker, actionable diagnostics, and backup/restore.
- Keep browser-source output management inside Alerts and reuse the existing route-key and overlay authorization model.
- Apply one cross-cutting pattern for explicit saves, dirty-state guards, destructive confirmation, accessible status, and human-readable failures with next steps and reference IDs.
- **BREAKING**: remove the old top-level `Dashboard`, `Twitch`, `Overlays`, and `Playback` management surfaces after replacement routes are available.
- Keep the live operator console as design-only scope; implementation is not part of this change.

## Capabilities

### New Capabilities

- `management-ui-ux`: Management shell, Home readiness, provider setup, visual foundation, accessibility, responsive behavior, and cross-cutting interaction rules.
- `asset-library-management`: Searchable global asset review, previews, tags, usage links, guarded replacement/deletion, and an inline alert-editor asset picker.
- `configuration-backup-restore`: Full local configuration and asset export, validated restore, safety backup, secret exclusions, and live-activity safeguards.

### Modified Capabilities

- `alert-configuration-management`: Replace collection/form-first management with alert sets, explicit activation, two fixed target profiles, and a focused canvas-first editor with preview/test workflows.
- `overlay-output-management`: Present module/profile browser-source outputs inside Alerts with masked route keys, connection state, copy feedback, and impact-aware regeneration confirmation.
- `runtime-log-operations`: Add Problems, Events, and Raw logs diagnostics views with reference-ID search, correction deep links, redacted detail, and sanitized support exports.

## Impact

- Affects domain schemas and services in `packages/core`, management APIs and persistence adapters in `apps/server`, and management routes, components, styles, Storybook stories, and browser tests in `apps/web`.
- Reuses existing management authorization, overlay route-key plumbing, asset IDs, playback pipeline, structured logs, and diagnostics exports.
- Requires persistence migrations for new alert-set/profile/editor, asset-tag/usage, provider, and backup metadata where current storage cannot represent the approved contracts.
- Adds no UI framework, router, utility-CSS framework, cloud service, OBS integration, or operator-console runtime.
