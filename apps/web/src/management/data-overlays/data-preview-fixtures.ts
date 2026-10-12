import { dataOverlayStateSchema, type DataOverlayState } from "@stream-jams/core";

/** Small deterministic sample shared by canvas tests and stories. */
export function dataPreviewFixture(): DataOverlayState {
  const value = { revision: 0, createdAt: "2026-10-08T12:00:00Z", updatedAt: "2026-10-08T12:00:00Z", resetGroupId: null };
  const geometry = { order: 0, x: 40, y: 40, width: 640, height: 80, visible: true, stalePolicy: "retain-last" };
  return dataOverlayStateSchema.parse({ revision: 0,
    values: [{ ...value, id: "counter", name: "Community challenge", kind: "integer", content: 40, resetDefault: 0 },
      { ...value, id: "label", name: "Label", kind: "text", content: "Community challenge", resetDefault: "" }],
    goals: [{ id: "goal", name: "Challenge goal", valueId: "counter", mode: "fixed-target", target: 100 }],
    resetGroups: [], pinnedValueIds: ["counter"],
    canvases: [{ id: "canvas", name: "Challenge display", enabled: true, order: 0, targetProfileId: "landscape",
      outputs: { browser: true, desktop: true }, elements: [
        { ...geometry, id: "label-text", kind: "text", binding: { kind: "value", valueId: "label" }, literalText: "",
          format: { thousandsSeparator: true, prefix: "", suffix: "", overflow: "wrap" },
          style: { fontSizePx: 40, color: "#ffffffff", fontWeight: 700, align: "left" } },
        { ...geometry, y: 140, id: "count-text", kind: "text", binding: { kind: "value", valueId: "counter" }, literalText: "",
          format: { thousandsSeparator: true, prefix: "", suffix: " / 100", overflow: "ellipsis" },
          style: { fontSizePx: 40, color: "#ffffffff", fontWeight: 700, align: "left" } },
        { ...geometry, y: 240, id: "bar", kind: "progress", goalId: "goal", orientation: "horizontal", direction: "forward",
          fillColor: "#30ca8aff", backgroundColor: "#142634ff", borderColor: "#ffffffff", borderWidthPx: 2 },
        { ...geometry, y: 340, width: 80, id: "image", kind: "image", assetId: "tiny-image", fit: "contain" }
      ] }]
  });
}
