# Streamer.bot Live Event Ingestion Implementation Plan

**Goal:** Make an active Streamer.bot registration consume supported Twitch events through the existing canonical alert pipeline and remove false provider-kind incompatibility warnings.

**Architecture:** Reuse the existing WebSocket client. Add a focused runtime owner, a pure fixture-backed normalizer, and one composition-level synchronizer for Twitch versus Streamer.bot. Keep alert matching based on canonical event type plus explicit conditions; `providerKind` remains editor/catalog context only.

**Stack:** Node.js 24, TypeScript 6, Fastify runtime composition, Vitest, existing SQLite repositories, existing Streamer.bot protocol client, existing diagnostics logger.

## Task 1: Normalize Streamer.bot Twitch Events

**Files:**

- Create: `apps/server/src/modules/streamerbot/fixtures/*.json`
- Create: `apps/server/src/modules/streamerbot/streamerbot-event-normalizer.test.ts`
- Create: `apps/server/src/modules/streamerbot/streamerbot-event-normalizer.ts`

1. Commit six envelope fixtures. Label fixture provenance in a README or fixture index; Follow/Cheer/Sub/ReSub derive from official WebSocket schemas, Raid/RewardRedemption derive from official trigger variables because their WebSocket schema pages are incomplete.
2. Write tests for every event mapping, provenance, actor/message/amount/tier/reward fields, stable upstream IDs, deterministic fallback IDs, malformed supported payloads, and unsupported source/type pairs.
3. Run `corepack.cmd pnpm --filter @stream-jams/server test -- streamerbot-event-normalizer.test.ts` and confirm failures are caused by the missing normalizer.
4. Implement one explicit source/type dispatch table and small boundary validators. Do not infer an event family from payload shape.
5. Re-run the focused test until green.

## Task 2: Share Normalized Ingestion

**Files:**

- Modify: `apps/server/src/modules/events/event-ingestion-service.test.ts`
- Modify: `apps/server/src/modules/events/event-ingestion-service.ts`

1. Add tests for accepting a pre-normalized Streamer.bot event, forwarding it once, and rejecting a duplicate normalized ID.
2. Run the focused test and confirm the missing method/behavior fails.
3. Add `ingestNormalizedEvent` with ID deduplication and shared status updates. Keep EventSub envelope parsing in `ingestTwitchEventSubNotification`, then delegate accepted events without changing its public result contract.
4. Re-run focused ingestion and Twitch normalizer/runtime tests.

## Task 3: Own Persistent Streamer.bot Runtime

**Files:**

- Create: `apps/server/src/modules/streamerbot/streamerbot-runtime-service.test.ts`
- Create: `apps/server/src/modules/streamerbot/streamerbot-runtime-service.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Create: `apps/server/src/modules/streamerbot/node-streamerbot-socket.test.ts`
- Create: `apps/server/src/modules/streamerbot/node-streamerbot-socket.ts`
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`

1. Define tests with a fake client boundary for active/non-active registrations, password lookup, missing secret, exact discovered category key, supported-event intersection, partial support degradation, normalized delivery, unsupported/malformed diagnostics, and disconnect.
2. Run focused tests and confirm failure before production code.
3. Implement runtime service with a client factory, safe state, discovery/subscription, normalizer callback, and disconnect.
4. Construct it in runtime composition with the existing socket factory, secret store, provider repository, ingestion service, maintenance gate, and runtime logger.
5. Add Streamer.bot provider status to diagnostics and account for its active connection in configuration-backup maintenance checks.
6. Re-run runtime and smoke tests.
7. Verify a compressed `GetEvents` response through the production Node socket adapter; use the explicit `ws` dependency because live Streamer.bot 1.0.4 interoperability fails with Node's built-in WebSocket.

## Task 4: Synchronize Provider Lifecycle

**Files:**

- Modify: `apps/server/src/modules/providers/provider-management-service.test.ts`
- Modify: `apps/server/src/modules/providers/provider-management-service.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/index.ts`

1. Add tests proving an active event-source registration triggers synchronization after registration, activation, and deactivation, while TTS changes do not.
2. Add composition tests proving Twitch and Streamer.bot are mutually exclusive and shutdown disconnects both.
3. Run focused tests and confirm failures.
4. Add an optional event-source-change callback to provider management and invoke it only after durable event-source changes.
5. Implement one composition-local synchronizer that disconnects the inactive runtime before connecting the active one.
6. Replace startup's unconditional Twitch connect with the synchronizer; use it for Twitch account changes and expose it through composition.
7. Re-run focused service, composition, auth, and provider route tests.

## Task 5: Correct Canonical Compatibility UX

**Files:**

- Modify: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `apps/web/src/management/alerts/AlertModulePage.test.tsx` or current owning alert UI test
- Modify: current owning Storybook story if warning state changes
- Modify: `docs/design/ui-refactor-decisions.md`
- Modify: `docs/design/ui-refactor-mvp-ux-spec.md`

1. Add tests showing a Twitch-authored raid remains compatible when Streamer.bot is active and event-source activation impact remains matched.
2. Run focused tests and confirm the current `PROVIDER_KIND_MISMATCH` behavior fails them.
3. Remove implicit provider-kind mismatch warnings for canonical event-source alerts. Preserve explicit `ingestProvider` condition behavior and unrelated TTS impact warnings.
4. Update UI tests/stories only where visible warning output changes.
5. Correct design language: provider metadata chooses event catalog/sample context; canonical runtime eligibility comes from event type and explicit conditions.

## Task 6: Verify And Restart

1. Run focused suites, then `corepack.cmd pnpm lint`, `corepack.cmd pnpm typecheck`, `corepack.cmd pnpm test`, and `corepack.cmd pnpm build`.
2. Run `corepack.cmd pnpm --filter @stream-jams/web build-storybook` and `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci`.
3. Run `corepack.cmd pnpm test:e2e` because provider switching and warnings are browser-visible.
4. Run `openspec.cmd validate add-streamerbot-live-event-ingestion --strict`.
5. Re-read proposal, specs, design, tasks, and diff; close all in-scope gaps.
6. Stop the old service bound to the configured port, rebuild, start `apps/server/dist/index.js`, wait for health, and reload the management UI.
7. Verify the persisted active provider drives runtime state, switching provider no longer reports false alert incompatibility, and Streamer.bot runtime diagnostics show ready/degraded state with actionable messages.
