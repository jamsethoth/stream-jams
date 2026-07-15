# Slice 8: Settings, Backup, And Restore

## Goal

Move global application concerns into Settings and add a complete, secret-free configuration backup and guarded restore workflow.

## Archive Boundary

- Use one bounded `.streamjams-backup` JSON container with a versioned manifest, typed configuration snapshot, checksums, and base64-encoded assets.
- Export user-owned module, alert, asset, provider, preference, and logical overlay-output configuration.
- Exclude credentials, tokens, secret references, raw route keys, key hashes, operational logs, runtime sessions, and connected-state records.
- Preserve destination-machine storage paths during restore and regenerate overlay route keys from logical output descriptors.

## Backend

- Add typed core contracts for archive export, preflight validation, impact summaries, blockers, runtime guards, and restore results.
- Add an allowlisted SQLite snapshot repository with deterministic ordering and one synchronous replacement transaction.
- Validate archive/container versions, checksums, typed records, asset references, duplicate IDs, encoded and expanded size limits, and capacity before mutation.
- Block restore while event intake, current playback, or queued playback is active.
- Create a safety backup outside the replacement roots before any mutation; stop on failure.
- Stage assets and configuration, replace owned data with compensation boundaries, restore providers disconnected without secrets, and regenerate output route keys.
- Return human-readable failures with corrective next steps and a reference ID.

## Frontend

- Reframe Settings around server preferences, storage locations, log retention, app/schema versions, backup/export, and restore.
- Keep moderation controls out of global Settings; TTS safety remains provider-owned.
- Download exports with explicit success or failure feedback.
- Validate a selected archive before enabling restore and show the replacement impact, compatibility, blockers, and warnings.
- Require explicit confirmation, show live-runtime and safety-backup failures, and surface route-key/browser-source plus provider-reconnect follow-up after success.

## Verification

- Core schema and secret-exclusion tests.
- SQLite snapshot, archive checksum/preflight, live guard, safety-backup, transactional replacement, and route-key regeneration tests.
- Route and management-client tests for export, validation, and restore.
- Component tests and Storybook stories for overview, export ready, invalid archive, live blocked, safety-backup failure, and route-key warning states.
- Playwright coverage for export and validated restore gating.
- Repository lint, typecheck, unit, build, Storybook, Playwright, OpenSpec validation, CodeGraph sync, and independent frontend review.
