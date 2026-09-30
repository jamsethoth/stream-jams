## 1. Media transport

- [x] 1.1 Add failing range/auth/HEAD boundary regressions and implement authorized byte-range asset responses.
- [x] 1.2 Add actual-browser nonzero media-seek coverage against the asset endpoint.

## 2. Playback failure evidence

- [x] 2.1 Reproduce private overlay cause loss and preserve failures across active playback IPC replies.
- [x] 2.2 Add bounded selected-device failure details, propagate and log all failed-route results without changing destinations.
- [x] 2.3 Test unavailable routes, healthy-recipient independence, device/source/metadata/seek/decode/play failures and cleanup.

## 3. Timing and recovery

- [x] 3.1 Test and classify expired source media and slow asynchronous seek failures with timing evidence, retaining the then-current synchronization bounds (superseded for normal playback by section 5).
- [x] 3.2 Verify provider keepalive recovery and management session renewal scenarios; cover missing failure cases.

## 4. Verification and handoff

- [x] 4.1 Reconcile every incident bucket with implementation and tests; strict-validate OpenSpec and run required package/UI gates.
- [x] 4.2 Rebuild and verify the changed workflow on an isolated local service; record physical-output limits and remaining historical unknowns.

## 5. Approved coordinated startup and automatic target recovery

- [x] 5.1 Record approved preparation-then-start policy: approximate shared start, full content at normal speed, selected audio destinations only, target recovery without interrupted clip replay.
- [x] 5.2 Add failing regressions and implement browser-source, desktop-overlay and selected-device audio prepare/start handshakes with cancellation and bounded readiness.
- [x] 5.3 Coordinate shared start after preparation for Alerts and Screen Effects; preserve full media intervals and fades from actual onset, retain separate watchdogs, and exclude reconnect replay.
- [x] 5.4 Add repeated-failure recovery tests and remove permanent renderer lockouts while bounding recreation and respecting shutdown.
- [x] 5.5 Run affected tests and repository/UI gates; rebuild and verify actual browser media startup, including the previously failing short clip; document physical output verification limits.
