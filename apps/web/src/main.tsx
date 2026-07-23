import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { OverlayApp } from "./overlay/OverlayApp.js";
import { OperatorApp } from "./operator/OperatorApp.js";

const language = navigator.language || "en";
const baseLanguage = language.split("-")[0]?.toLowerCase() ?? "en";
const overlayRoute = window.location.pathname.startsWith("/overlay/");
const operatorRoute = window.location.pathname === "/operator";

document.documentElement.lang = language;
document.documentElement.dir = ["ar", "fa", "he", "ur"].includes(baseLanguage) ? "rtl" : "ltr";
document.body.classList.toggle("overlay-shell", overlayRoute);
document.body.classList.toggle("operator-shell", operatorRoute);
document.body.classList.toggle("management-shell", !overlayRoute && !operatorRoute);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    {overlayRoute ? <OverlayApp /> : operatorRoute ? <OperatorApp /> : <App />}
  </StrictMode>
);
