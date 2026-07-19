import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { OverlayApp } from "./overlay/OverlayApp.js";

const language = navigator.language || "en";
const baseLanguage = language.split("-")[0]?.toLowerCase() ?? "en";
const overlayRoute = window.location.pathname.startsWith("/overlay/");

document.documentElement.lang = language;
document.documentElement.dir = ["ar", "fa", "he", "ur"].includes(baseLanguage) ? "rtl" : "ltr";
document.body.classList.toggle("overlay-shell", overlayRoute);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    {overlayRoute ? <OverlayApp /> : <App />}
  </StrictMode>
);
