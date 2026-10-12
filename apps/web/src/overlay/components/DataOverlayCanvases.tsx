import { useState, type CSSProperties } from "react";
import { timerProfileDimensions, type DataOverlayProjection, type DataProjectedElement } from "@stream-jams/core";
import "./DataOverlayCanvases.css";

export interface DataOverlayCanvasesProps {
  readonly projection: DataOverlayProjection;
  readonly resolveAssetUrl: (assetId: string) => string | null;
}

/** Browser and private desktop consume the same already-scoped projection. */
export function DataOverlayCanvases({ projection, resolveAssetUrl }: DataOverlayCanvasesProps) {
  return <div className="data-overlay-canvases">
    {projection.canvases.map((canvas, canvasIndex) => <div
      className="data-overlay-canvas" key={canvas.id} data-canvas-id={canvas.id}
      style={{ ...timerProfileDimensions[canvas.targetProfileId], zIndex: canvasIndex }}
    >{canvas.elements.map((element, index) => <DataElement key={element.id} element={element} index={index} resolveAssetUrl={resolveAssetUrl} />)}</div>)}
  </div>;
}

function DataElement({ element, index, resolveAssetUrl }: {
  readonly element: DataProjectedElement;
  readonly index: number;
  readonly resolveAssetUrl: DataOverlayCanvasesProps["resolveAssetUrl"];
}) {
  const style: CSSProperties = { left: element.x, top: element.y, width: element.width, height: element.height, zIndex: index };
  if (element.kind === "image") {
    const src = resolveAssetUrl(element.assetId);
    return src === null ? null : <DataImage key={`${element.assetId}:${src}`} src={src} fit={element.fit} style={style} id={element.id} />;
  }
  if (element.kind === "text") return <div className="data-overlay-element data-overlay-text" data-element-id={element.id}
    data-overflow={element.overflow} style={{ ...style, fontSize: element.style.fontSizePx, color: element.style.color,
      fontWeight: element.style.fontWeight, textAlign: element.style.align }}>{element.text}</div>;
  if (element.kind === "rectangle" || element.kind === "ellipse") return <div className="data-overlay-element" data-element-id={element.id}
    style={{ ...style, backgroundColor: element.color, borderRadius: element.kind === "ellipse" ? "50%" : 0 }} />;
  if (element.kind !== "progress") return null;
  const horizontal = element.orientation === "horizontal";
  const forward = element.direction === "forward";
  const fill = Math.max(0, Math.min(1, element.fill));
  return <div className="data-overlay-element data-overlay-progress" data-element-id={element.id}
    style={{ ...style, backgroundColor: element.backgroundColor, border: `${element.borderWidthPx}px solid ${element.borderColor}` }}>
    <div className="data-overlay-progress-fill" style={{ backgroundColor: element.fillColor,
      width: horizontal ? `${fill * 100}%` : "100%", height: horizontal ? "100%" : `${fill * 100}%`,
      left: horizontal && !forward ? undefined : 0, right: horizontal && !forward ? 0 : undefined,
      top: !horizontal && forward ? undefined : 0, bottom: !horizontal && forward ? 0 : undefined }} />
  </div>;
}

function DataImage({ src, fit, style, id }: { readonly src: string; readonly fit: "contain" | "cover" | "fill"; readonly style: CSSProperties; readonly id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img alt="" className="data-overlay-element" data-element-id={id} draggable={false} referrerPolicy="no-referrer"
    src={src} style={{ ...style, objectFit: fit }} onError={() => setFailed(true)} />;
}
