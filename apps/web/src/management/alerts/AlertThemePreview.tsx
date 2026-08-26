import {
  materializeAlertStarterTheme,
  targetProfileDefinitions,
  type AlertStarterThemeId,
  type StreamEventType,
  type TargetProfileId
} from "@stream-jams/core";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { alertTextLayerStyle } from "../../overlay/components/alert-text-style.js";
import { renderAlertTemplatePreview } from "./editor/template-preview.js";

interface AlertThemePreviewProps {
  readonly eventType: StreamEventType;
  readonly profileId: TargetProfileId;
  readonly templateContext: Readonly<Record<string, unknown>>;
  readonly themeId: AlertStarterThemeId;
  readonly themeLabel: string;
}

export function AlertThemePreview(props: AlertThemePreviewProps) {
  const profileDefinition = targetProfileDefinitions.find((candidate) => candidate.id === props.profileId)!;
  const composition = materializeAlertStarterTheme({
    documentId: `starter-theme-preview-${props.eventType}`,
    eventType: props.eventType,
    themeId: props.themeId
  });
  const profile = composition.targetProfiles.find((candidate) => candidate.id === props.profileId)!;
  const layouts = new Map(profile.layerLayouts.map((layout) => [layout.layerId, layout]));
  const fallbackSurfaceWidth = props.profileId === "landscape" ? 288 : 112;
  const [surfaceRef, textScale] = usePreviewTextScale(profileDefinition.width, fallbackSurfaceWidth);

  return (
    <span
      aria-label={`${props.themeLabel} ${profileDefinition.label} preview`}
      className={`alert-theme-preview alert-theme-preview--${props.profileId}`}
      ref={surfaceRef}
      role="img"
    >
      {composition.layers
        .filter((layer) => (layer.type === "text" || layer.type === "shape") && layer.visible && layouts.has(layer.id))
        .sort((left, right) => left.order - right.order)
        .map((layer) => {
          const layout = layouts.get(layer.id)!;
          const geometryStyle = previewLayerStyle(layout, profileDefinition);
          if (layer.type === "shape") {
            return (
              <span
                aria-hidden="true"
                className="alert-theme-preview__layer alert-theme-preview__shape"
                key={layer.id}
                style={{ ...geometryStyle, backgroundColor: layer.fill }}
              />
            );
          }
          if (layer.type !== "text") return null;

          return (
            <span
              aria-hidden="true"
              className="alert-theme-preview__layer alert-theme-preview__text alert-text-layer"
              key={layer.id}
              style={{
                ...geometryStyle,
                ...alertTextLayerStyle({
                  textStyle: layer.textStyle,
                  boxStyle: layer.boxStyle,
                  scale: textScale
                })
              }}
            >
              {renderAlertTemplatePreview(layer.template, props.templateContext)}
            </span>
          );
        })}
    </span>
  );
}

function usePreviewTextScale(profileWidth: number, fallbackSurfaceWidth: number) {
  const surfaceRef = useRef<HTMLSpanElement>(null);
  const fallbackScale = fallbackSurfaceWidth / profileWidth;
  const [scale, setScale] = useState(fallbackScale);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    setScale(fallbackScale);
    if (surface === null || typeof ResizeObserver === "undefined") return;

    const updateScale = (surfaceWidth: number) => {
      if (Number.isFinite(surfaceWidth) && surfaceWidth > 0) {
        setScale(surfaceWidth / profileWidth);
      }
    };
    updateScale(surface.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === surface);
      if (entry !== undefined) updateScale(entry.contentRect.width);
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [fallbackScale, profileWidth]);

  return [surfaceRef, scale] as const;
}

function previewLayerStyle(
  layout: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly zIndex: number },
  profile: { readonly width: number; readonly height: number }
): CSSProperties {
  return {
    height: `${layout.height / profile.height * 100}%`,
    left: `${layout.x / profile.width * 100}%`,
    top: `${layout.y / profile.height * 100}%`,
    width: `${layout.width / profile.width * 100}%`,
    zIndex: layout.zIndex
  };
}
