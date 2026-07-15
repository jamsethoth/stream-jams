# UI Refactor Slice 1: Domain And API Contracts

Status: complete.

OpenSpec change: `refactor-management-ui-ux`.

## Scope

Define and validate the management contracts needed by Home, providers, alert sets/editor, browser-source outputs, assets, diagnostics, and backup/restore before replacement screens are built. Keep current runtime behavior and routes working.

This slice does not build browser UI, activate multiple providers/sets, add custom profiles, implement bulk actions, add timeline/keyframes, or implement the operator console.

## Current-State Audit

- Alerts persist `alert_collections`, many-to-many rule membership, multiple enabled collections, and variants with one layout plus fixed visual/audio/text/TTS fields.
- Provider identity is split across Twitch/Streamer.bot runtime adapters and a static TTS registry; there is no common registered-provider record or one-active-per-capability constraint.
- Overlay keys are scoped by overlay/module/purpose but not target profile, and current client views contain only currently connected clients.
- Assets persist file identity, media type, MIME type, size, checksum, and storage path; tags, derived health, media dimensions/duration, and usage summaries are absent.
- Diagnostics persist normalized event/match/playback records and redacted JSONL runtime logs, but the management view is the legacy grouped grid rather than Problems/Events/Raw logs.
- Settings persist server, storage, logging, moderation, and secret references; there is no versioned configuration backup/restore model.

## Contract Decisions

- Put framework-independent management contract schemas and pure rules in `packages/core`; infer TypeScript types from Zod.
- Keep provider registration IDs separate from provider kind and capability.
- Lock MVP target profiles to landscape `1920x1080` and vertical `1080x1920`.
- Store alert content/layers separately from per-profile geometry so future timeline/keyframe work can extend animation without changing profile identity.
- Represent user-facing failures with summary, cause, next step, severity, timestamp, reference ID, and optional correction target.
- Extend the existing web management client with shared contract types; do not create another transport client.
- Server mapping code must validate outgoing view models through shared schemas at development/test boundaries.

## Required Persistence Migrations

Persistence changes land with their owning behavior slices, using deterministic migrations and repository interfaces:

1. Alert sets/editor: add alert sets, set membership, alert documents/layers, per-profile layouts/review state, and exactly-one-active-set enforcement. Migrate each collection to a set; duplicate multi-collection rules into each owning set; map ungrouped rules to `Default`; choose the first enabled set by stable ID as active; migrate current layout to landscape; create vertical disabled and `Needs review`.
2. Provider registrations: add capability, provider kind, nickname, non-secret config, secret reference, validation state, and active state with a unique active record per capability. Map the existing Twitch account and available local TTS provider when present.
3. Overlay profiles: add target-profile identity to module output/key/client history records. Preserve existing module output as landscape and require a separately generated vertical key.
4. Asset metadata: add display name, normalized tag relation, optional media dimensions/duration, and health timestamps. Derive usage from alert asset references rather than duplicating mutable counts.
5. Diagnostics: preserve current event/match/playback and JSONL records; add reference/correction fields only where source records cannot derive them. Problems remain derived, not persisted.
6. Backup/restore: no backup-history table is required for MVP; archive manifests are files, while app/schema version remains existing runtime metadata.

## TDD And Verification

1. Add failing core contract/rule tests.
2. Add minimum schemas, inferred types, constants, and pure rules to pass.
3. Add failing server mapping tests, then minimum mapping/service code.
4. Extend the current web API client types and HTTP tests.
5. Run touched tests, `corepack.cmd pnpm typecheck`, existing alert/assets/diagnostics/TTS route tests, full unit tests, and strict OpenSpec validation.
