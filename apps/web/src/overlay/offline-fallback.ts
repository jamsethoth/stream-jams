import { overlayOfflineFallback } from "@stream-jams/core";

/** Lets a later OBS load during a Stream Jams outage get a transparent self-retrying page instead of a browser error. */
export function registerOverlayOfflineFallback(container: Pick<ServiceWorkerContainer, "register"> | undefined = navigator.serviceWorker): void {
  if (container === undefined) return;
  container.register(overlayOfflineFallback.workerPath, { scope: overlayOfflineFallback.scope, updateViaCache: "none" })
    .catch((error: unknown) => { console.warn("Overlay offline fallback could not be registered.", error); });
}
