## 1. Preparation

The user authorized all four slices in dependency order on one branch, then explicitly authorized completing live Creator Goals on the existing PR. The branch includes main `4dc22d3c` via `9c78c826`; slice 1 is committed on this branch, not separately merged. Documentation-derived synthetic fixtures are labeled as such. The [live integration evidence](../../../docs/verification/live-creator-goals.md) supersedes the earlier helper-only checkpoint.

Live integration now includes optional EventSub goal subscriptions, canonical normalization, central bus consumption, snapshot convergence, persisted bindings and Management/Operator controls. The parent planned the work, medium implementers completed it, and low testing agents exercised backend and browser paths. Real-account acceptance remains unperformed.

The canonical capability now includes authoritative follow hints and live Creator Goals. Custom Data rules and Streamer.bot globals remain separate changes.

- [x] 1.1 Confirm slice 1 is present, fetch remote state, and continue the existing main-based branch under the user's explicit same-PR authorization (no separate slice-1 merge required).
- [x] 1.2 Record clearly labeled synthetic documentation-derived fixtures for Get Channel Followers, Get Creator Goals, and goal begin, progress and end; real-provider acceptance is tracked separately in 5.2.
- [x] 1.3 Write a requirement-to-test trace for this change.

## 2. Scopes

- [x] 2.1 Split `defaultTwitchOAuthScopes` into required and optional capability scopes, and gate the goal source on `channel:read:goals`. Add a regression test showing an account without the goal scope keeps alert intake.

## 3. Sources

- [x] 3.1 Implement follower-total refresh with interval, early refresh, backoff, rate-limit reset and connection epochs. Test decreases, late responses and rate limits.
- [x] 3.2 Implement the Creator Goals list with snapshot ordering, the event buffer, overflow resnapshot and reconnect. Test the initial-load race and two active goals.
- [x] 3.3 Implement active-goal-of-type and pinned bindings. Test goal replacement, the no-goal state, pinned end and broadcaster change.

## 4. Web

- [x] 4.1 Add the source picker, binding mode choice, units labeling, status and reconnect action to Data management. Add stories for ready, stale, ended and reauthorization states.

## 5. Verification and handoff

- [x] 5.1 Run lint, typecheck, tests, build, Storybook gates, Playwright and strict OpenSpec validation for the live integration; record exact results in the integration evidence.
- [ ] 5.2 Verify against a real Twitch account: follower total, creating and replacing a follower goal, and the missing-scope path. Record the result.
- [x] 5.3 Sync canonical specs and remove BL-062. Remove creator goals from BL-020.
