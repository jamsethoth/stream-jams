## 1. Streamer.bot Event Normalization

- [x] 1.1 Add labeled fixtures for the six supported Streamer.bot Twitch event envelopes
- [x] 1.2 Add failing normalizer tests for supported, malformed, unsupported, provenance, tier, and deterministic-ID behavior
- [x] 1.3 Implement the explicit Streamer.bot Twitch normalizer and make its focused tests pass

## 2. Shared Event Ingestion

- [x] 2.1 Add failing ingestion tests for normalized-event delivery and duplicate event IDs
- [x] 2.2 Add shared normalized-event ingestion while preserving direct Twitch EventSub behavior and status counters

## 3. Persistent Streamer.bot Runtime

- [x] 3.1 Add failing runtime tests for active registration connection, secret retrieval, discovery, exact-key subscription, partial support, event delivery, failure status, and disconnect
- [x] 3.2 Implement persistent Streamer.bot runtime lifecycle, safe status, and bounded diagnostic callbacks
- [x] 3.3 Add Streamer.bot runtime status to diagnostics and backup intake state
- [x] 3.4 Use an explicit `ws` runtime adapter and verify compressed Streamer.bot discovery responses after live Node WebSocket incompatibility was reproduced

## 4. Event Source Lifecycle Coordination

- [x] 4.1 Add failing provider-service and runtime-composition tests for startup, registration, activation, deactivation, shutdown, and mutually exclusive intake
- [x] 4.2 Implement one event-source runtime synchronizer and invoke it after all relevant lifecycle changes
- [x] 4.3 Preserve durable provider selection when runtime startup fails while surfacing the failure through diagnostics

## 5. Canonical Alert Compatibility

- [x] 5.1 Add failing tests proving Twitch-to-Streamer.bot switches preserve canonical alert matches and do not emit provider-kind mismatch warnings
- [x] 5.2 Remove implicit provider-kind alert targeting from validation and event-source activation impact
- [x] 5.3 Update UX decision/spec documents and changed Storybook/UI tests to describe provider metadata as management context rather than runtime eligibility

## 6. Verification And Live Validation

- [x] 6.1 Run focused tests through each red-green cycle and run the full lint, typecheck, unit, build, Storybook, and Playwright gates
- [x] 6.2 Strictly validate the OpenSpec change and review the final diff against every requirement
- [x] 6.3 Rebuild production artifacts, stop stale services, start the new server, wait for health, reload the management UI, and verify active-provider compatibility and Streamer.bot diagnostics live
