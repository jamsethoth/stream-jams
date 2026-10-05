## Context

The integrated management UI already owns all affected forms, typed clients, saved alert documents, reward catalog access, and validation boundaries. The remaining work is mostly presentation, except Home needs a narrow server-computed view of enabled alert configuration because the browser cannot safely infer rule and variant semantics from inventory rows.

The applicable MVP UX sections are Management UI, Home, Settings, Alert Sets, Asset Library, Integrations, accessibility, responsive behavior, validation, and failure recovery. This remains MVP management configuration; provider connectivity, browser-source connectivity, successful delivery, physical-device acceptance, and operator behavior stay outside the result.

## Goals / Non-Goals

**Goals:**

- Reduce Settings length while preserving every existing save and safety boundary.
- Replace technical display text with readable labels while retaining wire values and identifiers.
- Explain normalized Browser Speech values without changing payloads.
- Tell users when enabled alert configuration needs review, separately from setup completion.
- Exercise production components in an isolated served runtime at desktop and 390px widths.

**Non-Goals:**

- No persistence migration, readiness engine, matching change, queue change, auto-save, auto-enable, provider call, device output, or live-delivery claim.
- No change to fixed profile definitions, route selection, validation meaning, or profile review semantics.

## Decisions

### Native disclosures preserve mounted form state

Settings uses `details` and `summary` around existing mounted controls. Visible summaries report useful counts or state, and errors remain visible or force their containing disclosure open. A hash deep link opens backup and restore. This keeps browser keyboard behavior and avoids new stateful disclosure components.

### Restore actions remain downstream of successful preflight

File selection, preflight action, and any blocker remain available. Confirmation and regeneration controls render only for a successful, valid preflight. Existing confirmation and RESTORE safeguards remain unchanged.

### Presentation helpers do not alter identifiers

Known event and module values use existing catalog labels; unknown values normalize delimiters for display only. Reward conditions resolve from the existing typed catalog once per page. Missing or unavailable titles show `Unavailable reward` with the stored ID as secondary diagnostic text.

### Home configuration attention is server-computed and conservative

The existing management summary gains a narrow read-only alert-configuration section. The service reads the active set inventory and each saved alert editor document through existing methods, evaluates every enabled default or variation row, and evaluates only intended visual profiles. The active overview's zero-enabled-rules boundary preserves the legacy disabled-set case without treating a disabled default row as proof that all child variations are disabled. Device-only routes are not marked broken for lacking visual profiles. Missing documents, read failures, or ambiguous route readiness produce attention or unavailable status rather than an all-clear. The UI only presents the typed result and editor links.

### Acceptance uses a disposable runtime

Playwright starts the built app with an explicit temporary home/config root, isolated secrets and environment, and an available non-production port. Setup failure stops the suite; it never falls back to the user profile or port 39187. Provider boundaries remain mocked and documented.

## Risks / Trade-offs

- [A collapsed section could hide attention] → Keep meaningful summaries visible and open a section when it contains an error or deep-link target.
- [Rule enablement can be mistaken for default-variant enablement] → Use each inventory row's own enabled state and preserve enabled child variations even when the default row is disabled; use the active overview only for its existing zero-enabled-rules boundary.
- [Unused profiles can create false warnings] → Evaluate enabled intended profiles and actual visual needs instead of the inventory aggregate review flag.
- [Route intent can be unclear] → Return review-needed or unavailable rather than inventing successful configuration.
- [Reward catalog access can fail] → Keep stored IDs visible as secondary details and never rewrite conditions.

## Migration Plan

No data migration is required. Ship contract, service, frontend, tests, and verification together; rollback is a normal code revert.

## Open Questions

None.
