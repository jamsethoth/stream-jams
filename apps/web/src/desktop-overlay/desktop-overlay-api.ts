import { privateVisualMediaUrl, type PrivateDesktopMediaAsset, DesktopVisualRendererReply, DesktopVisualRendererRequest } from "@stream-jams/core";

export interface DesktopOverlayBridge {
  onCommand(callback: (request: DesktopVisualRendererRequest) => void): () => void;
  report(reply: DesktopVisualRendererReply): void;
}

declare global { interface Window { streamJamsOverlayHost?: DesktopOverlayBridge } }

/** Native elements stream only the fixed private session origin. */
export function prepareDesktopVisualAsset(asset: PrivateDesktopMediaAsset): Promise<{ url: string; dispose(): void }> {
  if (asset.reference.snapshot.mimeType.startsWith("font/")) {
    const url = privateVisualMediaUrl(asset.reference);
    return new Promise((resolve, reject) => {
      let settled = false;
      const dispose = () => { window.clearTimeout(timeout); };
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        dispose();
        if (ready) resolve({ url, dispose });
        else reject(new Error("Desktop visual media could not be prepared"));
      };
      const timeout = window.setTimeout(() => finish(false), 5000);
      try {
        // Detached decoding probe: AlertText owns registration and font-cache lifetime.
        const font = new FontFace("stream-jams-private-font-preflight", `url("${url}")`);
        void font.load().then(() => finish(true), () => finish(false));
      }
      // error-provenance: allow expected -- private font decoding failures become a bounded preparation error
      catch {
        finish(false);
      }
    });
  }
  return new Promise((resolve, reject) => {
    const url = privateVisualMediaUrl(asset.reference);
    const element = asset.reference.snapshot.mimeType.startsWith("video/") ? document.createElement("video") : new Image();
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
      // Detach mounted consumers as well as the readiness probe before host release.
      for (const consumer of document.querySelectorAll<HTMLImageElement | HTMLMediaElement>("img[src],video[src],audio[src]")) {
        if (consumer.getAttribute("src") !== url) continue;
        if (consumer instanceof HTMLMediaElement) consumer.pause();
        consumer.removeAttribute("src");
        if (consumer instanceof HTMLMediaElement) consumer.load();
      }
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
