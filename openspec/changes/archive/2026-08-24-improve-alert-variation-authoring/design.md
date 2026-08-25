## Context

The runtime already supports rule conditions, variation conditions, optional variation priority, positive weight, rule priority, and cooldown. Resolution filters matching variations, selects the highest priority group, and performs weighted selection within that group. The focused editor exposes the values but does not explain priority groups, relative weight, shared rule impact, or sample-dependent eligibility.

The condition evaluator already supports `equals`, `includes`, `min`, `max`, and numeric `range`. The normalized event catalog and UI field definitions determine which fields and operators are valid for each event type; raw metadata is intentionally excluded.

## Goals / Non-Goals

**Goals:**

- Make existing priority and weight semantics understandable without changing resolution behavior.
- Provide event-specific, operator-aware condition inputs and validation.
- Explain matching and weighted choice using the selected sample payload.
- Preserve provider-independent conditions and default fallback.

**Non-Goals:**

- Nested AND/OR groups, raw provider fields, actor targeting, bulk editing, historical simulation, or changing weighted random selection.

## Decisions

### Author priority as ordered groups

Variations are displayed in priority groups. Groups can move earlier or later; the save mapper normalizes group order to deterministic integer priorities. Variations in one group share a priority and remain weighted candidates. Moving a variation between groups changes priority; moving it within a group has no runtime meaning and is not offered. Unchanged group order and membership produce no priority assignments and preserve every stored integer exactly. After an explicit group order or membership change, every conditional sibling is normalized above the unchanged default priority and saved with the selected document in one atomic whole-rule update.

Alternative considered: assign every dragged row a unique priority. Rejected because it would make weights ineffective and misrepresent the current selector.

### Present weight as relative chance, not an absolute percentage

The editor labels the field `Relative chance`. For the selected sample, it calculates percentages only among enabled, condition-matching variations in the highest eligible priority group. If the sample does not make the group eligible, the UI reports that no meaningful percentage can be calculated.

Alternative considered: let users enter a percentage. Rejected because probabilities change whenever another eligible sibling or weight changes.

### Keep a typed condition catalog per event

Each field definition declares label, value kind, approved operators, bounds or options, and summary formatting. The inspector renders native numeric inputs, selects, checkboxes, or text inputs from this catalog and writes the existing `AlertCondition` contract. Range uses two ordered numeric values and cannot save when minimum exceeds maximum. The server boundary validates every new or modified condition against the same catalog. An unsupported saved condition can round-trip unchanged as a read-only, removable condition, but cannot be added, modified, or duplicated.

Alternative considered: build a generic query builder. Rejected because the approved scope is simple normalized event-specific conditions.

### Add a pure sample evaluation projection

A framework-independent evaluator returns rule-match status, eligible variations grouped by priority, calculated relative chances, fallback state, and validation explanations for the selected sample. Live resolution and explanation use one shared pure selection projection, while only live resolution consumes randomness for weighted choice. Explanation does not enqueue playback or consume provider data, and Preview and Send test continue targeting the selected alert document rather than running sibling selection.

Alternative considered: send every explanation request through the server. Rejected because samples and draft edits already exist locally and the logic can remain pure and shared.

### Preserve shared-versus-variation impact

Rule conditions, cooldown, and rule priority remain clearly labelled as affecting the default and all sibling variations. Variation conditions, priority group, and relative chance affect only the selected variation. Dirty-state and live-impact confirmation continue to guard saves.

## Risks / Trade-offs

- [Displayed probability is mistaken for a guarantee] -> Label it sample-specific and relative, and state that live selection remains random.
- [Priority normalization creates noisy diffs] -> Normalize only when group order changes and use stable deterministic values.
- [Catalog and evaluator disagree] -> Derive validation and summaries from one core field-definition contract and cover every event type.
- [Expanded controls overwhelm simple alerts] -> Hide variation-only controls for defaults and collapse rule-wide advanced fields behind the existing Event tab structure.

## Migration Plan

1. Complete and sync the normalized event and UI-refactor prerequisite changes.
2. Add core condition-field definitions, sample evaluation results, and deterministic priority-group mapping tests.
3. Add the focused read-only `GET /management/alerts/:alertId/editor/variation-context` endpoint for sibling variation state without expanding the general alert-set inventory or editor-document response.
4. Replace raw fields with grouped priority, relative chance, typed inputs, and summaries.
5. Existing numeric priorities and weights require no database migration. Unchanged group order and membership preserve every stored priority exactly; only an explicit group order or membership change normalizes every conditional sibling above the unchanged default priority in one atomic whole-rule update.
6. Roll back to numeric fields without altering stored matching semantics.

## Open Questions

None.
