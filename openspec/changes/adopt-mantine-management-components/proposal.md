## Why

The frontend audit found repeated control, tab, confirmation, feedback and module-section implementations that make behavior and appearance drift. After comparing isolated Assets prototypes, the user selected Mantine to reduce custom presentation code and make consistency easier to maintain.

## What Changes

- Adopt Mantine for shared management controls, accessible interaction widgets and theme presentation, keeping a small application-specific foundation inside `apps/web` and preserving the existing semantic token and theme-preference contract.
- Establish a common composed module-page structure for Alerts, Screen Effects, Timers and Music.
- Repair audit findings F1–F7: command feedback, tab semantics, pending confirmations, module controls, shared output rows, sections/disclosures and repeated basic controls.
- Migrate the production Assets workflow first, preserving all existing filters, media previews, usage links, validation and mutation safeguards. The sample prototype is a visual reference, not the production requirements.
- Extend migration through module pages, remaining management pages and management editors in independently verifiable slices; remove superseded presentation code after callers move.
- Document the component ownership, supported exceptions and verification requirements.

## Capabilities

### New Capabilities

- `management-component-consistency`: Shared management components, module presentation, accessible interactions and controlled incremental adoption.

### Modified Capabilities

None. Existing asset, module, security, persistence and feedback behavior remains authoritative; this change adds a shared presentation contract without changing those domain contracts.

## Impact

`apps/web` management UI, foundation, CSS, Storybook, frontend documentation and browser tests; exact Mantine core/hooks versions and workspace lockfile. Production APIs, schemas and stored configuration do not change. Management-only imports must remain out of Operator, browser-source overlays and private desktop renderers. Operator presentation is a separate scope, but its shared dependencies require compatibility checks during migration. No new UI package, class hierarchy or page-generation engine is needed.

Audit reference: `docs/audits/2026-10-05-frontend-component-consistency-audit.md`. Both isolated prototypes remain comparison artifacts rather than production implementation.
