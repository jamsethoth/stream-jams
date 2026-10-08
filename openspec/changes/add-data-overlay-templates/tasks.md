## 1. Preparation

- [ ] 1.1 Confirm slice 1 has merged, fetch remote state, and branch from `origin/main`.
- [ ] 1.2 Write a requirement-to-test trace for this change.

## 2. Implementation

- [ ] 2.1 Add template and slot schemas, and the four bundled starters with previews.
- [ ] 2.2 Add template repositories, "save as template", and atomic instantiation with new IDs and reference rewriting. Test independent copies, incompatible mappings, provider slots and missing assets.
- [ ] 2.3 Add flattened group insertion.
- [ ] 2.4 Build the template picker and slot-mapping flow with create-new-value and map-existing options. Add stories with interaction and accessibility checks.
- [ ] 2.5 Extend backup and restore with saved templates.

## 3. Verification and handoff

- [ ] 3.1 Add Playwright acceptance for creating a canvas from each starter and saving and reusing a user template.
- [ ] 3.2 Run lint, typecheck, tests, build, Storybook gates, Playwright and strict OpenSpec validation. Verify live.
- [ ] 3.3 Sync canonical specs and remove BL-063.
