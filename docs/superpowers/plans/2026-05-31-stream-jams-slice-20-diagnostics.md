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

- [x] Complete.

## Sub-Slice 20.2: Diagnostics Routes

**Objective:** Add `apps/server/src/http/routes/diagnostics.ts` and wire it through `createServerApp` and `index.ts`.

**Expected behavior:**

- `GET /diagnostics?limit=...` returns management-safe diagnostics view data.
- `GET /diagnostics/export?limit=...` returns redacted export JSON.
- Routes require management session authorization and rate limiting.
- Invalid limits return a controlled 400 response.

- [x] Complete.

## Sub-Slice 20.3: Management UI

**Objective:** Add `apps/web/src/management/diagnostics/DiagnosticsPanel.tsx`, extend `ManagementApi`, and add a Diagnostics navigation tab.

**Expected behavior:**

- The Diagnostics tab loads event ingestion, alert match, playback, and provider error sections.
- A limit filter reloads diagnostics.
- The export action fetches redacted export data and shows a generated timestamp and section counts.
- Empty and error states are visible.

- [x] Complete.

## Test Plan

- Unit test diagnostics service redaction with representative sensitive data in event metadata, error messages, playback messages, and provider status messages.
- Route-test diagnostics authorization, limit parsing, diagnostics listing, and redacted export output.
- Component-test the Diagnostics tab rendering, limit reload, and export action.
- Run local Playwright validation; document the known local Chromium `libnspr4.so` blocker if it reproduces before app assertions.

## Reconciliation Checklist

- [x] Add event ingestion log view.
- [x] Add alert match log view.
- [x] Add playback log view.
- [x] Add provider error log view.
- [x] Add redacted diagnostic export endpoint.
- [x] Add management UI for diagnostics filters.
- [x] Unit test redacted exports with representative sensitive data.
- [x] Integration test diagnostics endpoints.
- [x] Commit with message `feat: add diagnostics`.

## Final Validation

- [x] `pnpm lint` - passed.
- [x] `pnpm typecheck` - passed.
- [x] `pnpm test` - passed: 79 files, 303 tests.
- [x] `pnpm test:e2e` - attempted; local Chromium failed before app assertions because `libnspr4.so` is missing from the Playwright runtime.
- [x] `pnpm build` - passed.
- [x] `git diff --check` - passed.

## Verification Evidence

- Focused: `pnpm test:unit apps/server/src/modules/diagnostics/diagnostics-service.test.ts apps/server/src/http/routes/diagnostics.test.ts apps/server/src/app.test.ts apps/web/src/management/diagnostics/DiagnosticsPanel.test.tsx apps/web/src/management/management-api.test.ts apps/web/src/management/ManagementApp.test.tsx apps/web/src/App.test.tsx` - passed: 6 files, 26 tests.
- Full suite: `pnpm test` - passed: 79 files, 303 tests.
- E2E blocker: both Chromium specs fail at browser launch with `error while loading shared libraries: libnspr4.so: cannot open shared object file`; no application assertions ran.
- Review refinement: read-only explorer review flagged export atomicity, UI unmount guards, strict limit parsing, and route/app guard coverage; these were addressed before final validation.
