## 1. Preparation

- [ ] 1.1 Confirm slice 1 has merged, fetch remote state, and branch from `origin/main`.
- [ ] 1.2 Capture sanitized recorded fixtures from a real Streamer.bot for `GetGlobal`, `GetGlobals` and the global-variable created, updated and deleted events. If the payloads prove unusable, defer global-variable values and record why.
- [ ] 1.3 Write a requirement-to-test trace for this change.

## 2. Core

- [ ] 2.1 Add rule, filter, action, custom event type and broadcast schemas with shared limits. Test invalid references, type mismatch and bounds.
- [ ] 2.2 Implement deterministic rule evaluation against a working copy. Test ordering, multipliers, overflow and all-or-nothing effects.
- [ ] 2.3 Add received-subs and gift-batch starters. Test the batch-plus-recipients case, resubscriptions, Prime, and the overlap warning.

## 3. Server

- [ ] 3.1 Replace the single Streamer.bot custom handler with a marker dispatcher. Test that video-shoutout behavior is unchanged.
- [ ] 3.2 Add the data event consumer to normalized-event fan-out without changing alert or timer admission. Test hidden canvases, disabled module, failure isolation and the Operator pause.
- [ ] 3.3 Add repositories and migrations for rules, event types, global mappings, the applied-event log and the pause flag. Test redelivery across restart, 48-hour pruning, and per-source eviction at the cap.
- [ ] 3.4 Apply rendered-text moderation to event-sourced text before storing it. Test blocked usernames.
- [ ] 3.5 Implement Streamer.bot global-variable sync with snapshot, updates, stale on disconnect, ended on delete and type-mismatch handling, using the recorded fixtures.
- [ ] 3.6 Implement reset on stream online for opted-in groups. Test a duplicate `stream_online`.
- [ ] 3.7 Extend backup and restore with rules, event types, mappings and settings.

## 4. Web

- [ ] 4.1 Build the custom event type editor with a sample-JSON field picker and the schema-change review flow.
- [ ] 4.2 Build the rule editor with pickers, filters, actions, enablement, visible order, reordering and simulation. Add stories with interaction and accessibility checks.
- [ ] 4.3 Add the Operator pause toggle and read-only display for provider-backed values.

## 5. Verification and handoff

- [ ] 5.1 Write a Streamer.bot setup guide with a copy-paste `CPH.WebsocketBroadcastJson` example and `eventId` guidance.
- [ ] 5.2 Add disposable-service Playwright acceptance for a custom death counter, a subs counter from Twitch fixtures, a latest-follower label, and reset on stream online.
- [ ] 5.3 Run lint, typecheck, tests, build, Storybook gates, Playwright and strict OpenSpec validation. Verify against a real Streamer.bot and record the result.
- [ ] 5.4 Sync canonical specs and remove BL-061.
