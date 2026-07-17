## Context

The current management application keeps ten product areas behind component-local tab state in `ManagementApp.tsx`. Existing APIs already expose alerts, assets, overlay outputs, diagnostics, Twitch state, TTS tests, playback, and settings, but their view models do not represent the approved setup readiness, provider activation impact, alert-set/editor, asset-usage, diagnostics, or backup workflows.

This change implements the approved baseline recorded in:

- `docs/design/ui-refactor-mvp-ux-spec.md` (implementation-facing UX source)
- `docs/design/ui-refactor-decisions.md` (decision history and backlog)
- `docs/design/penpot-current-state.md` and `docs/design/penpot-current-state.json` (Penpot inventory and source mapping)
- `docs/design/hifi-concept-boards/review-guide.md` and `docs/design/hifi-concept-boards/manifest.json` (approved screen states)
- `docs/design/ui-refactor-implementation-plan.md` (slice order and acceptance gates)

OpenSpec requirements are normative for implementation behavior. The UX spec supplies the complete interaction detail, and the Penpot boards supply visual intent where they do not conflict with the requirements or current security model.

## Goals / Non-Goals

**Goals:**

- Rebuild management as a setup and configuration product with stable routes and deep links.
- Define truthful domain/API contracts before screens consume them.
- Preserve existing management authorization, overlay authorization, route-key, asset, playback, and logging boundaries.
- Implement alert sets, two fixed target profiles, a focused canvas editor, provider setup, asset management, diagnostics, and backup/restore in reviewable slices.
- Make failures visible, actionable, accessible, and traceable.

**Non-Goals:**

- Implementing the live operator console or moving live moderation into management.
- Adding OBS integration, LAN overlay mode, cloud sync, Electron packaging, multiple active providers, multiple active alert sets, custom target profiles, bulk operations, or timeline/keyframe editing.
- Adopting a router library, Tailwind, MUI, Carbon React, or another primary component framework at the start.
- Replacing the existing overlay route-key or normalized playback pipelines.

## Decisions

### Build contracts before dependent screens

New schemas and pure domain rules live in `packages/core`; persistence and provider details stay behind server services/repositories; Fastify handlers map validated requests and responses; React consumes typed management-client views. Existing API clients are extended instead of adding a parallel transport layer.

Alternative considered: build screens against temporary mocks and retrofit APIs later. Rejected because readiness, activation impact, asset usage, output state, and restore safety cannot be represented honestly by current view models.

### Use a small local route model first

Management paths and search parameters use `window.history`, stable IDs, and one route parser/formatter. A single dirty-state blocker owns navigation interception. A router dependency is added only if nested matching, blocking, or test complexity becomes measurably worse than the local model.

Alternative considered: adopt a router immediately. Rejected because the approved MVP route set is small and the repository has no router dependency to reuse.

### Migrate screens through temporary route adapters

The shell lands before every replacement page. Existing panels may remain reachable behind explicit adapter routes until their replacement slice is complete, then old top-level navigation and adapters are removed in Slice 9.

Alternative considered: replace every screen in one cutover. Rejected because it creates an unreviewable regression surface and prevents backend contracts from landing first.

### Keep local components and tokenized CSS

Stream Jams keeps local production components, CSS variables, System/Dark/Light themes, and comfortable default density. Accessible primitives may be adopted individually when native controls cannot meet dialog, menu, tabs, popover, select, slider, tooltip, sheet, or switch behavior without custom complexity.

Alternative considered: adopt MUI, Carbon React, or Tailwind for the refactor. Rejected to avoid dependency and styling migration before local needs prove it useful.

### Separate persistence from runtime activation

Provider settings, alert-set edits, alert-editor documents, asset changes, route-key regeneration, and restore require explicit actions. Low-risk view preferences may persist automatically. Provider `Save` and `Set active`, and alert-set `Save` and `Activate set`, remain distinct commands with impact checks.

Event-source lists expose saved activation as `Usage` and transient runtime evidence as `Live status`. Setup is complete before registration, so list rows do not repeat a setup-ready state. Inactive sources report `Not running`; active sources report `Starting`, `Healthy`, `Reconnecting`, or `Error` from the actual provider runtime.

An event-source runtime failure is projected into the selected provider view as transient actionable evidence rather than persisted setup state. The existing management error banner shows the runtime message, next step, occurrence time, and reference ID when available, with a correction link to the Diagnostics workspace filtered by that reference. The table retains only the `Error` status so it remains scannable; selecting the row exposes the complete failure in the right detail panel.

### Model alerts independently from registered provider instances

Alert rules match canonical event type plus explicit conditions. Provider catalog context supplies authoring fields and sample payloads without becoming an implicit runtime eligibility condition. Any number of provider registrations may exist per capability, but only one is active in MVP. Alert sets use stable IDs and exactly one active set. Two fixed target profiles, landscape and vertical, store independent layout while sharing alert content where defined.

### Reuse output authorization and playback paths

Browser-source outputs remain module/profile scoped and use existing overlay route-key authorization. Management masks keys by default and exposes reveal/copy/regenerate actions through authorized APIs. Editor Preview is local and always available; Send test uses the normalized playback/output path and requires a connected target.

### Keep assets globally referenced by ID

The library owns file metadata, health, tags, and usage summaries. Editor pickers select or register the same global assets without copying paths or files into alert documents. Replacement keeps asset identity and reports compatibility/usage impact.

### Derive diagnostics from sanitized operational data

Problems, normalized Events, and Raw logs are views over redacted runtime evidence. Reference IDs and correction targets are carried through typed records. Display, copy, and export never bypass existing redaction or expose raw provider payloads, credentials, or route keys.

### Treat backup/restore as a validated transaction

Export writes a versioned manifest, configuration, assets, checksums, and non-secret provider metadata. Restore validates before mutation, blocks during live intake/playback, creates a safety backup, applies through repository/service boundaries, and regenerates route keys by default.

### Verify each slice at its behavioral boundary

Core/server changes receive schema, service, repository, and route tests. Browser-visible changes receive production-component Storybook states and Testing Library/Playwright coverage where applicable. Each slice runs its acceptance gates before its commit/PR checkpoint.

## Risks / Trade-offs

- [Local route model grows beyond MVP needs] -> Keep parsing/formatting centralized and adopt an established router only when tests or nesting show a concrete need.
- [Adapters temporarily expose old and new concepts] -> Make adapters explicit, test reachability, and delete them in Slice 9.
- [Alert-set migration can invalidate existing data] -> Add deterministic migrations, schema validation, and rollback-compatible backups before changing persistence.
- [Active provider or set changes interrupt live output] -> Keep activation separate from save and require impact summaries, blockers, and warnings.
- [Canvas interactions are inaccessible or fragile] -> Provide exact inspector controls, keyboard paths, stable geometry tests, and a desktop-required message on narrow screens.
- [Diagnostics or exports leak secrets] -> Reuse allowlisted redaction, test sensitive-field fixtures, and never render raw provider payloads.
- [Restore causes data loss] -> Validate first, block active runtime, create a safety backup, use transactions, and fail without partial replacement.
- [The design artifacts drift from implementation] -> Keep repo specs normative, update manifests/review docs with intentional UX changes, and audit all approved boards in Slice 9.

## Migration Plan

1. Land this OpenSpec baseline without production changes.
2. Add domain schemas, view models, mappings, repositories, and APIs required by the new UX.
3. Introduce the route-aware shell and shared interaction primitives while keeping temporary adapters.
4. Replace Home and provider setup, then alert sets/outputs, assets, focused editor, diagnostics, and settings/backup in that dependency order.
5. Remove obsolete top-level management surfaces and adapters after replacement workflows and deep links pass regression coverage.
6. Roll back any incomplete slice by reverting that slice's commit; persistence-changing slices must include migration rollback or restore guidance before merge.

## Open Questions

None. Deferred capabilities remain in the documented backlog and require separate OpenSpec changes.
