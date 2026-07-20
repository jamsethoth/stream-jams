import type { ActionableManagementError } from "@stream-jams/core";
import { useEffect, useRef } from "react";
import { ManagementErrorBanner } from "./ManagementErrorBanner.js";

export type ManagementToastTone = "success" | "warning" | "failure";

export interface ManagementToastNotice {
  readonly tone: ManagementToastTone;
  readonly message: string;
  readonly detail?: string | undefined;
}

export function ManagementToast({ notice, onDismiss }: {
  readonly notice: ManagementToastNotice;
  readonly onDismiss: () => void;
}) {
  useAutoDismiss(`${notice.tone}:${notice.message}:${notice.detail ?? ""}`, notice.tone, onDismiss);
  const label = notice.tone === "success" ? "Success" : notice.tone === "warning" ? "Warning" : "Failure";
  return (
    <section className={`management-toast management-toast--${notice.tone}`} role={notice.tone === "failure" ? "alert" : "status"}>
      <div className="management-toast__content">
        <strong>{label}</strong>
        <p>{notice.message}</p>
        {notice.detail === undefined ? null : <p>{notice.detail}</p>}
      </div>
      <button className="button button--secondary" onClick={onDismiss} type="button">Dismiss {label.toLowerCase()}</button>
    </section>
  );
}

export function ManagementErrorToast({ error, onDismiss }: {
  readonly error: ActionableManagementError;
  readonly onDismiss: () => void;
}) {
  const tone: ManagementToastTone = error.severity === "error" || error.severity === "critical" ? "failure" : "warning";
  const diagnosticsRoute = error.referenceId === null
    ? null
    : `/manage/diagnostics?reference=${encodeURIComponent(error.referenceId)}`;
  const correctionAlreadyOpensDiagnostics = error.correction?.route.startsWith("/manage/diagnostics") ?? false;
  useAutoDismiss(error, tone, onDismiss);
  return (
    <div className={`management-toast management-toast--${tone} management-toast--actionable`}>
      <ManagementErrorBanner error={error} role={tone === "failure" ? "alert" : "status"} />
      <div className="management-toast__actions">
        {diagnosticsRoute === null || correctionAlreadyOpensDiagnostics ? null : <a href={diagnosticsRoute}>Open diagnostics</a>}
        <button className="button button--secondary" onClick={onDismiss} type="button">Dismiss error</button>
      </div>
    </div>
  );
}

function useAutoDismiss(trigger: unknown, tone: ManagementToastTone, onDismiss: () => void) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    const timeout = window.setTimeout(() => dismissRef.current(), tone === "failure" ? 8_000 : 4_000);
    return () => window.clearTimeout(timeout);
  }, [tone, trigger]);
}
