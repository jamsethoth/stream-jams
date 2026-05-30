import { useEffect, useState, type FormEvent } from "react";
import type { ManagementApi, ServerConfigView } from "../management-api.js";

export interface SettingsPanelProps {
  readonly managementApi: Pick<ManagementApi, "getServerConfig" | "updateServerConfig">;
}

export function SettingsPanel({ managementApi }: SettingsPanelProps) {
  const [config, setConfig] = useState<ServerConfigView>({ host: "127.0.0.1", port: 39187 });
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void managementApi
      .getServerConfig()
      .then((loadedConfig) => {
        if (!cancelled) {
          setConfig(loadedConfig);
          setDiagnostic(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error, "Unable to load server settings."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const savedConfig = await managementApi.updateServerConfig(config);
      setConfig(savedConfig);
      setDiagnostic("Server settings saved.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error, "Unable to update server settings."));
    }
  }

  return (
    <section className="management-panel" aria-labelledby="settings-title">
      <div className="management-panel__header">
        <div>
          <h2 id="settings-title">Settings</h2>
          <p>{`${config.host}:${config.port}`}</p>
        </div>
      </div>
      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      <form className="management-form" onSubmit={handleSubmit}>
        <label>
          <span>Host</span>
          <input value={config.host} onChange={(event) => setConfig({ ...config, host: event.currentTarget.value })} />
        </label>
        <label>
          <span>Port</span>
          <input
            min={1}
            max={65535}
            type="number"
            value={config.port}
            onChange={(event) => setConfig({ ...config, port: Number(event.currentTarget.value) })}
          />
        </label>
        <button type="submit">Save server settings</button>
      </form>
    </section>
  );
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
