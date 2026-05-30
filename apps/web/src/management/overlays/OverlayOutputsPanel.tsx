import { useEffect, useState } from "react";
import type { ManagementApi, OverlayClientView, OverlayOutputUrl } from "../management-api.js";

export interface OverlayOutputsPanelProps {
  readonly managementApi: Pick<ManagementApi, "listOverlayOutputs" | "listOverlayClients">;
}

export function OverlayOutputsPanel({ managementApi }: OverlayOutputsPanelProps) {
  const [outputs, setOutputs] = useState<readonly OverlayOutputUrl[]>([]);
  const [clients, setClients] = useState<readonly OverlayClientView[]>([]);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([managementApi.listOverlayOutputs(), managementApi.listOverlayClients()])
      .then(([loadedOutputs, loadedClients]) => {
        if (!cancelled) {
          setOutputs(loadedOutputs);
          setClients(loadedClients);
          setDiagnostic(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error, "Unable to load overlay outputs."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  async function copyOutput(output: OverlayOutputUrl) {
    await navigator.clipboard.writeText(output.url);
    setDiagnostic(`${output.label} copied.`);
  }

  return (
    <section className="management-panel" aria-labelledby="overlays-title">
      <div className="management-panel__header">
        <div>
          <h2 id="overlays-title">Overlays</h2>
          <p>{outputs.length} browser-source URLs</p>
        </div>
      </div>
      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      {outputs.length === 0 ? <p className="management-empty">No overlay URLs available.</p> : null}
      <div className="management-output-list">
        {outputs.map((output) => (
          <article className="management-output" key={output.id}>
            <div>
              <h3>{output.label}</h3>
              <p>{`${output.purpose} ${output.scope}`}</p>
            </div>
            <code>{output.url}</code>
            <button onClick={() => copyOutput(output)} type="button">
              Copy {output.label}
            </button>
          </article>
        ))}
      </div>
      <section className="management-subsection" aria-labelledby="overlay-clients-title">
        <h3 id="overlay-clients-title">Connected Clients</h3>
        {clients.length === 0 ? <p className="management-empty">No overlay clients connected.</p> : null}
        <ul className="management-list">
          {clients.map((client) => (
            <li key={client.id}>
              <span>{client.id}</span>
              <strong>{`${client.purpose} ${client.scope}`}</strong>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
