## Context

The focused shell hides overflow at viewport height. Screen Effects currently renders unbounded cards; Alerts uses a bounded workspace with scrolling side panels.

## Goals / Non-Goals

Match the Alerts presentation and keep all existing Screen Effects fields reachable. Preserve the document schema, playback, destinations and confirmations. Multi-layer composition and alert-set concepts are outside this change.

## Decisions

- Use a compact header and three-column workspace: variants, scaled silent visual canvas, inspector tabs for Variant, Effect and Triggers. Keep draft state above the tabs and implement arrow/Home/End keyboard navigation.
- Use independent panel scrolling on desktop; use a scrolling stacked workspace on narrow screens while retaining the header.
- Place collapsed browser sources above inventory, with configuration counts visible while collapsed. Use compact inventory rows and a More disclosure for copy/delete.
- Follow UX spec Alerts Module, Sets Page, Browser Sources, Alert Editor, and Cross-Cutting UX Rules. This is presentation of the approved post-MVP module.
- Keep existing typed APIs and reuse AssetPreview in compact muted mode for the canvas. Show geometry in the fixed 1920x1080 coordinate space. Existing explicit Preview and Test saved dialogs retain their contracts.

## Risks / Trade-offs

- Hidden controls can invalidate old tests: update interaction sequences to open their corresponding tab/disclosure, preserving all assertions.
- Short screens and long context errors can squeeze the workspace: bound notifications and allow workspace scrolling; verify at 1366x768 and smaller widths.
- Canvas is a silent layout view; animation playback remains in the existing preview workflow.
