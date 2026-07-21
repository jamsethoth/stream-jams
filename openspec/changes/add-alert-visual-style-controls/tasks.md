## 1. Prerequisite Gate

- [ ] 1.1 Fetch `origin/main` and verify `refactor-management-ui-ux` and `improve-management-ui-ux-audit-followups` are complete, validated, and present before implementation starts.
- [ ] 1.2 Reconcile current alert-layer contracts, editor-document migration, backup/restore, resolver, canvas, overlay renderer, and focused-editor architecture against this proposal.

## 2. Style Contracts And Compatibility

- [ ] 2.1 Add failing core schema tests for the font preset catalog, canonical RGBA colors, bounded typography, text shadow, box background, padding, radius, box shadow, and invalid values.
- [ ] 2.2 Add typed text and box style contracts, compatibility defaults matching current output, shared CSS mapping, and public exports without accepting raw CSS or external fonts.
- [ ] 2.3 Add failing migration and backup/restore tests proving older text layers receive explicit compatibility defaults and styled documents round-trip without loss.
- [ ] 2.4 Extend the editor-document migration and configuration snapshot validation for styled text layers while keeping rollback non-destructive.

## 3. Resolution And Rendering

- [ ] 3.1 Add failing resolver and overlay-instruction tests proving validated style survives draft preview, saved test, and live resolution without provider-specific data.
- [ ] 3.2 Extend normalized overlay instructions and the shared presentation mapper so editor canvas and production overlay consume the same typography and box style.
- [ ] 3.3 Add overlay component tests for alignment, padding, radius, shadows, overflow bounds, compatibility defaults, and transparent fail-closed rendering.

## 4. Focused Editor Controls

- [ ] 4.1 Add failing editor tests for text-only style visibility, native labelled controls, valid edits, invalid bounds, undo/redo, dirty navigation, profile geometry independence, and explicit save.
- [ ] 4.2 Implement one focused typography and text-box section using existing inspector and form patterns; do not add a dependency or general-purpose style abstraction.
- [ ] 4.3 Add production-component Storybook states covering default compatibility style, contrasting custom styles, vertical layout, invalid input, narrow-screen guard, and reduced-motion presentation.
- [ ] 4.4 Add Playwright coverage for styling a text layer, saving, reloading, previewing, and sending it to a connected test output.

## 5. Verification

- [ ] 5.1 Run focused core, migration, backup, resolver, overlay, editor, Storybook, and Playwright tests, then repository lint, typecheck, full tests, build, and required frontend gates.
- [ ] 5.2 Reconcile every requirement against code and tests, run `openspec.cmd validate add-alert-visual-style-controls --strict`, and complete an independent frontend review.
- [ ] 5.3 Rebuild and restart affected services, wait for health, reload the editor and overlay, and verify existing-alert compatibility plus styled landscape and vertical preview, test, live playback, backup, and restore.
