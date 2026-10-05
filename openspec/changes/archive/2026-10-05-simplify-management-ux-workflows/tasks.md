## 1. Baseline And Specification

- [x] 1.1 Confirm the six findings in current source and an isolated fixture-backed rendered UI without using live configuration or secret output URLs
- [x] 1.2 Strict-validate and commit the copied implementation plan plus proposal, design, delta specs, and implementation tasks

## 2. Accurate Sample Preview And Test Actions

- [x] 2.1 Add failing alert inventory tests for Sample message, Test saved, compact destinations, no sample delivery, and accessible focus behavior
- [x] 2.2 Implement the alert inventory labels, summaries, and text-only sample explanation while preserving saved-test delivery semantics
- [x] 2.3 Add failing focused-editor tests for local Preview help, Test draft, destination summaries, and unavailable output or TTS states
- [x] 2.4 Implement focused-editor wording and summaries while preserving draft delivery, audio, TTS, and output availability contracts
- [x] 2.5 Add failing Screen Effects tests for Test saved, destination summaries, and confirmation-before-queueing, then implement the presentation change

## 3. Shared Alert Draft Across Profiles

- [x] 3.1 Replace profile-switch warning tests with failing shared-draft, two-profile, history, review, enablement, Save, Revert, and dirty-navigation cases
- [x] 3.2 Remove profile-switch-only save/discard state and preserve one draft plus profile-specific transient view state across switching

## 4. Live Readiness

- [x] 4.1 Add failing tests for blocker, profile review, profile enablement, alert enablement, set activation, configured-ready, optional-profile, and Unsaved readiness states
- [x] 4.2 Implement one derived Live readiness summary and correction action using existing facts and controls without claiming output delivery

## 5. Actionable Home

- [x] 5.1 Add failing Home tests and stories for blocked, mixed, all-complete, empty, load-failure, and no-active-set ordering and disclosure behavior
- [x] 5.2 Render problems and incomplete setup first, identify the next action, and place completed setup in an initially collapsed native disclosure

## 6. Simplified Alert Rows

- [x] 6.1 Add failing desktop and narrow alert-row tests for one copy of each action, keyboard More operation, focus restoration, eligibility, and wrapping
- [x] 6.2 Keep Edit, Test saved, and Enable or Disable inline and move all eligible secondary actions into the existing More disclosure

## 7. Documentation And Verification

- [x] 7.1 Update production-component stories, Playwright workflows, and UX documentation for all intentional behavior changes
- [x] 7.2 Run focused tests, typecheck, lint, full tests, build, Storybook build/test, applicable Playwright tests, and strict OpenSpec validation
- [x] 7.3 Verify the rebuilt isolated full application plus desktop and narrow fixture workflows, synchronize durable specs, and record evidence without publishing externally
