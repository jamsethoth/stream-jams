## 1. Contracts And Activation

- [x] 1.1 Add failing core tests for document-derived profile usage and activation relevance.
- [x] 1.2 Replace set-level target-profile summaries with derived profile-usage contracts and activation logic.

## 2. Server And Persistence

- [x] 2.1 Add failing service and repository tests for derived profile usage and metadata without profile fields.
- [x] 2.2 Bulk-hydrate alert documents for set overviews and remove profile fields from set metadata persistence.
- [x] 2.3 Add a tested SQLite migration that rebuilds alert-set metadata without changing alert documents.
- [x] 2.4 Add backup/restore compatibility tests and update portable table mappings for legacy redundant fields.

## 3. Management UI

- [x] 3.1 Add failing Alerts and Home tests for saved-document test targets, profile usage, and output-only Browser Source status.
- [x] 3.2 Update Alerts and Home UI, typed fixtures, and Storybook stories to consume derived profile usage.
- [x] 3.3 Update Playwright coverage for saved tests and Browser Source presentation.

## 4. Documentation And Verification

- [x] 4.1 Update the canonical MVP UX document to remove selected-set profile state and document-derived activation/test behavior.
- [x] 4.2 Run strict OpenSpec validation and affected-package focused tests during implementation.
- [x] 4.3 Run lint, typecheck, full tests, production and Storybook builds/tests, Playwright, then rebuild/restart and verify the live workflow.

## 5. Independent Review Corrections

- [x] 5.1 Preserve compatibility-document hydration when profile usage is derived for legacy alerts without persisted editor documents.
- [x] 5.2 Expose no-playable-profile activation failures as actionable validation and activation-impact blockers.
- [x] 5.3 Keep alert and set review rollups stable when disabled profiles remain unreviewed.
- [x] 5.4 Align the operator runbook with saved-profile targeting, then rerun focused and full verification.
