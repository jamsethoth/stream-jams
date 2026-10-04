# Automation Settings refresh race correction

PR #152 re-review identified that an action invalidates an outstanding refresh but leaves its loading marker occupied, suppressing the immediate post-action read. This follow-up preserves the existing scoped-automation contract and changes only request scheduling in Settings.

After approval, denial or revocation settles, supersede the outstanding read marker and start a new request. Request sequence checks must reject obsolete results and errors; old requests must not clear the newer request marker. No command retries, new permissions, polling frequency changes or API changes are introduced.

Acceptance: all three successful actions render fresh state while the prior read remains unresolved; late prior success/failure cannot overwrite it. Existing subset selection and strict-effect cleanup remain covered. The rebuilt real browser must approve during a stalled management refresh and successfully exchange/revoke the exact selected scope set.

UX scope: Product Surfaces / Management UI, Settings integrations, Status Freshness and failure feedback. Existing MVP behavior; no backlog feature, new controls or styling. Role-labelled controls and keyboard behavior remain unchanged. A production-component Storybook interaction covers stalled-refresh success, and Playwright exercises the rebuilt production application.

Validation: four new component regressions failed before the fix; all13 component tests passed after it. Workspace lint/typecheck, web production build and Storybook build passed. Eight affected Storybook interactions passed with console/accessibility gates (31 unrelated suites tag-filtered). Rebuilt disposable Chromium acceptance passed with a deliberately stalled management poll, immediate approved status, selected-scope exchange and revocation. This micro UI fix uses focused verification; full repository unit/hardware suites were not repeated. Remote CI validates the follow-up PR separately.
