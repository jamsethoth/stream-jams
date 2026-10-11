# Triage vocabulary

Use these default terms as local metadata; no remote labels are required.

| Role | Term |
| --- | --- |
| Needs initial assessment | needs-triage |
| Needs clarification or evidence | needs-info |
| Ready for agent execution | ready-for-agent |
| Requires human work or a decision | ready-for-human |
| Declined | wontfix |

These terms do not replace backlog Status or Priority.

`ready-for-agent` does not grant permission or override repository gates.
For implementation, it requires an apply-ready OpenSpec change.

Record declined product outcomes using the backlog's existing
`Not planned` convention, with rationale linked where useful.
