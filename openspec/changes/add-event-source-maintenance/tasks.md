# Tasks

## 1. Server

- [ ] 1.1 Migration: suspension marker on alert rules, Screen Effect bindings, timer rules and Videos mappings; `broadcasterId` on Videos reward mappings. Backup/restore round-trips both.
- [ ] 1.2 Matching skips suspended triggers in every bus consumer.
- [ ] 1.3 Edit route and service with validate-then-swap secret handling and reconnect of an active source.
- [ ] 1.4 Removal impact and delete routes; one transaction for deactivate, suspend and delete; secret removed after commit.
- [ ] 1.5 Replace impact and replace routes; subscriptions and forwarding carried over.
- [ ] 1.6 Shared reward availability check.

## 2. Management

- [ ] 2.1 Edit and Delete actions on event sources, with the removal impact confirmation.
- [ ] 2.2 Replace action reusing the setup dialog, with the replace impact step.
- [ ] 2.3 Suspended-trigger list with one-click re-enable once a delivering source exists.
- [ ] 2.4 "Reward unavailable" with the reward picker in Screen Effects, timers and Videos.
- [ ] 2.5 Stories for each new state.

## 3. Verification

- [ ] 3.1 Unit tests: edit success, failed validation leaves source and secret unchanged, delete with and without a second same-kind source, replace carries subscriptions, reward check.
- [ ] 3.2 Playwright: edit, delete with impact and re-enable, replace, fix an unavailable reward.
- [ ] 3.3 Maintainer edits, replaces and deletes a Streamer.bot source on Windows.
