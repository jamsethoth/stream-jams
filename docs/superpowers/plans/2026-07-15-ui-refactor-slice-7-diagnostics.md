# Slice 7: Diagnostics Workspace

## Goal

Replace the legacy diagnostics grid with the approved Problems, Events, and Raw logs workflow while preserving bounded, redacted support exports.

## Backend

- Extend the typed diagnostics workspace contract with problem ownership, event detail, raw-log messages, and correction targets.
- Map existing event, match, playback, provider-status, and runtime-log evidence through `DiagnosticsService` into a redacted management workspace.
- Keep the existing bounded diagnostics and debug export routes as the support-bundle boundary.
- Preserve reference IDs and correction routes without exposing credentials, tokens, route keys, authorization fields, or raw provider payloads.

## Frontend

- Build Problems, Events, and Raw logs tabs with shared reference-ID search and session-only filters/sort.
- Use a two-pane list/detail workspace with grouped problem severity and owning area.
- Add correction deep links for providers, alerts, assets, outputs, and settings while preserving the diagnostic reference in the URL.
- Add sanitized copy and explicit export success/failure feedback with human-readable recovery guidance.

## Verification

- Core contract and redaction tests.
- Diagnostics service, route, and management client tests.
- Component tests for search, filtering, sorting, selection, deep links, copy, empty states, and export failure.
- Storybook states for active/no problems, event detail, raw-log detail, and export failure.
- Playwright coverage for diagnostics navigation and preserved correction context.
- Repository lint, typecheck, unit, build, Storybook, Playwright, OpenSpec validation, and CodeGraph sync.
