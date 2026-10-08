import { formatDataContent } from "./formatting.js";
import { projectDataGoal } from "./goals.js";
import { dataOverlayLimits } from "./limits.js";
import { dataCanvasElementSchema, dataCanvasSchema, dataSourceStatusSchema, dataValueSchema } from "./schemas.js";
import type { DataCanvasElement, DataGoalProjection, DataOverlayProjection, DataOverlayState, DataProjectedElement, DataProjectionOptions, DataValue } from "./types.js";

/** One pure projection shared by editor sample stores and every live output. */
export function projectDataOverlays(state: DataOverlayState, options: DataProjectionOptions): DataOverlayProjection {
  const result: DataOverlayProjection = { runtimeId: options.runtimeId, revision: state.revision, canvases: [] };
  if (!options.moduleEnabled || options.outputPaused) return result;
  const values = new Map(state.values.map(value => [value.id, value]));
  const goals = new Map(state.goals.map(goal => [goal.id, goal]));
  function usable(value: DataValue | undefined, element: DataCanvasElement): value is DataValue {
    if (!value || !dataValueSchema.safeParse(value).success) return false;
    const status = options.sourceStatuses !== undefined && Object.hasOwn(options.sourceStatuses, value.id) ? options.sourceStatuses[value.id] : undefined;
    if (!status) return true;
    if (!dataSourceStatusSchema.safeParse(status).success) return false;
    if (status.state === "current") return true;
    if (status.state !== "stale") return false;
    if (!Number.isFinite(status.staleSinceEpochMs) || !Number.isFinite(options.nowEpochMs) || status.staleSinceEpochMs > options.nowEpochMs) return false;
    return element.stalePolicy !== "hide-immediately" && options.nowEpochMs - status.staleSinceEpochMs <= dataOverlayLimits.staleGraceMs;
  }
  function resolveGoal(id: string, element: DataCanvasElement): DataGoalProjection | null {
    const goal = goals.get(id);
    const value = goal ? values.get(goal.valueId) : undefined;
    if (!goal || !usable(value, element)) return null;
    try { return projectDataGoal(goal, value); }
    // error-provenance: allow expected -- invalid goal arithmetic suppresses only its bound element transparently
    catch { return null; }
  }
  function projectElement(element: DataCanvasElement): DataProjectedElement | null {
    if (!element.visible || !dataCanvasElementSchema.safeParse(element).success) return null;
    const geometry = { id: element.id, order: element.order, x: element.x, y: element.y, width: element.width, height: element.height };
    switch (element.kind) {
      case "text": {
        let content: string | number | boolean = element.literalText;
        if (element.binding?.kind === "value") {
          const value = values.get(element.binding.valueId);
          if (!usable(value, element)) return null;
          content = value.content;
        } else if (element.binding?.kind === "goal") {
          const goal = resolveGoal(element.binding.goalId, element);
          if (!goal) return null;
          content = goal[element.binding.field];
        }
        return { ...geometry, kind: "text", text: formatDataContent(content, element.format), overflow: element.format.overflow, style: { ...element.style } };
      }
      case "image": return options.resolveAssetId(element.assetId) ? { ...geometry, kind: "image", assetId: element.assetId, fit: element.fit } : null;
      case "rectangle": case "ellipse": return { ...geometry, kind: element.kind, color: element.color };
      case "progress": {
        const goal = resolveGoal(element.goalId, element);
        return goal ? { ...geometry, kind: "progress", fill: goal.fill, orientation: element.orientation, direction: element.direction, fillColor: element.fillColor, backgroundColor: element.backgroundColor, borderColor: element.borderColor, borderWidthPx: element.borderWidthPx } : null;
      }
    }
  }
  const byOrder = (a: { order: number; id: string }, b: { order: number; id: string }) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const document of [...state.canvases].sort(byOrder)) {
    const parsed = dataCanvasSchema.safeParse(document);
    if (!parsed.success) continue;
    const canvas = parsed.data;
    if (!canvas.enabled || !canvas.outputs[options.output] || canvas.targetProfileId !== options.targetProfileId) continue;
    const elements = [...canvas.elements].sort(byOrder).map(projectElement).filter((element): element is DataProjectedElement => element !== null);
    result.canvases.push({ id: canvas.id, order: canvas.order, targetProfileId: canvas.targetProfileId, elements });
  }
  return result;
}
