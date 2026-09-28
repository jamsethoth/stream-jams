import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { resolveWebRouteShell, type WebRouteShell } from "./route-shell.js";
import {
  createClientErrorReporter,
  createClientExceptionReport,
  installManagementGlobalErrorListeners
} from "./management/diagnostics/client-error-reporter.js";

const language = navigator.language || "en";
const baseLanguage = language.split("-")[0]?.toLowerCase() ?? "en";
const shell = resolveWebRouteShell(window.location.pathname);
const managementErrorReporter = shell === "management" ? createClientErrorReporter() : null;
const loaders = {
  management: () => import("./App.js").then(({ App }) => <App errorReporter={managementErrorReporter!} />),
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

if (managementErrorReporter !== null) {
  installManagementGlobalErrorListeners({ target: window, reporter: managementErrorReporter });
}

void loaders[shell]().then((application) => {
  createRoot(rootElement).render(<StrictMode>{application}</StrictMode>);
}).catch((cause: unknown) => {
  if (managementErrorReporter === null) {
    console.error(`The ${shell} application could not be loaded.`, cause);
    return;
  }
  const report = createClientExceptionReport(
    "bootstrap",
    "The management interface could not be loaded.",
    cause
  );
  void managementErrorReporter.report(report);
  createRoot(rootElement).render(
    <main className="management-error-boundary">
      <section className="management-error-banner management-error-banner--error" role="alert">
        <div>
          <strong>The management interface could not be loaded</strong>
          <p>Reload Stream Jams to try again. If the problem returns, use this reference in Diagnostics.</p>
          <p className="management-error-boundary__reference"><span>Reference ID</span> <code>{report.referenceId}</code></p>
        </div>
        <div className="management-error-boundary__actions">
          <button className="button button--primary" type="button" onClick={() => { window.location.reload(); }}>Reload management</button>
          <a href={`/manage/diagnostics?reference=${encodeURIComponent(report.referenceId)}`}>Open diagnostics</a>
        </div>
      </section>
    </main>
  );
});
