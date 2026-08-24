## 1. Prerequisite Gate

- [x] 1.1 Fetch `origin/main` and verify `refactor-management-ui-ux` and `improve-management-ui-ux-audit-followups` are complete, validated, and present before implementation starts.
- [x] 1.2 Reconcile current alert-layer contracts, editor-document migration, backup/restore, resolver, canvas, overlay renderer, and focused-editor architecture against this proposal.

## 2. Style Contracts And Compatibility

- [x] 2.1 Add failing core schema tests for the font preset catalog, canonical RGBA colors, bounded typography, text shadow, box background, padding, radius, box shadow, and invalid values.
- [x] 2.2 Add typed text and box style contracts, compatibility defaults matching current output, shared CSS mapping, and public exports without accepting raw CSS or external fonts.
- [x] 2.3 Add failing migration and backup/restore tests proving older text layers receive explicit compatibility defaults and styled documents round-trip without loss.
- [x] 2.4 Extend the editor-document migration and configuration snapshot validation for styled text layers while keeping rollback non-destructive.

## 3. Resolution And Rendering

- [x] 3.1 Add failing resolver and overlay-instruction tests proving validated style survives draft preview, saved test, and live resolution without provider-specific data.
- [x] 3.2 Extend normalized overlay instructions and the shared presentation mapper so editor canvas and production overlay consume the same typography and box style.
- [x] 3.3 Add overlay component tests for alignment, padding, radius, shadows, overflow bounds, compatibility defaults, and transparent fail-closed rendering.

## 4. Focused Editor Controls

- [x] 4.1 Add failing editor tests for text-only style visibility, native labelled controls, valid edits, invalid bounds, undo/redo, dirty navigation, profile geometry independence, and explicit save.
- [x] 4.2 Implement one focused typography and text-box section using existing inspector and form patterns; do not add a dependency or general-purpose style abstraction.
- [x] 4.3 Add production-component Storybook states covering default compatibility style, contrasting custom styles, vertical layout, invalid input, narrow-screen guard, and reduced-motion presentation.
- [x] 4.4 Add Playwright coverage for styling a text layer, saving, reloading, previewing, and sending it to a connected test output.
- [x] 4.5 Make every major selected-layer editor section a native collapsible disclosure, open by default, with component, Storybook, and Playwright coverage.

## 5. Verification

- [x] 5.1 Run focused core, migration, backup, resolver, overlay, editor, Storybook, and Playwright tests, then repository lint, typecheck, full tests, build, and required frontend gates.
- [x] 5.2 Reconcile every requirement against code and tests, run `openspec.cmd validate add-alert-visual-style-controls --strict`, and complete an independent frontend review.
- [x] 5.3 Rebuild and restart affected services, wait for health, reload the editor and overlay, and verify existing-alert compatibility plus styled landscape and vertical preview, test, live playback, backup, and restore.
- [x] 5.4 Run focused frontend tests and gates, validate the updated OpenSpec change, rebuild, restart, and verify the disclosure behavior in the live editor.

## 6. Validation Audit Follow-ups

- [x] 6.1 Replace screenshot-gated visual parity with deterministic shared-mapper, computed-style, and fixed-viewport geometry checks; retain screenshots only as optional review artifacts and OBS/Cef as a manual smoke check.
- [x] 6.2 Prove a document with non-default typography, RGBA colors, text shadow, box background, padding, radius, and box shadow survives portable snapshot validation and restore without loss.
- [x] 6.3 Exercise line height, text color, every text-shadow field, every box-shadow field, persistence, and representative field-specific correction messages through the production editor controls.
- [x] 6.4 Prove styled vertical authoring, reload, preview, Send test, target-profile transport, and fixed-viewport overlay rendering with deterministic CSS and outer-box geometry assertions.
- [x] 6.5 Toggle Live TTS, Typography, Text box, Position and size, and Animation preset disclosures individually and independently in proportional component, Storybook, and real-browser coverage without dirtying alert data.
- [x] 6.6 Run focused and repository frontend gates, strict OpenSpec validation, rebuilt live browser verification, an OBS/Cef smoke check when OBS is available, and restore the pre-verification stopped-app state.

## 7. Review Workflow Correction

- [x] 7.1 Add a failing service regression and Playwright coverage for incrementally reviewing an alert whose landscape and vertical profiles are both already enabled and `Needs review`.
- [x] 7.2 Make save validation transition-aware, retain rejection for newly enabled unreviewed profiles, run required gates, rebuild and restart the app, verify the live workflow, and update the pull request.

## 8. Review Action Discoverability

- [x] 8.1 Add failing component, Storybook, and Playwright coverage for a selected-profile warning that exposes `Mark reviewed`, updates only the draft profile state, and still requires explicit `Save`.
- [x] 8.2 Add the inline action to the existing profile warning using the current button and warning patterns, while retaining the Alert-tab action as a secondary path.
- [x] 8.3 Run focused and repository frontend gates, strict OpenSpec validation, rebuild and restart the app, verify the live workflow, and update the pull request UX note.
