export interface EditorRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface SnapGuide { readonly axis: "x" | "y"; readonly position: number }
export interface EditorSnapOptions {
  readonly mode: "move" | "resize";
  readonly bounds: { readonly width: number; readonly height: number };
  readonly peers: readonly EditorRect[];
  readonly grid: boolean;
  readonly alignment: boolean;
  readonly scale: number;
  readonly minSize?: number;
  readonly gridSize?: number;
  /** Screen pixels; converted to canvas pixels using scale. */
  readonly threshold?: number;
}

/** Shared pointer-only snapping. Numeric and keyboard edits bypass this boundary. */
export function snapEditorRect(raw: EditorRect, options: EditorSnapOptions): { rect: EditorRect; guides: readonly SnapGuide[] } {
  const min = options.minSize ?? 1;
  const x = clamp(Math.round(raw.x), 0, options.bounds.width - Math.min(min, options.bounds.width));
  const y = clamp(Math.round(raw.y), 0, options.bounds.height - Math.min(min, options.bounds.height));
  const width = clamp(Math.round(raw.width), Math.min(min, options.bounds.width), options.bounds.width - (options.mode === "resize" ? x : 0));
  const height = clamp(Math.round(raw.height), Math.min(min, options.bounds.height), options.bounds.height - (options.mode === "resize" ? y : 0));
  const rect = { x: Math.min(x, options.bounds.width - width), y: Math.min(y, options.bounds.height - height), width, height };
  const guides: SnapGuide[] = [];
  const threshold = (options.threshold ?? 5) / Math.max(0.01, options.scale);
  const gridSize = Math.max(1, options.gridSize ?? 10);
  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "width" : "height";
    const limit = options.bounds[size];
    const current = options.mode === "move" ? rect[axis] : rect[size];
    const lower = options.mode === "move" ? 0 : Math.min(min, limit);
    const upper = options.mode === "move" ? limit - rect[size] : limit - rect[axis];
    let best: { value: number; distance: number; guide: number } | undefined;
    if (options.alignment) {
      const targets = [0, limit / 2, limit, ...options.peers.flatMap(peer => [peer[axis], peer[axis] + peer[size] / 2, peer[axis] + peer[size]])];
      for (const target of targets) {
        // Resize keeps its leading edge fixed, so only its center and trailing edge move.
        const values = options.mode === "move"
          ? [target, target - rect[size] / 2, target - rect[size]]
          : [target - rect[axis], (target - rect[axis]) * 2];
        for (const [index, candidate] of values.entries()) {
          const value = Math.round(candidate);
          const distance = Math.abs(value - current) * (options.mode === "resize" && index === 1 ? 0.5 : 1);
          if (value >= lower && value <= upper && distance <= threshold && (best === undefined || distance < best.distance)) best = { value, distance, guide: target };
        }
      }
    }
    if (best !== undefined) {
      rect[options.mode === "move" ? axis : size] = best.value;
      guides.push({ axis, position: best.guide });
    } else if (options.grid) {
      const value = options.mode === "move" ? current : rect[axis] + current;
      const snapped = Math.round(value / gridSize) * gridSize - (options.mode === "move" ? 0 : rect[axis]);
      rect[options.mode === "move" ? axis : size] = clamp(snapped, lower, upper);
    }
  }
  return { rect, guides };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
