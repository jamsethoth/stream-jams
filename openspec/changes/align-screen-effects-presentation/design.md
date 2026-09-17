## Context

The focused shell hides overflow at viewport height. Screen Effects currently renders unbounded cards; Alerts uses a bounded workspace with scrolling side panels.

## Goals / Non-Goals

Match the Alerts presentation and keep all existing Screen Effects fields reachable. Preserve playback, destinations and confirmations while replacing the default-versus-weighted variant distinction with one weighted model. Multi-layer composition remains outside this change.

## Decisions

- Use a compact header and three-column workspace: variants, scaled local preview canvas, inspector tabs for Variant, Effect and Triggers. Keep draft state above the tabs and implement arrow/Home/End keyboard navigation.
- Use independent panel scrolling on desktop; use a scrolling stacked workspace on narrow screens while retaining the header.
- Place collapsed browser sources above inventory, with configuration counts visible while collapsed. Use compact inventory rows and a More disclosure for copy/delete.
- Follow UX spec Alerts Module, Sets Page, Browser Sources, Alert Editor, and Cross-Cutting UX Rules. This is presentation of the approved post-MVP module.
- Preview the selected draft in the fixed 1920x1080 canvas with local audio and Play, Stop and Mute controls. Keep Test saved as the explicit confirmed live action.
- Treat every enabled Screen Effect variant as a member of one weighted selection pool. Keep `Default` as an editable starter name only, show calculated chances, and simulate 1,000 local selections through the same core selector without persistence or live delivery.
- Keep the migration 022 `kind` column and stored JSON field as a repository-only compatibility detail. Current domain and management contracts omit `kind`, while saved rows use the neutral legacy value `weighted`.

## Risks / Trade-offs

- Hidden controls can invalidate old tests: update interaction sequences to open their corresponding tab/disclosure, preserving all assertions.
- Short screens and long context errors can squeeze the workspace: bound notifications and allow workspace scrolling; verify at 1366x768 and smaller widths.
- Local simulation is statistical and may vary between runs; show both expected and observed percentages and always total exactly 1,000 selections.
