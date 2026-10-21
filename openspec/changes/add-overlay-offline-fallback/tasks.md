# Tasks

## 1. Core

- [x] 1.1 Export the worker path, fallback path, scope and cache naming as shared overlay constants.

## 2. Server

- [x] 2.1 Serve the worker script at `/overlay/offline-worker.js` with a JavaScript type and `cache-control: no-cache`.
- [x] 2.2 Serve the transparent, script-free fallback page at `/overlay/offline-fallback` with a strict CSP and `cache-control: no-store`.
- [x] 2.3 Worker: store the fallback page on install, delete older offline caches on activate, and answer only failed `/overlay/modules/` navigations.

## 3. Web

- [x] 3.1 Register the worker from the overlay shell only, scoped to `/overlay/`, failing silently when unsupported.

## 4. Verification

- [x] 4.1 Unit: worker install, activate, pass-through, fallback, non-navigation and out-of-scope cases; served source runs in an isolated context.
- [x] 4.2 Unit: route headers and bodies, no key or script in the fallback page; registration success, absence and rejection.
- [x] 4.3 Playwright: an overlay reloaded during an outage shows the fallback page, then the live overlay returns without action; management is not controlled.
- [x] 4.4 Real OBS: OBS restarted during an outage and a shutdown-when-hidden source shown during an outage both recover once Stream Jams is listening.
- [x] 4.5 Docs: runbook note on the Refresh-while-down limitation and a backlog row for an OBS WebSocket refresh follow-up.
- [ ] 4.6 Maintainer starts their own OBS scene collection before Stream Jams and confirms every Stream Jams source appears once Stream Jams starts.
