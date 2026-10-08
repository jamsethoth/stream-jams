## 1. Preparation

Implementation checkpoint: follower backend `0d3e2e5f`, source UI `2acc1704`. The user authorized all four slices in dependency order on one branch based on fetched `origin/main` at `55d29f2b`; slice 1 is locally committed, not merged. Documentation-derived synthetic fixtures are labeled as such. The [scenario trace](../../../docs/verification/data-overlays-scenarios.md) distinguishes helper coverage from production integration.

Task 3.1 is partially complete: authoritative polling, decreases, epochs, backoff, rate-reset handling and the ten-second hint throttle are tested. Production follow-event wiring awaits the central event bus. Tasks 3.2–3.3 have tested pure list/buffer/binding helpers but no production subscription/consumer or persisted binding flow. Task 4.1 includes follower selection/status/read-only controls and optional-scope reconnect guidance; native goal controls remain blocked. Real-account acceptance is unperformed.

The canonical `twitch-overlay-data` capability records only implemented follower polling, read-only ownership, optional scopes and account invalidation. It deliberately omits the pending event hint and live Creator Goal requirements. BL-062 remains partially implemented; task 5.3 is not complete.

- [ ] 1.1 Confirm slice 1 has merged, fetch remote state, and branch from `origin/main`.
- [ ] 1.2 Record sanitized fixtures for Get Channel Followers, Get Creator Goals, and the goal begin, progress and end events.
- [x] 1.3 Write a requirement-to-test trace for this change.

## 2. Scopes

- [x] 2.1 Split `defaultTwitchOAuthScopes` into required and optional capability scopes, and gate the goal source on `channel:read:goals`. Add a regression test showing an account without the goal scope keeps alert intake.

## 3. Sources

- [ ] 3.1 Implement follower-total refresh with interval, early refresh, backoff, rate-limit reset and connection epochs. Test decreases, late responses and rate limits.
- [ ] 3.2 Implement the Creator Goals list with snapshot ordering, the event buffer, overflow resnapshot and reconnect. Test the initial-load race and two active goals.
- [ ] 3.3 Implement active-goal-of-type and pinned bindings. Test goal replacement, the no-goal state, pinned end and broadcaster change.

## 4. Web

- [ ] 4.1 Add the source picker, binding mode choice, units labeling, status and reconnect action to Data management. Add stories for ready, stale, ended and reauthorization states.

## 5. Verification and handoff

- [x] 5.1 Run lint, typecheck, tests, build, Storybook gates, Playwright and strict OpenSpec validation for the implemented scope; blocked live goal/event paths remain unchecked above.
- [ ] 5.2 Verify against a real Twitch account: follower total, creating and replacing a follower goal, and the missing-scope path. Record the result.
- [ ] 5.3 Sync canonical specs and remove BL-062. Remove creator goals from BL-020.
