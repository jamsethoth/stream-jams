# Issue tracker: Local backlog

`docs/backlog.md` is the canonical tracker for deferred, planned, and
intentionally rejected Stream Jams product work.

## Conventions

- Read `docs/backlog.md` and relevant linked documents before adding work.
- Follow its existing maintenance rules, columns, IDs, and status values.
- Add one row per product outcome; link detailed notes rather than
  duplicating them.
- Keep implementation proposals, specs, and tasks in OpenSpec.
- Use `Planned` only when an apply-ready OpenSpec change exists.
- Remove completed rows only after implementation, spec sync, and
  required acceptance are complete.
- Do not create GitHub issues or a parallel `.scratch/` tracker unless
  the user requests it.

## When a skill says "publish to the issue tracker"

Add or update the relevant backlog row. Link supporting detail or the
OpenSpec change.

## When a skill says "fetch the relevant ticket"

Find the backlog ID, read its row, and follow its linked detail and
OpenSpec change.

## Triage metadata

When triage is needed, record its term in linked supporting notes or the
issue description. Keep triage metadata separate from backlog Status:
triage readiness does not imply an apply-ready OpenSpec change.

Do not add triage columns or metadata to every existing backlog item
solely for setup.

## Pull requests as a triage surface

PRs as a request surface: no.
