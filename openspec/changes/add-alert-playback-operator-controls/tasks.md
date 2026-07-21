## 1. Prerequisite Gate

- [ ] 1.1 Fetch `origin/main` and verify `refactor-management-ui-ux` and `improve-management-ui-ux-audit-followups` are complete, validated, and present before implementation starts.
- [ ] 1.2 Reconcile the current playback snapshot, protected routes, app-config schema, web entrypoint, management session bootstrap, and operator design artifacts against this proposal; update tasks only for verified drift.

## 2. Durable Playback Safety State

- [ ] 2.1 Add failing core config tests for absent-field defaults and valid or invalid paused, muted, and do-not-disturb values.
- [ ] 2.2 Extend the non-secret app-config contract and file store with playback safety defaults while preserving older config compatibility and backup behavior.
- [ ] 2.3 Add failing queue/composition tests proving restored safety state is applied before playback and persistence failure leaves runtime state unchanged.
- [ ] 2.4 Wire write-before-apply safety-state persistence through the existing coordinator and protected control routes without changing queue-item durability.

## 3. Typed Operator Client And Route

- [ ] 3.1 Add failing web client tests for playback snapshot parsing and every existing control response and failure.
- [ ] 3.2 Extend the existing same-origin typed client with get, pause/resume, mute/unmute, skip, replay, and do-not-disturb methods; add no parallel transport.
- [ ] 3.3 Add failing route tests for `/operator`, management-to-operator navigation, same-session access, and configuration or Diagnostics correction links.
- [ ] 3.4 Implement the minimal top-level operator shell and management link without reintroducing the legacy Playback page or management editing chrome.

## 4. Playback Operator Experience

- [ ] 4.1 Add failing component tests for now playing, queue ordering, recent replay, empty states, persistent safety status, stale refresh, command failure, and keyboard operation.
- [ ] 4.2 Implement bounded visible-tab polling, immediate command-response updates, allowlisted normalized summaries, and actionable redacted failures.
- [ ] 4.3 Add production-component Storybook states for idle, active queue, paused, muted, do-not-disturb, stale data, and failed control actions.
- [ ] 4.4 Add Playwright coverage for opening `/operator`, changing reversible safety state, skipping current playback, and replaying a known recent alert.

## 5. Verification

- [ ] 5.1 Run affected core, server-route, runtime-composition, web-component, Storybook, and Playwright tests, then run repository lint, typecheck, full tests, build, and required frontend gates.
- [ ] 5.2 Reconcile every requirement against code and tests, run `openspec.cmd validate add-alert-playback-operator-controls --strict`, and complete an independent frontend review.
- [ ] 5.3 Rebuild and restart affected local services, wait for health, reload management and `/operator`, and verify live queue refresh plus pause, mute, DND, skip, replay, restart restoration, and diagnostics links.
