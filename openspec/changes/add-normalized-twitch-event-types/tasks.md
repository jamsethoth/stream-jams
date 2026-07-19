## 1. Canonical Event Contract

- [x] 1.1 Add failing core tests for the 14 event-type identifiers, typed normalized payloads, and shared alert event-type validation.
- [x] 1.2 Implement the shared canonical event-type tuple, TypeScript event interfaces, Zod payload schemas, exports, and alert schema reuse.
- [x] 1.3 Add normalized scalar condition aliases and tests for the new event families without exposing raw provider metadata.

## 2. Direct Twitch EventSub

- [x] 2.1 Add table-driven Twitch normalizer tests for gifts, Hype Trains, polls, predictions, streams, terminal statuses, and malformed payloads.
- [x] 2.2 Implement direct Twitch normalization, including gift-versus-subscription branching and stable normalized IDs/fields.
- [x] 2.3 Expand EventSub subscription definitions and tests with the documented event versions, scopes, and conditions.

## 3. Streamer.bot Twitch Parity

- [x] 3.1 Add representative Streamer.bot fixtures and failing tests for every expanded canonical mapping and terminal variant.
- [x] 3.2 Implement explicit Streamer.bot normalizers with the same canonical fields and existing deterministic ID/provenance behavior.
- [x] 3.3 Expand runtime subscription discovery, partial-availability diagnostics, reconnect restoration, and tests for the supported Twitch event names.

## 4. Twitch Authorization Readiness

- [x] 4.1 Add failing OAuth, runtime, provider-adapter, management API, and UI tests for expanded scopes and saved grants that need authorization updates.
- [x] 4.2 Add the required OAuth scopes and server-side missing-scope readiness contract while preserving saved accounts and tokens.
- [x] 4.3 Expose `Authorization update required`, missing capability copy, diagnostics linkage, and the existing reconnect action in Event Sources.

## 5. Alert Creation And Testing UX

- [ ] 5.1 Add failing core/server tests for grouped templates, unchanged starter sets, normalized template variables, built-in samples, and test-event construction.
- [ ] 5.2 Implement grouped new-alert definitions, normal/edge samples, exhaustive test-event construction, and applicable normalized condition definitions.
- [ ] 5.3 Update the alert creation UI, editor conditions, stories, component tests, and Playwright coverage for every event group and gift-frequency explanation.

## 6. Integration And Release Verification

- [ ] 6.1 Add pipeline and runtime-composition tests proving both providers match the same alerts and malformed supported events produce reference-linked diagnostics without stopping intake.
- [ ] 6.2 Update product documentation to move the implemented event families into current scope while retaining deferred donation, creator-goal, and stream-intake automation boundaries.
- [ ] 6.3 Run OpenSpec strict validation plus lint, typecheck, unit tests, build, Storybook gates, and applicable Playwright tests; fix all failures without weakening coverage.
- [ ] 6.4 Rebuild production artifacts, restart affected local services, wait for health, and verify grouped alert creation, samples, authorization-update status, and live status refresh against the rebuilt app.
