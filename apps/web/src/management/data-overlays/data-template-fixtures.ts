import { buildDataTemplatePreviewState, type DataTemplate } from "@stream-jams/core";
import type { DataTemplateApi } from "./data-template-api.js";

export function dataTemplateFixture(kind: "value" | "goal" = "goal"): DataTemplate {
  return { id: "sample-template", origin: "bundled", schemaVersion: 1, name: "Sample goal", targetProfileId: "landscape", slots: kind === "goal" ? [{ id: "slot", name: "Session", kind: "goal" }] : [{ id: "slot", name: "Count", kind: "value", valueKind: "integer" }], elements: [{ id: "text", kind: "text", order: 0, x: 0, y: 0, width: 400, height: 80, visible: true, stalePolicy: "retain-last", binding: kind === "goal" ? { kind: "goal", goalId: "slot", field: "current" } : { kind: "value", valueId: "slot" }, literalText: "", format: { prefix: "", suffix: "", thousandsSeparator: true, overflow: "wrap" }, style: { fontSizePx: 40, fontWeight: 400, color: "#ffffffff", align: "left" } }] };
}
export function createDataTemplateFixture(templates: DataTemplate[] = [dataTemplateFixture()]): DataTemplateApi {
  let catalog = structuredClone(templates);
  return {
    async getCatalog() { return { templates: structuredClone(catalog) }; },
    async save(id, input) { const template = { ...dataTemplateFixture(), id: id ?? "saved-template", origin: "user" as const, name: input.name }; catalog = [...catalog.filter(item => item.id !== template.id), template]; return { templates: structuredClone(catalog) }; },
    async delete(id) { catalog = catalog.filter(item => item.id !== id); return { templates: structuredClone(catalog) }; },
    async instantiate(id, input) { const template = catalog.find(item => item.id === id)!; const state = buildDataTemplatePreviewState(template); state.canvases[0]!.name = input.name; state.canvases[0]!.enabled = input.enabled; return state; },
    async insert(id) { return buildDataTemplatePreviewState(catalog.find(item => item.id === id)!); }
  };
}
