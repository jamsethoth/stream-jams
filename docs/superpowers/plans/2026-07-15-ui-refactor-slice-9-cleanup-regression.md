# UI Refactor Slice 9: Cleanup And Regression Hardening

## Goal

Finish the management UI refactor by removing superseded management surfaces, proving correction/deep-link workflows, and recording an explicit implementation or backlog disposition for every approved high-fidelity concept.

## Scope

- Remove Dashboard, Twitch, legacy module setup, standalone overlay output, and management playback routes and panels.
- Remove the unused alert-form adapter passed through `App` and `ManagementApp`.
- Retain backend playback, Twitch, module, and output APIs because they remain runtime capabilities and future operator-UI inputs.
- Retain only frontend output-key operations used by the alert-set browser-source workflow.
- Make unknown and former `/legacy/*` routes resolve to Home.
- Add regression coverage for Home next actions, asset usage links, focused editor context, diagnostics correction links, and browser-source anchors.
- Add a board-by-board implementation audit and link it from the generated high-fidelity manifest.

## Test-First Changes

1. Route and shell tests assert that legacy route IDs and navigation are absent and former legacy URLs resolve to Home.
2. Management integration and Playwright tests assert the five required deep-link workflows preserve their context.
3. Storybook navigation contains only the approved management information architecture.
4. Full lint, typecheck, unit/integration, build, Storybook, and Playwright gates pass.

## Acceptance

- Primary management navigation is Home, Event sources, TTS providers, Modules > Alerts, Assets, Diagnostics, and Settings.
- No management-side live playback controls or legacy panels are reachable.
- Approved concept-board behavior is either implemented and covered or listed as a deliberate backlog item.
- Repo design artifacts remain reproducible and point to the implementation audit.
