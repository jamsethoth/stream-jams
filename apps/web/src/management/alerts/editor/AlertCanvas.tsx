import type { AlertEditorDocument, AlertLayer, TargetProfileId } from "@stream-jams/core";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { AssetApi } from "../../assets/asset-api.js";
import { overlayPresetAnimationStyle } from "../../../overlay/components/OverlaySurface.js";
import { snapLayerGeometry, type LayerGeometry } from "./editor-state.js";

interface AlertCanvasProps {
  readonly assetApi: AssetApi;
  readonly document: AlertEditorDocument;
  readonly onGeometryChange: (layerId: string, geometry: LayerGeometry) => void;
  readonly onSelectLayer: (layerId: string) => void;
  readonly preview: boolean;
  readonly previewRunId?: number;
  readonly profileId: TargetProfileId;
  readonly samplePayload: Record<string, unknown>;
  readonly selectedLayerId: string | null;
  readonly zoom: number;
}

interface PointerOperation {
  readonly layerId: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startGeometry: LayerGeometry;
  readonly mode: "move" | "resize";
}

export function AlertCanvas(props: AlertCanvasProps) {
  const profile = props.document.targetProfiles.find((candidate) => candidate.id === props.profileId)!;
  const dimensions = props.profileId === "landscape" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
  const surfaceRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<PointerOperation | null>(null);
  const layouts = new Map(profile.layerLayouts.map((layout) => [layout.layerId, layout]));

  function beginOperation(event: ReactPointerEvent<HTMLElement>, layerId: string, mode: "move" | "resize") {
    const layout = layouts.get(layerId);
    if (layout === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    operationRef.current = {
      layerId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startGeometry: layout,
      mode
    };
    props.onSelectLayer(layerId);
  }

  function continueOperation(event: ReactPointerEvent<HTMLElement>) {
    const operation = operationRef.current;
    const surface = surfaceRef.current;
    if (operation === null || operation.pointerId !== event.pointerId || surface === null) return;
    const rect = surface.getBoundingClientRect();
    const deltaX = (event.clientX - operation.startClientX) * dimensions.width / rect.width;
    const deltaY = (event.clientY - operation.startClientY) * dimensions.height / rect.height;
    const raw = operation.mode === "move"
      ? { ...operation.startGeometry, x: operation.startGeometry.x + deltaX, y: operation.startGeometry.y + deltaY }
      : {
          ...operation.startGeometry,
          width: Math.max(24, operation.startGeometry.width + deltaX),
          height: Math.max(24, operation.startGeometry.height + deltaY)
        };
    const constrained = constrainGeometry(snapLayerGeometry(raw, props.profileId), dimensions);
    props.onGeometryChange(operation.layerId, constrained);
  }

  function endOperation(event: ReactPointerEvent<HTMLElement>) {
    if (operationRef.current?.pointerId === event.pointerId) operationRef.current = null;
  }

  return (
    <div
      aria-label={`${profileLabel(props.profileId)} alert canvas`}
      className="alert-canvas"
      role="region"
    >
      <div className="alert-canvas__viewport">
        <div
          className={`alert-canvas__surface alert-canvas__surface--${props.profileId}${props.preview ? " alert-canvas__surface--preview" : ""}`}
          ref={surfaceRef}
          style={{ width: `${props.zoom}%` }}
        >
          <div aria-hidden="true" className="alert-canvas__safe-area" />
          <div aria-hidden="true" className="alert-canvas__center-line alert-canvas__center-line--vertical" />
          <div aria-hidden="true" className="alert-canvas__center-line alert-canvas__center-line--horizontal" />
          {props.document.layers
            .filter((layer) => layer.visible && layouts.has(layer.id))
            .sort((left, right) => left.order - right.order)
            .map((layer) => {
              const layout = layouts.get(layer.id)!;
              return (
                <div
                  aria-label={`${layer.name} layer`}
                  className={`alert-canvas__layer${props.selectedLayerId === layer.id ? " alert-canvas__layer--selected" : ""}`}
                  key={`${layer.id}:${props.preview ? props.previewRunId ?? 0 : "edit"}`}
                  onClick={() => props.onSelectLayer(layer.id)}
                  onKeyDown={(event) => {
                    if (!event.key.startsWith("Arrow")) return;
                    event.preventDefault();
                    const step = event.shiftKey ? 10 : 1;
                    const geometry = {
                      ...layout,
                      x: layout.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
                      y: layout.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)
                    };
                    props.onGeometryChange(layer.id, constrainGeometry(geometry, dimensions));
                  }}
                  onPointerDown={(event) => beginOperation(event, layer.id, "move")}
                  onPointerMove={continueOperation}
                  onPointerUp={endOperation}
                  role="button"
                  style={layerStyle(
                    layout,
                    dimensions,
                    props.preview ? layer.animation : null,
                    props.document.durationMs
                  )}
                  tabIndex={0}
                >
                  <CanvasLayer assetApi={props.assetApi} layer={layer} samplePayload={props.samplePayload} />
                  <span
                    aria-hidden="true"
                    className="alert-canvas__resize-handle"
                    onPointerDown={(event) => beginOperation(event, layer.id, "resize")}
                    onPointerMove={continueOperation}
                    onPointerUp={endOperation}
                  />
                </div>
              );
            })}
          {props.document.layers.some((layer) => layer.visible && layouts.has(layer.id)) ? null : (
            <p className="alert-canvas__empty">Add or show a visual layer to begin.</p>
          )}
          {props.preview ? <span className="alert-canvas__preview-label">Preview</span> : null}
        </div>
      </div>
      <footer>
        <span>{dimensions.width} x {dimensions.height}</span>
        <span>Safe area and center guides</span>
      </footer>
    </div>
  );
}

function CanvasLayer({
  assetApi,
  layer,
  samplePayload
}: {
  readonly assetApi: AssetApi;
  readonly layer: AlertLayer;
  readonly samplePayload: Record<string, unknown>;
}) {
  if (layer.type === "text") {
    return <span className="alert-canvas__text">{renderTemplate(layer.template, samplePayload)}</span>;
  }
  if (layer.type === "image" || layer.type === "video") {
    return <CanvasAsset assetApi={assetApi} assetId={layer.assetId} kind={layer.type} />;
  }
  if (layer.type === "shape") {
    return <span className="alert-canvas__shape" style={{ background: layer.fill }} />;
  }
  return <span>{layer.name}</span>;
}

function CanvasAsset({ assetApi, assetId, kind }: { readonly assetApi: AssetApi; readonly assetId: string; readonly kind: "image" | "video" }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void assetApi.getAssetFile(assetId).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {
      if (active) setUrl(null);
    });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [assetApi, assetId]);
  if (url === null) return <span className="alert-canvas__asset-placeholder">{kind === "video" ? "Video" : "Image"}</span>;
  return kind === "video"
    ? <video aria-label="Video asset preview" autoPlay loop muted src={url} />
    : <img alt="" src={url} />;
}

function layerStyle(
  layout: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly zIndex: number },
  dimensions: { readonly width: number; readonly height: number },
  animation: AlertLayer["animation"] | null,
  instructionDurationMs: number
): CSSProperties {
  return {
    height: `${layout.height / dimensions.height * 100}%`,
    left: `${layout.x / dimensions.width * 100}%`,
    top: `${layout.y / dimensions.height * 100}%`,
    width: `${layout.width / dimensions.width * 100}%`,
    zIndex: layout.zIndex,
    ...overlayPresetAnimationStyle(animation, instructionDurationMs)
  };
}

function constrainGeometry(
  geometry: LayerGeometry,
  dimensions: { readonly width: number; readonly height: number }
): LayerGeometry {
  const width = Math.min(Math.max(24, Math.round(geometry.width)), dimensions.width);
  const height = Math.min(Math.max(24, Math.round(geometry.height)), dimensions.height);
  return {
    x: Math.max(0, Math.min(Math.round(geometry.x), dimensions.width - width)),
    y: Math.max(0, Math.min(Math.round(geometry.y), dimensions.height - height)),
    width,
    height
  };
}

function renderTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{([^{}]+)\}/gu, (_match, path: string) => {
    const value = path.trim().split(".").reduce<unknown>((current, segment) =>
      typeof current === "object" && current !== null ? (current as Record<string, unknown>)[segment] : undefined, values);
    return value === null || value === undefined || typeof value === "object" ? "" : String(value);
  });
}

function profileLabel(profileId: TargetProfileId): string {
  return profileId === "landscape" ? "Landscape" : "Vertical";
}
