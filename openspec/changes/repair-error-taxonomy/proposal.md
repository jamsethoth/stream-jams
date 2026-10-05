## Why

The error-class audit found a duplicated Screen Effects constructor that can turn expected missing-resource failures into generic 500 responses, 24 custom errors that serialize with the generic type `Error`, and repeated envelope/classification mechanics. Repair those contracts without erasing typed payloads, causes, safe operator responses or module ownership.

## What Changes

- Unify the Screen Effects missing-definition error and explicitly map admission-time missing variants.
- Introduce minimal shared name/cause mechanics and a server-only safe HTTP envelope; migrate the affected existing classes while retaining their constructor signatures and identities.
- Initialize stable names for all 24 affected errors and enforce that contract for future declarations.
- Consolidate three payload-free subscription leaves into one code-discriminated family, preserving existing codes, messages and serialized names.
- Replace first-party message/name-driven classification in the audited boundaries with explicit module-owned outcomes/codes. Document narrow third-party compatibility adapters where no stable library code exists.
- Add regression coverage for interleaved mutation, serialization, safe mappings and unknown failures; retain single-owner diagnostics.

## Capabilities

### New Capabilities
- `application-error-contracts`: Stable custom error identity, minimal shared foundations, unique domain constructors, code-based module boundaries and compatibility-preserving consolidation.

### Modified Capabilities
None. Existing error-provenance, Screen Effects, security and operator-control requirements remain authoritative; this change repairs their implementation and adds an explicit error contract rather than rewriting those capabilities.

## Impact

Touches core error primitives and affected classes, server error families/routes/provider adapters, tests, error-construction checks and engineering documentation. No new dependencies, persistence migration, credential changes, UI redesign, or scheduler changes. Existing external API codes/statuses/payloads remain stable except the audited incorrect generic-500 paths, which receive their existing domain responses. Corrected diagnostic names and new internal discriminant codes are intentional diagnostic changes. Planning only in this turn; no implementation or publication is authorized here.
