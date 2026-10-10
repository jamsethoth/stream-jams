import "../csp-schema-validation.js";
import { createRoot } from "react-dom/client";
import { DesktopOverlayApp } from "./DesktopOverlayApp.js";
import { DesktopOverlayController } from "./desktop-overlay-controller.js";
import { createDesktopVideoMirrorConnector, prepareDesktopVisualAsset } from "./desktop-overlay-api.js";
import "../App.css";

const bridge = window.streamJamsOverlayHost;
const element = document.getElementById("root");
// A normal browser or missing preload must remain transparent and inert.
if (bridge !== undefined && element !== null) {
  const listeners = new Set<() => void>();
  const controller = new DesktopOverlayController({ report: reply => bridge.report(reply),
    changed: () => { for (const listener of listeners) listener(); }, prepareAsset: prepareDesktopVisualAsset });
  const unsubscribe = bridge.onCommand(request => controller.receive(request));
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const videoMirror = bridge.videoMirror === undefined ? undefined : createDesktopVideoMirrorConnector(bridge.videoMirror);
  createRoot(element).render(<DesktopOverlayApp controller={controller} subscribe={subscribe} videoMirror={videoMirror} />);
  window.addEventListener("beforeunload", () => { unsubscribe(); controller.dispose(); listeners.clear(); }, { once: true });
}
