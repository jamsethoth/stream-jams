import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { resolveWebRouteShell, type WebRouteShell } from "./route-shell.js";

const language = navigator.language || "en";
const baseLanguage = language.split("-")[0]?.toLowerCase() ?? "en";
const shell = resolveWebRouteShell(window.location.pathname);
const loaders = {
  management: () => import("./App.js").then(({ App }) => <App />),
  operator: () => import("./operator/OperatorApp.js").then(({ OperatorApp }) => <OperatorApp />),
  overlay: () => import("./overlay/OverlayApp.js").then(({ OverlayApp }) => <OverlayApp />)
} satisfies Record<WebRouteShell, () => Promise<ReactNode>>;

document.documentElement.lang = language;
document.documentElement.dir = ["ar", "fa", "he", "ur"].includes(baseLanguage) ? "rtl" : "ltr";
document.body.classList.toggle("overlay-shell", shell === "overlay");
document.body.classList.toggle("operator-shell", shell === "operator");
document.body.classList.toggle("management-shell", shell === "management");

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

void loaders[shell]().then((application) => {
  createRoot(rootElement).render(<StrictMode>{application}</StrictMode>);
}).catch((cause: unknown) => {
  console.error(`The ${shell} application could not be loaded.`, cause);
});
