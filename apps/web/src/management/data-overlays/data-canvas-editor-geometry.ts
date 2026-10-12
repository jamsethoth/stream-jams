import { snapEditorRect, type EditorRect, type SnapGuide } from "../editor/snapping.js";

export interface DataCanvasGeometryOptions {
  readonly grid?: boolean;
  readonly alignment?: boolean;
  readonly peers?: readonly EditorRect[];
  readonly scale?: number;
  readonly mode?: "move" | "resize";
}
export type DataCanvasBounds = { readonly width: number; readonly height: number };

/** Pointer, keyboard and numeric callers share this one bounds/snapping boundary. */
export function constrainDataCanvasGeometry(rect: EditorRect, bounds: DataCanvasBounds, options: DataCanvasGeometryOptions = {}): { rect: EditorRect; guides: readonly SnapGuide[] } {
  if (![rect.x, rect.y, rect.width, rect.height, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width < 1 || bounds.height < 1 || (options.scale !== undefined && (!Number.isFinite(options.scale) || options.scale <= 0))) {
    throw new Error("Canvas geometry must be finite and bounds and scale positive.");
  }
  return snapEditorRect(rect, { bounds, mode: options.mode ?? "move", grid: options.grid ?? false,
    alignment: options.alignment ?? false, peers: options.peers ?? [], scale: options.scale ?? 1, minSize: 1 });
}

export function moveDataCanvasGeometry(rect: EditorRect, dx: number, dy: number, bounds: DataCanvasBounds, options: DataCanvasGeometryOptions = {}) {
  return constrainDataCanvasGeometry({ ...rect, x: rect.x + dx, y: rect.y + dy }, bounds, { ...options, mode: "move" });
}

export function resizeDataCanvasGeometry(rect: EditorRect, dw: number, dh: number, bounds: DataCanvasBounds, options: DataCanvasGeometryOptions = {}) {
  return constrainDataCanvasGeometry({ ...rect, width: rect.width + dw, height: rect.height + dh }, bounds, { ...options, mode: "resize" });
}
