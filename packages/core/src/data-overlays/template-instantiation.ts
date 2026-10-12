import { dataIdSchema } from "./schemas.js";
import { DataOverlayError, type DataOverlayServiceOptions } from "./value-service.js";
import type { DataCanvasElement, DataOverlayState, DataValue, DataValueCreateInput } from "./types.js";
import type { DataTemplate, DataTemplateMapping } from "./template-schemas.js";

/** Called only inside the overlay catalog transaction; any failure discards all new resources. */
export function instantiateDataTemplateElements(template: DataTemplate, mappings: DataTemplateMapping[], state: DataOverlayState, options: DataOverlayServiceOptions): DataCanvasElement[] {
  const slots = new Map(template.slots.map(slot => [slot.id, slot])); const resolved = new Map<string, string>();
  if (mappings.length !== slots.size || new Set(mappings.map(mapping => mapping.slotId)).size !== slots.size || mappings.some(mapping => !slots.has(mapping.slotId))) throw new TypeError("Exactly one compatible mapping per template slot is required");
  const id = () => dataIdSchema.parse(options.generateId());
  const find = <T extends {id:string}>(items: T[], reference: string) => { const item = items.find(item => item.id === reference); if (!item) throw new DataOverlayError("NOT_FOUND", "Template mapping resource not found"); return item; };
  const name = (items: {name:string}[], candidate: string) => { if (items.some(item => item.name.trim().toLowerCase() === candidate.trim().toLowerCase())) throw new DataOverlayError("NAME_CONFLICT", "Data name is already in use"); };
  const createValue = (definition: DataValueCreateInput): DataValue => {
    name(state.values, definition.name); const now = options.now();
    const value: DataValue = { ...definition, id: id(), content: definition.resetDefault, revision: 0, createdAt: now, updatedAt: now } as DataValue;
    state.values.push(value); return value;
  };
  for (const {slotId, mapping} of mappings) {
    const slot = slots.get(slotId)!; let value: DataValue; let reference: string;
    if (slot.kind === "value") {
      if (mapping.kind !== "value" && mapping.kind !== "new-value") throw new TypeError("Value template slot requires a value mapping");
      value = mapping.kind === "value" ? find(state.values, mapping.valueId) : createValue(mapping.definition);
      if (value.kind !== slot.valueKind) throw new TypeError("Incompatible template value kind"); reference = value.id;
    } else {
      if (mapping.kind === "goal") { const goal = find(state.goals, mapping.goalId); value = find(state.values, goal.valueId); reference = goal.id; }
      else if (mapping.kind === "new-goal") {
        value = mapping.value.kind === "existing" ? find(state.values, mapping.value.valueId) : createValue(mapping.value.definition);
        if (value.kind !== "integer") throw new TypeError("Goals require integer values");
        if (value.source?.kind === "creator-goal") throw new DataOverlayError("SOURCE_READ_ONLY", "Creator Goal values require their native read-only goal");
        name(state.goals, mapping.goal.name); reference = id();
        state.goals.push(mapping.goal.mode === "fixed-target" ? { ...mapping.goal, id: reference, valueId: value.id } : { ...mapping.goal, id: reference, valueId: value.id, baseline: value.content });
      } else throw new TypeError("Goal template slot requires a goal mapping");
      if (value.kind !== "integer") throw new TypeError("Goals require integer values");
    }
    if (slot.requiredSource && (!value.source || value.source.invalidated || value.source.provider !== slot.requiredSource.provider || value.source.kind !== slot.requiredSource.kind || !options.isTemplateSourceReady?.(value))) throw new DataOverlayError("SOURCE_NOT_READY", "Configure or reconnect the matching Twitch source before mapping this slot");
    resolved.set(slotId, reference);
  }
  return [...template.elements].sort((a,b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((original,index) => {
    const element = structuredClone(original); element.id = id(); element.order = index;
    if (element.kind === "text" && element.binding) {
      if (element.binding.kind === "value") element.binding.valueId = resolved.get(element.binding.valueId)!;
      else element.binding.goalId = resolved.get(element.binding.goalId)!;
    } else if (element.kind === "progress") element.goalId = resolved.get(element.goalId)!;
    else if (element.kind === "image" && !options.resolveImageAsset?.(element.assetId)) {
      const { assetId, ...geometry } = element; return { ...geometry, kind: "missing-image" as const, sourceAssetId: assetId };
    }
    return element;
  });
}
