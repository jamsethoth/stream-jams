import { useEffect, useState } from "react";
import type { AssetLibraryItem } from "@stream-jams/core";
import type { AssetApi } from "./asset-api.js";

export function AssetPreview({ assetApi, compact = false, item }: { readonly assetApi: Pick<AssetApi, "getAssetFile">; readonly compact?: boolean; readonly item: AssetLibraryItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);
    if (typeof URL.createObjectURL !== "function") return () => { active = false; };
    void assetApi.getAssetFile(item.id).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error(`[asset-preview-${item.id}] Asset preview failed`, error);
      setFailed(true);
    });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [assetApi, item.id]);

  if (failed) return <span className="asset-preview asset-preview--failed" title={`Retry by reselecting the asset. Reference: asset-preview-${item.id}`}>Preview unavailable</span>;
  if (url === null) return <span aria-label={`${item.mediaType} preview`} className={`asset-preview asset-preview--placeholder${compact ? " asset-preview--compact" : ""}`}>{item.mediaType === "audio" ? "Audio" : formatMedia(item.mediaType)}</span>;
  if (item.mediaType === "audio") return <audio aria-label={`${item.displayName} preview`} className="asset-preview__audio" controls preload="metadata" src={url} />;
  if (item.mediaType === "video") return <video aria-label={`${item.displayName} preview`} className={`asset-preview__media${compact ? " asset-preview__media--compact" : ""}`} controls={!compact} muted preload="metadata" src={url} />;
  return <img alt={`${item.displayName} preview`} className={`asset-preview__media${compact ? " asset-preview__media--compact" : ""}`} src={url} />;
}

function formatMedia(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
