import { dataTemplateSchema, type DataTemplate } from "./template-schemas.js";
import type { DataCanvasElement, DataOverlayState } from "./types.js";

const base = (id: string, x: number, y: number, width: number, height: number, order: number) => ({ id, x, y, width, height, order, visible: true, stalePolicy: "retain-last" as const });
const text = (id: string, x: number, y: number, width: number, label: string, binding: Extract<DataCanvasElement, {kind:"text"}>["binding"] = null): DataCanvasElement => ({ ...base(id, x, y, width, 56, 1), kind: "text", binding, literalText: label, format: { thousandsSeparator: true, prefix: "", suffix: "", overflow: "ellipsis" }, style: { fontSizePx: 28, color: "#FFFFFFFF", fontWeight: 600, align: "left" } });
const panel = (width: number, height: number): DataCanvasElement => ({ ...base("panel", 0, 0, width, height, 0), kind: "rectangle", color: "#17233AFF" });
const bar = (id: string, goalId: string, y: number): DataCanvasElement => ({ ...base(id, 24, y, 552, 28, 1), kind: "progress", goalId, orientation: "horizontal", direction: "forward", fillColor: "#44D7B6FF", backgroundColor: "#33445FFF", borderColor: "#33445FFF", borderWidthPx: 0 });
const goalRow = (slot: string, label: string, y: number): DataCanvasElement[] => [text(`${slot}-label`,24,y,360,label),text(`${slot}-current`,400,y,80,"",{kind:"goal",goalId:slot,field:"current"}),text(`${slot}-target`,500,y,80,"",{kind:"goal",goalId:slot,field:"target"}),bar(`${slot}-bar`,slot,y+60)];
export const bundledDataTemplates: readonly DataTemplate[] = [
  { id: "counter-badge", name: "Counter badge", slots: [{id:"count",name:"Counter",kind:"value",valueKind:"integer"}], elements: [panel(360,140),text("label",24,12,312,"Counter"),text("count",24,72,312,"",{kind:"value",valueId:"count"})] },
  { id: "goal-bar", name: "Goal bar", slots: [{id:"goal",name:"Goal",kind:"goal"}], elements: [panel(600,140),...goalRow("goal","Goal",24)] },
  { id: "latest-supporter", name: "Latest supporter", slots: [{id:"supporter",name:"Supporter",kind:"value",valueKind:"text"}], elements: [panel(500,140),text("label",24,12,452,"Latest supporter"),text("supporter",24,72,452,"",{kind:"value",valueId:"supporter"})] },
  { id: "combined-goals-panel", name: "Combined goals panel", slots: [{id:"first-goal",name:"First goal",kind:"goal"},{id:"second-goal",name:"Second goal",kind:"goal"}], elements: [panel(600,264),...goalRow("first-goal","First goal",24),...goalRow("second-goal","Second goal",148)] }
].map(template => dataTemplateSchema.parse({ ...template, origin: "bundled", schemaVersion: 1, targetProfileId: "landscape" }));

/** Sample-only state; it contains no configured source identity and never touches a repository. */
export function buildDataTemplatePreviewState(input: DataTemplate): DataOverlayState {
  const template = dataTemplateSchema.parse(input); const stamp = "2026-01-01T00:00:00Z";
  const state: DataOverlayState = { revision: 0, values: [], goals: [], resetGroups: [], pinnedValueIds: [], canvases: [] };
  for (const slot of template.slots) {
    const id = slot.kind === "goal" ? `sample-value-${slot.id}` : slot.id;
    const common = { id, name: slot.name, revision: 0, createdAt: stamp, updatedAt: stamp, resetGroupId: null };
    state.values.push(slot.kind === "value" && slot.valueKind === "text" ? { ...common, kind: "text", content: "Sample supporter", resetDefault: "" } : { ...common, kind: "integer", content: 42, resetDefault: 0 });
    if (slot.kind === "goal") state.goals.push({ id: slot.id, name: slot.name, valueId: id, mode: "fixed-target", target: 100 });
  }
  state.canvases.push({ id: "sample-canvas", name: template.name, enabled: true, order: 0, targetProfileId: template.targetProfileId, outputs: { browser: true, desktop: true }, elements: structuredClone(template.elements) });
  return state;
}
