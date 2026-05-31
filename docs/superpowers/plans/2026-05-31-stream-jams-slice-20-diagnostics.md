# Slice 20: Diagnostics And Redacted Export

**Goal:** Add management-facing diagnostics views and a redacted export endpoint for event ingestion, alert matching, playback, and provider errors without exposing secrets.

**Base requirements:** `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` Slice 20.

## Scope

In scope:

- Add a diagnostics service that reads existing SQLite diagnostics logs and produces management-safe view models.
- Add management-protected HTTP routes for diagnostics summary data and redacted export data.
- Add a management UI tab with filters and tables for event ingestion logs, alert match logs, playback logs, and provider errors.
- Use the existing redactor for export payloads and sensitive message fields.
- Add unit and route tests for redaction, authorization, limit parsing, and exported diagnostics.

Out of scope:

- Adding a new persistent provider-error table. Provider errors are derived from failed event logs and provider status snapshots for this slice.
- Reading hourly structured log files back into the UI.
- Adding downloadable files, compression, or support-bundle packaging beyond a JSON export payload.
- Changing retention policy or log rollover behavior.

## Sub-Slice 20.1: Diagnostics Service

**Objective:** Create `apps/server/src/modules/diagnostics/diagnostics-service.ts` to aggregate repository logs, derive provider-error rows, apply limit defaults, and redact export payloads.

**Expected behavior:**

- Event log rows expose event id, provider id, event type, actor display name, status, timestamps, correlation id, processing id, and redacted error messages.
- Alert match and playback rows expose their existing diagnostic fields.
- Provider errors include failed event logs and optional provider status sources with redacted messages.
- Export output includes generated timestamp, all diagnostics sections, and redacted nested event metadata.

- [ ] Complete.

## Sub-Slice 20.2: Diagnostics Routes

**Objective:** Add `apps/server/src/http/routes/diagnostics.ts` and wire it through `createServerApp` and `index.ts`.

**Expected behavior:**

- `GET /diagnostics?limit=...` returns management-safe diagnostics view data.
- `GET /diagnostics/export?limit=...` returns redacted export JSON.
- Routes require management session authorization and rate limiting.
- Invalid limits return a controlled 400 response.

- [ ] Complete.

## Sub-Slice 20.3: Management UI

**Objective:** Add `apps/web/src/management/diagnostics/DiagnosticsPanel.tsx`, extend `ManagementApi`, and add a Diagnostics navigation tab.

**Expected behavior:**

- The Diagnostics tab loads event ingestion, alert match, playback, and provider error sections.
- A limit filter reloads diagnostics.
- The export action fetches redacted export data and shows a generated timestamp and section counts.
- Empty and error states are visible.

- [ ] Complete.

## Test Plan

- Unit test diagnostics service redaction with representative sensitive data in event metadata, error messages, playback messages, and provider status messages.
- Route-test diagnostics authorization, limit parsing, diagnostics listing, and redacted export output.
- Component-test the Diagnostics tab rendering, limit reload, and export action.
- Run local Playwright validation; document the known local Chromium `libnspr4.so` blocker if it reproduces before app assertions.

## Reconciliation Checklist

- [ ] Add event ingestion log view.
- [ ] Add alert match log view.
- [ ] Add playback log view.
- [ ] Add provider error log view.
- [ ] Add redacted diagnostic export endpoint.
- [ ] Add management UI for diagnostics filters.
- [ ] Unit test redacted exports with representative sensitive data.
- [ ] Integration test diagnostics endpoints.
- [ ] Commit with message `feat: add diagnostics`.

## Final Validation

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e`
- [ ] `pnpm build`
- [ ] `git diff --check`
