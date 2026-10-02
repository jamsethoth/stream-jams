## 1. Design and regression contract

- [x] 1.1 Research reference implementations and document the candidate, constraints and native evidence requirements.
- [x] 1.2 Vet file ownership and test interfaces; commit implementation spec/plan before code changes.

## 2. Desktop recovery

- [ ] 2.1 Add failing lifecycle and playback-start regression tests and record red evidence.
- [ ] 2.2 Implement bounded non-activating recovery and validate focused tests.

## 3. Automated acceptance harnesses

- [ ] 3.1 Implement native competing-window negative control and candidate order/focus/input/composition checks.
- [ ] 3.2 Implement and test the bounded Control observer/trigger runner with owned cleanup and redacted evidence.

## 4. Verification and handoff

- [ ] 4.1 Run relevant build/typecheck/lint/tests and native candidate checks; retain evidence.
- [ ] 4.2 Review the completed diff and resolve in-scope findings.
- [ ] 4.3 Prepare candidate and user-return commands with exact automated versus pending evidence.
- [ ] 4.4 Confirm physical Control visibility and gameplay input with the user; leave pending while unavailable.
