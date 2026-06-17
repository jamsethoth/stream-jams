# Proposal: Expand Alert Configuration UI

## Why

The alert domain and server APIs support collections, rule conditions, variants, asset IDs, layouts, cooldowns, and priorities, but the management UI only creates a simple text-only rule with no conditions, assets, or variant editing. Streamers need a complete MVP alert editor that exposes the existing domain model clearly and avoids misleading module-wizard fields.

## What Changes

- Expand the management alert UI to create, edit, enable/disable, and delete collections, rules, and variants.
- Add condition builder support for a minimal normalized Twitch MVP field set: amount, subscription tier, and channel point reward ID.
- Add asset picker integration for visual and audio asset IDs.
- Add layout, duration, cooldown, priority, weight, and rule/variant enabled controls.
- Add realistic sample/test alert workflows for configured alert rules.
- Keep TTS provider-specific alert controls out of this change; those are handled by `add-speakerbot-tts-provider`.
- Keep broader condition fields, an interactive layout canvas, and configuration backup/history/rollback out of this change and track them as future features.

## Capabilities

### New Capabilities

- `alert-configuration-management`: Management users can configure MVP alert collections, rules, conditions, variants, assets, layout, and test workflows.

### Modified Capabilities

None. No repo-local base specs exist yet for this behavior.

## Impact

- Affected code: alert management UI, management API DTOs, alert route usage, asset picker UI, overlay module wizard copy/field behavior, tests, and runbook docs.
- Dependencies: implementation MUST wait until `serve-overlay-safe-assets` is merged and present in remote `main` so asset picker selections map to renderable overlay media.
