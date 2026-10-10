# Tasks

## 1. Management

- [x] 1.1 Label the re-pair save action "Save new authorization" and name it in the passing-test message.
- [x] 1.2 Explain the auth-required recovery in the Music sources status.

## 2. Runtime

- [x] 2.1 Report `auth-required` instead of reconnecting when Pear's certificate is not trusted by the saved source.
- [x] 2.2 Report `auth-required` when a saved HTTP source finds Pear serving HTTPS, using a credential-free certificate probe.
- [x] 2.3 Map Pear video IDs that start with `-` or `_` to `yt:`-prefixed track IDs.

## 3. Verification

- [x] 3.1 Unit tests for HTTP-to-HTTPS, changed and untrusted certificates (auto, ws, poll), unreachable Pear, and dash-prefixed track IDs.
- [x] 3.2 Management page test for re-pair save.
- [ ] 3.3 Maintainer re-pairs Pear Desktop on Windows and live Music reaches connected.
