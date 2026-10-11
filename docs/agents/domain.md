# Domain docs

Stream Jams uses a single-context domain documentation layout:

- `GLOSSARY.md` at the repository root for shared domain vocabulary.
- `docs/adr/` for Architecture Decision Records.

## Before exploring

Read the glossary if it exists and ADRs relevant to the requested area.
If either is absent, proceed silently. Create domain documentation only
when terms or decisions are actually resolved.

Continue following `AGENTS.md` context routing and canonical OpenSpec
specifications. Domain docs supplement those sources.

## Vocabulary

Use glossary terms consistently in proposals, tickets, code, and tests.
When a term is missing, first check existing source and canonical specs
before introducing new terminology.

## Decisions

ADRs record an architectural choice, its context, rationale, and
consequences. Keep each record focused on one decision.

If proposed work conflicts with an existing ADR, identify the conflict
explicitly. Do not silently override it.
