import type { DataOverlayState } from "@stream-jams/core";
import type { DataOverlaysApi } from "./data-overlays-api.js";
import { dataPreviewFixture } from "./data-preview-fixtures.js";
/** Disposable Storybook/test API. All mutations stay in this fixture copy. */
export function createDataManagementFixture(initial = dataPreviewFixture()): DataOverlaysApi {
    const state: DataOverlayState = structuredClone(initial);
    let enabled = false;
    let sequence = 0;
    const copy = () => structuredClone(state);
    const commit = () => { state.revision += 1; return copy(); };
    return {
        async getState() { return copy(); }, async getEnabled() { return enabled; }, async setEnabled(next) { enabled = next; return enabled; }, async listOutputs() { return []; },
        async createValue(input) { state.values.push({ ...input, id: `new-value-${++sequence}`, content: input.resetDefault, revision: 0, createdAt: "2026-10-08T12:00:00Z", updatedAt: "2026-10-08T12:00:00Z" } as DataOverlayState["values"][number]); return commit(); },
        async updateValue(id, input) { state.values = state.values.map(value => value.id === id ? { ...value, ...input } as typeof value : value); return commit(); },
        async deleteValue(id) { state.values = state.values.filter(value => value.id !== id); return commit(); },
        async saveGoal(id, input) { state.goals = [...state.goals.filter(goal => goal.id !== id), { ...input, id: id ?? `new-goal-${++sequence}` }]; return commit(); },
        async deleteGoal(id) { state.goals = state.goals.filter(goal => goal.id !== id); return commit(); },
        async saveGroup(id, input) { state.resetGroups = [...state.resetGroups.filter(group => group.id !== id), { ...input, id: id ?? `new-group-${++sequence}` }]; return commit(); },
        async deleteGroup(id) { state.resetGroups = state.resetGroups.filter(group => group.id !== id); return commit(); },
        async saveCanvas(id, input) { state.canvases = [...state.canvases.filter(canvas => canvas.id !== id), { ...input, id: id ?? `new-canvas-${++sequence}` }]; return commit(); },
        async deleteCanvas(id) { state.canvases = state.canvases.filter(canvas => canvas.id !== id); return commit(); },
        async setPins(valueIds) { state.pinnedValueIds = [...valueIds]; return commit(); }
    };
}
