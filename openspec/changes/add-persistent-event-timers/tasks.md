## 1. Timer state and contracts
- [x] 1.1 Add strict event-rule and adjustment contracts, migration, and repository tests.
- [x] 1.2 Implement checkpoint/recovery and safe duration adjustments with fake-clock regression tests.

## 2. Event and API integration
- [x] 2.1 Dispatch matching normalized events through timer rules with failure diagnostics and tests.
- [x] 2.2 Add authenticated manual adjustment API and strict boundary tests.

## 3. User controls
- [x] 3.1 Add saved rule editing and manual corrections to Timers with typed clients and tests.
- [x] 3.2 Add Operator corrections and representative Storybook and Playwright coverage.

## 4. Verification and handoff
- [x] 4.1 Validate OpenSpec and run lint, typecheck, tests, build, and relevant browser gates.
- [x] 4.2 Rebuild/restart a disposable local service and verify recovery, rules, and manual corrections live.

## 5. Automated acceptance follow-up
- [x] 5.1 Verify forced process-crash recovery against the last real SQLite checkpoint and no replayed start cue.
- [x] 5.2 Verify authenticated UI corrections reach a live overlay, complete at zero, and disappear after the hold.
- [x] 5.3 Verify subscription tiers, resubscription occurrence counts, gift quantities, ordered actions, and idle alternatives against the real coordinator.
- [x] 5.4 Verify saved Cat paws reward selection and idempotent starts through real ingestion.
- [x] 5.5 Verify checkpoint failure diagnostics/retry and recovery with missing media or stopped/completed runs.
- [x] 5.6 Verify Timers and Operator failure/input-retention/retry UX and clear stale errors after success.
- [x] 5.7 Run affected acceptance checks and repository regression gates; record the evidence.
