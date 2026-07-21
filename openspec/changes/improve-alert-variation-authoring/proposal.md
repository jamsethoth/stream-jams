## Why

Stream Jams can persist conditional variations, weights, priorities, cooldowns, and rule priority, but the focused editor exposes those semantics as isolated fields without clearly explaining evaluation order, relative chance, or conflicts. The runtime model is capable; the authoring experience needs to make its outcome predictable.

## What Changes

- Add direct variation reordering that maps to deterministic saved priority without requiring users to manage raw priority numbers.
- Present weight as relative chance and show the effective probability among currently eligible same-priority variations for the selected sample payload.
- Replace generic value entry with event-specific controls for the normalized condition fields and operators already supported by the alert runtime.
- Show readable condition summaries, shared rule-impact copy, validation for impossible or incomplete ranges, and sample-driven explanations of which variation would win.
- Preserve default-alert fallback and weighted random selection semantics across live, test, and preview paths.
- Keep generic nested AND/OR groups, raw provider metadata, actor-specific targeting, bulk multi-select editing, and a general simulation engine out of this change.
- Require `refactor-management-ui-ux`, `improve-management-ui-ux-audit-followups`, and `add-normalized-twitch-event-types` to be complete and present on `origin/main` before implementation begins.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `alert-configuration-management`: Variation priority, relative chance, normalized conditions, validation, and sample-driven match explanations become understandable and directly authorable without changing provider-independent matching semantics.

## Impact

- Extends alert-management projections and condition validation where the current contracts do not expose enough information for honest summaries.
- Updates the focused editor's Event inspector, variation list controls, local sample evaluation, stories, component tests, and end-to-end authoring coverage.
- Reuses the current rule/variant persistence, normalized event catalog, weighted selector, cooldown, Send test, and playback paths.
