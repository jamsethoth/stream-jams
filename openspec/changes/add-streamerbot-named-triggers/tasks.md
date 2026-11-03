# Tasks

## 1. Core and server

- [ ] 1.1 Optional `triggerName` on the external identity, selector `external` match, `ExternalAlertIdentity` and `simulate-external`; rejected unless the identity is `General` / `Custom`. Selector identity string unchanged when absent.
- [ ] 1.2 Intake reads the `StreamJams` / `Trigger` marker into `triggerName` and `message` on the `streamerbot-event` trigger; invalid names fall back to an unnamed event with a Diagnostics note.
- [ ] 1.3 `matchSelector` and the alert matcher compare `triggerName` when the rule has one.
- [ ] 1.4 Alerts consumer carries the message into `ExternalAlertEvent.message`, through moderation and TTS.
- [ ] 1.5 Manual simulation reads the name and message the same way as live intake.
- [ ] 1.6 Recent trigger names route from the bus journal.

## 2. Management

- [ ] 2.1 Trigger name field with recent-name suggestions in the Alert, Screen Effect and timer rule editors for `General` / `Custom`.
- [ ] 2.2 Hint on unnamed `General` / `Custom` rules.
- [ ] 2.3 Stories for named, unnamed and no-suggestions states.
- [ ] 2.4 `docs/` Streamer.bot section with the marker and example.

## 3. Verification

- [ ] 3.1 Unit tests: name validation and lower-casing, invalid name fallback, named and unnamed matching, old journal rows, selector identity strings unchanged, message moderation, backup/restore round-trip of named rules.
- [ ] 3.2 Playwright: create a named alert and effect, send two different names through Test, only the matching one plays.
- [ ] 3.3 Maintainer triggers two named actions from Streamer.bot chat commands on Windows.
