## 1. Design and regression contract

- [x] 1.1 Research reference implementations and document the candidate, constraints and native evidence requirements.
- [x] 1.2 Vet file ownership and test interfaces; commit implementation spec/plan before code changes.

## 2. Desktop recovery

- [x] 2.1 Add failing lifecycle and playback-start regression tests and record red evidence.
- [x] 2.2 Implement bounded non-activating recovery and validate focused tests.

## 3. Automated acceptance harnesses

- [x] 3.1 Implement native competing-window negative control and candidate order/focus/input/composition checks.
- [x] 3.2 Implement and test the bounded Control observer/trigger runner with owned cleanup and redacted evidence.

## 4. Verification and handoff

- [x] 4.1 Run relevant build/typecheck/lint/tests and background native candidate ordering checks; retain evidence.
- [x] 4.2 Review the completed diff and resolve in-scope findings.
- [x] 4.3 Prepare candidate and user-return commands with exact automated versus pending evidence.
- [x] 4.4 Confirm physical Control visibility and gameplay input with the user. Control DX12 borderless passed; DX11 remains untested.

- [x] 4.5 Complete foreground/input/compositor native fixture acceptance after unlock. Passed with Control in the background and user input idle; see docs/verification/desktop-overlay-topmost.md for evidence and earlier failed attempts.
