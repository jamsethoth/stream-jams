import { type FormEvent, useEffect, useRef, useState } from "react";
import type { DiagnosticsDebugExportView, DiagnosticsExportView, DiagnosticsView, ManagementApi } from "../management-api.js";

export interface DiagnosticsPanelProps {
  readonly managementApi: Pick<ManagementApi, "getDiagnostics" | "exportDiagnostics" | "exportDebugDiagnostics">;
}

export function DiagnosticsPanel({ managementApi }: DiagnosticsPanelProps) {
  const [limit, setLimit] = useState("50");
  const [diagnostics, setDiagnostics] = useState<DiagnosticsView | null>(null);
  const [exported, setExported] = useState<DiagnosticsExportView | DiagnosticsDebugExportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void loadDiagnostics(50);

    return () => {
      mounted.current = false;
    };
  }, []);

  async function loadDiagnostics(nextLimit: number): Promise<void> {
    setLoading(true);
    setMessage(null);
    try {
      const nextDiagnostics = await managementApi.getDiagnostics({ limit: nextLimit });
      if (mounted.current) {
        setDiagnostics(nextDiagnostics);
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : "Unable to load diagnostics.");
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }

  async function handleReload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadDiagnostics(parseLimit(limit));
  }

  async function handleExport(): Promise<void> {
    setExporting(true);
    setMessage(null);
    try {
      const result = await managementApi.exportDiagnostics({ limit: parseLimit(limit) });
      if (mounted.current) {
        setExported(result);
        setMessage(`Diagnostics export generated at ${result.generatedAt}.`);
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : "Unable to export diagnostics.");
      }
    } finally {
      if (mounted.current) {
        setExporting(false);
      }
    }
  }

  async function handleDebugExport(): Promise<void> {
    setExporting(true);
    setMessage(null);
    try {
      const result = await managementApi.exportDebugDiagnostics({
        limit: parseLimit(limit),
        runtimeLogLimit: 200,
        sinceHours: 2
      });
      if (mounted.current) {
        setExported(result);
        setMessage(`Diagnostics debug export generated at ${result.generatedAt}.`);
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : "Unable to export diagnostics with recent runtime logs.");
      }
    } finally {
      if (mounted.current) {
        setExporting(false);
      }
    }
  }

  return (
    <section className="management-panel" aria-labelledby="diagnostics-title">
      <div className="management-panel__header">
        <div>
          <h2 id="diagnostics-title">Diagnostics</h2>
          <p>Redacted event, alert, playback, and provider diagnostics.</p>
        </div>
      </div>

      <form className="management-form management-form--wide" onSubmit={(event) => void handleReload(event)}>
        <label>
          <span>Log limit</span>
          <input
            aria-label="Diagnostics limit"
            max="200"
            min="1"
            onChange={(event) => setLimit(event.target.value)}
            type="number"
            value={limit}
          />
        </label>
        <button disabled={loading} type="submit">
          Reload diagnostics
        </button>
        <button disabled={exporting} onClick={() => void handleExport()} type="button">
          Export diagnostics
        </button>
        <button disabled={exporting} onClick={() => void handleDebugExport()} type="button">
          Export with recent logs
        </button>
      </form>

      {message === null ? null : <p className="management-diagnostic">{message}</p>}
      {exported === null ? null : (
        <p className="management-diagnostic">
          {`${exported.eventLogs.length} events, ${exported.alertMatchLogs.length} matches, ${exported.playbackLogs.length} playback rows, ${exported.providerErrors.length} provider errors exported${exported.debugExport ? ` with ${exported.runtimeLogEntries.length} recent runtime log entries` : ""}.`}
        </p>
      )}

      {loading ? <p className="management-empty">Loading diagnostics...</p> : null}
      {diagnostics === null || loading ? null : (
        <div className="management-diagnostics-grid">
          <DiagnosticsTable
            columns={["Received", "Event", "Actor", "Status", "Correlation", "Error"]}
            emptyMessage="No event ingestion logs."
            rows={diagnostics.eventLogs.map((log) => [
              log.receivedAt,
              `${log.providerId} ${log.eventType} ${log.eventId}`,
              log.actorDisplayName,
              log.status,
              log.correlationId,
              log.errorMessage ?? ""
            ])}
            title="Event Ingestion"
          />
          <DiagnosticsTable
            columns={["Matched", "Event", "Rule", "Variant", "Correlation"]}
            emptyMessage="No alert match logs."
            rows={diagnostics.alertMatchLogs.map((log) => [
              log.matchedAt,
              log.sourceEventId,
              log.ruleId,
              log.variantId,
              log.correlationId
            ])}
            title="Alert Matches"
          />
          <DiagnosticsTable
            columns={["Occurred", "Queue item", "Status", "Alerts", "Message"]}
            emptyMessage="No playback logs."
            rows={diagnostics.playbackLogs.map((log) => [
              log.occurredAt,
              log.queueItemId,
              log.status,
              log.alertIds.join(", "),
              log.message ?? ""
            ])}
            title="Playback"
          />
          <DiagnosticsTable
            columns={["Occurred", "Provider", "Message", "Correlation"]}
            emptyMessage="No provider errors."
            rows={diagnostics.providerErrors.map((error) => [
              error.occurredAt,
              error.label,
              error.message,
              error.correlationId ?? ""
            ])}
            title="Provider Errors"
          />
        </div>
      )}
    </section>
  );
}

interface DiagnosticsTableProps {
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly emptyMessage: string;
}

function DiagnosticsTable({ title, columns, rows, emptyMessage }: DiagnosticsTableProps) {
  return (
    <section className="management-subsection">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="management-empty">{emptyMessage}</p>
      ) : (
        <div className="management-table-wrap">
          <table className="management-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${rowIndex}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function parseLimit(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 50;
}
