## 1. Preparation

Implemented backend `1d11e7f0` and frontend `1023bb4d` on the authorized committed base. The [scenario trace](../../../docs/verification/data-overlays-scenarios.md) includes all four starter workflows, independent reuse, insertion, provider readiness, missing-image replacement and backup evidence. Canonical provider examples use the implemented Twitch follower source; native Twitch Creator Goal slots await the separate source/event-bus dependency.

- [x] 1.1 Use the user-authorized committed slice 1 dependency on the branch based on fetched `origin/main` at `55d29f2b`; no merge is claimed.
- [x] 1.2 Write a requirement-to-test trace for this change.

## 2. Implementation

- [x] 2.1 Add template and slot schemas, and the four bundled starters with previews.
- [x] 2.2 Add template repositories, "save as template", and atomic instantiation with new IDs and reference rewriting. Test independent copies, incompatible mappings, provider slots and missing assets.
- [x] 2.3 Add flattened group insertion.
- [x] 2.4 Build the template picker and slot-mapping flow with create-new-value and map-existing options. Add stories with interaction and accessibility checks.
- [x] 2.5 Extend backup and restore with saved templates.

## 3. Verification and handoff

- [x] 3.1 Add Playwright acceptance for creating a canvas from each starter and saving and reusing a user template.
- [x] 3.2 Run lint, typecheck, tests, build, Storybook gates, Playwright and strict OpenSpec validation. Verify live.
- [x] 3.3 Sync canonical specs and remove BL-063.
