import {
  alertEditorDocumentSchema,
  areAlertPriorityGroupsEqual,
  targetProfileDefinitions,
  type AlertEditorDocument,
  type AlertLayer,
  type AlertPriorityGroup
} from "@stream-jams/core";

type LayerLayout = AlertEditorDocument["targetProfiles"][number]["layerLayouts"][number];
export type TargetProfileId = AlertEditorDocument["targetProfiles"][number]["id"];
export type LayerGeometry = Pick<LayerLayout, "x" | "y" | "width" | "height">;
export type LayerGeometryByProfile = Partial<Record<TargetProfileId, LayerGeometry>>;
export type EditorArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface CanvasViewState {
  readonly zoom: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

export interface AlertEditorSnapshot {
  readonly document: AlertEditorDocument;
  readonly priorityGroups: readonly AlertPriorityGroup[];
}

export interface AlertEditorState {
  readonly document: AlertEditorDocument;
  readonly savedDocument: AlertEditorDocument;
  readonly priorityGroups: readonly AlertPriorityGroup[];
  readonly savedPriorityGroups: readonly AlertPriorityGroup[];
  readonly past: readonly AlertEditorSnapshot[];
  readonly future: readonly AlertEditorSnapshot[];
  readonly historyLimit: number;
}

export interface SnapOptions {
  readonly gridSize?: number;
  readonly threshold?: number;
}

export interface AddShapeLayerResult {
  readonly document: AlertEditorDocument;
  readonly layerId: string;
}

export function createEditorState(document: AlertEditorDocument, historyLimit?: number): AlertEditorState;
export function createEditorState(
  document: AlertEditorDocument,
  priorityGroups: readonly AlertPriorityGroup[],
  historyLimit?: number
): AlertEditorState;
export function createEditorState(
  document: AlertEditorDocument,
  priorityGroupsOrHistoryLimit: readonly AlertPriorityGroup[] | number = [],
  suppliedHistoryLimit = 50
): AlertEditorState {
  const priorityGroups = typeof priorityGroupsOrHistoryLimit === "number" ? [] : priorityGroupsOrHistoryLimit;
  const historyLimit = typeof priorityGroupsOrHistoryLimit === "number"
    ? priorityGroupsOrHistoryLimit
    : suppliedHistoryLimit;
  return {
    document,
    savedDocument: document,
    priorityGroups,
    savedPriorityGroups: priorityGroups,
    past: [],
    future: [],
    historyLimit: Math.max(1, Math.trunc(historyLimit))
  };
}

export function applyEditorUpdate(
  state: AlertEditorState,
  update: (document: AlertEditorDocument) => AlertEditorDocument
): AlertEditorState {
  const document = update(state.document);
  if (document === state.document) {
    return state;
  }

  return {
    ...state,
    document,
    past: [...state.past, currentSnapshot(state)].slice(-state.historyLimit),
    future: []
  };
}

export function applyPriorityGroupUpdate(
  state: AlertEditorState,
  update: (groups: readonly AlertPriorityGroup[]) => readonly AlertPriorityGroup[]
): AlertEditorState {
  const priorityGroups = update(state.priorityGroups);
  if (areAlertPriorityGroupsEqual(priorityGroups, state.priorityGroups)) {
    return state;
  }

  return {
    ...state,
    priorityGroups,
    past: [...state.past, currentSnapshot(state)].slice(-state.historyLimit),
    future: []
  };
}

export function undoEditorUpdate(state: AlertEditorState): AlertEditorState {
  const snapshot = state.past.at(-1);
  if (snapshot === undefined) {
    return state;
  }

  return {
    ...state,
    ...snapshot,
    past: state.past.slice(0, -1),
    future: [currentSnapshot(state), ...state.future].slice(0, state.historyLimit)
  };
}

export function redoEditorUpdate(state: AlertEditorState): AlertEditorState {
  const snapshot = state.future[0];
  if (snapshot === undefined) {
    return state;
  }

  return {
    ...state,
    ...snapshot,
    past: [...state.past, currentSnapshot(state)].slice(-state.historyLimit),
    future: state.future.slice(1)
  };
}

export function markEditorSaved(state: AlertEditorState): AlertEditorState {
  return {
    ...state,
    savedDocument: state.document,
    savedPriorityGroups: state.priorityGroups,
    past: [],
    future: []
  };
}

export function revertEditorChanges(state: AlertEditorState): AlertEditorState {
  return createEditorState(state.savedDocument, state.savedPriorityGroups, state.historyLimit);
}

export function isEditorDirty(state: AlertEditorState): boolean {
  return state.document !== state.savedDocument
    || arePriorityGroupsDirty(state);
}

export function arePriorityGroupsDirty(state: AlertEditorState): boolean {
  return !areAlertPriorityGroupsEqual(state.priorityGroups, state.savedPriorityGroups);
}

function currentSnapshot(state: AlertEditorState): AlertEditorSnapshot {
  return { document: state.document, priorityGroups: state.priorityGroups };
}

export function copyAlertDesign(
  source: AlertEditorDocument,
  target: AlertEditorDocument
): AlertEditorDocument {
  const sourceProfiles = new Map(source.targetProfiles.map((profile) => [profile.id, profile]));
  return {
    ...target,
    layers: structuredClone(source.layers),
    targetProfiles: target.targetProfiles.map((profile) => ({
      ...profile,
      layerLayouts: structuredClone(sourceProfiles.get(profile.id)?.layerLayouts ?? [])
    }))
  };
}

export function copyProfileLayout(
  document: AlertEditorDocument,
  sourceId: TargetProfileId,
  targetId: TargetProfileId
): AlertEditorDocument {
  if (sourceId === targetId) return document;
  const source = document.targetProfiles.find((profile) => profile.id === sourceId);
  const sourceDefinition = targetProfileDefinitions.find((profile) => profile.id === sourceId);
  const targetDefinition = targetProfileDefinitions.find((profile) => profile.id === targetId);
  if (source === undefined || sourceDefinition === undefined || targetDefinition === undefined) return document;

  const scaleX = targetDefinition.width / sourceDefinition.width;
  const scaleY = targetDefinition.height / sourceDefinition.height;
  return {
    ...document,
    targetProfiles: document.targetProfiles.map((profile) => profile.id !== targetId ? profile : {
      ...profile,
      enabled: false,
      reviewState: "needs-review",
      layerLayouts: source.layerLayouts.map((layout) => ({
        ...layout,
        x: Math.round(layout.x * scaleX),
        y: Math.round(layout.y * scaleY),
        width: Math.round(layout.width * scaleX),
        height: Math.round(layout.height * scaleY)
      }))
    })
  };
}

export function updateLayer(
  document: AlertEditorDocument,
  layerId: string,
  update: (layer: AlertLayer) => AlertLayer
): AlertEditorDocument {
  const layerIndex = document.layers.findIndex((layer) => layer.id === layerId);
  if (layerIndex < 0) {
    return document;
  }

  const layer = document.layers[layerIndex]!;
  const updatedLayer = update(layer);
  if (updatedLayer === layer) {
    return document;
  }

  return {
    ...document,
    layers: document.layers.map((candidate, index) => index === layerIndex ? updatedLayer : candidate)
  };
}

export function addLayer(
  document: AlertEditorDocument,
  layer: AlertLayer,
  geometryByProfile: LayerGeometryByProfile = {}
): AlertEditorDocument {
  if (document.layers.some((candidate) => candidate.id === layer.id)) {
    return document;
  }

  const targetProfiles = document.targetProfiles.map((profile) => {
    const geometry = geometryByProfile[profile.id];
    return geometry === undefined
      ? profile
      : {
          ...profile,
          layerLayouts: [...profile.layerLayouts, { layerId: layer.id, ...geometry, zIndex: document.layers.length }]
        };
  });

  return synchronizeLayerOrder(document, [...document.layers, layer], targetProfiles);
}

export function addShapeLayer(
  document: AlertEditorDocument,
  selectedLayerId: string | null
): AddShapeLayerResult {
  const layerId = nextLayerId(document, "shape");
  const selectedIndex = document.layers.findIndex((layer) => layer.id === selectedLayerId && isVisualLayer(layer));
  const insertIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const appended = addLayer(
    document,
    {
      id: layerId,
      name: "Shape",
      type: "shape",
      visible: true,
      order: document.layers.length,
      fill: "#000000B8",
      animation: {
        mode: "preset",
        entrance: "fade",
        exit: "fade",
        durationMs: 300,
        delayMs: 0,
        easing: "ease-out"
      }
    },
    {
      landscape: { x: 610, y: 720, width: 700, height: 160 },
      vertical: { x: 190, y: 1180, width: 700, height: 160 }
    }
  );
  const candidate = reorderLayer(appended, layerId, insertIndex);
  if (!alertEditorDocumentSchema.safeParse(candidate).success) {
    throw new Error("Shape layer could not be created safely.");
  }
  return { document: candidate, layerId };
}

export function deleteLayer(document: AlertEditorDocument, layerId: string): AlertEditorDocument {
  if (!document.layers.some((layer) => layer.id === layerId)) {
    return document;
  }

  return synchronizeLayerOrder(
    document,
    document.layers.filter((layer) => layer.id !== layerId),
    document.targetProfiles.map((profile) => ({
      ...profile,
      layerLayouts: profile.layerLayouts.filter((layout) => layout.layerId !== layerId)
    }))
  );
}

export function duplicateLayer(
  document: AlertEditorDocument,
  layerId: string,
  duplicateLayerId: string,
  duplicateName?: string
): AlertEditorDocument {
  const sourceIndex = document.layers.findIndex((layer) => layer.id === layerId);
  if (sourceIndex < 0 || document.layers.some((layer) => layer.id === duplicateLayerId)) {
    return document;
  }

  const source = document.layers[sourceIndex]!;
  const duplicate: AlertLayer = {
    ...source,
    id: duplicateLayerId,
    name: duplicateName ?? `${source.name} copy`
  };
  const layers = [...document.layers];
  layers.splice(sourceIndex + 1, 0, duplicate);

  const targetProfiles = document.targetProfiles.map((profile) => {
    const sourceLayout = profile.layerLayouts.find((layout) => layout.layerId === layerId);
    return sourceLayout === undefined
      ? profile
      : {
          ...profile,
          layerLayouts: [...profile.layerLayouts, { ...sourceLayout, layerId: duplicateLayerId }]
        };
  });

  return synchronizeLayerOrder(document, layers, targetProfiles);
}

export function reorderLayer(
  document: AlertEditorDocument,
  layerId: string,
  toIndex: number
): AlertEditorDocument {
  const fromIndex = document.layers.findIndex((layer) => layer.id === layerId);
  if (fromIndex < 0 || !Number.isInteger(toIndex)) {
    return document;
  }

  const targetIndex = Math.max(0, Math.min(document.layers.length - 1, toIndex));
  if (fromIndex === targetIndex) {
    return document;
  }

  const layers = [...document.layers];
  const [layer] = layers.splice(fromIndex, 1);
  layers.splice(targetIndex, 0, layer!);
  return synchronizeLayerOrder(document, layers, document.targetProfiles);
}

export function toggleLayerVisible(document: AlertEditorDocument, layerId: string): AlertEditorDocument {
  return updateLayer(document, layerId, (layer) => ({ ...layer, visible: !layer.visible }));
}

export function updateLayerGeometry(
  document: AlertEditorDocument,
  profileId: TargetProfileId,
  layerId: string,
  update: Partial<LayerGeometry>
): AlertEditorDocument {
  let changed = false;
  const targetProfiles = document.targetProfiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile;
    }

    let profileChanged = false;
    const layerLayouts = profile.layerLayouts.map((layout) => {
      if (layout.layerId !== layerId) {
        return layout;
      }

      const updatedLayout = { ...layout, ...update };
      if (sameGeometry(layout, updatedLayout)) {
        return layout;
      }

      profileChanged = true;
      return updatedLayout;
    });
    if (!profileChanged) {
      return profile;
    }

    changed = true;
    return { ...profile, layerLayouts };
  });

  return changed ? { ...document, targetProfiles } : document;
}

export function moveLayerWithArrow(
  document: AlertEditorDocument,
  profileId: TargetProfileId,
  layerId: string,
  key: EditorArrowKey,
  accelerated = false
): AlertEditorDocument {
  const layout = document.targetProfiles
    .find((profile) => profile.id === profileId)
    ?.layerLayouts.find((candidate) => candidate.layerId === layerId);
  if (layout === undefined) {
    return document;
  }

  const step = accelerated ? 10 : 1;
  switch (key) {
    case "ArrowUp":
      return updateLayerGeometry(document, profileId, layerId, { y: layout.y - step });
    case "ArrowDown":
      return updateLayerGeometry(document, profileId, layerId, { y: layout.y + step });
    case "ArrowLeft":
      return updateLayerGeometry(document, profileId, layerId, { x: layout.x - step });
    case "ArrowRight":
      return updateLayerGeometry(document, profileId, layerId, { x: layout.x + step });
  }
}

export function snapLayerGeometry(
  geometry: LayerGeometry,
  profileId: TargetProfileId,
  options: SnapOptions = {}
): LayerGeometry {
  const profile = targetProfileDefinitions.find((candidate) => candidate.id === profileId)!;
  const gridSize = options.gridSize ?? 10;
  const threshold = options.threshold ?? 5;

  return {
    ...geometry,
    x: nearestSnap(
      geometry.x,
      [0, profile.width - geometry.width, (profile.width - geometry.width) / 2, Math.round(geometry.x / gridSize) * gridSize],
      threshold
    ),
    y: nearestSnap(
      geometry.y,
      [0, profile.height - geometry.height, (profile.height - geometry.height) / 2, Math.round(geometry.y / gridSize) * gridSize],
      threshold
    )
  };
}

function synchronizeLayerOrder(
  document: AlertEditorDocument,
  layers: readonly AlertLayer[],
  targetProfiles: AlertEditorDocument["targetProfiles"]
): AlertEditorDocument {
  const zIndexes = new Map(layers.map((layer, index) => [layer.id, index]));
  return {
    ...document,
    layers: layers.map((layer, index): AlertLayer => ({ ...layer, order: index })),
    targetProfiles: targetProfiles.map((profile) => ({
      ...profile,
      layerLayouts: profile.layerLayouts.map((layout) => {
        const zIndex = zIndexes.get(layout.layerId);
        return zIndex === undefined || zIndex === layout.zIndex ? layout : { ...layout, zIndex };
      })
    }))
  };
}

function sameGeometry(left: LayerGeometry, right: LayerGeometry): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}

function isVisualLayer(layer: AlertLayer): boolean {
  return layer.type === "text" || layer.type === "image" || layer.type === "video" || layer.type === "shape";
}

function nextLayerId(document: AlertEditorDocument, type: AlertLayer["type"]): string {
  let suffix = document.layers.length + 1;
  while (document.layers.some((layer) => layer.id === `layer-${type}-${suffix}`)) suffix += 1;
  return `layer-${type}-${suffix}`;
}

function nearestSnap(value: number, candidates: readonly number[], threshold: number): number {
  let result = value;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance <= threshold && distance < nearestDistance) {
      result = candidate;
      nearestDistance = distance;
    }
  }

  return result;
}
