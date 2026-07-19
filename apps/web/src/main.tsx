import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { OverlayApp } from "./overlay/OverlayApp.js";

const language = navigator.language || "en";
const baseLanguage = language.split("-")[0]?.toLowerCase() ?? "en";

document.documentElement.lang = language;
document.documentElement.dir = ["ar", "fa", "he", "ur"].includes(baseLanguage) ? "rtl" : "ltr";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    {window.location.pathname.startsWith("/overlay/") ? <OverlayApp /> : <App />}
  </StrictMode>
);
