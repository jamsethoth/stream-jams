Each numbered section is one independently reviewable slice and PR, in order. Every slice runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Storybook gates for changed UI, applicable Playwright, and a rebuilt live check before its PR.

## 1. Bus Core And Journal (no behavior change)

- [x] 1.1 Fetch `origin/main`, confirm `EventPipeline`, `EventIngestionService`, and the single-active index still match the design's context section.
- [x] 1.2 Add `BusEvent`, `EventBusConsumer`, and schemas in `packages/core/src/event-bus` with unit tests for valid, invalid, and secret-free envelopes.
- [x] 1.3 Add migration and typed repository for `event_bus_journal`, `event_bus_consumer_cursors`, and `event_bus_delivery_failures`; test foreign keys, narrow transactions, retention bounds, and WAL backup exclusion.
- [x] 1.4 Implement publisher (validate, exact dedupe against journal, commit, wake workers) and per-consumer workers (batch read, cursor advance, three retries with backoff, failure record, no unbounded buffer).
- [x] 1.5 Register Alerts, Screen Effects, and Timers as consumers; `EventPipeline` now only builds consumers. Effect triggers are still derived at intake and carried on the bus event until slice 4 replaces them with selectors.
- [x] 1.6 Tests: consumer isolation (one throws, others admit), FIFO per consumer, idempotent redelivery, poisoned event skip, ingestion accepted only after commit, journal write failure.
- [x] 1.7 Verify existing alert, effect, and timer suites pass unchanged.
- [x] 1.8 Until slice 6, `start()` skips events a consumer missed before restart and logs the count instead of replaying them.

## 2. Cross-Source Correlation

- [x] 2.1 Add correlation-key derivation for every Twitch-origin canonical type, per design decision 3.
- [x] 2.2 Record paired fixtures from the direct Twitch and Streamer.bot normalizers for every Twitch-origin type and assert equal keys.
- [x] 2.3 Implement merge with the correlation window, one-to-one pairing per other source, and `merged` outcome recording.
- [x] 2.4 Tests: same follow both sources (merged), two identical cheers both sources (two events), same-source distinct IDs (never merged), copy after window (separate), restart within dedupe window (still duplicate).

## 3. Multiple Active Event Sources

- [x] 3.1 Migration: replace the `event-source` part of `provider_registrations_one_active_capability` with one active per provider kind; keep music and TTS at one per capability; preflight fails closed.
- [x] 3.2 Update provider activation so same-kind activation replaces and other kinds are untouched; update activation impact with the overlap warning.
- [x] 3.3 Rewrite `syncEventSourceRuntimes` to sync each runtime from its own registration; remove the cross-runtime disconnects.
- [x] 3.4 Add `forwardTwitchEvents` to Streamer.bot configuration (default on) and honor it in subscriptions and publishing.
- [x] 3.5 Event sources page: multiple `In use` rows with per-source live status, forwarding toggle, overlap warning; Storybook states; Playwright for activating both sources.
- [x] 3.6 Update provider-related docs and `docs/design/ui-refactor-decisions.md` wording on one active event source.

## 4. Shared Trigger Selector

- [x] 4.1 Add `EventTriggerSelector` and `matchSelector` in core with tests for canonical, reward, external, source restriction, and ignored external payload content.
- [x] 4.2 Migrate `screen_effect_bindings` and timer rules to selectors; tests prove each saved binding and rule matches the same events before and after.
- [x] 4.3 Screen Effects editor: choose canonical events with typed conditions alongside reward and external triggers; Storybook and Playwright.
- [x] 4.4 Timer rule editor uses the selector; existing behavior preserved.
- [x] 4.5 Alerts: external-event rules, allowlisted variables, moderation, unsubscribed-identity warning; Storybook and Playwright.

## 5. Module Intake Onto The Bus

- [ ] 5.1 Move Video shoutout intake from the Streamer.bot `customEventHandler` to a bus consumer for its configured external identity, keeping its payload validation; coordinate with the Videos module work.
- [ ] 5.2 Publish the consumer registration contract and document it for custom data overlays (BL-055).
- [ ] 5.3 Operator queue items show the delivering source.

## 6. Restart Replay And Diagnostics

- [ ] 6.1 Add replay age setting (default 2 minutes, 0 to 30) and expired handling per consumer; restore marks pending rows expired.
- [ ] 6.2 Tests: shutdown before admission then restart within age (admitted once), after age (expired, nothing plays), global safety applies to replay.
- [ ] 6.3 Diagnostics bus view with intake and per-consumer outcomes, no raw payloads or secrets; Storybook and Playwright.
- [ ] 6.4 Reconcile requirements against code and tests, sync specs, remove BL-025 from the backlog.
