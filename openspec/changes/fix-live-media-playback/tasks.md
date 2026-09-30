## 1. Media transport

- [ ] 1.1 Add failing range/auth/HEAD boundary regressions and implement authorized byte-range asset responses.
- [ ] 1.2 Add actual-browser nonzero media-seek coverage against the asset endpoint.

## 2. Playback failure evidence

- [ ] 2.1 Reproduce private overlay cause loss and preserve failures across active playback IPC replies.
- [ ] 2.2 Add bounded selected-device failure details, propagate and log all failed-route results without changing destinations.
- [ ] 2.3 Test unavailable routes, healthy-recipient independence, device/source/metadata/seek/decode/play failures and cleanup.

## 3. Timing and recovery

- [ ] 3.1 Test and classify expired source media and slow asynchronous seek failures with timing evidence, retaining current synchronization bounds.
- [ ] 3.2 Verify provider keepalive recovery and management session renewal scenarios; cover missing failure cases.

## 4. Verification and handoff

- [ ] 4.1 Reconcile every incident bucket with implementation and tests; strict-validate OpenSpec and run required package/UI gates.
- [ ] 4.2 Rebuild and verify the changed workflow on an isolated local service; record physical-output limits and remaining historical unknowns.
