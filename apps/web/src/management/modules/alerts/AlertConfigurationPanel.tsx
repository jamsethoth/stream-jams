import { useEffect, useState } from "react";
import { AlertRulesList } from "../../alerts/AlertRulesList.js";
import { AlertCollectionsList } from "../../collections/AlertCollectionsList.js";
import type { AlertCollection, AlertConfigurationApi, AlertRule } from "./alert-api.js";
export type { AlertConfigurationApi } from "./alert-api.js";

export interface AlertConfigurationPanelProps {
  readonly alertApi: AlertConfigurationApi;
}

type LoadState = "loading" | "ready" | "saving";

export function AlertConfigurationPanel({ alertApi }: AlertConfigurationPanelProps) {
  const [collections, setCollections] = useState<readonly AlertCollection[]>([]);
  const [rules, setRules] = useState<readonly AlertRule[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConfiguration() {
      setLoadState("loading");
      try {
        const [loadedCollections, loadedRules] = await Promise.all([
          alertApi.listCollections(),
          alertApi.listRules()
        ]);
        if (!cancelled) {
          setCollections(loadedCollections);
          setRules(loadedRules);
          setDiagnostic(null);
          setLoadState("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error));
          setLoadState("ready");
        }
      }
    }

    void loadConfiguration();

    return () => {
      cancelled = true;
    };
  }, [alertApi]);

  async function refresh() {
    const [loadedCollections, loadedRules] = await Promise.all([alertApi.listCollections(), alertApi.listRules()]);
    setCollections(loadedCollections);
    setRules(loadedRules);
  }

  async function toggleCollection(collectionId: string, enabled: boolean) {
    setLoadState("saving");
    try {
      await alertApi.setCollectionEnabled(collectionId, enabled);
      await refresh();
      setDiagnostic("Collection updated.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  async function toggleRule(ruleId: string, enabled: boolean) {
    setLoadState("saving");
    try {
      await alertApi.setRuleEnabled(ruleId, enabled);
      await refresh();
      setDiagnostic("Rule updated.");
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  const controlsDisabled = loadState === "loading" || loadState === "saving";

  return (
    <section className="alert-panel" aria-labelledby="alert-panel-title">
      <div className="management-panel__header">
        <div>
          <h2 id="alert-panel-title">Alerts</h2>
          <p>
            {collections.length} collections, {rules.length} rules
          </p>
        </div>
      </div>

      {diagnostic !== null ? <p className="management-diagnostic">{diagnostic}</p> : null}
      {loadState === "loading" ? <p className="management-empty">Loading alert configuration...</p> : null}

      <div className="alert-panel__grid">
        <section aria-labelledby="alert-collections-title">
          <h3 id="alert-collections-title">Collections</h3>
          <AlertCollectionsList
            collections={collections}
            disabled={controlsDisabled}
            onToggle={toggleCollection}
          />
        </section>

        <section aria-labelledby="alert-rules-title">
          <h3 id="alert-rules-title">Rules</h3>
          <AlertRulesList disabled={controlsDisabled} onToggle={toggleRule} rules={rules} />
        </section>
      </div>
    </section>
  );
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Alert configuration operation failed.";
}
