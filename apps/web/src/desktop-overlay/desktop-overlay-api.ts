import type { DesktopVisualAsset, DesktopVisualRendererReply, DesktopVisualRendererRequest } from "@stream-jams/core";

export interface DesktopOverlayBridge {
  onCommand(callback: (request: DesktopVisualRendererRequest) => void): () => void;
  report(reply: DesktopVisualRendererReply): void;
}

declare global { interface Window { streamJamsOverlayHost?: DesktopOverlayBridge } }

/** Only decoded, renderer-local Blob URLs reach the visual component. */
export function prepareDesktopVisualAsset(asset: DesktopVisualAsset): Promise<{ url: string; dispose(): void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }));
    const element = asset.mimeType.startsWith("video/") ? document.createElement("video") : new Image();
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(timeout);
      element.removeEventListener("error", fail);
      element.removeEventListener("load", ready);
      element.removeEventListener("loadeddata", ready);
      if (element instanceof HTMLVideoElement) element.pause();
      element.removeAttribute("src");
      if (element instanceof HTMLVideoElement) element.load();
      URL.revokeObjectURL(url);
    };
    const fail = () => { dispose(); reject(new Error("Desktop visual media could not be prepared")); };
    const ready = () => {
      window.clearTimeout(timeout);
      element.removeEventListener("error", fail);
      element.removeEventListener("load", ready);
      element.removeEventListener("loadeddata", ready);
      resolve({ url, dispose });
    };
    const timeout = window.setTimeout(fail, 5000);
    element.addEventListener("error", fail, { once: true });
    if (element instanceof HTMLVideoElement) {
      element.muted = true; element.preload = "auto";
      element.addEventListener("loadeddata", ready, { once: true });
    } else element.addEventListener("load", ready, { once: true });
    element.src = url;
  });
}
