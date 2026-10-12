import { dataIdSchema } from "./schemas.js";
import { bundledDataTemplates } from "./template-starters.js";
import { dataTemplateCatalogSchema, dataTemplateSaveInputSchema, dataTemplateSchema, type DataTemplate, type DataTemplateCatalog, type DataTemplateSaveInput, type DataTemplateSlot, type DataTemplateInstantiateInput, type DataTemplateInsertInput } from "./template-schemas.js";
import { DataOverlayError, type DataOverlayService } from "./value-service.js";

export interface DataTemplateRepository { read(): DataTemplate[]; mutate(work: (draft: DataTemplate[]) => void): DataTemplate[] }
export interface DataTemplateServiceOptions { generateId(): string; runMutation?<T>(work: () => T): T }
export class DataTemplateService {
  constructor(private readonly repository: DataTemplateRepository, private readonly overlays: DataOverlayService, private readonly options: DataTemplateServiceOptions) {}
  getCatalog(): DataTemplateCatalog { return dataTemplateCatalogSchema.parse({ templates: [...structuredClone(bundledDataTemplates), ...this.repository.read()] }); }
  private find(id: string): DataTemplate { dataIdSchema.parse(id); const template = this.getCatalog().templates.find(t => t.id === id); if (!template) throw new DataOverlayError("NOT_FOUND", "Data template not found"); return template; }
  private snapshot(input: DataTemplateSaveInput, id: string): DataTemplate {
    const definition = dataTemplateSaveInputSchema.parse(input); const state = this.overlays.getState();
    const canvas = state.canvases.find(c => c.id === definition.canvasId); if (!canvas) throw new DataOverlayError("NOT_FOUND", "Source canvas not found");
    const selected = definition.elementIds ? new Set(definition.elementIds) : null;
    const elements = structuredClone(canvas.elements.filter(e => !selected || selected.has(e.id)));
    if (selected && selected.size !== elements.length) throw new DataOverlayError("NOT_FOUND", "Selected canvas element not found");
    const x = selected ? Math.min(...elements.map(e => e.x)) : 0; const y = selected ? Math.min(...elements.map(e => e.y)) : 0;
    const slots: DataTemplateSlot[] = []; const refs = new Map<string, string>();
    for (const [index, element] of elements.entries()) {
      element.id = `element-${index + 1}`; element.x -= x; element.y -= y;
      const binding = element.kind === "text" ? element.binding : element.kind === "progress" ? { kind: "goal" as const, goalId: element.goalId } : null;
      if (!binding) continue;
      const reference = binding.kind === "value" ? binding.valueId : binding.goalId; const key = `${binding.kind}:${reference}`;
      let slotId = refs.get(key);
      if (!slotId) {
        slotId = `slot-${slots.length + 1}`; refs.set(key, slotId);
        const goal = binding.kind === "goal" ? state.goals.find(g => g.id === reference) : undefined;
        const value = state.values.find(v => v.id === (goal?.valueId ?? reference));
        if (!value || (binding.kind === "goal" && !goal)) throw new TypeError("Template source binding is invalid");
        const required = value.source ? { requiredSource: { provider: value.source.provider, kind: value.source.kind } } : {};
        slots.push(binding.kind === "goal" ? { id: slotId, name: goal!.name, kind: "goal", ...required } : { id: slotId, name: value.name, kind: "value", valueKind: value.kind, ...required });
      }
      if (element.kind === "text") { element.binding = binding.kind === "value" ? { kind: "value", valueId: slotId } : { kind: "goal", goalId: slotId, field: element.binding!.kind === "goal" ? element.binding!.field : "current" }; element.literalText = ""; }
      else if (element.kind === "progress") element.goalId = slotId;
    }
    return dataTemplateSchema.parse({ id, origin: "user", schemaVersion: 1, name: definition.name, targetProfileId: canvas.targetProfileId, slots, elements });
  }
  private change(work: (templates: DataTemplate[]) => void): DataTemplateCatalog {
    const commit = () => this.repository.mutate(templates => { work(templates); dataTemplateCatalogSchema.parse({ templates: [...bundledDataTemplates, ...templates] }); });
    if (this.options.runMutation) this.options.runMutation(commit); else commit();
    return this.getCatalog();
  }
  save(input: DataTemplateSaveInput): DataTemplateCatalog { return this.change(templates => { const template = this.snapshot(input, dataIdSchema.parse(this.options.generateId())); if (templates.some(t => t.name.trim().toLowerCase() === template.name.trim().toLowerCase())) throw new DataOverlayError("NAME_CONFLICT", "Template name is already in use"); templates.push(template); }); }
  replace(id: string, input: DataTemplateSaveInput): DataTemplateCatalog { if (this.find(id).origin !== "user") throw new TypeError("Bundled templates cannot be changed"); return this.change(templates => { const template = this.snapshot(input, id); if (templates.some(t => t.id !== id && t.name.trim().toLowerCase() === template.name.trim().toLowerCase())) throw new DataOverlayError("NAME_CONFLICT", "Template name is already in use"); templates[templates.findIndex(t => t.id === id)] = template; }); }
  delete(id: string): DataTemplateCatalog { if (this.find(id).origin !== "user") throw new TypeError("Bundled templates cannot be changed"); return this.change(templates => { templates.splice(templates.findIndex(t => t.id === id), 1); }); }
  instantiate(id: string, input: DataTemplateInstantiateInput) { return this.overlays.instantiateTemplate(this.find(id), input); }
  insert(id: string, input: DataTemplateInsertInput) { return this.overlays.insertTemplateGroup(this.find(id), input); }
}
