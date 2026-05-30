import { useEffect, useState } from "react";
import type { DashboardSummary, ManagementApi } from "../management-api.js";

export interface DashboardPanelProps {
  readonly managementApi: Pick<ManagementApi, "getDashboard">;
}

export function DashboardPanel({ managementApi }: DashboardPanelProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void managementApi
      .getDashboard()
      .then((loadedSummary) => {
        if (!cancelled) {
          setSummary(loadedSummary);
          setDiagnostic(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error, "Unable to load dashboard."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  return (
    <section className="management-panel" aria-labelledby="dashboard-title">
      <div className="management-panel__header">
        <div>
          <h2 id="dashboard-title">Dashboard</h2>
          <p>{summary === null ? "Loading status" : `${summary.queue.queuedCount} queued alerts`}</p>
        </div>
      </div>
      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      {summary === null ? <p className="management-empty">Loading dashboard...</p> : null}
      {summary !== null ? (
        <>
          <div className="management-metric-grid">
            <StatusMetric label="Twitch" value={summary.twitch.label} />
            <StatusMetric label="Overlays" value={summary.overlay.label} />
            <StatusMetric label="Queue" value={summary.queue.label} />
          </div>
          <section aria-labelledby="dashboard-errors-title" className="management-subsection">
            <h3 id="dashboard-errors-title">Recent Errors</h3>
            {summary.recentErrors.length === 0 ? (
              <p className="management-empty">No recent errors.</p>
            ) : (
              <ul className="management-list">
                {summary.recentErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

function StatusMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="management-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
