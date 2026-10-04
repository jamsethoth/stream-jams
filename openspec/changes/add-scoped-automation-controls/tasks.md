## 1. Runtime foundations
- [x] 1.1 Add guarded timer activation/reset/adjust/stop and bulk toggle with transition/race tests.
- [x] 1.2 Add independent module mute throughout browser/desktop playback and dashboard/tray, with output tests.
## 2. Secure integration
- [x] 2.1 Add proof-bound pairing, scoped persisted grants, revocation, export exclusion and security tests.
- [x] 2.2 Add versioned state/capability API and guarded queue/timer routes with integration tests.
- [x] 2.3 Add management approval/grant UI with Storybook and browser acceptance.
## 3. Delivery verification
- [x] 3.1 Document wire contract, errors, limits, revisions, pairing and no-retry behavior.
- [x] 3.2 Run lint/typecheck/unit/build/Storybook/Playwright, fix relevant failures and perform one independent review.
- [x] 3.3 Rebuild disposable runtime, verify live pairing and controls, reconcile spec/task completion.

## 4. Acceptance gap closure
- [x] 4.1 Update legacy desktop mute fixtures and verify affected packaged lifecycle/timer/overlay checks.
- [x] 4.2 Verify populated Alerts/Effects queues, replacement guards, and atomic mixed-scope mute through the real scoped API.
- [x] 4.3 Verify persisted grant restart and actual backup-restore invalidation using disposable runtimes.
- [x] 4.4 Verify simultaneous native browser/Electron audio, current/future mute, independent timer cues and renderer reconnect/recreation.
- [x] 4.5 Fix and regress timer composition updates removing streamed playback while preserving stop/disable behavior.
