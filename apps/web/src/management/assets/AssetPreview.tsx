import { useEffect, useRef, useState } from "react";
import type { AssetLibraryItem } from "@stream-jams/core";
import type { MediaPreviewApi } from "./media-preview-api.js";
import { useMediaPreviewGroup } from "./use-media-preview-group.js";

export function AssetPreview({ assetApi, compact = false, item }: { readonly assetApi: MediaPreviewApi; readonly compact?: boolean; readonly item: AssetLibraryItem }) {
  const { group, descriptors, unavailable: failed } = useMediaPreviewGroup(assetApi, [item.id], `${item.updatedAt}:${item.sizeBytes}:${item.mimeType}:${item.durationMs}`);
  const url = descriptors[item.id]?.url ?? null;
  const media = useRef<HTMLImageElement | HTMLVideoElement | HTMLAudioElement>(null);
  const [font, setFont] = useState<{ url: string; family: string } | null>(null);
  useEffect(() => {
    if (item.mediaType !== "font" || url === null) return;
    let active = true;
    const family = `asset-preview-${crypto.randomUUID()}`;
    const face = new FontFace(family, `url(${JSON.stringify(url)})`);
    const timeout = setTimeout(() => { if (active) group?.failAsset(item.id, url); }, 10_000);
    void face.load().then(loaded => {
      if (!active) return;
      clearTimeout(timeout);
      document.fonts.add(loaded);
      setFont({ url, family });
    }).catch((error: unknown) => {
      if (active) {
        console.error(`[asset-preview-${item.id}] Font preview could not be loaded`, error);
        group?.failAsset(item.id, url);
      }
    });
    return () => { active = false; clearTimeout(timeout); document.fonts.delete(face); };
  }, [group, item.id, item.mediaType, url]);
  useEffect(() => {
    const element = media.current;
    if (element !== null && group !== null) return group.registerElement(element, item.id);
  }, [group, item.id, url]);

  if (failed) return <span className="asset-preview asset-preview--failed" title={`Retry by reselecting the asset. Reference: asset-preview-${item.id}`}>Preview unavailable</span>;
  if (url === null) return <span aria-label={`${item.mediaType} preview`} className={`asset-preview asset-preview--placeholder${compact ? " asset-preview--compact" : ""}`}>{item.mediaType === "audio" ? "Audio" : formatMedia(item.mediaType)}</span>;
  const fail = () => group?.failAsset(item.id, url);
  if (item.mediaType === "font") return <span aria-label={`${item.displayName} preview`} className="asset-preview asset-preview--font" style={font?.url === url ? { fontFamily: font.family } : undefined}>{font?.url === url ? "Aa Bb 123" : "Loading font…"}</span>;
  if (item.mediaType === "audio") return <audio ref={media as React.RefObject<HTMLAudioElement>} aria-label={`${item.displayName} preview`} className="asset-preview__audio" controls onError={fail} preload="metadata" src={url} />;
  if (item.mediaType === "video") return <video ref={media as React.RefObject<HTMLVideoElement>} aria-label={`${item.displayName} preview`} className={`asset-preview__media${compact ? " asset-preview__media--compact" : ""}`} controls={!compact} muted onError={fail} preload="metadata" src={url} />;
  return <img ref={media as React.RefObject<HTMLImageElement>} referrerPolicy="no-referrer" alt={`${item.displayName} preview`} className={`asset-preview__media${compact ? " asset-preview__media--compact" : ""}`} onError={fail} src={url} />;
}

function formatMedia(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
