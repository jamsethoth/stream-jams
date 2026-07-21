## 1. Prerequisite Gate

- [ ] 1.1 Fetch `origin/main` and verify `add-alert-visual-style-controls` is complete, validated, and present before implementation starts.
- [ ] 1.2 Reconcile the existing shape contract, resolver, canvas, overlay renderer, layer commands, copy workflows, and shared color control against this proposal.

## 2. Shape Contract And Defaults

- [ ] 2.1 Add failing schema and compatibility tests for canonical solid-fill colors, invalid CSS or external values, creation defaults, and existing saved shapes.
- [ ] 2.2 Reuse the visual-style color schema for shape fill and add one visible rectangle default without introducing a new primitive hierarchy.
- [ ] 2.3 Add failing service tests proving shape creation is atomic and profile layouts use service-owned IDs and bounded default geometry.

## 3. Shape Authoring

- [ ] 3.1 Add failing focused-editor tests for Add Shape, selected-layer fill editing, rename, visibility, geometry, ordering, animation, duplicate, delete, undo/redo, and save.
- [ ] 3.2 Add Shape to the existing type-first layer menu and implement its inspector through existing layer operations and shared native color controls.
- [ ] 3.3 Add failing copy, duplication, migration, and backup/restore tests proving shape data survives every existing alert workflow without asset relinking.

## 4. Rendering And Browser Coverage

- [ ] 4.1 Extend canvas, resolver, and production overlay tests for order, visibility, profile geometry, preset animation, preview, Send test, and live shape rendering.
- [ ] 4.2 Add Storybook states for a shape background, badge, hidden shape, vertical profile, invalid fill, and copy/review state.
- [ ] 4.3 Add Playwright coverage for adding, styling, ordering, saving, reloading, previewing, and sending a shape-backed alert.

## 5. Verification

- [ ] 5.1 Run focused core, server, editor, overlay, Storybook, and Playwright tests, then repository lint, typecheck, full tests, build, and required frontend gates.
- [ ] 5.2 Reconcile every requirement against code and tests, run `openspec.cmd validate add-alert-shape-layer-authoring --strict`, and complete an independent frontend review.
- [ ] 5.3 Rebuild and restart affected services, wait for health, reload the editor and overlay, and verify shape add/edit/copy/backup plus landscape and vertical preview, test, and live playback.
