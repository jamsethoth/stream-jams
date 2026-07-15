import { targetProfileDefinitions, type AlertEditorDocument, type AlertLayer } from "@stream-jams/core";

type LayerLayout = AlertEditorDocument["targetProfiles"][number]["layerLayouts"][number];
export type TargetProfileId = AlertEditorDocument["targetProfiles"][number]["id"];
export type LayerGeometry = Pick<LayerLayout, "x" | "y" | "width" | "height">;
export type LayerGeometryByProfile = Partial<Record<TargetProfileId, LayerGeometry>>;
export type EditorArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface AlertEditorState {
  readonly document: AlertEditorDocument;
  readonly savedDocument: AlertEditorDocument;
  readonly past: readonly AlertEditorDocument[];
  readonly future: readonly AlertEditorDocument[];
  readonly historyLimit: number;
}

export interface SnapOptions {
  readonly gridSize?: number;
  readonly threshold?: number;
}

export function createEditorState(document: AlertEditorDocument, historyLimit = 50): AlertEditorState {
  return {
    document,
    savedDocument: document,
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
    past: [...state.past, state.document].slice(-state.historyLimit),
    future: []
  };
}

export function undoEditorUpdate(state: AlertEditorState): AlertEditorState {
  const document = state.past.at(-1);
  if (document === undefined) {
    return state;
  }

  return {
    ...state,
    document,
    past: state.past.slice(0, -1),
    future: [state.document, ...state.future].slice(0, state.historyLimit)
  };
}

export function redoEditorUpdate(state: AlertEditorState): AlertEditorState {
  const document = state.future[0];
  if (document === undefined) {
    return state;
  }

  return {
    ...state,
    document,
    past: [...state.past, state.document].slice(-state.historyLimit),
    future: state.future.slice(1)
  };
}

export function markEditorSaved(state: AlertEditorState): AlertEditorState {
  return {
    ...state,
    savedDocument: state.document,
    past: [],
    future: []
  };
}

export function revertEditorChanges(state: AlertEditorState): AlertEditorState {
  return createEditorState(state.savedDocument, state.historyLimit);
}

export function isEditorDirty(state: AlertEditorState): boolean {
  return state.document !== state.savedDocument;
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
