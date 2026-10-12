# Live Creator Goals integration — October 11, 2026

This record supersedes the Creator Goals and follower-hint implementation status in the earlier [main reassessment](data-overlays-main-reassessment.md). It covers the continuation of PR #182 after `9c78c826`, planned in [the live goals plan](../superpowers/plans/2026-10-11-live-creator-goals.md).

## Scope and evidence

| Requirement | Production path and regression evidence |
| --- | --- |
| Optional goal subscriptions preserve alerts | `twitch-eventsub-client` requests begin/progress/end only with goal scope. Tests cover absent scope, partial failure, retry of failed subscriptions only, revocation, reconnect and obsolete retries. |
| Documented provider boundaries | `twitch-api-client` normalizes Helix `created_at`; `twitch-event-normalizer` validates EventSub `started_at`, broadcaster, safe amounts and original occurrence time. Fixtures are synthetic documentation-derived records, not real account captures. |
| One central event path | Runtime registers `twitch-data-sources` on the journaled bus. Goal notifications reach the same normalizer and consumer as other canonical events. Twitch and Streamer.bot follow hints request authoritative follower refresh without adding one locally. |
| Canonical events versus alert authoring | Canonical goal events validate and appear in diagnostics; the alert catalog remains unchanged. Schema/HTTP tests reject goal alert rules and playback returns no-match before querying alert rules. Direct-only goal correlation fixtures keep full canonical coverage explicit. |
| Snapshot convergence | `twitch-goal-source-runtime.test.ts` exercises delayed snapshot/progress, progress-before-begin, two goals, replay/wrong-account rejection, overflow, end tombstones and reconnect. |
| Failure recovery | Source tests exercise rate deadlines, stale expiry, old-account/maintenance responses and an end arriving during a subsequently failed snapshot. Optional subscription failures distinguish temporary retry from reauthorization. |
| Durable ownership | `creator-goals.test.ts` covers atomic value/target changes, invalid batch rollback, manual/forged-source rejection, readonly projections and durable A→B→A invalidation with explicit rebind. |
| Persistence and templates | SQLite/portable backup tests round-trip source provenance. Templates retain typed requirements without live amounts, broadcaster identity or binding IDs. |
| Management and Operator | Production controls list active goals and units, default to newest-of-type, offer pin/rebind, and retain provider readonly controls. Source stories exercise ready, stale, ended, invalid and reauthorization states. |
| Browser pipeline | `twitch-data-overlays.spec.ts` uses disposable SQLite, secrets and fake provider boundaries through real EventSub intake, bus, runtime and rebuilt UI. It covers live text/bar, end/replacement, pin/rebind, restart and account invalidation. |
| Existing PR regressions | Data follows the primary/recent Operator controls on compact layouts. Pin changes update immediately and roll back on failure. Asset authorization uses verified persisted key scope; asset requests have an independent shared rate budget. Number grouping avoids the flagged polynomial regex. |

## Validation

- Medium implementation agents completed contracts, EventSub, runtime and UI. One low backend review/test agent passed 202 focused tests with no remaining findings; a low browser tester ran the full browser gate. The parent read the changed code, reproduced failures and reran the corrected workflows.
- Final workspace build, strict TypeScript build, full lint/error-provenance gate and `git diff --check` pass.
- Full Playwright gate: 145/145 pass. Parent verification on final rebuilt assets confirms Creator Goals, follower scope isolation, Diagnostics and all nine full-app UX cases. One parent run hit the management loading error boundary; its isolated case and full nine-case sequence subsequently passed unchanged.
- Static Storybook: 478 scenarios / 54 suites pass. After the last Operator/Diagnostics/alert-catalog edits, rebuilt affected suites pass 50 scenarios / 3 suites, including interaction, accessibility and console checks.
- Script tests: 132 pass, one existing Windows platform exclusion. One concurrent fixture-test child process exited without a failing assertion; that file passed in isolation and the full serial script run passed unchanged.
- Final full unit run: **3,945/3,945 tests across 411 files pass**, using two isolated workers (`node node_modules/vitest/vitest.mjs run --maxWorkers=2 --fileParallelism`, exit 0). The earlier four-worker run timed out on the existing 100-layer canvas test; its isolated file and the complete lower-concurrency run pass without changing that test. Earlier real event-catalog/consumer-count failures were reproduced and corrected, with negative alert-authoring and direct-only goal correlation tests added.
- All four Data OpenSpec changes and all 54 canonical capabilities pass strict validation.

Sandboxed Vitest launches hit missing temporary SSR-cache files and the sandbox browser cache lacked Chromium. The same commands run with the installed host tools passed; those failed launches are environment failures, not passing evidence. Scratch command logs are under `.superpowers/sdd/2026-10-08-data-overlays/live-goals-*` and are not committed.

## Acceptance limits

No real Twitch account, normal profile, OAuth token, OBS session or physical desktop overlay was used. Real-account acceptance remains unchecked in the OpenSpec tasks. The automated fixtures exercise the production paths but do not establish real-provider or hardware acceptance.

Custom Data event-rule authoring, stream-online resets and Streamer.bot global-variable adapters are outside this integration. Streamer.bot globals still need sanitized real response/event fixtures. The PR remains a draft pending the broader Data work; this change does not merge it.

Remote main advanced after the branch's earlier `4dc22d3c` merge, and GitHub reports conflicts for PR #182. This delivery completes the live-goal integration on its existing branch; it does not incorporate the later browser/desktop output refactor. The draft needs reconciliation with newer main before merge, and fresh remote CodeQL status cannot be inferred from local authorization tests.

Implementation commit `64481812` was pushed to [PR #182](https://github.com/jamsethoth/stream-jams/pull/182), and its remote head, draft state and conflict status were verified. No fresh PR checks were present at that checkpoint; branch CI is requested separately. This delivery record does not claim remote checks have passed.
