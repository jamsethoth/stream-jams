import { useEffect, useRef } from "react";
import type { AssetLibraryItem } from "@stream-jams/core";
import type { MediaPreviewApi } from "./media-preview-api.js";
import { useMediaPreviewGroup } from "./use-media-preview-group.js";

export function AssetPreview({ assetApi, compact = false, item }: { readonly assetApi: MediaPreviewApi; readonly compact?: boolean; readonly item: AssetLibraryItem }) {
  const { group, descriptors, unavailable: failed } = useMediaPreviewGroup(assetApi, [item.id], `${item.updatedAt}:${item.sizeBytes}:${item.mimeType}:${item.durationMs}`);
  const url = descriptors[item.id]?.url ?? null;
  const media = useRef<HTMLImageElement | HTMLVideoElement | HTMLAudioElement>(null);
  useEffect(() => {
    const element = media.current;
    if (element !== null && group !== null) return group.registerElement(element, item.id);
  }, [group, item.id, url]);

  if (failed) return <span className="asset-preview asset-preview--failed" title={`Retry by reselecting the asset. Reference: asset-preview-${item.id}`}>Preview unavailable</span>;
  if (url === null) return <span aria-label={`${item.mediaType} preview`} className={`asset-preview asset-preview--placeholder${compact ? " asset-preview--compact" : ""}`}>{item.mediaType === "audio" ? "Audio" : formatMedia(item.mediaType)}</span>;
  const fail = () => group?.failAsset(item.id, url);
  if (item.mediaType === "audio") return <audio ref={media as React.RefObject<HTMLAudioElement>} aria-label={`${item.displayName} preview`} className="asset-preview__audio" controls onError={fail} preload="metadata" src={url} />;
  if (item.mediaType === "video") return <video ref={media as React.RefObject<HTMLVideoElement>} aria-label={`${item.displayName} preview`} className={`asset-preview__media${compact ? " asset-preview__media--compact" : ""}`} controls={!compact} muted onError={fail} preload="metadata" src={url} />;
  return <img ref={media as React.RefObject<HTMLImageElement>} referrerPolicy="no-referrer" alt={`${item.displayName} preview`} className={`asset-preview__media${compact ? " asset-preview__media--compact" : ""}`} onError={fail} src={url} />;
}

function formatMedia(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
