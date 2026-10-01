import { useEffect, useState, useSyncExternalStore } from "react";
import type { MediaPreviewApi } from "./media-preview-api.js";
import { createMediaPreviewGroup, type MediaPreviewGroup } from "./media-preview-group.js";

const empty = { descriptors: {}, unavailable: false } as const;
const noopSubscribe = () => () => {};
const emptySnapshot = () => empty;

export function useMediaPreviewGroup(api: MediaPreviewApi, assetIds: readonly string[], revision = "", enabled = true) {
  const key = [...new Set(assetIds)].sort().join("\u0000");
  const [group, setGroup] = useState<MediaPreviewGroup | null>(null);
  useEffect(() => {
    if (!enabled) { setGroup(null); return; }
    const next = createMediaPreviewGroup(api);
    setGroup(next);
    void next.acquire(key === "" ? [] : key.split("\u0000")).catch(
      // error-provenance: allow expected -- the group publishes an unavailable state for its local preview
      () => undefined);
    return () => next.dispose();
  }, [api, key, revision, enabled]);
  const state = useSyncExternalStore(group?.subscribe ?? noopSubscribe, group?.getSnapshot ?? emptySnapshot, emptySnapshot);
  return { group, ...state };
}
