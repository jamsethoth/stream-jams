## 1. Preparation

- [x] 1.1 Verify official authentication/TLS support, current baseline, and install frozen dependencies.
- [x] 1.2 Record the approved audit scope, design, and regression criteria.

## 2. Implementation

- [ ] 2.1 Enforce credential-free loopback connection contracts at setup/runtime/export boundaries and protect legacy management projections.
- [ ] 2.2 Gate Streamer.bot event delivery on completed authentication and explicit local unauthenticated consent.
- [ ] 2.3 Explain provider transport/authentication in setup and cover the new UI state.
- [ ] 2.4 Unify normal/emergency URL and capability redaction with failure-path regressions.
- [ ] 2.5 Protect management HTML with CSP and anti-framing headers and browser regressions.

## 3. Verification

- [ ] 3.1 Run focused regressions, lint, typecheck, full unit/script suite, builds, Storybook, and browser acceptance.
- [ ] 3.2 Verify the rebuilt workflow in a disposable live instance and review the scoped diff once.
- [ ] 3.3 Validate OpenSpec and record actual verification results and remaining limitations.
