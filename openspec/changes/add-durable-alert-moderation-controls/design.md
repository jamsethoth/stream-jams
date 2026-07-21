## Context

`DefaultModerationService` already owns separate rendered-text and TTS settings, performs URL stripping, blocked-term replacement, and length truncation, and reports safe action metadata. The resolver, safe template renderer, and TTS service share one runtime instance. Protected management routes and web API methods exist, but runtime composition always starts from defaults and the refactored UI no longer calls those methods.

The policy is global alert configuration, not provider configuration and not live-event moderation. TTS voice/rate/volume safety remains provider-owned. Configuration backup currently snapshots allowlisted SQLite tables and app configuration.

## Goals / Non-Goals

**Goals:**

- Persist one validated global policy for rendered and spoken alert text.
- Restore and enforce it consistently before alert processing begins.
- Provide an explicit-save configuration UI within the Alerts module.
- Include policy in safe backup/restore and expose moderation outcomes without raw text.

**Non-Goals:**

- Manual approval, user blocklists, anti-spam heuristics, ML classification, provider AutoMod, or a live moderation queue.
- Moving provider-owned voice/rate/volume settings into alert policy.

## Decisions

### Add one typed SQLite moderation settings repository

A single-row `alert_moderation_settings` table stores the rendered and TTS policy as validated columns/JSON with an update timestamp. A repository interface lives with core/server boundaries; the SQLite adapter supplies the production implementation. Missing data returns canonical defaults and is inserted during migration.

Alternative considered: add policy to the file app config. Rejected because the settings are part of backup-managed alert configuration and already rely on SQLite-backed application data.

### Persist before changing the live policy

A durable moderation service validates the complete next policy, writes it transactionally, then swaps the in-memory settings used by resolver and TTS paths. A failed write leaves the previous policy active and returns an actionable management error.

Alternative considered: mutate memory then save asynchronously. Rejected because a reported save failure could still alter live output until restart.

### Place policy at `/manage/modules/alerts/safety`

Alerts gains a child `Safety` configuration route with separate Rendered text and TTS sections, explicit Save/Revert, dirty-navigation protection, validation, and a safe example preview. Global Settings remains focused on application/data maintenance, and `/operator` remains focused on stream-time actions.

Alternative considered: restore the old Settings form. Rejected because the approved information architecture removed moderation from global Settings and provider TTS safety does not cover rendered alert text.

### Preview outcomes without retaining input

The UI can submit a session-only sample to the same pure moderation function and display the sanitized result plus action types/counts. Neither server logs nor persistence retain the sample or original viewer text. Existing preview, Send test, live resolver, and TTS provider paths all use the same active service instance.

Alternative considered: implement a separate browser filter. Rejected because it would drift from live enforcement.

### Include policy in configuration backup

The new table joins the existing allowlisted snapshot and restore transaction. It contains configuration, not credentials or viewer data. Restore validates the policy before mutation and the runtime reloads it after successful replacement.

## Risks / Trade-offs

- [A policy update changes live output immediately] -> Require explicit save, show live-impact copy, and keep the previous policy on failure.
- [Blocked terms appear in support data] -> Include them only in user-requested configuration backups, never logs or diagnostics exports.
- [Preview leaks raw viewer text] -> Keep preview input in component state and return only sanitized output and action metadata.
- [Backup restore and in-memory policy diverge] -> Reload the shared service only after the restore transaction completes.

## Migration Plan

1. Add the single-row table and seed canonical defaults.
2. Add repository/service tests proving write-before-swap behavior and restart recovery.
3. Wire the durable service into resolver, safe template, TTS, routes, and post-restore reload.
4. Add the Alerts safety route and remove no provider-owned TTS controls.
5. Add the table to backup/restore allowlists and compatibility tests.
6. Roll back by retaining the additive table while constructing the service from its last valid row or defaults.

## Open Questions

None.
