## 1. Prerequisite Gate

- [x] 1.1 Fetch `origin/main` and verify `refactor-management-ui-ux`, `improve-management-ui-ux-audit-followups`, and `add-speakerbot-tts-provider` are complete, validated, and present before implementation starts.
- [x] 1.2 Reconcile the core moderation service, resolver, safe template renderer, TTS service, protected routes, management client, backup allowlist, and current navigation against this proposal.

## 2. Durable Moderation Repository

- [ ] 2.1 Add a failing migration test for a single canonical moderation-policy row and upgrade defaults matching current rendered-text and TTS behavior.
- [ ] 2.2 Add a typed moderation repository interface and SQLite adapter with validated read and transactional replace behavior.
- [ ] 2.3 Add failing service tests proving normalization, persist-before-swap, previous-policy retention on write failure, restart recovery, and no original viewer text in errors.
- [ ] 2.4 Compose one durable moderation service shared by resolver, safe template rendering, TTS, and management routes before event intake starts.

## 3. Backup And Runtime Consistency

- [ ] 3.1 Add failing configuration backup/preflight/restore tests for moderation policy inclusion, invalid-policy blocking, viewer-text exclusion, and post-restore runtime reload.
- [ ] 3.2 Add the moderation table to the allowlisted snapshot and restore transaction and reload the shared service only after successful replacement.
- [ ] 3.3 Extend preview, Send test, live resolver, browser speech, and Speaker.bot tests to prove independent rendered/TTS policy is consistently enforced.

## 4. Alert Safety Management Route

- [ ] 4.1 Add failing route and client tests for read, preview, explicit save, invalid update, unauthorized access, persistence failure, and safe action summaries.
- [ ] 4.2 Add `/manage/modules/alerts/safety` as an Alerts child route with Rendered text and TTS sections, normalization preview, Save/Revert, and dirty-navigation protection.
- [ ] 4.3 Add failing component tests for loaded values, blocked-term normalization, independent URL stripping and length bounds, example preview, unsaved navigation, save failure, and provider-safety separation.
- [ ] 4.4 Add Storybook states for defaults, edited policy, normalized duplicates, moderated example, invalid bounds, save failure, and narrow viewport.
- [ ] 4.5 Add Playwright coverage for changing policy, previewing sanitized output, saving, reloading, verifying an alert preview/test, and restoring the policy from backup.

## 5. Verification

- [ ] 5.1 Run focused migration, repository, moderation, resolver, TTS, backup, route, web, Storybook, and Playwright tests, then repository lint, typecheck, full tests, build, and required frontend gates.
- [ ] 5.2 Reconcile every requirement against code and tests, run `openspec.cmd validate add-durable-alert-moderation-controls --strict`, and complete an independent frontend review.
- [ ] 5.3 Rebuild and restart affected services, wait for health, reload Alert safety, and verify restart durability, preview/test/live enforcement, provider TTS, backup, restore, privacy, and actionable failure paths.
