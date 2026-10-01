import type { MediaPreviewDescriptor } from "@stream-jams/core";
import type { MediaPreviewApi } from "./media-preview-api.js";
import { acquireOwnedMediaPreview, type OwnedMediaPreview } from "./owned-media-preview.js";

export interface MediaPreviewGroupState {
  readonly descriptors: Readonly<Record<string, MediaPreviewDescriptor>>;
  readonly unavailable: boolean;
}

/** Owns only references and native consumers for one editor lifecycle/preparation group. */
export function createMediaPreviewGroup(api: MediaPreviewApi) {
  let state: MediaPreviewGroupState = { descriptors: {}, unavailable: false };
  let disposed = false;
  const failedAssets = new Set<string>();
  const owners = new Map<string, OwnedMediaPreview>();
  const elements = new Map<Element, { assetId: string; url: string | null }>();
  const listeners = new Set<() => void>();
  const cancellation = new AbortController();
  const detach = (element: Element, expectedUrl?: string | null) => {
    if (expectedUrl !== undefined && typeof element.getAttribute === "function" && element.getAttribute("src") !== expectedUrl) return;
    if ("pause" in element && typeof element.pause === "function") element.pause();
    element.removeAttribute?.("src");
    if (typeof element.removeAttribute !== "function" && "src" in element) element.src = "";
    if (element instanceof HTMLMediaElement) element.load();
  };
  const publish = () => {
    const descriptors: Record<string, MediaPreviewDescriptor> = {};
    let unavailable = failedAssets.size > 0;
    for (const [id, owner] of owners) {
      const snapshot = owner.getSnapshot();
      if (snapshot.descriptor !== null) descriptors[id] = snapshot.descriptor;
      else {
        for (const [element, entry] of elements) if (entry.assetId === id) detach(element, entry.url);
        unavailable ||= snapshot.unavailable;
      }
    }
    state = { descriptors, unavailable };
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    registerElement(element: Element, assetId: string) {
      if (disposed) { detach(element); return () => {}; }
      const entry = { assetId, url: element.getAttribute?.("src") ?? null };
      elements.set(element, entry);
      return () => {
        detach(element, entry.url);
        if (elements.get(element) === entry) elements.delete(element);
      };
    },
    failAsset(assetId: string, expectedUrl: string) {
      const owner = owners.get(assetId);
      if (disposed || owner?.getSnapshot().descriptor?.url !== expectedUrl) return;
      for (const [element, entry] of elements) {
        if (entry.assetId === assetId) {
          detach(element, entry.url);
          elements.delete(element);
        }
      }
      owners.delete(assetId);
      failedAssets.add(assetId);
      owner.dispose();
      publish();
    },
    async acquire(assetIds: readonly string[]) {
      try {
        await Promise.all([...new Set(assetIds)].map(async id => {
          const owner = await acquireOwnedMediaPreview(api, id, { signal: cancellation.signal });
          if (disposed) { owner.dispose(); return; }
          owners.set(id, owner);
          owner.subscribe(publish);
        }));
        if (!disposed) publish();
      } catch (cause) {
        if (!disposed) {
          for (const [element, entry] of elements) detach(element, entry.url);
          cancellation.abort();
          for (const owner of owners.values()) owner.dispose();
          owners.clear();
          state = { descriptors: {}, unavailable: true };
          for (const listener of listeners) listener();
        }
        throw cause;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [element, entry] of elements) detach(element, entry.url);
      elements.clear();
      cancellation.abort();
      for (const owner of owners.values()) owner.dispose();
      owners.clear();
      listeners.clear();
    }
  };
}
export type MediaPreviewGroup = ReturnType<typeof createMediaPreviewGroup>;
