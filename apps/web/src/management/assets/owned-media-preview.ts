import type { MediaPreviewDescriptor } from "@stream-jams/core";
import type { MediaPreviewApi } from "./media-preview-api.js";

export interface MediaPreviewState { readonly descriptor: MediaPreviewDescriptor | null; readonly unavailable: boolean }
export interface OwnedMediaPreview {
  getSnapshot(): MediaPreviewState;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
export interface OwnedMediaPreviewOptions { readonly signal?: AbortSignal; readonly now?: () => number }

/** One preview owner, never a media-body cache. Renewal does not replace its native source URL. */
export async function acquireOwnedMediaPreview(api: MediaPreviewApi, assetId: string, options: OwnedMediaPreviewOptions = {}): Promise<OwnedMediaPreview> {
  options.signal?.throwIfAborted();
  const first = await api.createPreview(assetId);
  const now = options.now ?? Date.now;
  let state: MediaPreviewState = { descriptor: first, unavailable: false };
  let disposed = false;
  let timer: number | null = null;
  let recovering = false;
  const listeners = new Set<() => void>();
  const release = (descriptor: MediaPreviewDescriptor) => {
    void api.releasePreview(descriptor.id).catch(
      // error-provenance: allow cleanup -- server expiry releases an abandoned owner if teardown cannot reach it
      () => undefined);
  };
  const update = (next: MediaPreviewState) => { state = next; for (const listener of listeners) listener(); };
  const schedule = () => { timer = window.setTimeout(() => { timer = null; void refresh(); }, 60000); };
  const refresh = async () => {
    if (disposed || recovering) return;
    recovering = true;
    const prior = state.descriptor;
    const recreate = prior === null || prior.expiresAt <= now();
    if (recreate && prior !== null) { update({ descriptor: null, unavailable: true }); release(prior); }
    try {
      const next = recreate ? await api.createPreview(assetId) : await api.renewPreview(prior.id);
      if (disposed) { release(next); return; }
      if (!recreate && (next.id !== prior.id || next.url !== prior.url || JSON.stringify(next.snapshot) !== JSON.stringify(prior.snapshot))) {
        update({ descriptor: null, unavailable: true });
        if (next.id !== prior.id) release(next);
        throw new Error("Media preview renewal changed the pinned media source.");
      }
      update({ descriptor: next, unavailable: false });
      if (timer !== null) window.clearTimeout(timer);
      schedule();
    }
    // error-provenance: allow expected -- local state asks the consumer to detach media and permits focus recovery
    catch {
      if (!disposed) {
        update({ descriptor: null, unavailable: true });
        if (prior !== null) release(prior);
      }
    } finally { recovering = false; }
  };
  const active = () => {
    if (document.visibilityState === "hidden") return;
    if (state.descriptor === null || state.descriptor.expiresAt <= now()) {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      void refresh();
    }
  };
  const resource: OwnedMediaPreview = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      window.removeEventListener("focus", active);
      document.removeEventListener("visibilitychange", active);
      options.signal?.removeEventListener("abort", resource.dispose);
      if (state.descriptor !== null) release(state.descriptor);
      listeners.clear();
    }
  };
  if (options.signal?.aborted === true) { resource.dispose(); options.signal.throwIfAborted(); }
  options.signal?.addEventListener("abort", resource.dispose, { once: true });
  window.addEventListener("focus", active);
  document.addEventListener("visibilitychange", active);
  schedule();
  return resource;
}
