import { projectDataGoal, projectDataOverlays, type DataOverlayState, type DataProjectionOptions, type DataSourceStatus } from "@stream-jams/core";

export type DataPreviewScenario = "zero" | "decrease" | "completion" | "over-target" | "long-text" | "missing-source";

/** A private copy of samples and drafts; this boundary has no live mutation client. */
export function createDataPreviewStore(initial: DataOverlayState) {
  const baseline = structuredClone(initial);
  let state = structuredClone(baseline);
  let sourceStatuses: Record<string, DataSourceStatus> = {};
  return {
    snapshot: (): DataOverlayState => structuredClone(state),
    reset(next: DataOverlayState = baseline) { state = structuredClone(next); sourceStatuses = {}; },
    simulate(scenario: DataPreviewScenario, valueId: string, goalId?: string) {
      const value = state.values.find(item => item.id === valueId);
      if (!value) throw new Error("Choose an available preview value.");
      if (scenario === "missing-source") { sourceStatuses[valueId] = { state: "ended" }; return; }
      let content: string | number;
      if (scenario === "long-text") {
        if (value.kind !== "text") throw new Error("Long text needs a text value.");
        content = "A long plain-text preview label <b>with literal markup</b> ".repeat(20);
      } else {
        if (value.kind !== "integer" || typeof value.content !== "number") throw new Error("This preview needs an integer value.");
        if (scenario === "zero") content = 0;
        else if (scenario === "decrease") content = value.content - 1;
        else {
          const goal = state.goals.find(item => item.id === goalId && item.valueId === valueId);
          if (!goal) throw new Error("Choose a goal that uses this preview value.");
          content = projectDataGoal(goal, value).target + (scenario === "over-target" ? 1 : 0);
        }
        if (!Number.isSafeInteger(content)) throw new Error("Preview result exceeds the safe integer range.");
      }
      value.content = content;
      delete sourceStatuses[valueId];
      state.revision += 1;
    },
    project(options: DataProjectionOptions, layout?: DataOverlayState) {
      return projectDataOverlays(layout === undefined ? state : { ...state, canvases: layout.canvases }, { ...options, sourceStatuses: { ...options.sourceStatuses, ...sourceStatuses } });
    }
  };
}
