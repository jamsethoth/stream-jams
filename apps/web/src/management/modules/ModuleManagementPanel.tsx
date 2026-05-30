import { useEffect, useState } from "react";
import type { ManagementApi, ManagementModuleField, ManagementModuleView } from "../management-api.js";

export interface ModuleManagementPanelProps {
  readonly managementApi: Pick<ManagementApi, "listModules" | "setModuleEnabled" | "saveModuleConfig">;
}

export function ModuleManagementPanel({ managementApi }: ModuleManagementPanelProps) {
  const [modules, setModules] = useState<readonly ManagementModuleView[]>([]);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void managementApi
      .listModules()
      .then((loadedModules) => {
        if (!cancelled) {
          setModules(loadedModules);
          setDiagnostic(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error, "Unable to load overlay modules."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managementApi]);

  async function toggleModule(moduleId: string, enabled: boolean) {
    try {
      await managementApi.setModuleEnabled(moduleId, enabled);
      setModules((currentModules) =>
        currentModules.map((moduleView) => (moduleView.id === moduleId ? { ...moduleView, enabled } : moduleView))
      );
      setDiagnostic("Module updated.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error, "Unable to update overlay module."));
    }
  }

  function updateModuleConfig(moduleId: string, field: ManagementModuleField, rawValue: string | boolean) {
    const value = parseFieldValue(field, rawValue);
    setModules((currentModules) =>
      currentModules.map((moduleView) =>
        moduleView.id === moduleId ? { ...moduleView, config: writePath(moduleView.config, field.id, value) } : moduleView
      )
    );
  }

  async function saveModule(moduleView: ManagementModuleView) {
    try {
      await managementApi.saveModuleConfig(moduleView.id, {
        enabled: moduleView.enabled,
        config: moduleView.config
      });
      setDiagnostic(moduleView.displayName + " configuration saved.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error, "Unable to save overlay module config."));
    }
  }

  return (
    <section className="management-panel" aria-labelledby="modules-title">
      <div className="management-panel__header">
        <div>
          <h2 id="modules-title">Overlay Modules</h2>
          <p>{modules.length} registered</p>
        </div>
      </div>
      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      {modules.length === 0 ? <p className="management-empty">No overlay modules registered.</p> : null}
      <div className="management-module-list">
        {modules.map((moduleView) => (
          <article className="management-module" key={moduleView.id}>
            <div className="management-row">
              <div>
                <h3>{moduleView.displayName}</h3>
                <p>{moduleView.id}</p>
              </div>
              <label className="management-toggle">
                <input
                  aria-label={moduleView.displayName + " enabled"}
                  checked={moduleView.enabled}
                  onChange={(event) => toggleModule(moduleView.id, event.currentTarget.checked)}
                  type="checkbox"
                />
                Enabled
              </label>
            </div>
            <div className="management-wizard">
              {moduleView.wizard.steps.map((step) => (
                <section aria-labelledby={moduleView.id + "-" + step.id + "-title"} key={step.id}>
                  <h4 id={moduleView.id + "-" + step.id + "-title"}>{step.title}</h4>
                  <div className="management-field-grid">
                    {step.fields.map((field) => (
                      <label key={field.id}>
                        <span>{field.label}</span>
                        {field.type === "boolean" ? (
                          <input
                            checked={readBoolean(moduleView.config, field.id)}
                            onChange={(event) => updateModuleConfig(moduleView.id, field, event.currentTarget.checked)}
                            type="checkbox"
                          />
                        ) : (
                          <input
                            onChange={(event) => updateModuleConfig(moduleView.id, field, event.currentTarget.value)}
                            type={field.type === "number" ? "number" : "text"}
                            value={readString(moduleView.config, field.id)}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              ))}
              <div className="management-actions">
                <button onClick={() => saveModule(moduleView)} type="button">
                  Save {moduleView.displayName} configuration
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function parseFieldValue(field: ManagementModuleField, rawValue: string | boolean): unknown {
  if (field.type === "boolean") {
    return rawValue === true;
  }

  if (field.type === "number" && typeof rawValue === "string") {
    return rawValue.trim() === "" ? "" : Number(rawValue);
  }

  return rawValue;
}

function readString(config: unknown, path: string): string {
  const value = readPath(config, path);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function readBoolean(config: unknown, path: string): boolean {
  return readPath(config, path) === true;
}

function readPath(config: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, config);
}

function writePath(config: unknown, path: string, value: unknown): unknown {
  return writePathSegments(config, path.split("."), value);
}

function writePathSegments(current: unknown, segments: readonly string[], value: unknown): Record<string, unknown> {
  const [segment, ...remainingSegments] = segments;
  if (segment === undefined) {
    return isRecord(current) ? current : {};
  }

  const base = isRecord(current) ? current : {};
  return {
    ...base,
    [segment]: remainingSegments.length === 0 ? value : writePathSegments(base[segment], remainingSegments, value)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
