# Data overlays: latest main reconciliation

PR [#182](https://github.com/jamsethoth/stream-jams/pull/182) incorporates main `a7ae402d7598ca36b965e2b55389e1feca071f6b` into `codex/data-overlays-implementation`. This supersedes the conflict status in the earlier [live Creator Goals delivery](live-creator-goals.md).

## Reconciliation

- Data exposes Landscape and Vertical live browser sources and an explicit private desktop capability. Main's retired public test/unified sources remain retired, including asset access. Selection uses the trusted recipient kind.
- Data revision guards and snapshot subscription tickets coexist with main's output canvas/runtime guards. Backup restore retains recipient retirement and provider suspension.
- Data migrations follow main as `048-custom-data-overlays` and `049-data-overlay-templates`. Schema versions count migrations: main is 46; Data and templates are 47 and 48. An exact known pre-merge Data migration history is reconciled transactionally without recreating its tables. Tests preserve values, goals, pins and timestamps, verify idempotence, and prove rollback on failure. Unknown histories still fail closed.
- Legacy main backups through schema 46 work without Data tables. Data tables are required from schema 47 and templates from 48.
- Measured merged gzip sizes are 150.58 KiB for Overlay and 188.11 KiB for Operator. Budgets are 151.75 and 189.25 KiB; existing import-graph isolation checks remain enforced.
- Main's native code-scanning workflow and desktop quit fix are retained. The deleted custom CodeQL gate is not recreated.

## Verification

Verification uses disposable databases, profiles and provider fixtures; no normal profile or real credentials are changed.

- Full lint/error provenance, strict typecheck, workspace build and static Storybook build pass. Final changed test files are checked again.
- Full unit run: 4,163 passed, one obsolete Data renderer expectation failed. That expectation was corrected; the affected routes, migration and backup rerun passes 81 tests. Expanded legacy backup coverage then passes 75 tests, including six additional main schema versions. The failed full run is not reported as green.
- Repository script tests: 125 pass, one existing Windows platform exclusion.
- Focused rebuilt browser workflows: all 21 pass after correcting three pre-Data expectations; the six corrected output/restore cases pass together. Data editing, Operator changes, browser/private renderer parity, templates, live Creator Goals, retirement and restore run against the rebuilt application.
- Packaged Windows lifecycle: all five tests pass, including the previously failing pending-dialog quit case.
- Strict OpenSpec validation: 63 items pass.
- One GPT-6.1-sol low review finds no actionable merge interoperability issues. Parent verifies the findings and test results.

Static Storybook interaction gate: all 502 scenarios across 54 suites pass. The full browser run against the production preview passes 158 of 166 cases; eight cases require Vite source-module URLs or source interception and fail on that server type. Their six files are rerun on the intended development server: all 18 cases pass, including every failed case. All 166 browser cases therefore have passing evidence across these runs; the original full run is not reported as green.

Initial native tests started before packaging finished and failed to launch; they were rerun after successful packaging. An initial full browser attempt omitted its required preview server and was stopped, then restarted with the rebuilt loopback preview and the repository's single-worker setting. Those environment failures are not passing evidence. Scratch logs remain under `.superpowers/sdd/2026-10-08-data-overlays/main-merge-*`.

## Acceptance limits

Real Twitch, physical OBS and desktop/game acceptance remain unperformed. Automated native lifecycle checks do not establish hardware acceptance. Custom Data event-rule authoring and Streamer.bot global adapters remain separate work. The PR remains a draft; fresh remote CI must be assessed for the pushed head.
