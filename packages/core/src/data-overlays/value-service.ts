import { dataCanvasInputSchema, dataGoalInputSchema, dataIdSchema, dataOverlayStateSchema, dataResetGroupInputSchema, dataValueCreateInputSchema, dataValueDeltaInputSchema, dataValueSetInputSchema, dataValueUpdateInputSchema } from "./schemas.js";
import { restartDataGoal } from "./goals.js";
import type { DataOverlayRepository } from "./repository.js";
import type { DataCanvasInput, DataGoalInput, DataOverlayState, DataResetGroupInput, DataValue, DataValueCreateInput, DataValueUpdateInput } from "./types.js";
export type DataValueCommand = { action: "set"; content: string | number; expectedRevision: number } | { action: "add" | "subtract"; amount: number } | { action: "reset" };
export class DataOverlayError extends Error {
  constructor(readonly code: "NOT_FOUND" | "NAME_CONFLICT" | "REFERENCED" | "REVISION_CONFLICT", message: string, readonly references: string[] = [], readonly currentValue: DataValue | null = null) { super(message); this.name = "DataOverlayError"; }
}
export interface DataOverlayServiceOptions {
  generateId(): string;
  now(): string;
  publish?(state: DataOverlayState): void;
  onPublishError?(error: unknown): void;
  runMutation?<T>(work: () => T): T;
  resolveImageAsset?(id: string): boolean;
}
export class DataOverlayService {
  constructor(private readonly repository: DataOverlayRepository, private readonly options: DataOverlayServiceOptions) {}
  getState(): DataOverlayState { return this.repository.read(); }
  private change(work: (draft: DataOverlayState) => void): DataOverlayState {
    const commit = () => this.repository.mutate(state => { work(state); state.revision += 1; dataOverlayStateSchema.parse(state); });
    const state = this.options.runMutation ? this.options.runMutation(commit) : commit();
    try { this.options.publish?.(structuredClone(state)); } catch (error) {
      // The committed command must never invite a retry after notification failure.
      try { this.options.onPublishError?.(error); }
      // error-provenance: allow expected -- diagnostic callback failures cannot turn committed deltas into retryable failures
      catch { /* Diagnostics cannot undo a commit. */ }
    }
    return state;
  }
  private id(): string { return dataIdSchema.parse(this.options.generateId()); }
  private find<T extends { id: string }>(items: T[], id: string): T {
    dataIdSchema.parse(id);
    const item = items.find(item => item.id === id);
    if (!item) throw new DataOverlayError("NOT_FOUND", `Data resource ${id} not found`);
    return item;
  }
  private name(items: { id: string; name: string }[], name: string, id?: string): void {
    if (items.some(item => item.id !== id && item.name.trim().toLowerCase() === name.trim().toLowerCase())) throw new DataOverlayError("NAME_CONFLICT", "Data name is already in use");
  }
  createValue(input: DataValueCreateInput): DataOverlayState {
    const definition = dataValueCreateInputSchema.parse(input);
    return this.change(state => { this.name(state.values, definition.name); const now = this.options.now(); state.values.push({ ...definition, id: this.id(), content: definition.resetDefault, revision: 0, createdAt: now, updatedAt: now } as DataValue); });
  }
  updateValue(id: string, input: DataValueUpdateInput): DataOverlayState {
    const definition = dataValueUpdateInputSchema.parse(input);
    return this.change(state => { const value = this.find(state.values, id); if (definition.name !== undefined) this.name(state.values, definition.name, id); Object.assign(value, definition, { revision: value.revision + 1, updatedAt: this.options.now() }); });
  }
  commandValue(id: string, command: DataValueCommand): DataOverlayState {
    return this.change(state => {
      const value = this.find(state.values, id);
      let content: number | string;
      if (command.action === "set") {
        const input = dataValueSetInputSchema.parse({ content: command.content, expectedRevision: command.expectedRevision });
        if (input.expectedRevision !== value.revision) throw new DataOverlayError("REVISION_CONFLICT", "Value revision changed", [], structuredClone(value));
        content = input.content;
      } else if (command.action === "reset") content = value.resetDefault;
      else {
        const { amount } = dataValueDeltaInputSchema.parse({ amount: command.amount });
        if (value.kind !== "integer") throw new TypeError("Deltas require integer values");
        const exact = BigInt(value.content) + (command.action === "add" ? BigInt(amount) : -BigInt(amount));
        if (exact < BigInt(Number.MIN_SAFE_INTEGER) || exact > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError("Integer overflow");
        content = Number(exact);
      }
      Object.assign(value, { content, revision: value.revision + 1, updatedAt: this.options.now() });
    });
  }
  createGoal(input: DataGoalInput): DataOverlayState { const definition = dataGoalInputSchema.parse(input); return this.change(state => { this.name(state.goals, definition.name); state.goals.push({ ...definition, id: this.id() }); }); }
  updateGoal(id: string, input: DataGoalInput): DataOverlayState { const definition = dataGoalInputSchema.parse(input); return this.change(state => { const goal = this.find(state.goals, id); this.name(state.goals, definition.name, id); state.goals[state.goals.indexOf(goal)] = { ...definition, id }; }); }
  restartGoal(id: string): DataOverlayState { return this.change(state => { const goal = this.find(state.goals, id); state.goals[state.goals.indexOf(goal)] = restartDataGoal(goal, this.find(state.values, goal.valueId)); }); }
  createResetGroup(input: DataResetGroupInput): DataOverlayState { const definition = dataResetGroupInputSchema.parse(input); return this.change(state => { this.name(state.resetGroups, definition.name); state.resetGroups.push({ ...definition, id: this.id() }); }); }
  updateResetGroup(id: string, input: DataResetGroupInput): DataOverlayState { const definition = dataResetGroupInputSchema.parse(input); return this.change(state => { const group = this.find(state.resetGroups, id); this.name(state.resetGroups, definition.name, id); Object.assign(group, definition); }); }
  resetGroup(id: string): DataOverlayState {
    return this.change(state => { this.find(state.resetGroups, id); const members = state.values.filter(value => value.resetGroupId === id); for (const value of members) Object.assign(value, { content: value.resetDefault, revision: value.revision + 1, updatedAt: this.options.now() }); for (const goal of state.goals) if (goal.mode === "saved-baseline" && members.some(value => value.id === goal.valueId)) state.goals[state.goals.indexOf(goal)] = restartDataGoal(goal, this.find(state.values, goal.valueId)); });
  }
  private canvas(input: DataCanvasInput): DataCanvasInput {
    const definition = dataCanvasInputSchema.parse(input);
    for (const element of definition.elements) if (element.kind === "image" && !this.options.resolveImageAsset?.(element.assetId)) throw new TypeError("Canvas image must reference an available registered image");
    return definition;
  }
  createCanvas(input: DataCanvasInput): DataOverlayState { const definition = this.canvas(input); return this.change(state => { this.name(state.canvases, definition.name); state.canvases.push({ ...definition, id: this.id() }); }); }
  updateCanvas(id: string, input: DataCanvasInput): DataOverlayState { const definition = this.canvas(input); return this.change(state => { const canvas = this.find(state.canvases, id); this.name(state.canvases, definition.name, id); Object.assign(canvas, definition); }); }
  setCanvasVisibility(id: string, enabled: boolean): DataOverlayState { if (typeof enabled !== "boolean") throw new TypeError("Invalid visibility"); return this.change(state => { this.find(state.canvases, id).enabled = enabled; }); }
  setPins(ids: string[]): DataOverlayState { return this.change(state => { state.pinnedValueIds = [...ids]; }); }
  private remove(key: "values" | "goals" | "resetGroups" | "canvases", id: string): DataOverlayState {
    return this.change(state => {
      this.find(state[key], id);
      const references: string[] = [];
      if (key === "values") { for (const goal of state.goals) if (goal.valueId === id) references.push(`goal:${goal.id}`); if (state.pinnedValueIds.includes(id)) references.push(`pin:${id}`); }
      if (key === "resetGroups") for (const value of state.values) if (value.resetGroupId === id) references.push(`value:${value.id}`);
      if (key === "values" || key === "goals") for (const canvas of state.canvases) for (const element of canvas.elements) {
        const binding = element.kind === "text" ? element.binding : element.kind === "progress" ? { kind: "goal" as const, goalId: element.goalId } : null;
        if (binding && (key === "values" ? binding.kind === "value" && binding.valueId === id : binding.kind === "goal" && binding.goalId === id)) references.push(`canvas:${canvas.id}:element:${element.id}`);
      }
      if (references.length) throw new DataOverlayError("REFERENCED", "Data resource is referenced", references);
      const items = state[key]; items.splice(items.findIndex(item => item.id === id), 1);
    });
  }
  deleteValue(id: string): DataOverlayState { return this.remove("values", id); }
  deleteGoal(id: string): DataOverlayState { return this.remove("goals", id); }
  deleteResetGroup(id: string): DataOverlayState { return this.remove("resetGroups", id); }
  deleteCanvas(id: string): DataOverlayState { return this.remove("canvases", id); }
}
