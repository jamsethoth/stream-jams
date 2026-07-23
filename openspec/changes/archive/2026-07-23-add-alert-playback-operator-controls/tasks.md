## 1. Prerequisite Gate

- [x] 1.1 Fetch `origin/main` and verify `refactor-management-ui-ux` and `improve-management-ui-ux-audit-followups` are complete, validated, and present before implementation starts.
- [x] 1.2 Reconcile the current playback snapshot, protected routes, app-config schema, web entrypoint, management session bootstrap, and operator design artifacts against this proposal; update tasks only for verified drift.

## 2. Durable Playback Safety State

- [x] 2.1 Add failing core config tests for absent-field defaults and valid or invalid paused, muted, and do-not-disturb values.
- [x] 2.2 Extend the non-secret app-config contract and file store with playback safety defaults while preserving older config compatibility and configuration backup/restore behavior.
- [x] 2.3 Add failing queue/composition tests proving restored safety state is applied before playback and persistence failure leaves runtime state unchanged.
- [x] 2.4 Wire write-before-apply safety-state persistence through the existing coordinator and protected control routes without changing queue-item durability.

## 3. Real Skip And Mute Semantics

- [x] 3.1 Add failing gateway and overlay-client tests for authoritative audio state on connect/change and targeted stop messages on the existing authorized socket.
- [x] 3.2 Extend the existing overlay gateway/client message union; make audio/video/browser speech react to mute and make stop remove active instructions without reporting false completion.
- [x] 3.3 Add failing coordinator tests proving skip stops every current instruction before the next delivery and remote TTS dispatch waits for current-item delivery.
- [x] 3.4 Broadcast mute changes after successful persistence, suppress new remote TTS while muted, and document that already-triggered external speech cannot be recalled.

## 4. Typed Operator Client And Route

- [x] 4.1 Add failing web client tests for playback snapshot parsing and every existing control response and failure.
- [x] 4.2 Extend the existing same-origin typed client with get, pause/resume, mute/unmute, skip, replay, and do-not-disturb methods; add no parallel transport.
- [x] 4.3 Add failing route tests for `/operator`, management-to-operator navigation, management-session bootstrap, and configuration or Diagnostics correction links.
- [x] 4.4 Implement the minimal top-level operator shell and management link without reintroducing the legacy Playback page or management editing chrome.

## 5. Playback Operator Experience

- [x] 5.1 Add failing component tests for now playing, queue ordering, recent replay, empty states, persistent safety status, stale refresh, command failure, and keyboard operation.
- [x] 5.2 Implement bounded visible-tab polling, immediate command-response updates, allowlisted normalized summaries, and actionable redacted failures.
- [x] 5.3 Add production-component Storybook states for idle, active queue, paused, muted, do-not-disturb, stale data, and failed control actions.
- [x] 5.4 Add Playwright coverage for opening `/operator`, changing reversible safety state, skipping current playback without overlap, and replaying a known recent alert.

## 6. Verification

- [x] 6.1 Run affected core, server-route, gateway, overlay-renderer, runtime-composition, web-component, Storybook, and Playwright tests, then run repository lint, typecheck, full tests, build, and required frontend gates.
- [x] 6.2 Reconcile every requirement against code and tests, run `openspec.cmd validate add-alert-playback-operator-controls --strict`, and complete an independent frontend review.
- [x] 6.3 Rebuild and restart affected local services, wait for health, reload management and `/operator`, and verify live queue refresh plus pause, browser-source mute, future remote-TTS suppression, DND, skip without overlap, replay, restart restoration, and diagnostics links.

## 7. Consistent Surface Navigation

- [x] 7.1 Add failing component tests for management-header placement, operator-header placement, shared styling, and native same-tab link attributes.
- [x] 7.2 Move the management link into the existing page-header action slot, reuse the same treatment for the operator return link, and update Storybook and Playwright coverage.
- [x] 7.3 Run focused and repository gates, strict OpenSpec validation, restart the rebuilt service, and verify desktop and narrow live layouts.
