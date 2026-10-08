## 1. Preparation

- [ ] 1.1 Confirm slice 1 and the central event bus change have merged, fetch remote state, and branch from `origin/main`.
- [ ] 1.2 Capture sanitized fixtures from a real Streamer.bot for `GetGlobal`, `GetGlobals` and the global-variable created, updated and deleted events. If the payloads prove unusable, defer global-variable values and record why.
- [ ] 1.3 Write a requirement-to-test trace for this change.

## 2. Core

- [ ] 2.1 Add rule-action and input schemas on top of the shared trigger model, with limits. Test invalid fields, type mismatch and bounds.
- [ ] 2.2 Implement deterministic effect computation against a working copy. Test ordering, multipliers, overflow and all-or-nothing effects.
- [ ] 2.3 Add received-subs and gift-batch starters. Test the batch-plus-recipients case, resubscriptions, Prime, and the overlap warning.

## 3. Server

- [ ] 3.1 Register the data consumer on the bus, committing value changes and the cursor checkpoint in one transaction. Test crash before and after commit, invalid events advancing the cursor, and a new consumer starting at the journal head.
- [ ] 3.2 Add repositories and migrations for rules, global mappings, the checkpoint and the pause flag.
- [ ] 3.3 Apply rendered-text moderation to event-sourced text before storing it. Test blocked usernames.
- [ ] 3.4 Implement reset on stream online as a built-in rule. Test a replayed `stream_online`.
- [ ] 3.5 Implement the Operator pause. Test that skipped events are not applied after resume.
- [ ] 3.6 Implement Streamer.bot global-variable sync with snapshot, updates, stale on disconnect, ended on delete and type-mismatch handling, using the recorded fixtures.
- [ ] 3.7 Extend backup and restore with rules, mappings and settings.

## 4. Web

- [ ] 4.1 Build the rule editor on the shared trigger editor, with action, input, enablement, visible order, reordering and simulation. Add stories with interaction and accessibility checks.
- [ ] 4.2 Add the Operator pause toggle, the global-variable picker, and read-only display for provider-backed values.

## 5. Verification and handoff

- [ ] 5.1 Write a Streamer.bot setup guide with a copy-paste `CPH.WebsocketBroadcastJson` example, using the bus's external event format.
- [ ] 5.2 Add disposable-service Playwright acceptance for a custom death counter, a subs counter from Twitch fixtures, a latest-follower label, and reset on stream online.
- [ ] 5.3 Run lint, typecheck, tests, build, Storybook gates, Playwright and strict OpenSpec validation. Verify against a real Streamer.bot and record the result.
- [ ] 5.4 Sync canonical specs and remove BL-061.
