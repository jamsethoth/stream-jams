import { Component, type ErrorInfo, type ReactNode } from "react";
import { createClientExceptionReport, type ClientErrorReporter } from "../diagnostics/client-error-reporter.js";

export interface ManagementErrorBoundaryProps {
  readonly children: ReactNode;
  readonly reporter: ClientErrorReporter;
  readonly generateReferenceId?: () => string;
  readonly resetKey?: string;
  readonly onReload?: () => void;
}

interface ManagementErrorBoundaryState {
  readonly referenceId: string | null;
}

export interface ManagementErrorFallbackProps {
  readonly referenceId: string;
  readonly onReload?: () => void;
}

export function ManagementErrorFallback({ referenceId, onReload }: ManagementErrorFallbackProps) {
  const diagnosticsRoute = `/manage/diagnostics?reference=${encodeURIComponent(referenceId)}`;
  return (
    <main className="management-error-boundary">
      <section className="management-error-banner management-error-banner--error" role="alert">
        <div>
          <strong>The management interface stopped unexpectedly</strong>
          <p>Reload Stream Jams to continue. If the problem returns, open Diagnostics and use this reference.</p>
          <p className="management-error-boundary__reference"><span>Reference ID</span> <code>{referenceId}</code></p>
        </div>
        <div className="management-error-boundary__actions">
          <button className="button button--primary" type="button" onClick={onReload ?? (() => { window.location.reload(); })}>Reload management</button>
          <a href={diagnosticsRoute}>Open diagnostics</a>
        </div>
      </section>
    </main>
  );
}

export class ManagementErrorBoundary extends Component<ManagementErrorBoundaryProps, ManagementErrorBoundaryState> {
  state: ManagementErrorBoundaryState = { referenceId: null };

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const reactError = new Error("React failed while rendering the management interface.", { cause: error });
    reactError.name = "ReactRenderError";
    if (typeof info.componentStack === "string" && info.componentStack.trim() !== "") {
      reactError.stack = `React component stack:${info.componentStack}`;
    }
    const report = createClientExceptionReport(
      "react",
      "The management interface stopped unexpectedly.",
      reactError,
      this.props.generateReferenceId
    );
    this.setState({ referenceId: report.referenceId });
    void this.props.reporter.report(report);
  }

  componentDidUpdate(previous: ManagementErrorBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.referenceId !== null) {
      this.setState({ referenceId: null });
    }
  }

  render(): ReactNode {
    const { referenceId } = this.state;
    if (referenceId === null) return this.props.children;
    return <ManagementErrorFallback referenceId={referenceId} {...(this.props.onReload === undefined ? {} : { onReload: this.props.onReload })} />;
  }
}
