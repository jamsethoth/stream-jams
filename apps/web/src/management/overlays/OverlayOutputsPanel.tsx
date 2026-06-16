import { useEffect, useState } from "react";
import type { ManagementApi, OverlayClientView, OverlayOutputUrl } from "../management-api.js";

export interface OverlayOutputsPanelProps {
  readonly managementApi: Pick<
    ManagementApi,
    | "listOverlayOutputs"
    | "listOverlayClients"
    | "createOverlayOutputKey"
    | "regenerateOverlayOutputKey"
    | "revokeOverlayOutputKey"
  >;
}

export function OverlayOutputsPanel({ managementApi }: OverlayOutputsPanelProps) {
  const [outputs, setOutputs] = useState<readonly OverlayOutputUrl[]>([]);
  const [clients, setClients] = useState<readonly OverlayClientView[]>([]);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([managementApi.listOverlayOutputs(), managementApi.listOverlayClients()])
      .then(([loadedOutputs, loadedClients]) => {
        if (!cancelled) {
          setOutputs(loadedOutputs);
          setClients(loadedClients);
          setDiagnostic(null);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error, "Unable to load overlay outputs."));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  async function copyOutput(output: OverlayOutputUrl) {
    if (output.url === null) {
      setDiagnostic(`${output.label} needs a fresh URL.`);
      return;
    }

    await navigator.clipboard.writeText(output.url);
    setDiagnostic(`${output.label} copied.`);
  }

  async function createOutput(output: OverlayOutputUrl) {
    await managementApi.createOverlayOutputKey(toKeyRequest(output));
    await reload();
    setDiagnostic(`${output.label} URL created.`);
  }

  async function regenerateOutput(output: OverlayOutputUrl) {
    await managementApi.regenerateOverlayOutputKey(toKeyRequest(output));
    await reload();
    setDiagnostic(`${output.label} URL regenerated.`);
  }

  async function revokeOutput(output: OverlayOutputUrl) {
    if (output.keyId === null) {
      return;
    }

    await managementApi.revokeOverlayOutputKey(output.keyId);
    await reload();
    setDiagnostic(`${output.label} URL revoked.`);
  }

  async function reload() {
    const [loadedOutputs, loadedClients] = await Promise.all([
      managementApi.listOverlayOutputs(),
      managementApi.listOverlayClients()
    ]);
    setOutputs(loadedOutputs);
    setClients(loadedClients);
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
      {loading ? <p className="management-empty">Loading overlay outputs...</p> : null}
      {outputs.length === 0 ? <p className="management-empty">No overlay URLs available.</p> : null}
      <div className="management-output-list">
        {outputs.map((output) => (
          <article className="management-output" key={output.id}>
            <div>
              <h3>{output.label}</h3>
              <p>{`${output.purpose} ${output.scope} ${output.enabled ? "enabled" : "disabled"}`}</p>
            </div>
            <code>{output.url ?? "Generate a URL to copy this output."}</code>
            {output.copyableUrlStatus === "create-required" ? (
              <button onClick={() => void createOutput(output)} type="button">
                Create URL
              </button>
            ) : null}
            {output.copyableUrlStatus === "available" ? (
              <button onClick={() => void copyOutput(output)} type="button">
                Copy {output.label}
              </button>
            ) : null}
            {output.keyId !== null ? (
              <>
                <button onClick={() => void regenerateOutput(output)} type="button">
                  Regenerate
                </button>
                <button onClick={() => void revokeOutput(output)} type="button">
                  Revoke
                </button>
              </>
            ) : null}
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
              <span>{`Connected ${client.connectedAt}`}</span>
              <span>{`Last seen ${client.lastSeenAt}`}</span>
              {client.userAgent === null ? null : <span>{client.userAgent}</span>}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function toKeyRequest(output: OverlayOutputUrl) {
  return {
    overlayId: output.overlayId,
    scope: output.scope,
    moduleId: output.moduleId,
    purpose: output.purpose
  };
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
