import type { AlertEditorDocument, AlertLayer } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import {
  addLayer,
  applyEditorUpdate,
  createEditorState,
  deleteLayer,
  duplicateLayer,
  isEditorDirty,
  markEditorSaved,
  moveLayerWithArrow,
  redoEditorUpdate,
  reorderLayer,
  revertEditorChanges,
  snapLayerGeometry,
  toggleLayerVisible,
  undoEditorUpdate,
  updateLayer,
  updateLayerGeometry
} from "./editor-state.js";

describe("alert editor history", () => {
  it("bounds undo history and supports undo, redo, and branched edits", () => {
    const initial = createDocument();
    let state = createEditorState(initial, 2);

    state = applyEditorUpdate(state, (document) => ({ ...document, name: "One" }));
    state = applyEditorUpdate(state, (document) => ({ ...document, name: "Two" }));
    state = applyEditorUpdate(state, (document) => ({ ...document, name: "Three" }));

    expect(state.past.map((document) => document.name)).toEqual(["One", "Two"]);
    state = undoEditorUpdate(state);
    expect(state.document.name).toBe("Two");
    expect(state.future.map((document) => document.name)).toEqual(["Three"]);

    state = redoEditorUpdate(state);
    expect(state.document.name).toBe("Three");

    state = undoEditorUpdate(state);
    state = applyEditorUpdate(state, (document) => ({ ...document, name: "Branch" }));
    expect(state.document.name).toBe("Branch");
    expect(state.future).toEqual([]);
    expect(redoEditorUpdate(state)).toBe(state);
  });

  it("does not record no-op updates and reports clean after undoing to saved state", () => {
    const state = createEditorState(createDocument());
    expect(applyEditorUpdate(state, (document) => document)).toBe(state);

    const edited = applyEditorUpdate(state, (document) => ({ ...document, name: "Draft" }));
    expect(isEditorDirty(edited)).toBe(true);
    expect(isEditorDirty(undoEditorUpdate(edited))).toBe(false);
  });

  it("resets history at save and reverts later edits to that saved document", () => {
    const initial = createEditorState(createDocument());
    const draft = applyEditorUpdate(initial, (document) => ({ ...document, name: "Saved name" }));
    const saved = markEditorSaved(draft);

    expect(saved.savedDocument).toBe(saved.document);
    expect(saved.past).toEqual([]);
    expect(saved.future).toEqual([]);
    expect(isEditorDirty(saved)).toBe(false);
    expect(undoEditorUpdate(saved)).toBe(saved);

    const edited = applyEditorUpdate(saved, (document) => ({ ...document, name: "Unsaved name" }));
    const reverted = revertEditorChanges(edited);
    expect(reverted.document.name).toBe("Saved name");
    expect(reverted.document).toBe(saved.document);
    expect(reverted.past).toEqual([]);
    expect(reverted.future).toEqual([]);
    expect(isEditorDirty(reverted)).toBe(false);
  });
});

describe("alert editor layer operations", () => {
  it("updates and toggles a layer without mutating the input document", () => {
    const document = createDocument();
    const updated = updateLayer(document, "layer-text", (layer) =>
      layer.type === "text" ? { ...layer, template: "Welcome, {userName}!" } : layer
    );
    const toggled = toggleLayerVisible(updated, "layer-text");

    expect(updated.layers[0]).toMatchObject({ template: "Welcome, {userName}!" });
    expect(toggled.layers[0]?.visible).toBe(false);
    expect(document.layers[0]).toMatchObject({ template: "{userName}", visible: true });
  });

  it("adds and deletes a layer with profile layouts and normalized ordering", () => {
    const document = createDocument();
    const video: AlertLayer = {
      ...layerBase("layer-video", "Celebration", 99),
      type: "video",
      assetId: "asset-video"
    };
    const added = addLayer(document, video, {
      landscape: { x: 1200, y: 700, width: 480, height: 270 },
      vertical: { x: 300, y: 1200, width: 480, height: 270 }
    });

    expect(added.layers.map(({ id, order }) => [id, order])).toEqual([
      ["layer-text", 0],
      ["layer-image", 1],
      ["layer-video", 2]
    ]);
    expect(profileLayout(added, "landscape", "layer-video")).toEqual({
      layerId: "layer-video",
      x: 1200,
      y: 700,
      width: 480,
      height: 270,
      zIndex: 2
    });
    expect(document.layers).toHaveLength(2);

    const deleted = deleteLayer(added, "layer-video");
    expect(deleted.layers.map(({ id, order }) => [id, order])).toEqual([
      ["layer-text", 0],
      ["layer-image", 1]
    ]);
    expect(profileLayout(deleted, "landscape", "layer-video")).toBeUndefined();
  });

  it("duplicates beside the source and reorders layers with matching profile z-indexes", () => {
    const document = createDocument();
    const duplicated = duplicateLayer(document, "layer-text", "layer-text-copy");

    expect(duplicated.layers.map(({ id, name, order }) => [id, name, order])).toEqual([
      ["layer-text", "Follower name", 0],
      ["layer-text-copy", "Follower name copy", 1],
      ["layer-image", "Avatar", 2]
    ]);
    expect(profileLayout(duplicated, "vertical", "layer-text-copy")).toEqual({
      ...profileLayout(document, "vertical", "layer-text"),
      layerId: "layer-text-copy",
      zIndex: 1
    });

    const reordered = reorderLayer(duplicated, "layer-image", 0);
    expect(reordered.layers.map(({ id, order }) => [id, order])).toEqual([
      ["layer-image", 0],
      ["layer-text", 1],
      ["layer-text-copy", 2]
    ]);
    expect(reordered.targetProfiles[0]?.layerLayouts.map(({ layerId, zIndex }) => [layerId, zIndex])).toEqual([
      ["layer-text", 1],
      ["layer-image", 0],
      ["layer-text-copy", 2]
    ]);
    expect(document.layers.map(({ id, order }) => [id, order])).toEqual([
      ["layer-text", 0],
      ["layer-image", 1]
    ]);
  });
});

describe("alert editor profile geometry", () => {
  it("updates exact geometry only for the selected target profile", () => {
    const document = createDocument();
    const landscape = document.targetProfiles[0];
    const updated = updateLayerGeometry(document, "vertical", "layer-text", {
      x: 140,
      y: 960,
      width: 700,
      height: 160
    });

    expect(profileLayout(updated, "vertical", "layer-text")).toMatchObject({
      x: 140,
      y: 960,
      width: 700,
      height: 160
    });
    expect(updated.targetProfiles[0]).toBe(landscape);
    expect(profileLayout(document, "vertical", "layer-text")).toMatchObject({
      x: 290,
      y: 800,
      width: 500,
      height: 120
    });
  });

  it.each([
    ["ArrowUp", { x: 710, y: 419 }],
    ["ArrowDown", { x: 710, y: 421 }],
    ["ArrowLeft", { x: 709, y: 420 }],
    ["ArrowRight", { x: 711, y: 420 }]
  ] as const)("moves one pixel for %s", (key, expected) => {
    const moved = moveLayerWithArrow(createDocument(), "landscape", "layer-text", key);
    expect(profileLayout(moved, "landscape", "layer-text")).toMatchObject(expected);
  });

  it("moves ten pixels when the arrow move is accelerated", () => {
    const document = createDocument();
    const moved = moveLayerWithArrow(document, "landscape", "layer-text", "ArrowRight", true);

    expect(profileLayout(moved, "landscape", "layer-text")).toMatchObject({ x: 720, y: 420 });
    expect(profileLayout(moved, "vertical", "layer-text")).toBe(profileLayout(document, "vertical", "layer-text"));
  });

  it("snaps positions to grid, canvas edges, and center lines for each profile", () => {
    expect(
      snapLayerGeometry(
        { x: 13, y: 27, width: 100, height: 80 },
        "landscape",
        { gridSize: 10, threshold: 4 }
      )
    ).toEqual({ x: 10, y: 30, width: 100, height: 80 });

    expect(
      snapLayerGeometry(
        { x: 3, y: 997, width: 100, height: 80 },
        "landscape",
        { gridSize: 64, threshold: 4 }
      )
    ).toEqual({ x: 0, y: 1000, width: 100, height: 80 });

    expect(
      snapLayerGeometry(
        { x: 913, y: 497, width: 100, height: 80 },
        "landscape",
        { gridSize: 64, threshold: 4 }
      )
    ).toEqual({ x: 910, y: 500, width: 100, height: 80 });

    expect(
      snapLayerGeometry(
        { x: 977, y: 1837, width: 100, height: 80 },
        "vertical",
        { gridSize: 64, threshold: 4 }
      )
    ).toEqual({ x: 980, y: 1840, width: 100, height: 80 });
  });
});

const animation = {
  mode: "preset",
  entrance: "fade",
  exit: "fade",
  durationMs: 300,
  delayMs: 0,
  easing: "ease-out"
} as const;

function layerBase(id: string, name: string, order: number) {
  return { id, name, order, visible: true, animation } as const;
}

function createDocument(): AlertEditorDocument {
  return {
    id: "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "New follower",
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: 0,
    rulePriority: 0,
    durationMs: 5000,
    layers: [
      { ...layerBase("layer-text", "Follower name", 0), type: "text", template: "{userName}" },
      { ...layerBase("layer-image", "Avatar", 1), type: "image", assetId: "asset-avatar" }
    ],
    targetProfiles: [
      {
        id: "landscape",
        enabled: true,
        reviewState: "ready",
        layerLayouts: [
          { layerId: "layer-text", x: 710, y: 420, width: 500, height: 120, zIndex: 0 },
          { layerId: "layer-image", x: 860, y: 220, width: 200, height: 200, zIndex: 1 }
        ]
      },
      {
        id: "vertical",
        enabled: false,
        reviewState: "needs-review",
        layerLayouts: [
          { layerId: "layer-text", x: 290, y: 800, width: 500, height: 120, zIndex: 0 },
          { layerId: "layer-image", x: 440, y: 500, width: 200, height: 200, zIndex: 1 }
        ]
      }
    ],
    samplePayloads: [
      { id: "sample-normal", label: "Normal follower", kind: "built-in", payload: { userName: "jamsethoth" } }
    ]
  };
}

function profileLayout(
  document: AlertEditorDocument,
  profileId: "landscape" | "vertical",
  layerId: string
) {
  return document.targetProfiles
    .find((profile) => profile.id === profileId)
    ?.layerLayouts.find((layout) => layout.layerId === layerId);
}
