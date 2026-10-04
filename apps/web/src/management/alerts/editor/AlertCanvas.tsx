import { createAlertTemplateContext, type AlertEditorDocument, type AlertLayer, type AlertTextWarp, type TargetProfileId } from "@stream-jams/core";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { AssetApi } from "../../assets/asset-api.js";
import type { MediaPreviewGroupState, MediaPreviewGroup } from "../../assets/media-preview-group.js";
import { useMediaPreviewGroup } from "../../assets/use-media-preview-group.js";
import { AlertTextContent } from "../../../overlay/components/AlertTextContent.js";
import { TextWarpEditor } from "./TextWarpEditor.js";
import { overlayPresetAnimationStyle } from "../../../overlay/components/OverlaySurface.js";
import { type CanvasViewState, type LayerGeometry } from "./editor-state.js";
import { snapEditorRect, type SnapGuide } from "../../editor/snapping.js";
import { renderAlertTemplatePreview } from "./template-preview.js";

export interface CanvasBackground {
  readonly mode: "checkerboard" | "neutral" | "test";
  readonly color: string;
}

interface AlertCanvasProps {
  readonly warpLayerId?: string | null;
  readonly onWarpChange?: (layerId: string, warp: AlertTextWarp) => void;
  readonly onWarpDone?: () => void;
  readonly assetApi: AssetApi;
  readonly assetMediaTypes?: Readonly<Record<string, "image" | "gif" | "video">>;
  readonly background?: CanvasBackground;
  readonly document: AlertEditorDocument;
  readonly fitRequestId?: number;
  readonly onGeometryChange: (layerId: string, geometry: LayerGeometry) => void;
  readonly onSelectLayer: (layerId: string) => void;
  readonly onViewStateChange?: (viewState: CanvasViewState) => void;
  readonly preview: boolean;
  readonly previewMedia?: MediaPreviewGroup | null;
  readonly assetRevision?: string;
  readonly previewElapsedMs?: number;
  readonly previewRunId?: number;
  readonly previewTextByLayerId?: Readonly<Record<string, string>>;
  readonly profileId: TargetProfileId;
  readonly samplePayload: Record<string, unknown>;
  readonly selectedLayerId: string | null;
  readonly showGrid?: boolean;
  readonly snapToGrid?: boolean;
  readonly snapToAlignment?: boolean;
  readonly showSafeArea?: boolean;
  readonly viewState?: CanvasViewState;
  /** @deprecated Use viewState for profile-specific zoom and pan state. */
  readonly zoom?: number;
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
  const [draftWarp, setDraftWarp] = useState<{ layerId: string; value: AlertTextWarp } | null>(null);
  const loadFont = useCallback((assetId: string) => props.assetApi.getAssetFile(assetId), [props.assetApi, props.assetRevision]);
  const profile = props.document.targetProfiles.find((candidate) => candidate.id === props.profileId)!;
  const visibleLayouts = new Set(profile.layerLayouts.map(layout => layout.layerId));
  const visualIds = props.document.layers.flatMap(layer => layer.visible && visibleLayouts.has(layer.id) && (layer.type === "image" || layer.type === "video") ? [layer.assetId] : []);
  const staticMedia = useMediaPreviewGroup(props.assetApi, visualIds, props.assetRevision ?? "", !props.preview || props.previewMedia === undefined);
  const mediaGroup = props.preview ? props.previewMedia ?? staticMedia.group : staticMedia.group;
  const mediaState = useSyncExternalStore(mediaGroup?.subscribe ?? emptySubscribe, mediaGroup?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const dimensions = props.profileId === "landscape" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
  const surfaceRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const processedFitRequestRef = useRef(0);
  const operationRef = useRef<PointerOperation | null>(null);
  const [snapGuides, setSnapGuides] = useState<readonly SnapGuide[]>([]);
  useEffect(() => { operationRef.current = null; setSnapGuides([]); }, [props.profileId, props.preview]);
  const layouts = new Map(profile.layerLayouts.map((layout) => [layout.layerId, layout]));
  const warpLayer = !props.preview && props.warpLayerId === props.selectedLayerId ? props.document.layers.find((layer) => layer.id === props.warpLayerId && layer.visible && layer.type === "text") : undefined;
  const warpLayout = warpLayer === undefined ? undefined : layouts.get(warpLayer.id);
  const authoredWarp = warpLayer?.type === "text" ? warpLayer.textStyle.warp : undefined;
  useEffect(() => { setDraftWarp(null); }, [props.profileId, props.warpLayerId, props.selectedLayerId, props.preview, authoredWarp]);
  const viewState = props.viewState ?? { zoom: props.zoom ?? 100, scrollLeft: 0, scrollTop: 0 };
  const background = props.background ?? { mode: "checkerboard", color: "#1a1e23" };
  const templateContext = createAlertTemplateContext({
    eventType: props.document.eventType,
    samplePayload: props.samplePayload
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    viewport.scrollLeft = viewState.scrollLeft;
    viewport.scrollTop = viewState.scrollTop;
  }, [props.profileId, viewState.scrollLeft, viewState.scrollTop]);

  useEffect(() => {
    const requestId = props.fitRequestId ?? 0;
    if (props.viewState !== undefined && (requestId === 0 || requestId === processedFitRequestRef.current)) return;
    processedFitRequestRef.current = requestId;
    const viewport = viewportRef.current;
    if (viewport === null || props.onViewStateChange === undefined) return;
    const horizontalZoom = (Math.max(1, viewport.clientWidth - 56) / dimensions.width) * 100;
    const verticalZoom = (Math.max(1, viewport.clientHeight - 56) / dimensions.height) * 100;
    props.onViewStateChange({ zoom: Math.max(10, Math.min(150, Math.floor(Math.min(horizontalZoom, verticalZoom)))), scrollLeft: 0, scrollTop: 0 });
  }, [dimensions.height, dimensions.width, props.fitRequestId, props.onViewStateChange, props.viewState]);

  function beginOperation(event: ReactPointerEvent<HTMLElement>, layerId: string, mode: "move" | "resize") {
    if (layerId === warpLayer?.id) return;
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
    const peers = props.document.layers.flatMap(layer => {
      const layout = layouts.get(layer.id);
      const visual = layer.type === "text" || layer.type === "image" || layer.type === "video" || layer.type === "shape";
      return layer.id !== operation.layerId && layer.visible && visual && layout !== undefined ? [layout] : [];
    });
    const snapped = snapEditorRect(raw, { mode: operation.mode, bounds: dimensions, peers,
      grid: props.snapToGrid ?? true, alignment: props.snapToAlignment ?? true, scale: rect.width / dimensions.width, minSize: 24 });
    setSnapGuides(snapped.guides);
    props.onGeometryChange(operation.layerId, snapped.rect);
  }

  function endOperation(event: ReactPointerEvent<HTMLElement>) {
    if (operationRef.current?.pointerId === event.pointerId) { operationRef.current = null; setSnapGuides([]); }
  }

  return (
    <div
      aria-label={`${profileLabel(props.profileId)} alert canvas`}
      className="alert-canvas"
      role="region"
    >
      <div
        className="alert-canvas__viewport"
        onScroll={(event) => props.onViewStateChange?.({
          ...viewState,
          scrollLeft: event.currentTarget.scrollLeft,
          scrollTop: event.currentTarget.scrollTop
        })}
        ref={viewportRef}
      >
        <div
          className={`alert-canvas__surface alert-canvas__surface--${props.profileId}${props.preview ? " alert-canvas__surface--preview" : ""}`}
          ref={surfaceRef}
          style={{
            backgroundColor: background.color,
            backgroundImage: background.mode === "checkerboard" ? undefined : "none",
            width: `${dimensions.width * viewState.zoom / 100}px`
          }}
        >
          {props.showGrid === false ? null : <div aria-hidden="true" className="alert-canvas__grid" />}
          {props.showSafeArea === false ? null : (
            <>
              <div aria-hidden="true" className="alert-canvas__safe-area" />
              <div aria-hidden="true" className="alert-canvas__center-line alert-canvas__center-line--vertical" />
              <div aria-hidden="true" className="alert-canvas__center-line alert-canvas__center-line--horizontal" />
            </>
          )}
          {props.document.layers
            .filter((layer) => layer.visible && layouts.has(layer.id))
            .sort((left, right) => left.order - right.order)
            .map((layer) => {
              const layout = layouts.get(layer.id)!;
              return (
                <div
                  aria-label={`${layer.name} layer`}
                  aria-pressed={props.selectedLayerId === layer.id}
                  className={`alert-canvas__layer${props.selectedLayerId === layer.id ? " alert-canvas__layer--selected" : ""}`}
                  key={`${layer.id}:${props.preview ? props.previewRunId ?? 0 : "edit"}`}
                  onClick={() => props.onSelectLayer(layer.id)}
                  onKeyDown={(event) => {
                    if (layer.id === warpLayer?.id) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      props.onSelectLayer(layer.id);
                      return;
                    }
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
                  onPointerCancel={endOperation}
                  onLostPointerCapture={endOperation}
                  role="button"
                  style={layerStyle(
                    layout,
                    dimensions,
                    props.preview ? layer.animation : null,
                    props.document.durationMs,
                    props.previewElapsedMs ?? 0
                  )}
                  tabIndex={0}
                >
                  <CanvasLayer
                    loadFont={loadFont}
                    width={layout.width * viewState.zoom / 100}
                    height={layout.height * viewState.zoom / 100}
                    mediaGroup={mediaGroup}
                    sourceUrl={"assetId" in layer ? mediaState.descriptors[layer.assetId]?.url ?? null : null}
                    assetMediaType={"assetId" in layer ? snapshotMediaType(mediaState.descriptors[layer.assetId]?.snapshot.mimeType) ?? props.assetMediaTypes?.[layer.assetId] : undefined}
                    layer={layer.type === "text" && layer.id === warpLayer?.id && draftWarp?.layerId === layer.id ? { ...layer, textStyle: { ...layer.textStyle, warp: draftWarp.value } } : layer}
                    {...(props.preview && layer.type === "text"
                      ? { previewText: props.previewTextByLayerId?.[layer.id] ?? "" }
                      : {})}
                    scale={viewState.zoom / 100}
                    templateContext={templateContext}
                  />
                  {layer.id === warpLayer?.id ? null : <span
                    aria-hidden="true"
                    className="alert-canvas__resize-handle"
                    onPointerDown={(event) => beginOperation(event, layer.id, "resize")}
                    onPointerMove={continueOperation}
                    onPointerUp={endOperation}
                    onPointerCancel={endOperation}
                    onLostPointerCapture={endOperation}
                  />}
                </div>
              );
            })}
          {snapGuides.map(guide => <div aria-hidden="true" className={`alert-canvas__snap-guide alert-canvas__snap-guide--${guide.axis}`} key={`${guide.axis}:${guide.position}`}
            style={guide.axis === "x" ? { left: `${guide.position / dimensions.width * 100}%` } : { top: `${guide.position / dimensions.height * 100}%` }} />)}
          {warpLayer?.type === "text" && warpLayer.textStyle.warp && warpLayout ? <div className="alert-canvas__warp-surface" style={{ ...layerStyle(warpLayout, dimensions, null, props.document.durationMs, 0), zIndex: 10000 }}>
            <TextWarpEditor key={`${props.profileId}:${warpLayer.id}`} warp={draftWarp?.layerId === warpLayer.id ? draftWarp.value : warpLayer.textStyle.warp}
              onPreview={(value) => setDraftWarp(value === null ? null : { layerId: warpLayer.id, value })}
              onCommit={(value) => { setDraftWarp(null); props.onWarpChange?.(warpLayer.id, value); }}
              onDone={() => { setDraftWarp(null); props.onWarpDone?.(); }} />
          </div> : null}
          {props.document.layers.some((layer) => layer.visible && layouts.has(layer.id)) ? null : (
            <p className="alert-canvas__empty">Add or show a visual layer to begin.</p>
          )}
          {props.preview ? <span className="alert-canvas__preview-label">Preview</span> : null}
        </div>
      </div>
      <footer>
        <span>{dimensions.width} x {dimensions.height}</span>
        <span>{props.showSafeArea === false ? "Guides hidden" : "Safe area and center guides"}</span>
      </footer>
    </div>
  );
}

function CanvasLayer({
  loadFont,
  width,
  height,
  mediaGroup,
  sourceUrl,
  assetMediaType,
  layer,
  previewText,
  scale,
  templateContext
}: {
  readonly loadFont: (assetId: string) => Promise<Blob>;
  readonly width: number;
  readonly height: number;
  readonly mediaGroup: MediaPreviewGroup | null;
  readonly sourceUrl: string | null;
  readonly assetMediaType?: "image" | "gif" | "video" | undefined;
  readonly layer: AlertLayer;
  readonly previewText?: string;
  readonly scale: number;
  readonly templateContext: Record<string, unknown>;
}) {
  if (layer.type === "text") {
    return <CanvasText key={layer.id} text={previewText ?? renderAlertTemplatePreview(layer.template, templateContext)} layer={layer} width={width} height={height} scale={scale} loadFont={loadFont} />;
  }
  if (layer.type === "image" || layer.type === "video") {
    const kind = assetMediaType === "gif" ? "gif" : assetMediaType ?? layer.type;
    return <CanvasAsset group={mediaGroup} url={sourceUrl} assetId={layer.assetId} kind={kind} loop={layer.type === "video" && (layer.loop ?? false)} />;
  }
  if (layer.type === "shape") {
    return <span className="alert-canvas__shape" style={{ background: layer.fill }} />;
  }
  return <span>{layer.name}</span>;
}

function CanvasText({ text, layer, width, height, scale, loadFont }: { readonly text: string; readonly layer: Extract<AlertLayer, { type: "text" }>; readonly width: number; readonly height: number; readonly scale: number; readonly loadFont: (assetId: string) => Promise<Blob> }) {
  const [error, setError] = useState<string | null>(null);
  return <><AlertTextContent text={text} textStyle={layer.textStyle} boxStyle={layer.boxStyle} width={width} height={height} scale={scale} loadFont={loadFont} onReady={() => setError(null)} onError={(cause) => setError(cause instanceof Error ? cause.message : "Unable to render text. Select another font or reset the warp.")} />
    {error ? <span role="alert" className="alert-canvas__text-error">{error}</span> : null}</>;
}

const emptyMediaState: MediaPreviewGroupState = { descriptors: {}, unavailable: false };
const emptySubscribe = () => () => {};
const emptySnapshot = () => emptyMediaState;

function CanvasAsset({ group, url, assetId, kind, loop }: { readonly group: MediaPreviewGroup | null; readonly url: string | null; readonly assetId: string; readonly kind: "image" | "gif" | "video"; readonly loop: boolean }) {
  const element = useRef<HTMLVideoElement | HTMLImageElement>(null);
  useEffect(() => {
    if (group !== null && element.current !== null) return group.registerElement(element.current, assetId);
  }, [group, assetId, url]);
  if (url === null) return <span className="alert-canvas__asset-placeholder">{kind === "video" ? "Video" : kind === "gif" ? "GIF" : "Image"}</span>;
  return kind === "video"
    ? <video ref={element as React.RefObject<HTMLVideoElement>} aria-label="Video asset preview" autoPlay loop={loop} muted src={url} />
    : <img ref={element as React.RefObject<HTMLImageElement>} referrerPolicy="no-referrer" alt={kind === "gif" ? "Animated image asset preview" : ""} src={url} />;
}

function layerStyle(
  layout: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly zIndex: number },
  dimensions: { readonly width: number; readonly height: number },
  animation: AlertLayer["animation"] | null,
  instructionDurationMs: number,
  elapsedMs: number
): CSSProperties {
  const animationStyle = overlayPresetAnimationStyle(animation, instructionDurationMs, elapsedMs);
  return {
    height: `${layout.height / dimensions.height * 100}%`,
    left: `${layout.x / dimensions.width * 100}%`,
    top: `${layout.y / dimensions.height * 100}%`,
    width: `${layout.width / dimensions.width * 100}%`,
    zIndex: layout.zIndex,
    ...animationStyle,
    ...(animation === null ? {} : { animationPlayState: "paused" })
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

function profileLabel(profileId: TargetProfileId): string {
  return profileId === "landscape" ? "Landscape" : "Vertical";
}

function snapshotMediaType(mimeType: string | undefined): "image" | "gif" | "video" | undefined {
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType === "image/gif") return "gif";
  return mimeType?.startsWith("image/") ? "image" : undefined;
}
