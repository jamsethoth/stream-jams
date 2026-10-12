import { describe, expect, it, vi } from "vitest";
import { DataOverlayService } from "./value-service.js";
import { dataOverlayStateSchema } from "./schemas.js";
import { projectDataOverlays } from "./projection.js";
import { bundledDataTemplates, buildDataTemplatePreviewState } from "./template-starters.js";
import { dataTemplateSchema, type DataTemplate, type DataTemplateMapping } from "./template-schemas.js";
import { DataTemplateService } from "./template-service.js";
import type { DataOverlayState } from "./types.js";

function fixture(ready = false) {
  let state: DataOverlayState = { revision: 0, values: [], goals: [], resetGroups: [], pinnedValueIds: [], canvases: [] };
  let templates: DataTemplate[] = []; let id = 0;
  const publish = vi.fn();
  const options = { generateId: () => `new-${++id}`, now: () => "2026-10-08T00:00:00Z", publish, resolveImageAsset: (id: string) => id === "present", isTemplateSourceReady: () => ready };
  const overlays = new DataOverlayService({ read: () => structuredClone(state), mutate: work => { const draft = structuredClone(state); work(draft); state = dataOverlayStateSchema.parse(draft); return structuredClone(state); } }, options);
  const service = new DataTemplateService({ read: () => structuredClone(templates), mutate: work => { const draft = structuredClone(templates); work(draft); templates = draft.map(t => dataTemplateSchema.parse(t)); return structuredClone(templates); } }, overlays, options);
  return { overlays, service, publish };
}
const createInput = (mappings: DataTemplateMapping[], name = "Created") => ({ name, enabled: true, order: 0, outputs: { browser: true, desktop: false }, mappings });
const newMappings = (template: DataTemplate): DataTemplateMapping[] => template.slots.map(slot => ({ slotId: slot.id, mapping: slot.kind === "goal"
  ? { kind: "new-goal", value: { kind: "new", definition: { name: slot.name, kind: "integer", resetDefault: 0, resetGroupId: null } }, goal: { name: slot.name, mode: "fixed-target", target: 100 } }
  : { kind: "new-value", definition: slot.valueKind === "integer" ? { name: slot.name, kind: "integer", resetDefault: 0, resetGroupId: null } : { name: slot.name, kind: "text", resetDefault: "", resetGroupId: null } } }));

describe("safe independent data templates", () => {
  it("provides four useful starters and private sample previews", () => {
    expect(bundledDataTemplates.map(t => t.name)).toEqual(["Counter badge", "Goal bar", "Latest supporter", "Combined goals panel"]);
    for (const template of bundledDataTemplates) {
      expect(dataTemplateSchema.parse(template)).toEqual(template);
      const { service, publish } = fixture();
      const state = service.instantiate(template.id, createInput(newMappings(template)));
      expect(state.canvases).toHaveLength(1); expect(publish).toHaveBeenCalledTimes(1); expect(state.revision).toBe(1);
      expect(state.canvases[0]!.elements.map(e => e.id)).not.toEqual(template.elements.map(e => e.id));
      const preview = buildDataTemplatePreviewState(template);
      expect(preview.values[0]?.content).toBe(template.slots[0]?.kind === "value" && template.slots[0].valueKind === "text" ? "Sample supporter" : 42);
    }
  });
  it("rejects extra sensitive fields, unknown slots, incompatible bindings and geometry", () => {
    const template = bundledDataTemplates[0]!;
    for (const field of ["content", "baseline", "credentials", "source"]) expect(dataTemplateSchema.safeParse({ ...template, [field]: "secret" }).success).toBe(false);
    expect(dataTemplateSchema.safeParse({ ...template, slots: [{ ...template.slots[0], broadcasterId: "secret" }] }).success).toBe(false);
    expect(dataTemplateSchema.safeParse({ ...template, slots: [] }).success).toBe(false);
    expect(dataTemplateSchema.safeParse({ ...template, elements: template.elements.map(e => ({ ...e, x: 1920 })) }).success).toBe(false);
  });
  it("saves at37 without live data and deduplicates selection refs, normalizes position, and copies independently", () => {
    const { overlays, service } = fixture(); const starter = bundledDataTemplates[1]!;
    const original = service.instantiate(starter.id, createInput(newMappings(starter), "Original"));
    const canvas = original.canvases[0]!; const value = original.values[0]!;
    overlays.commandValue(value.id, { action: "set", content: 37, expectedRevision: 0 });
    const saved = service.save({ name: "Saved", canvasId: canvas.id, elementIds: canvas.elements.filter(e => e.kind !== "rectangle").map(e => e.id) }).templates.find(t => t.origin === "user")!;
    expect(saved.slots).toHaveLength(1); expect(JSON.stringify(saved)).not.toContain(value.id); expect(JSON.stringify(saved)).not.toContain('"content":37'); expect(JSON.stringify(saved)).not.toContain("baseline");
    expect(saved.elements.filter(e => e.kind === "text" && e.binding).every(e => e.kind === "text" && e.literalText === "")).toBe(true);
    expect(Math.min(...saved.elements.map(e => e.x))).toBe(0); expect(Math.min(...saved.elements.map(e => e.y))).toBe(0);
    const copied = service.instantiate(saved.id, createInput([{ slotId: saved.slots[0]!.id, mapping: { kind: "goal", goalId: original.goals[0]!.id } }], "Copy"));
    service.replace(saved.id, { name: "Changed", canvasId: canvas.id, elementIds: [canvas.elements[0]!.id] });
    expect(overlays.getState().canvases).toEqual(copied.canvases);
  });
  it("creates integer and saved-baseline goal atomically, rejects bad maps without publication", () => {
    const { overlays, service, publish } = fixture(); const template = bundledDataTemplates[1]!;
    const mapping: DataTemplateMapping = { slotId: template.slots[0]!.id, mapping: { kind: "new-goal", value: { kind: "new", definition: { name: "Count", kind: "integer", resetDefault: 7, resetGroupId: null } }, goal: { name: "Goal", mode: "saved-baseline", additionalAmount: 100 } } };
    const good = service.instantiate(template.id, createInput([mapping])); expect(good.goals[0]).toMatchObject({ baseline: 7, additionalAmount: 100 });
    for (const mappings of [[], [mapping, mapping], [{ slotId: "unknown", mapping: mapping.mapping }], [{ slotId: mapping.slotId, mapping: { kind: "value", valueId: good.values[0]!.id } }]]) {
      expect(() => service.instantiate(template.id, createInput(mappings as DataTemplateMapping[], "Failed"))).toThrow();
      expect(overlays.getState()).toEqual(good); expect(publish).toHaveBeenCalledTimes(1);
    }
    expect(() => service.instantiate(template.id, createInput([mapping], "Failed"))).toThrow("name"); expect(overlays.getState()).toEqual(good);
  });
  it("flattens insertion with fresh ids, rejects profile/geometry failure transactionally", () => {
    const { service, overlays } = fixture(); const t = bundledDataTemplates[0]!;
    const state = service.instantiate(t.id, createInput(newMappings(t)));
    const mappings: DataTemplateMapping[] = [{ slotId: t.slots[0]!.id, mapping: { kind: "value", valueId: state.values[0]!.id } }];
    expect(() => service.insert(t.id, { canvasId: state.canvases[0]!.id, x: 1900, y: 0, mappings })).toThrow(); expect(overlays.getState()).toEqual(state);
    const inserted = service.insert(t.id, { canvasId: state.canvases[0]!.id, x: 500, y: 0, mappings });
    expect(inserted.canvases[0]!.elements).toHaveLength(t.elements.length * 2);
    expect(new Set(inserted.canvases[0]!.elements.map(e => e.id)).size).toBe(t.elements.length * 2);
  });
  it("requires trusted source kind/account readiness and rejects invalidated provenance", () => {
    const { service, overlays } = fixture(); const t = structuredClone(bundledDataTemplates[0]!);
    t.slots[0]!.requiredSource = { provider: "twitch", kind: "follower-total" };
    const manual = overlays.createValue({ name: "Manual", kind: "integer", resetDefault: 0, resetGroupId: null }).values[0]!;
    expect(() => overlays.instantiateTemplate(t, createInput([{ slotId: t.slots[0]!.id, mapping: { kind: "value", valueId: manual.id } }]))).toThrow("source");
    const provider = overlays.createTwitchFollowerValue("Followers", "account").values[1]!;
    const mapping: DataTemplateMapping = { slotId: t.slots[0]!.id, mapping: { kind: "value", valueId: provider.id } };
    expect(() => overlays.instantiateTemplate(t, createInput([mapping]))).toThrow("source");
    const ready = fixture(true); const active = ready.overlays.createTwitchFollowerValue("Followers", "account").values[0]!;
    expect(ready.overlays.instantiateTemplate(t, createInput([{ ...mapping, mapping: { kind: "value", valueId: active.id } }])).canvases).toHaveLength(1);
    ready.overlays.invalidateTwitchBindingsExcept("another");
    expect(() => ready.overlays.instantiateTemplate(t, createInput([{ ...mapping, mapping: { kind: "value", valueId: active.id } }], "Invalid"))).toThrow("source");
    expect(service.getCatalog().templates).toHaveLength(4);
  });
  it("saves source requirements without source/account IDs, counts, reset defaults or goal baselines", () => {
    const { overlays, service } = fixture(true); const t = bundledDataTemplates[1]!;
    const value = overlays.createTwitchFollowerValue("Followers", "private-account-42").values[0]!;
    overlays.replaceTwitchFollowerTotal("private-account-42", 9381);
    const state = service.instantiate(t.id, createInput([{slotId:"goal",mapping:{kind:"new-goal",value:{kind:"existing",valueId:value.id},goal:{name:"Growth",mode:"saved-baseline",additionalAmount:999}}}]));
    const saved = service.save({name:"Follower growth",canvasId:state.canvases[0]!.id}).templates.find(t=>t.origin==="user")!;
    expect(saved.slots[0]).toMatchObject({requiredSource:{provider:"twitch",kind:"follower-total"}});
    for (const forbidden of [value.id,"private-account-42","9381","resetDefault","additionalAmount","baseline"]) expect(JSON.stringify(saved)).not.toContain(forbidden);
    expect(() => service.instantiate(saved.id, createInput([{slotId:saved.slots[0]!.id,mapping:{kind:"new-goal",value:{kind:"new",definition:{name:"Manual substitute",kind:"integer",resetDefault:0,resetGroupId:null}},goal:{name:"Manual goal",mode:"fixed-target",target:100}}}],"Bad provider"))).toThrow("source");
  });
  it("retains Creator Goal template requirements without live account/binding or target metadata", () => {
    const { overlays, service } = fixture(true); const starter = bundledDataTemplates[1]!;
    const bound = overlays.createTwitchGoalBinding({ name: "Creator", binding: { mode: "pinned", goalId: "private-twitch-goal" } }, "private-account");
    const value = bound.values[0]!; const goal = bound.goals[0]!;
    overlays.applyTwitchCreatorGoals("private-account", [{ valueId: value.id, currentAmount: 6789, targetAmount: 9876 }]);
    const state = service.instantiate(starter.id, createInput([{ slotId: "goal", mapping: { kind: "goal", goalId: goal.id } }]));
    const saved = service.save({ name: "Creator template", canvasId: state.canvases[0]!.id }).templates.find(t => t.origin === "user")!;
    expect(saved.slots[0]).toMatchObject({ requiredSource: { provider: "twitch", kind: "creator-goal" } });
    for (const forbidden of ["private-twitch-goal", "private-account", "6789", "9876", "broadcasterId", "selectedGoalId", "resetDefault"]) expect(JSON.stringify(saved)).not.toContain(forbidden);
    expect(service.instantiate(saved.id, createInput([{ slotId: saved.slots[0]!.id, mapping: { kind: "goal", goalId: goal.id } }], "Mapped Creator")).canvases).toHaveLength(2);
    const before = overlays.getState();
    expect(() => overlays.instantiateTemplate(saved, createInput([{ slotId: saved.slots[0]!.id, mapping: { kind: "new-goal", value: { kind: "existing", valueId: value.id }, goal: { name: "Forged Creator", mode: "fixed-target", target: 10 } } }], "Forged"))).toThrow("read-only");
    expect(overlays.getState()).toEqual(before);
    overlays.invalidateTwitchBindingsExcept("new-account");
    expect(() => service.instantiate(saved.id, createInput([{ slotId: saved.slots[0]!.id, mapping: { kind: "goal", goalId: goal.id } }], "Invalid Creator"))).toThrow("source");
  });
  it("checks arithmetic, limits and insertion profile/orders before committing", () => {
    const {overlays,service,publish}=fixture(); const t=bundledDataTemplates[1]!;
    const overflow:DataTemplateMapping={slotId:"goal",mapping:{kind:"new-goal",value:{kind:"new",definition:{name:"Max",kind:"integer",resetDefault:Number.MAX_SAFE_INTEGER,resetGroupId:null}},goal:{name:"Overflow",mode:"saved-baseline",additionalAmount:1}}};
    const before=overlays.getState();expect(()=>service.instantiate(t.id,createInput([overflow]))).toThrow();expect(overlays.getState()).toEqual(before);expect(publish).not.toHaveBeenCalled();
    const good=service.instantiate(t.id,createInput(newMappings(t)));const canvas=good.canvases[0]!;
    const {id,...definition}=canvas; overlays.updateCanvas(id,{...definition,order:0,targetProfileId:"vertical"});
    const snapshot=overlays.getState();expect(()=>service.insert(t.id,{canvasId:id,x:0,y:0,mappings:[{slotId:"goal",mapping:{kind:"goal",goalId:good.goals[0]!.id}}]})).toThrow("profiles");expect(overlays.getState()).toEqual(snapshot);
    overlays.updateCanvas(id,{...definition,elements:definition.elements.map((element,index)=>({...element,order:index===0?Number.MAX_SAFE_INTEGER:element.order}))});
    const atMax=overlays.getState();expect(()=>service.insert(t.id,{canvasId:id,x:0,y:0,mappings:[{slotId:"goal",mapping:{kind:"goal",goalId:good.goals[0]!.id}}]})).toThrow();expect(overlays.getState()).toEqual(atMax);
  });
  it("bounds user templates and selection and applies the maintenance gate to template definitions", () => {
    const {overlays,service}=fixture();const state=service.instantiate("counter-badge",createInput(newMappings(bundledDataTemplates[0]!)));
    const input={name:"Saved",canvasId:state.canvases[0]!.id};expect(()=>service.save({...input,elementIds:[]})).toThrow();expect(()=>service.save({...input,elementIds:["gone"]})).toThrow();
    for(let i=0;i<100;i++)service.save({...input,name:`Saved ${i}`});const before=service.getCatalog();expect(()=>service.save({...input,name:"Too many"})).toThrow();expect(service.getCatalog()).toEqual(before);
    const gate=new DataTemplateService({read:()=>[],mutate:()=>{throw new Error("Repository should not be reached");}},overlays,{generateId:()=>"id",runMutation:()=>{throw new Error("Maintenance");}});
    expect(()=>gate.save(input)).toThrow("Maintenance");
  });
  it("preserves missing asset identity as hidden placeholder and permits later edits/replacement", () => {
    const { overlays } = fixture(); const template: DataTemplate = { id: "missing", origin: "user", schemaVersion: 1, name: "Missing", targetProfileId: "landscape", slots: [], elements: [{ id: "image", kind: "image", assetId: "removed", fit: "contain", order: 0, x: 0, y: 0, width: 100, height: 100, visible: true, stalePolicy: "retain-last" }] };
    const state = overlays.instantiateTemplate(template, createInput([]));
    expect(state.canvases[0]?.elements[0]).toMatchObject({ kind: "missing-image", sourceAssetId: "removed" });
    expect(projectDataOverlays(state, { runtimeId: "r", output: "browser", targetProfileId: "landscape", nowEpochMs: 0, moduleEnabled: true, outputPaused: false, resolveAssetId: () => true }).canvases[0]?.elements).toEqual([]);
    const { id, ...canvas } = state.canvases[0]!; overlays.updateCanvas(id, canvas);
    const placeholder = canvas.elements[0]!;
    if (placeholder.kind !== "missing-image") throw new Error("Expected missing image");
    const { sourceAssetId: _source, ...image } = placeholder;
    expect(_source).toBe("removed");
    expect(overlays.updateCanvas(id, { ...canvas, elements: [{ ...image, kind: "image", assetId: "present" }] }).canvases[0]?.elements[0]).toMatchObject({ kind: "image", assetId: "present" });
  });
});
