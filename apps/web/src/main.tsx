import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { OverlayApp } from "./overlay/OverlayApp.js";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    {window.location.pathname.startsWith("/overlay/") ? <OverlayApp /> : <App />}
  </StrictMode>
);
