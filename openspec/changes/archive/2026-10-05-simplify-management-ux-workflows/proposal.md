## Why

The management UI currently uses ambiguous preview/test labels, interrupts edits when switching fixed alert profiles, scatters readiness cues, and gives routine or secondary content the same prominence as corrective work. These corrections reduce repeated decisions and make safe next actions clear without changing alert or Screen Effects runtime contracts.

## What Changes

- Distinguish text-only sample inspection, local draft preview, draft delivery tests, and saved delivery tests with accurate labels and destination summaries.
- Treat Landscape and Vertical as views of one shared unsaved alert document, while retaining explicit Save, Revert, and dirty-navigation safeguards.
- Consolidate alert configuration prerequisites into one compact Live readiness summary with a single ordered correction action.
- Put Home problems and incomplete setup ahead of completed setup, with completed steps in a collapsed native disclosure.
- Keep primary alert-row actions inline and place secondary actions in the existing More disclosure at every supported width.
- Preserve explicit review, enablement, activation, live-impact confirmation, and output-security behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `management-ui-ux`: Prioritize actionable Home content and collapse completed setup while retaining accessible correction paths and all readiness data.
- `alert-configuration-management`: Clarify sample/preview/test semantics, preserve a shared draft across profile switching, summarize live readiness, and simplify inventory actions.
- `screen-effects`: Name the saved-variant delivery test accurately and summarize its destinations without weakening live-output confirmation.

## Impact

The change is limited to existing React management pages, their CSS, stories, unit tests, Playwright workflows, UX documentation, and OpenSpec requirements. It adds no dependency, persistence migration, endpoint, output route, or live-runtime behavior.
