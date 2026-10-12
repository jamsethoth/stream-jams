import { dataCanvasInputSchema, dataGoalInputSchema, dataIdSchema, dataIntegerSchema, dataOverlayStateSchema, dataResetGroupInputSchema, dataValueCreateInputSchema, dataValueDeltaInputSchema, dataValueSetInputSchema, dataValueUpdateInputSchema, twitchGoalSourceInputSchema } from "./schemas.js";
import { restartDataGoal } from "./goals.js";
import { dataTemplateSchema, dataTemplateInstantiateInputSchema, dataTemplateInsertInputSchema, type DataTemplate, type DataTemplateInstantiateInput, type DataTemplateInsertInput } from "./template-schemas.js";
import { instantiateDataTemplateElements } from "./template-instantiation.js";
import type { DataOverlayRepository } from "./repository.js";
import type { DataCanvasInput, DataGoalInput, DataOverlayState, DataResetGroupInput, DataValue, DataValueCreateInput, DataValueUpdateInput, TwitchGoalSourceInput } from "./types.js";
export type DataValueCommand = { action: "set"; content: string | number; expectedRevision: number } | { action: "add" | "subtract"; amount: number } | { action: "reset" };
export class DataOverlayError extends Error {
  constructor(readonly code: "NOT_FOUND" | "NAME_CONFLICT" | "REFERENCED" | "REVISION_CONFLICT" | "SOURCE_READ_ONLY" | "SOURCE_NOT_READY", message: string, readonly references: string[] = [], readonly currentValue: DataValue | null = null) { super(message); this.name = "DataOverlayError"; }
}
export interface DataOverlayServiceOptions {
  generateId(): string;
  now(): string;
  publish?(state: DataOverlayState): void;
  onPublishError?(error: unknown): void;
  runMutation?<T>(work: () => T): T;
  resolveImageAsset?(id: string): boolean;
  isTemplateSourceReady?(value: DataValue): boolean;
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
    return this.change(state => { const value = this.find(state.values, id); if (value.source && (definition.resetDefault !== undefined || definition.resetGroupId !== undefined)) throw new DataOverlayError("SOURCE_READ_ONLY", "Provider values are read-only"); if (definition.name !== undefined) this.name(state.values, definition.name, id); Object.assign(value, definition, { revision: value.revision + 1, updatedAt: this.options.now() }); });
  }
  commandValue(id: string, command: DataValueCommand): DataOverlayState {
    return this.change(state => {
      const value = this.find(state.values, id);
      if (value.source) throw new DataOverlayError("SOURCE_READ_ONLY", "Provider values are read-only");
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
  /** Internal producer boundary. HTTP value inputs cannot supply provenance. */
  createTwitchFollowerValue(name: string, broadcasterId: string): DataOverlayState {
    const definition = dataValueCreateInputSchema.parse({ name, kind: "integer", resetDefault: 0, resetGroupId: null });
    if (definition.kind !== "integer") throw new TypeError("Follower sources require integers");
    dataIdSchema.parse(broadcasterId);
    return this.change(state => { this.name(state.values, definition.name); const now = this.options.now(); state.values.push({ ...definition, kind: "integer", content: 0, id: this.id(), revision: 0, createdAt: now, updatedAt: now, source: { provider: "twitch", kind: "follower-total", broadcasterId } }); });
  }
  /** Authoritative totals replace old totals, including decreases, in one transaction. */
  replaceTwitchFollowerTotal(broadcasterId: string, total: number): DataOverlayState {
    dataIdSchema.parse(broadcasterId);
    dataValueSetInputSchema.parse({ content: total, expectedRevision: 0 });
    if (total < 0 || !Number.isSafeInteger(total)) throw new TypeError("Invalid follower total");
    return this.change(state => { for (const value of state.values) if (value.source?.broadcasterId === broadcasterId && value.source.kind === "follower-total" && !value.source.invalidated) Object.assign(value, { content: total, revision: value.revision + 1, updatedAt: this.options.now() }); });
  }
  /** Provider configuration creates both resources under the same catalog transaction. */
  createTwitchGoalBinding(input: TwitchGoalSourceInput, broadcasterId: string): DataOverlayState {
    const definition = twitchGoalSourceInputSchema.parse(input); dataIdSchema.parse(broadcasterId);
    return this.change(state => {
      this.name(state.values, definition.name); this.name(state.goals, definition.name);
      const now = this.options.now(); const valueId = this.id();
      state.values.push({ id: valueId, name: definition.name, kind: "integer", content: 0, resetDefault: 0, resetGroupId: null, revision: 0, createdAt: now, updatedAt: now, source: { provider: "twitch", kind: "creator-goal", broadcasterId, binding: definition.binding } });
      state.goals.push({ id: this.id(), name: definition.name, valueId, mode: "fixed-target", target: 1, source: { provider: "twitch", kind: "creator-goal" } });
    });
  }
  /** Explicit reselection is the only operation that clears durable account invalidation. */
  rebindTwitchGoalBinding(goalId: string, input: TwitchGoalSourceInput, broadcasterId: string): DataOverlayState {
    const definition = twitchGoalSourceInputSchema.parse(input); dataIdSchema.parse(broadcasterId);
    return this.change(state => {
      const goal = this.find(state.goals, goalId); const value = this.find(state.values, goal.valueId);
      if (goal.mode !== "fixed-target" || !goal.source || value.kind !== "integer" || value.source?.kind !== "creator-goal") throw new DataOverlayError("SOURCE_READ_ONLY", "Only native Creator Goal bindings can be rebound");
      this.name(state.values, definition.name, value.id); this.name(state.goals, definition.name, goal.id);
      Object.assign(value, { name: definition.name, content: 0, revision: value.revision + 1, updatedAt: this.options.now(), source: { provider: "twitch", kind: "creator-goal", broadcasterId, binding: definition.binding } });
      goal.name = definition.name; goal.target = 1;
    });
  }
  /** Internal authoritative producer boundary; public inputs cannot supply ownership. */
  applyTwitchCreatorGoals(broadcasterId: string, updates: readonly { valueId: string; currentAmount: number; targetAmount: number }[]): DataOverlayState {
    dataIdSchema.parse(broadcasterId);
    const ids = new Set<string>();
    for (const update of updates) {
      dataIdSchema.parse(update.valueId); dataIntegerSchema.nonnegative().parse(update.currentAmount); dataIntegerSchema.positive().parse(update.targetAmount);
      if (ids.has(update.valueId)) throw new TypeError("Duplicate Creator Goal update"); ids.add(update.valueId);
    }
    if (!updates.length) return this.getState();
    return this.change(state => {
      for (const update of updates) {
        const value = this.find(state.values, update.valueId);
        const goal = state.goals.find(goal => goal.valueId === value.id && goal.source);
        if (value.kind !== "integer" || value.source?.kind !== "creator-goal" || value.source.broadcasterId !== broadcasterId || value.source.invalidated || !goal || goal.mode !== "fixed-target") throw new DataOverlayError("SOURCE_READ_ONLY", "Obsolete or mismatched Creator Goal binding is read-only");
        Object.assign(value, { content: update.currentAmount, revision: value.revision + 1, updatedAt: this.options.now() }); goal.target = update.targetAmount;
      }
    });
  }
  /** Switching account invalidates old bindings durably, even if that account returns later. */
  invalidateTwitchBindingsExcept(broadcasterId: string): DataOverlayState {
    dataIdSchema.parse(broadcasterId);
    if (!this.getState().values.some(value => value.source && value.source.broadcasterId !== broadcasterId && !value.source.invalidated)) return this.getState();
    return this.change(state => { for (const value of state.values) if (value.source && value.source.broadcasterId !== broadcasterId && !value.source.invalidated) { value.source.invalidated = true; value.revision += 1; value.updatedAt = this.options.now(); } });
  }
  createGoal(input: DataGoalInput): DataOverlayState { const definition = dataGoalInputSchema.parse(input); return this.change(state => { if (state.values.find(value => value.id === definition.valueId)?.source?.kind === "creator-goal") throw new DataOverlayError("SOURCE_READ_ONLY", "Creator Goal values are read-only"); this.name(state.goals, definition.name); state.goals.push({ ...definition, id: this.id() }); }); }
  updateGoal(id: string, input: DataGoalInput): DataOverlayState { const definition = dataGoalInputSchema.parse(input); return this.change(state => {
    const goal = this.find(state.goals, id); this.name(state.goals, definition.name, id);
    if (goal.source) {
      if (definition.mode !== "fixed-target" || goal.mode !== "fixed-target" || definition.valueId !== goal.valueId || definition.target !== goal.target) throw new DataOverlayError("SOURCE_READ_ONLY", "Provider goals are read-only");
      goal.name = definition.name;
    } else {
      if (state.values.find(value => value.id === definition.valueId)?.source?.kind === "creator-goal") throw new DataOverlayError("SOURCE_READ_ONLY", "Creator Goal values are read-only");
      state.goals[state.goals.indexOf(goal)] = { ...definition, id };
    }
  }); }
  restartGoal(id: string): DataOverlayState { return this.change(state => { const goal = this.find(state.goals, id); if (goal.source) throw new DataOverlayError("SOURCE_READ_ONLY", "Provider goals are read-only"); state.goals[state.goals.indexOf(goal)] = restartDataGoal(goal, this.find(state.values, goal.valueId)); }); }
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
  instantiateTemplate(inputTemplate: DataTemplate, input: DataTemplateInstantiateInput): DataOverlayState {
    const template = dataTemplateSchema.parse(inputTemplate); const { mappings, ...definition } = dataTemplateInstantiateInputSchema.parse(input);
    return this.change(state => {
      this.name(state.canvases, definition.name);
      const elements = instantiateDataTemplateElements(template, mappings, state, this.options);
      state.canvases.push({ ...definition, id: this.id(), targetProfileId: template.targetProfileId, elements });
    });
  }
  insertTemplateGroup(inputTemplate: DataTemplate, input: DataTemplateInsertInput): DataOverlayState {
    const template = dataTemplateSchema.parse(inputTemplate); const definition = dataTemplateInsertInputSchema.parse(input);
    return this.change(state => {
      const canvas = this.find(state.canvases, definition.canvasId);
      if (canvas.targetProfileId !== template.targetProfileId) throw new TypeError("Template and canvas target profiles must match");
      const elements = instantiateDataTemplateElements(template, definition.mappings, state, this.options);
      let order = canvas.elements.length ? Math.max(...canvas.elements.map(e => e.order)) : -1;
      for (const element of elements.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) { element.x += definition.x; element.y += definition.y; element.order = ++order; }
      canvas.elements.push(...elements);
    });
  }
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
