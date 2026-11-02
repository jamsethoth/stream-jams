import "./csp-schema-validation.js";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { resolveWebRouteShell, type WebRouteShell } from "./route-shell.js";

const language = navigator.language || "en";
const baseLanguage = language.split("-")[0]?.toLowerCase() ?? "en";
const shell = resolveWebRouteShell(window.location.pathname);
const managementDiagnostics = shell === "management"
  ? import("./management/diagnostics/client-error-reporter.js")
  : null;
const managementErrorReporter = managementDiagnostics?.then(({ createClientErrorReporter, installManagementGlobalErrorListeners }) => {
  const reporter = createClientErrorReporter();
  installManagementGlobalErrorListeners({ target: window, reporter });
  return reporter;
}) ?? null;
const loaders = {
  management: () => Promise.all([import("./App.js"), managementErrorReporter!]).then(([{ App }, errorReporter]) => <App errorReporter={errorReporter} />),
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
}).catch(async (cause: unknown) => {
  if (managementErrorReporter === null) {
    console.error(`The ${shell} application could not be loaded.`, cause);
    return;
  }
  const referenceId = `err_${crypto.randomUUID()}`;
  const report = await managementDiagnostics?.then(({ createClientExceptionReport }) => createClientExceptionReport(
    "bootstrap", "The management interface could not be loaded.", cause, () => referenceId
  )).catch((reportingImportError: unknown) => {
    console.error(`Management exception reporting could not be loaded (${referenceId}).`, reportingImportError);
    return null;
  });
  if (report !== null && report !== undefined) {
    void managementErrorReporter.then((reporter) => reporter.report(report)).catch((reportingError: unknown) => {
      console.error(`Management exception reporting failed (${referenceId}).`, reportingError);
    });
  }
  createRoot(rootElement).render(
    <main className="management-error-boundary">
      <section className="management-error-banner management-error-banner--error" role="alert">
        <div>
          <strong>The management interface could not be loaded</strong>
          <p>Reload Stream Jams to try again. If the problem returns, use this reference in Diagnostics.</p>
          <p className="management-error-boundary__reference"><span>Reference ID</span> <code>{referenceId}</code></p>
        </div>
        <div className="management-error-boundary__actions">
          <button className="button button--primary" type="button" onClick={() => { window.location.reload(); }}>Reload management</button>
          <a href={`/manage/diagnostics?reference=${encodeURIComponent(referenceId)}`}>Open diagnostics</a>
        </div>
      </section>
    </main>
  );
});
