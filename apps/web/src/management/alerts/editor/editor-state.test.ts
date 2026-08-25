import {
  alertEditorDocumentSchema,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type AlertEditorDocument,
  type AlertPriorityGroup,
  type AlertLayer
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import {
  addLayer,
  addShapeLayer,
  applyEditorUpdate,
  applyPriorityGroupUpdate,
  copyAlertDesign,
  copyProfileLayout,
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

    expect(state.past.map((snapshot) => snapshot.document.name)).toEqual(["One", "Two"]);
    state = undoEditorUpdate(state);
    expect(state.document.name).toBe("Two");
    expect(state.future.map((snapshot) => snapshot.document.name)).toEqual(["Three"]);

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

  it("keeps document and priority-group edits in one undo and redo sequence", () => {
    const initialGroups: readonly AlertPriorityGroup[] = [
      { variationIds: ["variant-high"] },
      { variationIds: ["variant-low"] }
    ];
    let state = createEditorState(createDocument(), initialGroups);

    state = applyEditorUpdate(state, (document) => ({ ...document, name: "Draft name" }));
    state = applyPriorityGroupUpdate(state, (groups) => [groups[1]!, groups[0]!]);

    expect(state.document.name).toBe("Draft name");
    expect(state.priorityGroups).toEqual([
      { variationIds: ["variant-low"] },
      { variationIds: ["variant-high"] }
    ]);

    state = undoEditorUpdate(state);
    expect(state.document.name).toBe("Draft name");
    expect(state.priorityGroups).toBe(initialGroups);

    state = undoEditorUpdate(state);
    expect(state.document.name).toBe("New follower");
    expect(state.priorityGroups).toBe(initialGroups);

    state = redoEditorUpdate(redoEditorUpdate(state));
    expect(state.document.name).toBe("Draft name");
    expect(state.priorityGroups).toEqual([
      { variationIds: ["variant-low"] },
      { variationIds: ["variant-high"] }
    ]);
  });

  it("treats group-only changes as dirty and saves or reverts both baselines", () => {
    const initialGroups: readonly AlertPriorityGroup[] = [
      { variationIds: ["variant-high"] },
      { variationIds: ["variant-low"] }
    ];
    const initial = createEditorState(createDocument(), initialGroups);
    const draft = applyPriorityGroupUpdate(initial, (groups) => [groups[1]!, groups[0]!]);

    expect(isEditorDirty(draft)).toBe(true);
    expect(draft.document).toBe(initial.document);

    const reverted = revertEditorChanges(draft);
    expect(reverted.document).toBe(initial.savedDocument);
    expect(reverted.priorityGroups).toBe(initial.savedPriorityGroups);
    expect(reverted.past).toEqual([]);
    expect(reverted.future).toEqual([]);
    expect(isEditorDirty(reverted)).toBe(false);

    const saved = markEditorSaved(draft);
    expect(saved.savedDocument).toBe(saved.document);
    expect(saved.savedPriorityGroups).toBe(saved.priorityGroups);
    expect(saved.past).toEqual([]);
    expect(saved.future).toEqual([]);
    expect(isEditorDirty(saved)).toBe(false);
  });

  it("treats variation order within one priority group as unchanged membership", () => {
    const initialGroups: readonly AlertPriorityGroup[] = [
      { variationIds: ["variant-a", "variant-b"] },
      { variationIds: ["variant-low"] }
    ];
    const initial = createEditorState(createDocument(), initialGroups);

    const reordered = applyPriorityGroupUpdate(initial, () => [
      { variationIds: ["variant-b", "variant-a"] },
      { variationIds: ["variant-low"] }
    ]);

    expect(reordered).toBe(initial);
    expect(isEditorDirty(reordered)).toBe(false);
  });

  it("applies the history limit across mixed document and group edits", () => {
    const initialGroups: readonly AlertPriorityGroup[] = [
      { variationIds: ["variant-high"] },
      { variationIds: ["variant-low"] }
    ];
    let state = createEditorState(createDocument(), initialGroups, 2);
    state = applyEditorUpdate(state, (document) => ({ ...document, name: "One" }));
    state = applyPriorityGroupUpdate(state, (groups) => [groups[1]!, groups[0]!]);
    state = applyEditorUpdate(state, (document) => ({ ...document, name: "Three" }));

    expect(state.past).toHaveLength(2);
    state = undoEditorUpdate(undoEditorUpdate(state));
    expect(state.document.name).toBe("One");
    expect(state.priorityGroups).toBe(initialGroups);
    expect(undoEditorUpdate(state)).toBe(state);
  });
});

describe("alert editor layer operations", () => {
  it("copies design and both profile layouts without replacing target identity or matching controls", () => {
    const source = {
      ...createDocument(),
      id: "alert-source",
      name: "Source",
      conditions: [{ field: "ingestProvider", operator: "equals" as const, value: "twitch" }],
      layers: createDocument().layers.map((layer) => ({ ...layer, name: `Source ${layer.name}` }))
    };
    const target = {
      ...createDocument(),
      id: "variant-target",
      parentAlertId: "alert-follow",
      kind: "variation" as const,
      name: "Target",
      enabled: false,
      variantConditions: [{ field: "raidViewers", operator: "min" as const, value: 50 }],
      weight: 4,
      priority: 7,
      cooldownSeconds: 20,
      samplePayloads: [{ id: "target-sample", label: "Target", kind: "built-in" as const, payload: { target: true } }]
    };

    const copied = copyAlertDesign(source, target);

    expect(copied.layers.map((layer) => layer.name)).toEqual(["Source Follower name", "Source Avatar"]);
    expect(copied.layers[0]).toMatchObject({
      textStyle: compatibilityAlertTextStyle,
      boxStyle: compatibilityAlertTextBoxStyle
    });
    expect(copied.targetProfiles.map((profile) => profile.layerLayouts)).toEqual(
      source.targetProfiles.map((profile) => profile.layerLayouts)
    );
    expect(copied).toMatchObject({
      id: target.id,
      parentAlertId: target.parentAlertId,
      kind: target.kind,
      name: target.name,
      enabled: false,
      conditions: target.conditions,
      variantConditions: target.variantConditions,
      weight: 4,
      priority: 7,
      cooldownSeconds: 20,
      samplePayloads: target.samplePayloads
    });
    expect(copied.layers).not.toBe(source.layers);
  });

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
    expect(duplicated.layers[1]).toMatchObject({
      textStyle: compatibilityAlertTextStyle,
      boxStyle: compatibilityAlertTextBoxStyle
    });
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

  it("adds a default shape immediately behind the selected visual layer in one undo step", () => {
    const initial = createEditorState(createDocument());
    const updated = applyEditorUpdate(initial, (document) => addShapeLayer(document, "layer-image").document);
    const shape = updated.document.layers[1];

    expect(shape).toMatchObject({
      id: "layer-shape-3",
      name: "Shape",
      type: "shape",
      visible: true,
      order: 1,
      fill: "#000000B8",
      animation
    });
    expect(updated.document.layers.map(({ id, order }) => [id, order])).toEqual([
      ["layer-text", 0],
      ["layer-shape-3", 1],
      ["layer-image", 2]
    ]);
    expect(profileLayout(updated.document, "landscape", "layer-shape-3")).toEqual({
      layerId: "layer-shape-3",
      x: 610,
      y: 720,
      width: 700,
      height: 160,
      zIndex: 1
    });
    expect(profileLayout(updated.document, "vertical", "layer-shape-3")).toEqual({
      layerId: "layer-shape-3",
      x: 190,
      y: 1180,
      width: 700,
      height: 160,
      zIndex: 1
    });
    expect(alertEditorDocumentSchema.safeParse(updated.document).success).toBe(true);
    expect(updated.past).toHaveLength(1);
    expect(undoEditorUpdate(updated).document).toBe(initial.document);
  });

  it("adds a shape at the back when the selection is not visual", () => {
    const documentWithAudio = addLayer(createDocument(), {
      ...layerBase("layer-audio", "Audio", 2),
      type: "audio",
      assetId: "asset-audio",
      volume: 1
    });

    const result = addShapeLayer(documentWithAudio, "layer-audio");

    expect(result.layerId).toBe("layer-shape-4");
    expect(result.document.layers.map(({ id }) => id)).toEqual([
      "layer-shape-4",
      "layer-text",
      "layer-image",
      "layer-audio"
    ]);
  });

  it("fails shape creation without exposing a partial document when invariants are broken", () => {
    const invalid = {
      ...createDocument(),
      targetProfiles: createDocument().targetProfiles.slice(0, 1)
    } as AlertEditorDocument;

    expect(() => addShapeLayer(invalid, null)).toThrow("Shape layer could not be created safely");
    expect(invalid.layers).toHaveLength(2);
    expect(invalid.targetProfiles).toHaveLength(1);
  });

  it("preserves shape data through design copy, profile copy, and layer duplication", () => {
    const shaped = addShapeLayer(createDocument(), "layer-text").document;
    const shape = shaped.layers.find((layer) => layer.type === "shape")!;
    const source = updateLayer(shaped, shape.id, (layer) => layer.type === "shape"
      ? { ...layer, name: "Badge", fill: "#336699CC" }
      : layer);
    const target = { ...createDocument(), id: "alert-target", name: "Target" };

    const designCopy = copyAlertDesign(source, target);
    const layerCopy = duplicateLayer(source, shape.id, "layer-shape-copy");
    const profileCopy = copyProfileLayout(source, "landscape", "vertical");

    expect(designCopy.layers.find((layer) => layer.type === "shape")).toMatchObject({
      id: shape.id,
      name: "Badge",
      fill: "#336699CC"
    });
    expect(profileLayout(designCopy, "vertical", shape.id)).toEqual(profileLayout(source, "vertical", shape.id));
    expect(layerCopy.layers.find((layer) => layer.id === "layer-shape-copy")).toMatchObject({
      name: "Badge copy",
      type: "shape",
      fill: "#336699CC"
    });
    expect(profileLayout(layerCopy, "landscape", "layer-shape-copy")).toMatchObject({
      ...profileLayout(source, "landscape", shape.id),
      layerId: "layer-shape-copy",
      zIndex: 1
    });
    expect(profileLayout(profileCopy, "vertical", shape.id)).toMatchObject({
      x: 343,
      y: 1280,
      width: 394,
      height: 284
    });
  });
});

describe("alert editor profile geometry", () => {
  it("scales a copied layout to the target profile without changing the source", () => {
    const document = createDocument();
    const sourceProfile = document.targetProfiles[0];
    const copied = copyProfileLayout(document, "landscape", "vertical");

    expect(copied.targetProfiles[0]).toBe(sourceProfile);
    expect(copied.targetProfiles[1]).toMatchObject({
      id: "vertical",
      enabled: false,
      reviewState: "needs-review",
      layerLayouts: [
        { layerId: "layer-text", x: 399, y: 747, width: 281, height: 213, zIndex: 0 },
        { layerId: "layer-image", x: 484, y: 391, width: 113, height: 356, zIndex: 1 }
      ]
    });
    expect(document.targetProfiles[1]?.layerLayouts[0]).toMatchObject({ x: 290, y: 800, width: 500, height: 120 });
  });

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
      {
        ...layerBase("layer-text", "Follower name", 0),
        type: "text",
        template: "{userName}",
        textStyle: structuredClone(compatibilityAlertTextStyle),
        boxStyle: structuredClone(compatibilityAlertTextBoxStyle)
      },
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
